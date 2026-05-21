import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface TraceNode {
  kind:
    | "trigger"
    | "playbook_start"
    | "playbook_step"
    | "skill_execution"
    | "handoff"
    | "playbook_complete"
    | "agent_run"
    | "agent_decision"
    | "activity"
    | "watchdog_fix"
    | "event";
  at: string;
  title: string;
  subtitle?: string;
  detail?: string;
  status?: "ok" | "skipped" | "failed" | "running" | "completed" | "timeout";
  link?: string;
  entity?: { type: string; id: string };
}

interface MessageRow {
  id: string;
  from_agent_id: string;
  to_agent_id: string | null;
  message: string;
  message_type: string;
  priority: string | null;
  is_read: number;
  seen_at: string | null;
  created_at: string;
  deadline_at: string | null;
  from_name: string | null;
  to_name: string | null;
}

interface PlaybookRunRow {
  id: string;
  playbook_name: string;
  trigger_entity_type: string | null;
  trigger_entity_id: string | null;
  status: string;
  result: string | null;
  error: string | null;
  step_log: string;
  started_at: string;
  completed_at: string | null;
}

interface SkillExecRow {
  id: string;
  skill_id: string;
  agent_id: string | null;
  run_id: string | null;
  project_id: string | null;
  input_excerpt: string | null;
  output_excerpt: string | null;
  status: string;
  duration_ms: number;
  cost_usd: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

interface EventRow {
  id: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  source_agent_id: string | null;
  payload_json: string | null;
  created_at: string;
}

interface ActivityRow {
  id: string;
  action: string;
  details: string | null;
  project_id: string | null;
  created_at: string;
}

interface AgentRunRow {
  id: string;
  agent_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  skill_used: string | null;
  action_taken: string | null;
  error: string | null;
}

interface PlaybookStepLog {
  step: number;
  name: string;
  status: "ok" | "skipped" | "failed";
  output_excerpt?: string;
  detail?: string;
  at: string;
}

function parsePayload(payload: string | null): Record<string, unknown> {
  if (!payload) return {};
  try { return JSON.parse(payload) as Record<string, unknown>; } catch { return {}; }
}

function assembleFromPlaybookRun(runId: string): TraceNode[] {
  const db = getDb();
  const run = db.prepare(
    `SELECT id, playbook_name, trigger_entity_type, trigger_entity_id, status,
            result, error, step_log, started_at, completed_at
     FROM playbook_runs WHERE id = ?`
  ).get(runId) as PlaybookRunRow | undefined;
  if (!run) return [];

  const nodes: TraceNode[] = [];

  if (run.trigger_entity_id) {
    nodes.push({
      kind: "trigger",
      at: run.started_at,
      title: `Trigger: ${run.trigger_entity_type ?? "entity"} ${run.trigger_entity_id.slice(0, 8)}`,
      subtitle: run.playbook_name,
      link: run.trigger_entity_type === "project" ? `/projects/${run.trigger_entity_id}`
          : run.trigger_entity_type === "idea" ? `/ideabrowser`
          : undefined,
      entity: { type: run.trigger_entity_type ?? "entity", id: run.trigger_entity_id },
    });
  }

  nodes.push({
    kind: "playbook_start",
    at: run.started_at,
    title: `Playbook started: ${run.playbook_name}`,
    entity: { type: "playbook_run", id: run.id },
  });

  let stepLog: PlaybookStepLog[] = [];
  try { stepLog = JSON.parse(run.step_log || "[]") as PlaybookStepLog[]; } catch { /* keep empty */ }
  for (const step of stepLog) {
    nodes.push({
      kind: "playbook_step",
      at: step.at,
      title: `Step ${step.step}: ${step.name}`,
      subtitle: step.detail,
      detail: step.output_excerpt,
      status: step.status,
    });
  }

  const skills = db.prepare(
    `SELECT id, skill_id, agent_id, run_id, project_id, input_excerpt, output_excerpt,
            status, duration_ms, cost_usd, error, started_at, completed_at
     FROM skill_executions
     WHERE run_id = ?
     ORDER BY started_at ASC`
  ).all(run.id) as SkillExecRow[];
  for (const s of skills) {
    nodes.push({
      kind: "skill_execution",
      at: s.started_at,
      title: `Skill: ${s.skill_id}`,
      subtitle: s.duration_ms ? `${s.duration_ms}ms` : undefined,
      detail: s.output_excerpt ?? s.error ?? undefined,
      status: s.status as TraceNode["status"],
      link: `/skills`,
      entity: { type: "skill_execution", id: s.id },
    });
  }

  // Handoffs that name this playbook run in their event payload
  interface HandoffEventRow extends EventRow {}
  const handoffEvents = db.prepare(
    `SELECT id, type, entity_type, entity_id, source_agent_id, payload_json, created_at
     FROM events
     WHERE type = 'handoff_created'
       AND payload_json LIKE ?`
  ).all(`%${run.id}%`) as HandoffEventRow[];
  for (const ev of handoffEvents) {
    const payload = parsePayload(ev.payload_json);
    if (payload.playbook_run_id !== run.id) continue;
    nodes.push({
      kind: "handoff",
      at: ev.created_at,
      title: `Handoff → ${(payload.to_agent_id as string | null) ?? "(unassigned)"}`,
      subtitle: (payload.priority as string) ?? "normal",
      detail: (payload.excerpt as string) ?? undefined,
      link: ev.entity_id ? `/inbox#${ev.entity_id}` : undefined,
      entity: ev.entity_id ? { type: "message", id: ev.entity_id } : undefined,
    });
  }

  if (run.completed_at) {
    nodes.push({
      kind: "playbook_complete",
      at: run.completed_at,
      title: `Playbook ${run.status}: ${run.playbook_name}`,
      detail: run.result ?? run.error ?? undefined,
      status: run.status as TraceNode["status"],
    });
  }

  // Activity_log entries linked by project or by playbook name in details
  if (run.trigger_entity_type === "project" && run.trigger_entity_id) {
    const activity = db.prepare(
      `SELECT id, action, details, project_id, created_at
       FROM activity_log
       WHERE project_id = ?
         AND created_at >= ?
         AND created_at <= COALESCE(?, datetime('now','+1 day'))
       ORDER BY created_at ASC`
    ).all(run.trigger_entity_id, run.started_at, run.completed_at) as ActivityRow[];
    for (const a of activity) {
      nodes.push({
        kind: "activity",
        at: a.created_at,
        title: a.action,
        detail: a.details ?? undefined,
      });
    }
  }

  return nodes;
}

function assembleFromMessage(messageId: string): TraceNode[] {
  const db = getDb();
  const m = db.prepare(
    `SELECT m.id, m.from_agent_id, m.to_agent_id, m.message, m.message_type,
            m.priority, m.is_read, m.seen_at, m.created_at, m.deadline_at,
            af.name AS from_name, at.name AS to_name
     FROM agent_messages m
     LEFT JOIN agents af ON af.id = m.from_agent_id
     LEFT JOIN agents at ON at.id = m.to_agent_id
     WHERE m.id = ?`
  ).get(messageId) as MessageRow | undefined;
  if (!m) return [];

  const nodes: TraceNode[] = [];
  nodes.push({
    kind: "handoff",
    at: m.created_at,
    title: `${m.from_name ?? "Agent"} → ${m.to_name ?? "Operator"}`,
    subtitle: `${m.message_type} • ${m.priority ?? "normal"}`,
    detail: m.message,
    entity: { type: "message", id: m.id },
  });

  // Locate the originating playbook run via the handoff_created event payload.
  const ev = db.prepare(
    `SELECT id, type, entity_type, entity_id, source_agent_id, payload_json, created_at
     FROM events
     WHERE type = 'handoff_created' AND entity_id = ?
     LIMIT 1`
  ).get(messageId) as EventRow | undefined;
  if (ev) {
    const payload = parsePayload(ev.payload_json);
    const playbookRunId = payload.playbook_run_id as string | null | undefined;
    if (playbookRunId) {
      // Assemble the full playbook chain and inline it BEFORE the handoff for
      // chronological order. Sorting by `at` at the end handles ordering.
      nodes.push(...assembleFromPlaybookRun(playbookRunId));
    }
  }

  return nodes;
}

function assembleFromAgentRun(runId: string): TraceNode[] {
  const db = getDb();
  const r = db.prepare(
    `SELECT id, agent_id, status, started_at, completed_at, skill_used, action_taken, error
     FROM agent_runs WHERE id = ?`
  ).get(runId) as AgentRunRow | undefined;
  if (!r) return [];

  const nodes: TraceNode[] = [];
  nodes.push({
    kind: "agent_run",
    at: r.started_at,
    title: `Agent run: ${r.agent_id}`,
    subtitle: r.action_taken ?? undefined,
    status: r.status as TraceNode["status"],
    entity: { type: "agent_run", id: r.id },
    link: `/agents/${r.agent_id}`,
  });

  const skills = db.prepare(
    `SELECT id, skill_id, agent_id, run_id, project_id, input_excerpt, output_excerpt,
            status, duration_ms, cost_usd, error, started_at, completed_at
     FROM skill_executions
     WHERE run_id = ? OR agent_id = ?
     ORDER BY started_at ASC LIMIT 50`
  ).all(r.id, r.agent_id) as SkillExecRow[];
  for (const s of skills) {
    nodes.push({
      kind: "skill_execution",
      at: s.started_at,
      title: `Skill: ${s.skill_id}`,
      subtitle: s.duration_ms ? `${s.duration_ms}ms` : undefined,
      detail: s.output_excerpt ?? s.error ?? undefined,
      status: s.status as TraceNode["status"],
    });
  }

  return nodes;
}

function assembleFromTriggerEntity(entityType: string, entityId: string): TraceNode[] {
  const db = getDb();
  const runs = db.prepare(
    `SELECT id FROM playbook_runs WHERE trigger_entity_type = ? AND trigger_entity_id = ?
     ORDER BY started_at DESC LIMIT 5`
  ).all(entityType, entityId) as Array<{ id: string }>;
  const nodes: TraceNode[] = [];
  for (const r of runs) {
    nodes.push(...assembleFromPlaybookRun(r.id));
  }
  return nodes;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  try {
    const { entityType, entityId } = await params;
    let nodes: TraceNode[];

    switch (entityType) {
      case "message":
        nodes = assembleFromMessage(entityId);
        break;
      case "playbook_run":
        nodes = assembleFromPlaybookRun(entityId);
        break;
      case "agent_run":
        nodes = assembleFromAgentRun(entityId);
        break;
      case "project":
      case "idea":
      case "deal":
      case "activity_log":
        nodes = assembleFromTriggerEntity(entityType, entityId);
        break;
      default:
        return NextResponse.json({ error: `Unknown entity type: ${entityType}` }, { status: 400 });
    }

    nodes.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

    return NextResponse.json({
      entity: { type: entityType, id: entityId },
      nodes,
      count: nodes.length,
    });
  } catch (error) {
    console.error("GET /api/command/traces error:", error);
    return NextResponse.json({ error: "Failed to assemble trace" }, { status: 500 });
  }
}
