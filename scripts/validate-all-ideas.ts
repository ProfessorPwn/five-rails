#!/usr/bin/env npx tsx
// Batch-validate all IdeaBrowser ideas through the v2 AI engine.
// Calls ideas one-by-one to avoid HTTP timeouts and shows progress.

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "fiverails.db");
const API_BASE = process.env.API_BASE || "http://localhost:3000";

interface IdeaRow {
  id: string;
  title: string;
  community_signals: string | null;
}

async function main() {
  const db = new Database(DB_PATH, { readonly: true });
  const ideas = db.prepare("SELECT id, title, community_signals FROM ideabrowser_ideas ORDER BY imported_at DESC").all() as IdeaRow[];
  db.close();

  console.log(`\n=== Validating ${ideas.length} ideas with v2 AI engine ===\n`);

  let done = 0;
  let llm = 0;
  let deterministic = 0;
  let errors = 0;
  let skipped = 0;
  const startTime = Date.now();

  for (const idea of ideas) {
    done++;
    const pct = ((done / ideas.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const avgSec = done > 1 ? ((Date.now() - startTime) / 1000 / (done - 1)).toFixed(1) : "?";
    const remaining = done > 1 ? (((ideas.length - done) * (Date.now() - startTime)) / (done - 1) / 1000 / 60).toFixed(1) : "?";

    // Check if already v2 validated
    let hasV2 = false;
    try {
      const cs = JSON.parse(idea.community_signals || "{}");
      hasV2 = !!(cs._v2?.reddit?.subreddits?.length || cs._v2?.youtube?.videos?.length || cs._v2?.google_trends?.primary_keyword);
    } catch { /* not v2 */ }

    if (hasV2) {
      skipped++;
      process.stdout.write(`[${done}/${ideas.length}] (${pct}%) SKIP already v2: ${idea.title.slice(0, 50)}... (~${remaining}m left)\n`);
      continue;
    }

    process.stdout.write(`[${done}/${ideas.length}] (${pct}%) Validating: ${idea.title.slice(0, 50)}... `);

    try {
      const res = await fetch(`${API_BASE}/api/ideabrowser/ideas/${idea.id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
        signal: AbortSignal.timeout(300000),
      });

      if (!res.ok) {
        const err = await res.text();
        process.stdout.write(`ERROR ${res.status}: ${err.slice(0, 80)}\n`);
        errors++;
        continue;
      }

      const data = await res.json();
      const engine = data._engine || "?";

      if (engine === "llm") {
        llm++;
        process.stdout.write(`LLM OK (${avgSec}s avg, ~${remaining}m left)\n`);
      } else if (engine === "cached") {
        skipped++;
        process.stdout.write(`CACHED\n`);
      } else {
        deterministic++;
        process.stdout.write(`DETERMINISTIC (${avgSec}s avg, ~${remaining}m left)\n`);
      }
    } catch (err) {
      process.stdout.write(`FAIL: ${String(err).slice(0, 80)}\n`);
      errors++;
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n=== DONE in ${totalTime} minutes ===`);
  console.log(`  Total: ${ideas.length}`);
  console.log(`  LLM validated: ${llm}`);
  console.log(`  Deterministic: ${deterministic}`);
  console.log(`  Skipped (already v2): ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(console.error);
