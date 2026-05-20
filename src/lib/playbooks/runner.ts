// ─── Playbook Runner ──────────────────────────────────────────────────────────
// Shared helpers used by all playbooks under src/lib/playbooks/.
//
// A playbook is a multi-step automation that chains skill executions,
// agent handoffs, and conditional branches. Each playbook records its run
// in `playbook_runs` for idempotency, audit, and UI surfacing.
//
// Idempotency model: a (playbook_name, trigger_entity_id) pair can have at
// most one row with status='running' or 'completed' — so a playbook can't
// fire twice on the same entity (e.g. the same stuck deal). Failed runs do
// not block re-tries; the entity is re-eligible.

import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export interface PlaybookStep {
  step: number;
  name: string;
  status: "ok" | "skipped" | "failed";
  detail?: string;
  output_excerpt?: string;
  at: string;
}

export function startRun(opts: {
  playbookName: string;
  triggerEntityType?: string;
  triggerEntityId?: string;
}): { run_id: string; alreadyRan: boolean } {
  const db = getDb();
  // Idempotency: skip if there's already a non-failed run for this entity.
  if (opts.triggerEntityId) {
    const existing = db.prepare(
      `SELECT id, status FROM playbook_runs
       WHERE playbook_name = ? AND trigger_entity_id = ?
         AND status IN ('running','completed')
       ORDER BY started_at DESC LIMIT 1`,
    ).get(opts.playbookName, opts.triggerEntityId) as { id: string; status: string } | undefined;
    if (existing) {
      return { run_id: existing.id, alreadyRan: true };
    }
  }
  const id = uuidv4();
  db.prepare(
    `INSERT INTO playbook_runs (id, playbook_name, trigger_entity_type, trigger_entity_id, status)
     VALUES (?, ?, ?, ?, 'running')`,
  ).run(id, opts.playbookName, opts.triggerEntityType ?? null, opts.triggerEntityId ?? null);
  return { run_id: id, alreadyRan: false };
}

export function recordStep(runId: string, step: PlaybookStep) {
  const db = getDb();
  const row = db.prepare("SELECT step_log FROM playbook_runs WHERE id = ?").get(runId) as { step_log: string } | undefined;
  if (!row) return;
  const log: PlaybookStep[] = JSON.parse(row.step_log || "[]");
  log.push(step);
  db.prepare("UPDATE playbook_runs SET step_log = ? WHERE id = ?").run(JSON.stringify(log), runId);
}

export function completeRun(runId: string, opts: { status: "completed" | "failed" | "aborted"; result?: string; error?: string }) {
  getDb().prepare(
    `UPDATE playbook_runs
     SET status = ?, result = ?, error = ?, completed_at = datetime('now')
     WHERE id = ?`,
  ).run(opts.status, opts.result ?? null, opts.error ?? null, runId);
}

// ── Step helpers ────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 120_000;

export async function executeSkill(opts: {
  baseUrl: string;
  skillId: string;
  input: string;
  projectId?: string | null;
}): Promise<{ ok: boolean; output: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${opts.baseUrl}/api/skills/${opts.skillId}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: opts.input, project_id: opts.projectId || undefined }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, output: "", error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const data = await res.json();
    return { ok: true, output: data.output || "" };
  } catch (err) {
    return { ok: false, output: "", error: err instanceof Error ? err.message : String(err) };
  }
}

