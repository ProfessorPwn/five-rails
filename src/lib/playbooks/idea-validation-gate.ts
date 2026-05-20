// ─── Idea → Last-Mover Validation Gate (Thiel, consolidated item #20) ────────
// Triggered when an IdeaBrowser idea scores above threshold. The gate either
// validates the idea structurally (passes to Marty as a product brief) or
// kills it with a documented reason.
//
// Steps:
//   1. skill-red-flag-pitch-auditor — ≥2 fatal flags → DROP with rationale
//   2. skill-monopoly-score — avg ≤ 2/12 → DROP
//   3. (passed) — generate a validated product brief and hand off to Marty

import { getDb } from "@/lib/db";
import {
  startRun, recordStep, completeRun,
  executeSkill, createHandoff, logPlaybookActivity,
} from "./runner";

const NAME = "idea-last-mover-validation";

interface IdeaRow {
  id: string; title: string; description: string | null;
  category: string | null; overall_score: number; validation_status: string | null;
}

export async function runIdeaValidationGate(opts: { baseUrl: string; ideaId: string }): Promise<{ ok: boolean; verdict?: string; reason?: string }> {
  const { run_id, alreadyRan } = startRun({
    playbookName: NAME, triggerEntityType: "idea", triggerEntityId: opts.ideaId,
  });
  if (alreadyRan) return { ok: true, verdict: "already_ran" };

  const idea = getDb().prepare(
    "SELECT id, title, description, category, overall_score, validation_status FROM ideabrowser_ideas WHERE id = ?",
  ).get(opts.ideaId) as IdeaRow | undefined;
  if (!idea) {
    completeRun(run_id, { status: "failed", error: "idea not found" });
    return { ok: false, reason: "idea not found" };
  }

  const ideaPitch = `Idea: ${idea.title}
Category: ${idea.category || "(none)"}
Score: ${idea.overall_score}/100
Description: ${idea.description || "(none)"}`;

  // Step 1: Red Flag Pitch Auditor
  const audit = await executeSkill({
    baseUrl: opts.baseUrl, skillId: "skill-red-flag-pitch-auditor", input: ideaPitch,
  });
  recordStep(run_id, {
    step: 1, name: "red-flag-pitch-auditor",
    status: audit.ok ? "ok" : "failed",
    output_excerpt: audit.output.slice(0, 500),
    at: new Date().toISOString(),
  });
  if (!audit.ok) {
    completeRun(run_id, { status: "failed", error: audit.error || "audit step failed" });
    return { ok: false, reason: audit.error };
  }
  const fatalCount = (audit.output.match(/\bfatal\b/gi) || []).length;
  if (fatalCount >= 2) {
    // DROP — record reason on the idea, log
    getDb().prepare("UPDATE ideabrowser_ideas SET validation_status = 'failed' WHERE id = ?").run(idea.id);
    logPlaybookActivity(NAME, `Idea "${idea.title}" DROPPED at Red Flag gate (${fatalCount} fatal flags).`);
    completeRun(run_id, { status: "completed", result: `DROP — ${fatalCount} fatal flags in Red Flag Pitch Auditor.` });
    return { ok: true, verdict: "drop", reason: `${fatalCount} fatal flags` };
  }

  // Step 2: Monopoly Score
  const monopoly = await executeSkill({
    baseUrl: opts.baseUrl, skillId: "skill-monopoly-score", input: ideaPitch,
  });
  recordStep(run_id, {
    step: 2, name: "monopoly-score",
    status: monopoly.ok ? "ok" : "failed",
    output_excerpt: monopoly.output.slice(0, 500),
    at: new Date().toISOString(),
  });
  if (!monopoly.ok) {
    completeRun(run_id, { status: "failed", error: monopoly.error || "monopoly step failed" });
    return { ok: false, reason: monopoly.error };
  }
  // Parse "Total: X/12" from output
  const totalMatch = monopoly.output.match(/Total:\s*\*?\*?\s*(\d+)\s*\/\s*12/i);
  const moatScore = totalMatch ? parseInt(totalMatch[1], 10) : null;
  if (moatScore !== null && moatScore <= 2) {
    getDb().prepare("UPDATE ideabrowser_ideas SET validation_status = 'failed' WHERE id = ?").run(idea.id);
    logPlaybookActivity(NAME, `Idea "${idea.title}" DROPPED at Monopoly gate (score ${moatScore}/12).`);
    completeRun(run_id, { status: "completed", result: `DROP — Monopoly Score ${moatScore}/12, below threshold.` });
    return { ok: true, verdict: "drop", reason: `monopoly score ${moatScore}/12` };
  }

  // Step 3: PASSED — handoff to Marty as a validated product brief
  const validatedBrief = `[Validated by Last-Mover Gate] ${idea.title}

== RED FLAG AUDIT RESULT ==
${audit.output.slice(0, 1500)}

== MONOPOLY SCORE ==
${monopoly.output.slice(0, 1500)}

== ORIGINAL DESCRIPTION ==
${idea.description || "(none)"}`;

  createHandoff({
    fromAgentId: "agent-research",
    toAgentId: "agent-product",
    message: `[Idea Validation Gate] Idea ${idea.id} passed structural validation. Moat score: ${moatScore ?? "n/a"}/12. Convert to a project brief and kick off discovery (skill-riskiest-assumption-extractor + skill-four-bar-solution-scorer).\n\n${validatedBrief.slice(0, 4000)}`,
    messageType: "handoff",
    deadlineMinutes: 4 * 60,
  });
  getDb().prepare("UPDATE ideabrowser_ideas SET validation_status = 'passed' WHERE id = ?").run(idea.id);
  logPlaybookActivity(NAME, `Idea "${idea.title}" PASSED gate (moat ${moatScore ?? "n/a"}/12) → handed to Marty.`);
  completeRun(run_id, {
    status: "completed",
    result: `PASS — moat ${moatScore ?? "n/a"}/12, ${fatalCount} fatal flags. Handoff to agent-product.`,
  });
  return { ok: true, verdict: "pass" };
}
