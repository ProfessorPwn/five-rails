// ─── New Offer Launch (Hormozi, consolidated item #11) ───────────────────────
// Triggered when a project is created (or marked offer-bearing). Chains:
//   1. Grand Slam Offer Builder       → produces an Offer Brief
//   2. Value Equation Auditor         → stress-tests Brief, surfaces weakest lever
//   3. Pricing Page Generator         → existing skill — pages copy
//   4. Sales Page Surgeon             → existing skill — long-form sales page
//   5. Ad Copy Generator              → 3 variants targeting weakest lever
//
// All copy is anchored on the same validated Offer Brief produced in step 1
// so the messaging stays coherent across surfaces.

import { getDb } from "@/lib/db";
import {
  startRun, recordStep, completeRun,
  executeSkill, createHandoff, logPlaybookActivity,
} from "./runner";

const NAME = "new-offer-launch";

interface ProjectRow {
  id: string; name: string; description: string | null;
  niche: string | null; target_audience: string | null;
}

export async function runNewOfferLaunch(opts: { baseUrl: string; projectId: string }): Promise<{ ok: boolean; reason?: string; offer_brief?: string }> {
  const { run_id, alreadyRan } = startRun({
    playbookName: NAME, triggerEntityType: "project", triggerEntityId: opts.projectId,
  });
  if (alreadyRan) return { ok: true, reason: "already_ran" };

  const project = getDb().prepare(
    "SELECT id, name, description, niche, target_audience FROM projects WHERE id = ?",
  ).get(opts.projectId) as ProjectRow | undefined;
  if (!project) {
    completeRun(run_id, { status: "failed", error: "project not found" });
    return { ok: false, reason: "project not found" };
  }

  // Step 1: Grand Slam Offer Builder — produces the Offer Brief
  const briefInput = `Project: ${project.name}
Description: ${project.description || "(none)"}
Niche: ${project.niche || "(none)"}
Target audience: ${project.target_audience || "(none)"}

Build the Grand Slam Offer for this project — full stack, guarantee, anchor.`;
  const brief = await executeSkill({
    baseUrl: opts.baseUrl, skillId: "skill-grand-slam-offer-builder",
    input: briefInput, projectId: project.id,
  });
  recordStep(run_id, {
    step: 1, name: "grand-slam-offer-builder",
    status: brief.ok ? "ok" : "failed",
    output_excerpt: brief.output.slice(0, 500),
    detail: brief.error,
    at: new Date().toISOString(),
  });
  if (!brief.ok) {
    completeRun(run_id, { status: "failed", error: "offer brief generation failed" });
    return { ok: false, reason: brief.error };
  }

  // Step 2: Value Equation Auditor — stress-test the brief, identify weakest lever
  const auditInput = `Audit the following Offer Brief and identify the weakest Value Equation axis.\n\n--- OFFER BRIEF ---\n${brief.output}`;
  const audit = await executeSkill({
    baseUrl: opts.baseUrl, skillId: "skill-value-equation-auditor",
    input: auditInput, projectId: project.id,
  });
  recordStep(run_id, {
    step: 2, name: "value-equation-auditor",
    status: audit.ok ? "ok" : "failed",
    output_excerpt: audit.output.slice(0, 500),
    at: new Date().toISOString(),
  });
  // Audit failure is non-fatal — we proceed with the brief alone.

  // Step 3+4+5: handoff to Hormozi (marketing) with the Brief + audit as context.
  // Marketing agent will choose which copy skills to run from its assigned set.
  // We surface this as a single handoff so the agent can prioritize and order.
  createHandoff({
    fromAgentId: "agent-product",
    toAgentId: "agent-marketing",
    message: `[New Offer Launch] Project "${project.name}" (${project.id}) has a validated Offer Brief. Generate (a) pricing page, (b) sales page, (c) 3 ad variants targeting the weakest Value Equation lever per audit. Use ONLY this Brief as the source of truth for all messaging.\n\n--- OFFER BRIEF ---\n${brief.output.slice(0, 4000)}\n\n--- VALUE EQUATION AUDIT ---\n${(audit.output || "(audit step skipped — proceed with brief as-is)").slice(0, 2000)}`,
    messageType: "handoff",
    deadlineMinutes: 4 * 60,
  });
  recordStep(run_id, { step: 3, name: "marketing_handoff", status: "ok", at: new Date().toISOString() });

  logPlaybookActivity(NAME, `Offer Brief ready for ${project.name} → handed to Hormozi for pricing/sales/ad copy.`, project.id);
  completeRun(run_id, {
    status: "completed",
    result: `Offer Brief generated (${brief.output.length} chars), audit ${audit.ok ? "ok" : "skipped"}, handoff to agent-marketing for copy generation.`,
  });
  return { ok: true, offer_brief: brief.output };
}