export function createHandoff(opts: {
  fromAgentId: string;
  toAgentId: string;
  message: string;
  messageType?: "info" | "request" | "handoff" | "alert";
  deadlineMinutes?: number;
}): string {
  const db = getDb();
  const id = uuidv4();
  const deadlineAt = opts.deadlineMinutes
    ? new Date(Date.now() + opts.deadlineMinutes * 60_000).toISOString()
    : null;
  db.prepare(
    `INSERT INTO agent_messages
     (id, from_agent_id, to_agent_id, message, message_type, deadline_at, is_read)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
  ).run(id, opts.fromAgentId, opts.toAgentId, opts.message, opts.messageType ?? "handoff", deadlineAt);
  return id;
}

export function logPlaybookActivity(playbookName: string, message: string, projectId?: string | null) {
  logActivity({
    action: "playbook_run",
    project_id: projectId || undefined,
    details: `[${playbookName}] ${message}`.slice(0, 800),
  });
}

// ── Trigger query helpers (used by automation/process to find pending work) ──

export interface TriggerCandidate {
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
}

/**
 * Stuck deals: no deal_activities row in the last 7 days AND stage is not
 * terminal (won/lost). Used by Stuck Deal Revival playbook.
 */
export function findStuckDeals(maxResults = 20): TriggerCandidate[] {
  const rows = getDb().prepare(
    `SELECT d.id, d.title, d.stage, d.value, d.notes, d.updated_at,
            (SELECT MAX(da.created_at) FROM deal_activities da WHERE da.deal_id = d.id) as last_activity_at
     FROM deals d
     WHERE d.stage NOT IN ('won','lost')
       AND COALESCE(
         (SELECT MAX(da.created_at) FROM deal_activities da WHERE da.deal_id = d.id),
         d.updated_at
       ) < datetime('now','-7 days')
     ORDER BY d.value DESC
     LIMIT ?`,
  ).all(maxResults) as Array<{
    id: string; title: string; stage: string; value: number; notes: string | null;
    updated_at: string; last_activity_at: string | null;
  }>;
  return rows.map(r => ({ entityType: "deal", entityId: r.id, details: r as unknown as Record<string, unknown> }));
}

/**
 * Newly-created projects with no playbook run yet — kicks off Build-to-Learn
 * Cycle and New Offer Launch playbooks.
 */
export function findNewProjects(maxResults = 5): TriggerCandidate[] {
  const rows = getDb().prepare(
    `SELECT p.id, p.name, p.description, p.status, p.niche, p.target_audience, p.score, p.created_at
     FROM projects p
     WHERE p.created_at > datetime('now','-30 days')
       AND p.status IN ('idea','active')
     ORDER BY p.created_at DESC
     LIMIT ?`,
  ).all(maxResults) as Array<Record<string, unknown>>;
  return rows.map(r => ({ entityType: "project", entityId: String(r.id), details: r }));
}

/**
 * IdeaBrowser ideas scoring above the validation threshold (overall_score>=60)
 * that haven't been through the Last-Mover gate yet. Trigger for playbook 20.
 */
export function findIdeasReadyForValidation(maxResults = 5): TriggerCandidate[] {
  const rows = getDb().prepare(
    `SELECT id, title, description, category, overall_score, gate1_score, validation_status
     FROM ideabrowser_ideas
     WHERE overall_score >= 60
       AND (validation_status IS NULL OR validation_status IN ('unreviewed','scored'))
     ORDER BY overall_score DESC
     LIMIT ?`,
  ).all(maxResults) as Array<Record<string, unknown>>;
  return rows.map(r => ({ entityType: "idea", entityId: String(r.id), details: r }));
}

/**
 * Negative outcomes in the last hour that haven't been post-mortemed yet.
 * Trigger for Post-Failure Reflection routine (item 12).
 */
export function findRecentFailures(maxResults = 5): TriggerCandidate[] {
  const rows = getDb().prepare(
    `SELECT id, action, details, created_at, project_id
     FROM activity_log
     WHERE created_at > datetime('now','-1 hour')
       AND (
         action IN ('coder_failed','ad_launch_failed','scraper_error','agent_run_failed')
         OR lower(details) LIKE '%failed%'
         OR lower(details) LIKE '%error%'
         OR lower(details) LIKE '%bounce%'
         OR lower(details) LIKE '%cancelled%'
       )
       AND id NOT IN (
         SELECT trigger_entity_id FROM playbook_runs
         WHERE playbook_name = 'post-failure-reflection' AND trigger_entity_id IS NOT NULL
       )
     ORDER BY created_at DESC
     LIMIT ?`,
  ).all(maxResults) as Array<Record<string, unknown>>;
  return rows.map(r => ({ entityType: "activity_log", entityId: String(r.id), details: r }));
}
