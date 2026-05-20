// ─── Stuck Deal Revival (Voss, consolidated item #14) ─────────────────────────
// Triggered when a deal has no `deal_activities` entry for 7+ days. Scores it
// via skill-dead-deal-detector and branches:
//   0–3  → label-stack re-engagement (3 labels + 1 calibrated question)
//   4–5  → label-stack + Future Vision frame (acknowledges time gap)
//   6–8  → clean fast exit, mark Closed Lost, log reason
// On successful re-engagement detected later, Implementation Pivot Closer is
// invoked. That latter step is a separate trigger so it stays event-driven.

import { getDb } from "@/lib/db";
import {
  startRun, recordStep, completeRun,
  executeSkill, createHandoff, logPlaybookActivity,
} from "./runner";

const NAME = "stuck-deal-revival";

interface DealRow {
  id: string; title: string; stage: string; value: number;
  notes: string | null; updated_at: string;
  contact_id: string | null; project_id: string | null;
}

export async function runStuckDealRevival(opts: { baseUrl: string; dealId: string }): Promise<{ ok: boolean; status?: string; reason?: string }> {
  const { run_id, alreadyRan } = startRun({
    playbookName: NAME, triggerEntityType: "deal", triggerEntityId: opts.dealId,
  });
  if (alreadyRan) return { ok: true, status: "already_ran", reason: "Idempotent skip" };

  const deal = getDb().prepare(
    "SELECT id, title, stage, value, notes, updated_at, contact_id, project_id FROM deals WHERE id = ?",
  ).get(opts.dealId) as DealRow | undefined;

  if (!deal) {
    recordStep(run_id, { step: 0, name: "load_deal", status: "failed", detail: "deal not found", at: new Date().toISOString() });
    completeRun(run_id, { status: "failed", error: "deal not found" });
    return { ok: false, reason: "deal not found" };
  }

  // Step 1: score the deal via dead-deal-detector
  const dealSummary = `Deal: "${deal.title}" — stage ${deal.stage} — value $${deal.value || 0}
Last updated: ${deal.updated_at}
Notes: ${deal.notes || "(none)"}

Recent deal activities (chronological):
${getDealActivityLog(deal.id).slice(0, 8).map(a => `- ${a.created_at}: ${a.type} — ${a.description || ""}`).join("\n") || "(no recorded activities)"}

This deal has had no activity for 7+ days. Score it.`;

  const score = await executeSkill({
    baseUrl: opts.baseUrl, skillId: "skill-dead-deal-detector",
    input: dealSummary, projectId: deal.project_id,
  });
  recordStep(run_id, {
    step: 1, name: "dead-deal-detector",
    status: score.ok ? "ok" : "failed",
    detail: score.error,
    output_excerpt: score.output.slice(0, 400),
    at: new Date().toISOString(),
  });
  if (!score.ok) {
    completeRun(run_id, { status: "failed", error: score.error || "scoring failed" });
    return { ok: false, reason: "scoring failed" };
  }

  // Parse the recommendation. The skill outputs CONTINUE | CONTINUE WITH MILESTONE | EXIT | EXIT NOW
  const rec = parseRecommendation(score.output);

  // Step 2: branch on score
  if (rec === "EXIT" || rec === "EXIT NOW") {
    // Close it out cleanly. The skill already produced the exit draft —
    // surface it as a handoff to Voss for the actual send + DB mutation.
    const exitDraft = extractExitDraft(score.output);
    createHandoff({
      fromAgentId: "agent-product",
      toAgentId: "agent-sales",
      message: `[Stuck Deal Revival] Deal "${deal.title}" (${opts.dealId}) scored EXIT. Send the attached clean fast-exit message and update deals.stage='lost' with notes="auto-revival: ${rec}".\n\n--- DRAFT ---\n${exitDraft}`,
      messageType: "handoff",
      deadlineMinutes: 60,
    });
    recordStep(run_id, { step: 2, name: "exit_handoff", status: "ok", detail: rec, at: new Date().toISOString() });
    logPlaybookActivity(NAME, `Deal ${deal.title} flagged for exit (${rec})`, deal.project_id);
    completeRun(run_id, { status: "completed", result: `EXIT — handoff to agent-sales for clean close.` });
    return { ok: true, status: "exit_recommended" };
  }

  // CONTINUE path: generate a re-engagement message via label-stack-handler
  const reEngagementInput = `This deal has gone quiet for 7+ days. Previous context:\n${dealSummary}\n\nThe Dead Deal Detector recommended: ${rec}. Reasoning excerpt:\n${score.output.slice(0, 1200)}\n\nGenerate a re-engagement message that surfaces the time gap honestly and pulls them back in. ${rec === "CONTINUE WITH MILESTONE" ? "Include a specific implementation-talk milestone for the next touch." : ""}`;

  const reEngagement = await executeSkill({
    baseUrl: opts.baseUrl, skillId: "skill-label-stack-handler",
    input: reEngagementInput, projectId: deal.project_id,
  });
  recordStep(run_id, {
    step: 2, name: "label-stack-handler",
    status: reEngagement.ok ? "ok" : "failed",
    output_excerpt: reEngagement.output.slice(0, 400),
    detail: reEngagement.error,
    at: new Date().toISOString(),
  });
  if (!reEngagement.ok) {
    completeRun(run_id, { status: "failed", error: reEngagement.error || "re-engagement gen failed" });
    return { ok: false, reason: "re-engagement gen failed" };
  }

  // Handoff to Voss for the send + DB log
  createHandoff({
    fromAgentId: "agent-product",
    toAgentId: "agent-sales",
    message: `[Stuck Deal Revival] Deal "${deal.title}" (${opts.dealId}) ${rec}. Send re-engagement and log a deal_activities row.\n\n--- MESSAGE ---\n${reEngagement.output.slice(0, 2500)}`,
    messageType: "handoff",
    deadlineMinutes: 240,
  });
  logPlaybookActivity(NAME, `Deal ${deal.title} → re-engagement queued (${rec})`, deal.project_id);
  completeRun(run_id, { status: "completed", result: `${rec} — re-engagement handoff to agent-sales.` });
  return { ok: true, status: rec.toLowerCase().replace(/ /g, "_") };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getDealActivityLog(dealId: string) {
  return getDb().prepare(
    "SELECT created_at, type, description FROM deal_activities WHERE deal_id = ? ORDER BY created_at DESC LIMIT 10",
  ).all(dealId) as Array<{ created_at: string; type: string; description: string | null }>;
}

function parseRecommendation(skillOutput: string): "CONTINUE" | "CONTINUE WITH MILESTONE" | "EXIT" | "EXIT NOW" {
  const upper = skillOutput.toUpperCase();
  if (/\bEXIT NOW\b/.test(upper)) return "EXIT NOW";
  if (/RECOMMENDATION:[^\n]*\bEXIT\b/.test(upper)) return "EXIT";
  if (/\bCONTINUE WITH MILESTONE\b/.test(upper)) return "CONTINUE WITH MILESTONE";
  return "CONTINUE";
}

function extractExitDraft(skillOutput: string): string {
  // The skill places the exit draft after "If EXIT:" — pull what follows.
  const idx = skillOutput.indexOf("If EXIT:");
  if (idx < 0) return skillOutput;
  return skillOutput.slice(idx + "If EXIT:".length).trim();
}
