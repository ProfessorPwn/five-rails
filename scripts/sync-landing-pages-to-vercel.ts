// One-shot sync of all published landing_pages from local SQLite to the
// public form service on Vercel. Idempotent: safe to run repeatedly.
//
// Usage:
//   FORM_SERVICE_URL=... SERVICE_API_TOKEN=... npx tsx scripts/sync-landing-pages-to-vercel.ts
//
// The agents call syncLandingPages() directly from create-test-assets.ts;
// this script is the manual / cron path.

import "dotenv/config";
import { getDb } from "../src/lib/db";
import { syncLandingPages, isFormServiceConfigured, type FormServicePage } from "../src/lib/form-service";

interface LocalPage {
  id: string;
  slug: string | null;
  title: string;
  html: string;
  status: string;
  validation_campaign_id: string | null;
  project_id: string | null;
}

async function main() {
  if (!isFormServiceConfigured()) {
    console.error(
      "FORM_SERVICE_URL or SERVICE_API_TOKEN is not set. Add both to .env, then re-run.",
    );
    process.exit(1);
  }

  const db = getDb();
  const rows = db.prepare(
    `SELECT id, slug, title, html, status, validation_campaign_id, project_id
     FROM landing_pages
     WHERE slug IS NOT NULL AND slug != '' AND status IN ('published', 'archived')
     ORDER BY updated_at DESC LIMIT 500`,
  ).all() as LocalPage[];

  if (rows.length === 0) {
    console.log("No landing pages to sync.");
    return;
  }

  const pages: FormServicePage[] = rows.map(r => ({
    slug: r.slug as string,
    source_id: r.id,
    validation_campaign_id: r.validation_campaign_id,
    project_id: r.project_id,
    title: r.title,
    html: r.html,
    status: r.status === "archived" ? "archived" : "published",
  }));

  // Chunk to keep payloads modest on Vercel's free tier.
  const CHUNK = 50;
  let total = 0;
  for (let i = 0; i < pages.length; i += CHUNK) {
    const chunk = pages.slice(i, i + CHUNK);
    const { upserted } = await syncLandingPages(chunk);
    total += upserted;
    console.log(`Synced ${upserted}/${chunk.length} (running total ${total})`);
  }

  console.log(`Done. Pushed ${total} landing pages to ${process.env.FORM_SERVICE_URL}.`);
}

main().catch(err => {
  console.error("Sync failed:", err.message || err);
  process.exit(1);
});
