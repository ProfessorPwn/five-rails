import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface AgentRow {
  id: string;
  name: string;
  department: string;
  agent_state: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  current_task_id: string | null;
  is_active: number;
}

interface TodayRunsRow {
  total: number;
  completed: number;
  failed: number;
  cost_usd: number | null;
}

interface PriorityCountRow {
  priority: string;
  c: number;
}

interface KpiItem {
  label: string;
  value: string | number;
  href?: string;
  tone?: "default" | "warning" | "danger" | "success";
}

interface InboxItem {
  id: string;
  title: string;
  subtitle?: string;
  priority: "low" | "normal" | "high" | "urgent";
  href: string;
  kind: "handoff" | "fix" | "gap";
  created_at: string;
}

interface FleetItem {
  id: string;
  name: string;
  department: string;
  agent_state: "idle" | "working" | "blocked" | "error";
  last_run_at: string | null;
  next_run_at: string | null;
  current_task_label: string | null;
  queue_depth: number;
  last_run_status: "completed" | "failed" | "timeout" | "running" | null;
  unread_messages: number;
}

const PRIORITY_RANK: Record<InboxItem["priority"], number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function asAgentState(value: string | null): FleetItem["agent_state"] {
  if (value === "working" || value === "blocked" || value === "error") return value;
  return "idle";
}

function priorityFromMessage(messageType: string | null, isRead: number, storedPriority: string | null): InboxItem["priority"] {
  if (storedPriority === "urgent" || storedPriority === "high" || storedPriority === "low") return storedPriority;
  if (messageType === "alert") return "urgent";
  if (messageType === "handoff") return "high";
  if (messageType === "request") return "normal";
  return isRead ? "low" : "normal";
}

