// ─── High-Stakes Decision Gate (Dalio, consolidated item #19) ────────────────
// Triggered when any agent submits a ≥80%-confidence recommendation with no
// recorded dissent, OR when a deal/hire/strategic pivot is flagged high-stakes.
//
// Steps:
//   1. skill-contrarian-stress-tester — constructs the strongest case against
//   2. If material risk surfaces: skill-believability-decider — weights inputs
//      by verifiable track record, not vote
//   3. Dalio (executive) delivers recommendation with full reasoning chain;
//      decision + falsifiability condition logged to activity_log as a
//      principle candidate

import {
  startRun, recordStep, completeRun,
  executeSkill, createHandoff, logPlaybookActivity,
} from "./runner";

const NAME = "high-stakes-decision-gate";

export async function runHighStakesDecisionGate(opts: {
  baseUrl: string;
  triggerKey: string;             // any unique id — decision_id, deal_id, run_id
  proposalSummary: string;        // what's being proposed
  recordedRationales?: Array<{ source: string; rationale: string }>;
}): Promise<{ ok: boolean; verdict?: string; reason?: string }> {
  const { run_id, alreadyRan } = startRun({
    playbookName: NAME, triggerEntityType: "decision", triggerEntityId: opts.triggerKey,
  });
  if (alreadyRan) return { ok: true, verdict: "already_ran" };

  // Step 1 — Contrarian Stress-Tester
  const cst = await executeSkill({
    baseUrl: opts.baseUrl, skillId: "skill-contrarian-stress-tester",
    input: `Proposal under stress-test:\n${opts.proposalSummary}`,
  });
  recordStep(run_id, {
    step: 1, name: "contrarian-stress-tester",
    status: cst.ok ? "ok" : "failed",
    output_excerpt: cst.output.slice(0, 500),
    at: new Date().toISOString(),
  });
  if (!cst.ok) {
    completeRun(run_id, { status: "failed", error: cst.error || "stress-test failed" });
    return { ok: false, reason: cst.error };
  }

  // Pull recommendation from output
  const rec = parseRec(cst.output);

  // Step 2 — if KILL or PAUSE surfaced, weight inputs via believability-decider
  let bwd: { ok: boolean; output: string; error?: string } | null = null;
  if (rec !== "GO" && opts.recordedRationales?.length) {
    const advisorBlock = opts.recordedRationales
      .map((r, i) => `Advisor ${String.fromCharCode(65 + i)} (${r.source}): ${r.rationale}`)
      .join("\n\n");
    bwd = await executeSkill({
      baseUrl: opts.baseUrl, skillId: "skill-believability-decider",
      input: `Decision context:\n${opts.proposalSummary}\n\nContrarian case:\n${cst.output.slice(0, 1500)}\n\nAdvisor inputs:\n${advisorBlock}`,
    });
    recordStep(run_id, {
      step: 2, name: "believability-decider",
      status: bwd.ok ? "ok" : "failed",
      output_excerpt: bwd.output.slice(0, 500),
      at: new Date().toISOString(),
    });
  } else {
    recordStep(run_id, { step: 2, name: "believability-decider", status: "skipped", detail: `rec=${rec}, no rationales provided`, at: new Date().toISOString() });
  }

  // Step 3 — handoff to Dalio with the full reasoning chain for final call.
  // The falsifiability condition from the stress-test is the principle candidate.
  const falsifyMatch = cst.output.match(/Falsifiability condition:\*?\*?\s*(.+?)(?:\n|$)/i);
  const falsifiability = falsifyMatch ? falsifyMatch[1].trim() : "(no explicit falsifiability surfaced)";

  createHandoff({
    fromAgentId: "agent-product",  // sole-reporter pattern: Marty raises
    toAgentId: "agent-executive",  // Dalio arbitrates
    message: `[High-Stakes Decision Gate] Proposal under gate. Stress-test recommendation: ${rec}. Falsifiability: ${falsifiability}\n\nFull reasoning chain:\n${cst.output.slice(0, 2500)}${bwd ? `\n\nBelievability-weighted synthesis:\n${bwd.output.slice(0, 1500)}` : ""}\n\nDeliver the final call with explicit reasoning chain — not just a conclusion. Log the falsifiability condition to activity_log as a principle candidate.`,
    messageType: "handoff",
    deadlineMinutes: 4 * 60,
  });
  recordStep(run_id, { step: 3, name: "dalio_handoff", status: "ok", at: new Date().toISOString() });

  logPlaybookActivity(NAME, `Decision ${opts.triggerKey} → contrarian=${rec}, handed to Dalio for arbitration.`);
  completeRun(run_id, {
    status: "completed",
    result: `Stress-test: ${rec}. Falsifiability: ${falsifiability}. Handed to Dalio.`,
  });
  return { ok: true, verdict: rec };
}

function parseRec(out: string): "GO" | "PAUSE" | "KILL" {
  const up = out.toUpperCase();
  if (/RECOMMENDATION:\*?\*?\s*KILL/.test(up)) return "KILL";
  if (/RECOMMENDATION:\*?\*?\s*PAUSE/.test(up)) return "PAUSE";
  return "GO";
}
