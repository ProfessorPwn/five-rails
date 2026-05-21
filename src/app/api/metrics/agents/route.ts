import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface DailyRunRow {
  day: string;
  agent_id: string;
  agent_name: string | null;
  total: number;
  completed: number;
  failed: number;
}

interface DurationSampleRow {
  duration_ms: number | null;
}

interface CostByAgentRow {
  agent_id: string;
  agent_name: string | null;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  exec_count: number;
}

interface TopSkillRow {
  skill_id: string;
  exec_count: number;
  cost_usd: number;
  avg_duration_ms: number;
  failure_rate: number;
}

interface DailyCostRow {
  day: string;
  cost_usd: number;
  exec_count: number;
}

function clampDays(days: number): number {
  if (!Number.isFinite(days) || days < 1) return 14;
  if (days > 90) return 90;
  return Math.round(days);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const days = clampDays(parseInt(url.searchParams.get("days") ?? "14", 10));
    const agentFilter = url.searchParams.get("agent_id");
    const sinceClause = `datetime('now','-${days} days')`;
    const db = getDb();

    const dailyRuns = db.prepare(`
      SELECT
        date(r.started_at) AS day,
        r.agent_id,
        a.name AS agent_name,
        COUNT(*) AS total,
        SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN r.status IN ('failed','timeout') THEN 1 ELSE 0 END) AS failed
      FROM agent_runs r
      LEFT JOIN agents a ON a.id = r.agent_id
      WHERE r.started_at >= ${sinceClause}
        ${agentFilter ? "AND r.agent_id = ?" : ""}
      GROUP BY day, r.agent_id
      ORDER BY day ASC, r.agent_id ASC
    `).all(...(agentFilter ? [agentFilter] : [])) as DailyRunRow[];

    // Build day-by-day total run + success rate series across the whole fleet.
    const dailyFleet = new Map<string, { total: number; completed: number; failed: number }>();
    for (const r of dailyRuns) {
      const cur = dailyFleet.get(r.day) ?? { total: 0, completed: 0, failed: 0 };
      cur.total += r.total;
      cur.completed += r.completed;
      cur.failed += r.failed;
      dailyFleet.set(r.day, cur);
    }
    const runsPerDay = Array.from(dailyFleet.entries())
      .map(([day, s]) => ({
        day,
        total: s.total,
        completed: s.completed,
        failed: s.failed,
        success_rate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 100,
      }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));

    // Per-agent run totals (for stacked or grouped bars).
    const perAgentDaily = dailyRuns.map((r) => ({
      day: r.day,
      agent_id: r.agent_id,
      agent_name: r.agent_name,
      total: r.total,
      completed: r.completed,
      failed: r.failed,
    }));

    // Duration percentiles across all runs in the window (completed only).
    const durationRows = db.prepare(`
      SELECT duration_ms FROM agent_runs
      WHERE started_at >= ${sinceClause}
        AND duration_ms IS NOT NULL AND duration_ms > 0
        ${agentFilter ? "AND agent_id = ?" : ""}
      ORDER BY duration_ms ASC
    `).all(...(agentFilter ? [agentFilter] : [])) as DurationSampleRow[];
    const durations = durationRows
      .map((r) => r.duration_ms ?? 0)
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    const durationStats = {
      sample_count: durations.length,
      p50_ms: percentile(durations, 50),
      p95_ms: percentile(durations, 95),
      p99_ms: percentile(durations, 99),
    };

    // Cost per agent across the window — driven by skill_executions (the
    // capture point in runner.executeSkill).
    const costByAgent = db.prepare(`
      SELECT
        s.agent_id,
        a.name AS agent_name,
        COALESCE(SUM(s.cost_usd), 0) AS cost_usd,
        COALESCE(SUM(s.tokens_in), 0) AS tokens_in,
        COALESCE(SUM(s.tokens_out), 0) AS tokens_out,
        COUNT(*) AS exec_count
      FROM skill_executions s
      LEFT JOIN agents a ON a.id = s.agent_id
      WHERE s.started_at >= ${sinceClause}
        ${agentFilter ? "AND s.agent_id = ?" : ""}
      GROUP BY s.agent_id
      ORDER BY cost_usd DESC
    `).all(...(agentFilter ? [agentFilter] : [])) as CostByAgentRow[];

    // Daily cost trend (whole fleet).
    const dailyCost = db.prepare(`
      SELECT
        date(s.started_at) AS day,
        COALESCE(SUM(s.cost_usd), 0) AS cost_usd,
        COUNT(*) AS exec_count
      FROM skill_executions s
      WHERE s.started_at >= ${sinceClause}
        ${agentFilter ? "AND s.agent_id = ?" : ""}
      GROUP BY day
      ORDER BY day ASC
    `).all(...(agentFilter ? [agentFilter] : [])) as DailyCostRow[];

    // Top skills by usage and cost.
    const topSkills = db.prepare(`
      SELECT
        s.skill_id,
        COUNT(*) AS exec_count,
        COALESCE(SUM(s.cost_usd), 0) AS cost_usd,
        COALESCE(AVG(s.duration_ms), 0) AS avg_duration_ms,
        ROUND(
          1.0 * SUM(CASE WHEN s.status IN ('failed','timeout') THEN 1 ELSE 0 END) / COUNT(*),
          3
        ) AS failure_rate
      FROM skill_executions s
      WHERE s.started_at >= ${sinceClause}
        ${agentFilter ? "AND s.agent_id = ?" : ""}
      GROUP BY s.skill_id
      ORDER BY exec_count DESC
      LIMIT 12
    `).all(...(agentFilter ? [agentFilter] : [])) as TopSkillRow[];

    // Headline totals.
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status IN ('failed','timeout') THEN 1 ELSE 0 END) AS failed
      FROM agent_runs
      WHERE started_at >= ${sinceClause}
        ${agentFilter ? "AND agent_id = ?" : ""}
    `).get(...(agentFilter ? [agentFilter] : [])) as { total: number; completed: number; failed: number };

    const costTotal = db.prepare(`
      SELECT COALESCE(SUM(cost_usd), 0) AS cost_usd,
             COUNT(*) AS exec_count
      FROM skill_executions
      WHERE started_at >= ${sinceClause}
        ${agentFilter ? "AND agent_id = ?" : ""}
    `).get(...(agentFilter ? [agentFilter] : [])) as { cost_usd: number; exec_count: number };

    return NextResponse.json({
      window: { days, since: `now - ${days} days` },
      headline: {
        runs_total: totals.total ?? 0,
        runs_completed: totals.completed ?? 0,
        runs_failed: totals.failed ?? 0,
        success_rate: (totals.total ?? 0) > 0
          ? Math.round(((totals.completed ?? 0) / totals.total) * 100)
          : 100,
        cost_usd: costTotal.cost_usd ?? 0,
        skill_exec_count: costTotal.exec_count ?? 0,
        cost_note: "Estimated from char counts at Claude Sonnet 4 rates; directional only.",
      },
      runs_per_day: runsPerDay,
      per_agent_daily: perAgentDaily,
      duration_stats: durationStats,
      cost_by_agent: costByAgent,
      daily_cost: dailyCost,
      top_skills: topSkills,
    });
  } catch (error) {
    console.error("GET /api/metrics/agents error:", error);
    return NextResponse.json({ error: "Failed to compute agent metrics" }, { status: 500 });
  }
}