export async function GET() {
  try {
    const db = getDb();

    const agents = db.prepare(`
      SELECT id, name, department, agent_state, last_run_at, next_run_at,
             current_task_id, is_active
      FROM agents
      WHERE is_active = 1
      ORDER BY department ASC, name ASC
    `).all() as AgentRow[];

    const today = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status IN ('failed','timeout') THEN 1 ELSE 0 END) AS failed,
        COALESCE(SUM(cost_usd), 0) AS cost_usd
      FROM agent_runs
      WHERE started_at >= datetime('now','-1 day')
    `).get() as TodayRunsRow;

    const totalRuns = today.total ?? 0;
    const completedRuns = today.completed ?? 0;
    const failedRuns = today.failed ?? 0;
    const successRate = totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 100;

    const unreadCount = (db.prepare(
      `SELECT COUNT(*) AS c FROM agent_messages WHERE is_read = 0`
    ).get() as { c: number }).c;

    const pendingFixes = (db.prepare(
      `SELECT COUNT(*) AS c FROM watchdog_code_fixes WHERE status = 'pending'`
    ).get() as { c: number }).c;

    const pendingGaps = (db.prepare(
      `SELECT COUNT(*) AS c FROM capability_gaps WHERE status = 'pending'`
    ).get() as { c: number }).c;

    const blockedTasks = (db.prepare(
      `SELECT COUNT(*) AS c FROM agent_tasks WHERE status = 'blocked'`
    ).get() as { c: number }).c;

    interface UnreadMessageRow {
      id: string;
      from_agent_id: string;
      to_agent_id: string | null;
      message: string;
      message_type: string;
      created_at: string;
      priority: string | null;
      is_read: number;
      from_name: string | null;
    }
    const unreadMessages = db.prepare(`
      SELECT m.id, m.from_agent_id, m.to_agent_id, m.message, m.message_type,
             m.created_at, m.priority, m.is_read,
             a.name AS from_name
      FROM agent_messages m
      LEFT JOIN agents a ON a.id = m.from_agent_id
      WHERE m.is_read = 0 AND m.seen_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT 30
    `).all() as UnreadMessageRow[];

    interface FixRow {
      id: string;
      title: string;
      gap_text: string | null;
      created_at: string;
    }
    const fixRows = db.prepare(`
      SELECT id, title, gap_text,
             COALESCE(created_at, datetime('now')) AS created_at
      FROM watchdog_code_fixes
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT 8
    `).all() as FixRow[];

    interface GapRow {
      id: string;
      missing_capability: string;
      task_description: string;
      created_at: string;
    }
    const gapRows = db.prepare(`
      SELECT id, missing_capability, task_description, created_at
      FROM capability_gaps
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT 8
    `).all() as GapRow[];

    const inbox: InboxItem[] = [
      ...unreadMessages.map((m): InboxItem => ({
        id: `msg-${m.id}`,
        title: `${m.from_name ?? "Agent"} → ${m.message_type}`,
        subtitle: m.message.slice(0, 90),
        priority: priorityFromMessage(m.message_type, m.is_read, m.priority),
        href: `/inbox#${m.id}`,
        kind: "handoff",
        created_at: m.created_at,
      })),
      ...fixRows.map((f): InboxItem => ({
        id: `fix-${f.id}`,
        title: f.title,
        subtitle: f.gap_text?.slice(0, 90) ?? undefined,
        priority: "high",
        href: `/agents/watchdog/fixes#${f.id}`,
        kind: "fix",
        created_at: f.created_at,
      })),
      ...gapRows.map((g): InboxItem => ({
        id: `gap-${g.id}`,
        title: `Gap: ${g.missing_capability}`,
        subtitle: g.task_description.slice(0, 90),
        priority: "normal",
        href: `/agents/watchdog#gap-${g.id}`,
        kind: "gap",
        created_at: g.created_at,
      })),
    ].sort((a, b) => {
      const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (p !== 0) return p;
      return a.created_at < b.created_at ? 1 : -1;
    });

    interface CurrentTaskRow {
      agent_id: string;
      name: string;
    }
    const currentTaskRows = db.prepare(`
      SELECT t.agent_id, t.name
      FROM agent_tasks t
      WHERE t.status IN ('working','queued','blocked')
        AND t.agent_id IN (${agents.map(() => "?").join(",") || "''"})
      ORDER BY t.status = 'working' DESC, t.created_at ASC
    `).all(...agents.map((a) => a.id)) as CurrentTaskRow[];

    const currentTaskByAgent = new Map<string, string>();
    for (const row of currentTaskRows) {
      if (!currentTaskByAgent.has(row.agent_id)) {
        currentTaskByAgent.set(row.agent_id, row.name);
      }
    }

    interface QueueDepthRow {
      agent_id: string;
      c: number;
    }
    const queueRows = db.prepare(`
      SELECT agent_id, COUNT(*) AS c
      FROM agent_tasks
      WHERE status IN ('queued','working','blocked')
      GROUP BY agent_id
    `).all() as QueueDepthRow[];
    const queueByAgent = new Map<string, number>(queueRows.map((q) => [q.agent_id, q.c]));

    interface LastRunRow {
      agent_id: string;
      status: FleetItem["last_run_status"];
    }
    const lastRunRows = db.prepare(`
      SELECT r.agent_id, r.status
      FROM agent_runs r
      JOIN (
        SELECT agent_id, MAX(started_at) AS started_at
        FROM agent_runs
        GROUP BY agent_id
      ) latest ON latest.agent_id = r.agent_id AND latest.started_at = r.started_at
    `).all() as LastRunRow[];
    const lastRunByAgent = new Map<string, FleetItem["last_run_status"]>(
      lastRunRows.map((r) => [r.agent_id, r.status])
    );

    interface UnreadByAgentRow {
      to_agent_id: string;
      c: number;
    }
    const unreadByAgent = new Map<string, number>(
      (db.prepare(
        `SELECT to_agent_id, COUNT(*) AS c FROM agent_messages WHERE is_read = 0 AND to_agent_id IS NOT NULL GROUP BY to_agent_id`
      ).all() as UnreadByAgentRow[]).map((r) => [r.to_agent_id, r.c])
    );

    const fleet: FleetItem[] = agents.map((a) => ({
      id: a.id,
      name: a.name,
      department: a.department,
      agent_state: asAgentState(a.agent_state),
      last_run_at: a.last_run_at,
      next_run_at: a.next_run_at,
      current_task_label: currentTaskByAgent.get(a.id) ?? null,
      queue_depth: queueByAgent.get(a.id) ?? 0,
      last_run_status: lastRunByAgent.get(a.id) ?? null,
      unread_messages: unreadByAgent.get(a.id) ?? 0,
    }));

    const workingCount = fleet.filter((f) => f.agent_state === "working").length;
    const blockedCount = fleet.filter((f) => f.agent_state === "blocked" || f.agent_state === "error").length;
    const attentionCount = unreadCount + pendingFixes + pendingGaps;

    const kpis: KpiItem[] = [
      {
        label: "Fleet",
        value: `${workingCount} / ${fleet.length}`,
        tone: blockedCount > 0 ? "warning" : workingCount > 0 ? "success" : "default",
        href: "/agents",
      },
      {
        label: "Runs 24h",
        value: totalRuns,
        href: "/activity",
      },
      {
        label: "Success",
        value: `${successRate}%`,
        tone: successRate >= 90 ? "success" : successRate >= 70 ? "warning" : "danger",
      },
      {
        label: "Attention",
        value: attentionCount,
        tone: attentionCount > 0 ? "warning" : "default",
        href: "/inbox",
      },
      {
        label: "Cost 24h",
        value: `$${(today.cost_usd ?? 0).toFixed(2)}`,
      },
    ];

    const priorityCountRows = db.prepare(`
      SELECT COALESCE(priority, 'normal') AS priority, COUNT(*) AS c
      FROM agent_messages
      WHERE is_read = 0
      GROUP BY priority
    `).all() as PriorityCountRow[];
    const priorityCounts = priorityCountRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.priority] = row.c;
      return acc;
    }, {});

    return NextResponse.json({
      kpis,
      inbox: inbox.slice(0, 12),
      fleet,
      attention: {
        unread_messages: unreadCount,
        pending_watchdog_fixes: pendingFixes,
        pending_capability_gaps: pendingGaps,
        blocked_tasks: blockedTasks,
        unread_by_priority: priorityCounts,
      },
      today: {
        runs_total: totalRuns,
        runs_completed: completedRuns,
        runs_failed: failedRuns,
        success_rate: successRate,
        cost_usd: today.cost_usd ?? 0,
      },
    });
  } catch (error) {
    console.error("GET /api/command/overview error:", error);
    return NextResponse.json(
      { error: "Failed to assemble overview" },
      { status: 500 }
    );
  }
}
