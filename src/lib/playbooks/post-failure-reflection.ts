// ─── Post-Failure Reflection Trigger (Dalio, consolidated item #12) ──────────
// Event-driven: fires within 1 hour of any negative outcome logged to
// activity_log. Automatically invokes Post-Mortem Extractor on the failure
// context. Records the encoded principle to a persistent activity_log entry
// so future agents can retrieve it.

import { getDb, logActivity } from "@/lib/db";
import {
  startRun, recordStep, completeRun,
  executeSkill, logPlaybookActivity,
} from "./runner";

const NAME = "post-failure-reflection";

interface ActivityRow {
  id: string; action: string; details: string | null;
  created_at: string; project_id: string | null;
}

export async function runPostFailureReflection(opts: { baseUrl: string; activityId: string }): Promise<{ ok: boolean; reason?: string }> {
  const { run_id, alreadyRan } = startRun({
    playbookName: NAME, triggerEntityType: "activity_log", triggerEntityId: opts.activityId,
  });
  if (alreadyRan) return { ok: true, reason: "already_ran" };

  const failure = getDb().prepare(
    "SELECT id, action, details, created_at, project_id FROM activity_log WHERE id = ?",
  ).get(opts.activityId) as ActivityRow | undefined;
  if (!failure) {
    completeRun(run_id, { status: "failed", error: "activity not found" });
    return { ok: false, reason: "activity not found" };
  }

  const failureContext = `Failure event from activity_log:
Action: ${failure.action}
At: ${failure.created_at}
Details: ${failure.details || "(none)"}

Convert this into a post-mortem.`;

  const pm = await executeSkill({
    baseUrl: opts.baseUrl, skillId: "skill-post-mortem-extractor",
    input: failureContext, projectId: failure.project_id,
  });
  recordStep(run_id, {
    step: 1, name: "post-mortem-extractor",
    status: pm.ok ? "ok" : "failed",
    output_excerpt: pm.output.slice(0, 500),
    at: new Date().toISOString(),
  });
  if (!pm.ok) {
    completeRun(run_id, { status: "failed", error: pm.error || "post-mortem failed" });
    return { ok: false, reason: pm.error };
  }

  // Persist the encoded principle to activity_log so other agents can retrieve.
  logActivity({
    project_id: failure.project_id || undefined,
    action: "principle_encoded",
    details: `[post-mortem of ${failure.id}] ${pm.output.slice(0, 2000)}`,
  });

  logPlaybookActivity(NAME, `Encoded principle from failure ${failure.id} (${failure.action})`, failure.project_id);
  completeRun(run_id, {
    status: "completed",
    result: `Principle encoded from ${failure.action}. Available via activity_log.action='principle_encoded'.`,
  });
  return { ok: true };
}
