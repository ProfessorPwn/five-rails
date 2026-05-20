// ─── Build-to-Learn Cycle (Cagan, consolidated item #13) ─────────────────────
// Triggered when a new project enters the system OR an idea is promoted to
// active. Enforces discovery before engineering:
//   1. skill-riskiest-assumption-extractor  — what's most likely to be wrong?
//   2. skill-four-bar-solution-scorer        — Value/Usability/Feasibility/Viability
//   3. (any FAIL on a bar)                   → playbook returns NOT READY,
//                                             logs the blocker + cheapest fix
//   4. PASS                                  → hand off to Marty for the
//                                             prototype targeting assumption #1
// Zero projects enter engineering without passing the gate.

import { getDb, logActivity } from "@/lib/db";
import {
  startRun, recordStep, completeRun,
  executeSkill, createHandoff, logPlaybookActivity,
} from "./runner";

const NAME = "build-to-learn-cycle";

interface ProjectRow {
  id: string; name: string; description: string | null;
  niche: string | null; target_audience: string | null; status: string;
}

export async function runBuildToLearnCycle(opts: { baseUrl: string; projectId: string }): Promise<{ ok: boolean; verdict?: string; reason?: string }> {
  const { run_id, alreadyRan } = startRun({
    playbookName: NAME, triggerEntityType: "project", triggerEntityId: opts.projectId,
  });
  if (alreadyRan) return { ok: true, verdict: "already_ran" };

  const project = getDb().prepare(
    "SELECT id, name, description, niche, target_audience, status FROM projects WHERE id = ?",
  ).get(opts.projectId) as ProjectRow | undefined;
  if (!project) {
    completeRun(run_id, { status: "failed", error: "project not found" });
    return { ok: false, reason: "project not found" };
  }

  const projectContext = `Project: ${project.name}
Status: ${project.status}
Niche: ${project.niche || "(none)"}
Target audience: ${project.target_audience || "(none)"}
Description: ${project.description || "(none)"}`;

  // Step 1: Riskiest Assumption Extractor
  const ras = await executeSkill({
    baseUrl: opts.baseUrl, skillId: "skill-riskiest-assumption-extractor",
    input: `Proposed initiative:\n${projectContext}\n\nExtract the riskiest assumptions and prescribe cheap kill-tests.`,
    projectId: project.id,
  });
  recordStep(run_id, {
    step: 1, name: "riskiest-assumption-extractor",
    status: ras.ok ? "ok" : "failed",
    output_excerpt: ras.output.slice(0, 500),
    at: new Date().toISOString(),
  });
  if (!ras.ok) {
    completeRun(run_id, { status: "failed", error: ras.error || "assumption extract failed" });
    return { ok: false, reason: ras.error };
  }

  // Step 2: Four-Bar Solution Scorer
  const scorer = await executeSkill({
    baseUrl: opts.baseUrl, skillId: "skill-four-bar-solution-scorer",
    input: `Score this proposal across Value/Usability/Feasibility/Viability:\n${projectContext}`,
    projectId: project.id,
  });
  recordStep(run_id, {
    step: 2, name: "four-bar-solution-scorer",
    status: scorer.ok ? "ok" : "failed",
    output_excerpt: scorer.output.slice(0, 500),
    at: new Date().toISOString(),
  });
  if (!scorer.ok) {
    completeRun(run_id, { status: "failed", error: scorer.error || "scorer failed" });
    return { ok: false, reason: scorer.error };
  }

  // Parse overall verdict from scorer output: SHIP | NEEDS WORK | KILL
  const verdict = parseScorerVerdict(scorer.output);

  if (verdict === "KILL") {
    logActivity({
      project_id: project.id,
      action: "build_to_learn_kill",
      details: `[${NAME}] Project "${project.name}" failed Four-Bar gate (verdict: KILL). Blocker: see playbook_runs row ${run_id}.`,
    });
    completeRun(run_id, { status: "completed", result: `KILL — failed at Four-Bar gate.` });
    return { ok: true, verdict: "kill" };
  }

  // PASS or NEEDS WORK — hand off to Marty with both outputs.
  createHandoff({
    fromAgentId: "agent-product",
    toAgentId: "agent-product",   // Marty IS agent-product, but the handoff
                                  // makes the work explicit (queues a message
                                  // visible in his inbox/dashboard).
    message: `[Build-to-Learn Cycle] Project "${project.name}" passed first-pass discovery. Verdict: ${verdict}. Run the cheapest kill-test on assumption #1 before any engineering commit. Use Four-Bar Solution Scorer outputs as the spec for what counts as 'ready.'\n\n--- ASSUMPTIONS ---\n${ras.output.slice(0, 2500)}\n\n--- FOUR-BAR SCORES ---\n${scorer.output.slice(0, 1500)}`,
    messageType: "handoff",
    deadlineMinutes: 8 * 60,
  });
  recordStep(run_id, { step: 3, name: "marty_handoff", status: "ok", detail: verdict, at: new Date().toISOString() });

  logPlaybookActivity(NAME, `Project "${project.name}" → discovery verdict ${verdict}. Assumptions extracted.`, project.id);
  completeRun(run_id, {
    status: "completed",
    result: `${verdict} — assumptions + four-bar scores generated; queued for kill-test prototype.`,
  });
  return { ok: true, verdict: verdict.toLowerCase() };
}

function parseScorerVerdict(out: string): "SHIP" | "NEEDS WORK" | "KILL" {
  const up = out.toUpperCase();
  if (/OVERALL:[^\n]*\bKILL\b/.test(up)) return "KILL";
  if (/OVERALL:[^\n]*\bNEEDS WORK\b/.test(up) || /OVERALL:[^\n]*NEEDS-WORK/.test(up)) return "NEEDS WORK";
  if (/OVERALL:[^\n]*\bSHIP\b/.test(up)) return "SHIP";
  return "NEEDS WORK";
}
