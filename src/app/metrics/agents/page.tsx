"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import CommandLayout from "@/components/command/CommandLayout";

interface AgentLite {
  id: string;
  name: string;
  department: string;
}

interface Headline {
  runs_total: number;
  runs_completed: number;
  runs_failed: number;
  success_rate: number;
  cost_usd: number;
  skill_exec_count: number;
  cost_note: string;
}

interface RunsPerDay {
  day: string;
  total: number;
  completed: number;
  failed: number;
  success_rate: number;
}

interface DurationStats {
  sample_count: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

interface CostByAgent {
  agent_id: string;
  agent_name: string | null;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  exec_count: number;
}

interface DailyCost {
  day: string;
  cost_usd: number;
  exec_count: number;
}

interface TopSkill {
  skill_id: string;
  exec_count: number;
  cost_usd: number;
  avg_duration_ms: number;
  failure_rate: number;
}

interface MetricsPayload {
  window: { days: number; since: string };
  headline: Headline;
  runs_per_day: RunsPerDay[];
  duration_stats: DurationStats;
  cost_by_agent: CostByAgent[];
  daily_cost: DailyCost[];
  top_skills: TopSkill[];
}

const CHART_HEIGHT = 240;
const AMBER = "#f59e0b";
const EMERALD = "#34d399";
const ROSE = "#fb7185";
const SKY = "#38bdf8";

function fmtMs(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtCost(usd: number): string {
  if (!usd || usd === 0) return "$0.00";
  if (usd < 0.01) return `<$0.01`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export default function AgentMetricsPage() {
  const [days, setDays] = useState(14);
  const [agentId, setAgentId] = useState<string>("");
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL("/api/metrics/agents", window.location.origin);
      url.searchParams.set("days", String(days));
      if (agentId) url.searchParams.set("agent_id", agentId);
      const [m, a] = await Promise.all([
        fetch(url.toString(), { cache: "no-store" }),
        fetch("/api/agents", { cache: "no-store" }),
      ]);
      if (m.ok) {
        const payload = (await m.json()) as MetricsPayload;
        setData(payload);
      }
      if (a.ok) {
        const list = (await a.json()) as AgentLite[];
        setAgents(list);
      }
    } finally {
      setLoading(false);
    }
  }, [days, agentId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const costByAgentChart = useMemo(
    () =>
      (data?.cost_by_agent ?? []).map((c) => ({
        name: c.agent_name?.split(" ")[0] ?? c.agent_id.slice(0, 6),
        cost_usd: Number(c.cost_usd.toFixed(4)),
        execs: c.exec_count,
      })),
    [data]
  );

  return (
    <CommandLayout
      title="Agent Metrics"
      subtitle="Fleet performance + cost over the selected window. Cost is estimated from character counts at Claude Sonnet 4 rates."
      actions={
        <div className="flex items-center gap-2">
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="bg-[#141822] border border-[#1e293b] rounded-md px-2 py-1.5 text-xs text-[#e2e8f0]"
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 bg-[#141822] border border-[#1e293b] rounded-md p-0.5">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-2 py-0.5 text-[10px] uppercase tracking-widest rounded ${
                  days === d ? "bg-amber-500/15 text-amber-400" : "text-[#94a3b8] hover:text-[#e2e8f0]"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      }
      showRightRail={false}
    >
      {loading && !data ? (
        <div className="bg-[#141822] border border-[#1e293b] rounded-xl py-12 text-center text-[#64748b] text-sm">
          Loading metrics…
        </div>
      ) : !data ? (
        <div className="bg-[#141822] border border-[#1e293b] rounded-xl py-12 text-center text-rose-400 text-sm">
          Failed to load metrics.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="Runs" value={data.headline.runs_total.toLocaleString()} />
            <Kpi
              label="Success"
              value={`${data.headline.success_rate}%`}
              tone={data.headline.success_rate >= 90 ? "success" : data.headline.success_rate >= 70 ? "warning" : "danger"}
            />
            <Kpi label="Skill execs" value={data.headline.skill_exec_count.toLocaleString()} />
            <Kpi label="Cost (est.)" value={fmtCost(data.headline.cost_usd)} />
            <Kpi
              label={`p50 / p95`}
              value={`${fmtMs(data.duration_stats.p50_ms)} / ${fmtMs(data.duration_stats.p95_ms)}`}
              sub={`n=${data.duration_stats.sample_count}`}
            />
          </div>

          {/* Runs per day */}
          <Card title="Runs per day" subtitle={`${data.window.days}d window`}>
            {data.runs_per_day.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={data.runs_per_day} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="day" stroke="#475569" fontSize={10} />
                  <YAxis stroke="#475569" fontSize={10} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#0d0f17", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "12px" }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                  <Line type="monotone" dataKey="total" stroke={SKY} strokeWidth={2} dot={false} name="Total" />
                  <Line type="monotone" dataKey="completed" stroke={EMERALD} strokeWidth={2} dot={false} name="Completed" />
                  <Line type="monotone" dataKey="failed" stroke={ROSE} strokeWidth={2} dot={false} name="Failed" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Cost per day */}
          <Card title="Daily skill cost (estimated)" subtitle="$ across all skill executions">
            {data.daily_cost.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={data.daily_cost} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="day" stroke="#475569" fontSize={10} />
                  <YAxis stroke="#475569" fontSize={10} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                  <Tooltip
                    contentStyle={{ background: "#0d0f17", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "12px" }}
                    labelStyle={{ color: "#94a3b8" }}
                    formatter={(v) => fmtCost(typeof v === "number" ? v : 0)}
                  />
                  <Line type="monotone" dataKey="cost_usd" stroke={AMBER} strokeWidth={2} dot={false} name="Cost" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Cost by agent */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Cost by agent" subtitle="Driven by skill_executions">
              {costByAgentChart.length === 0 ? (
                <Empty />
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <BarChart data={costByAgentChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#475569" fontSize={10} />
                    <YAxis stroke="#475569" fontSize={10} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "#0d0f17", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "12px" }}
                      formatter={(v) => fmtCost(typeof v === "number" ? v : 0)}
                    />
                    <Bar dataKey="cost_usd" fill={AMBER} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Top skills by usage" subtitle="Cap 12">
              {data.top_skills.length === 0 ? (
                <Empty />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[#64748b] border-b border-[#1e293b]/60">
                        <th className="py-2 pr-3 font-medium">Skill</th>
                        <th className="py-2 px-2 font-medium text-right">Runs</th>
                        <th className="py-2 px-2 font-medium text-right">Cost</th>
                        <th className="py-2 px-2 font-medium text-right">Avg dur</th>
                        <th className="py-2 pl-2 font-medium text-right">Fail %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_skills.map((s) => (
                        <tr key={s.skill_id} className="border-b border-[#1e293b]/30 hover:bg-white/[0.02]">
                          <td className="py-2 pr-3 text-[#e2e8f0] truncate max-w-[200px]" title={s.skill_id}>
                            {s.skill_id.replace(/^skill-/, "")}
                          </td>
                          <td className="py-2 px-2 text-right text-[#94a3b8]">{s.exec_count}</td>
                          <td className="py-2 px-2 text-right text-[#94a3b8]">{fmtCost(s.cost_usd)}</td>
                          <td className="py-2 px-2 text-right text-[#94a3b8]">{fmtMs(s.avg_duration_ms)}</td>
                          <td className={`py-2 pl-2 text-right ${s.failure_rate > 0.2 ? "text-rose-400" : s.failure_rate > 0 ? "text-amber-400" : "text-[#94a3b8]"}`}>
                            {(s.failure_rate * 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* Cost details table */}
          {data.cost_by_agent.length > 0 ? (
            <Card title="Per-agent breakdown" subtitle="Cost is estimated. Tokens are estimated from character length at 4 chars/token.">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[#64748b] border-b border-[#1e293b]/60">
                      <th className="py-2 pr-3 font-medium">Agent</th>
                      <th className="py-2 px-2 font-medium text-right">Skill execs</th>
                      <th className="py-2 px-2 font-medium text-right">Tokens in</th>
                      <th className="py-2 px-2 font-medium text-right">Tokens out</th>
                      <th className="py-2 pl-2 font-medium text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cost_by_agent.map((c) => (
                      <tr key={c.agent_id ?? "unassigned"} className="border-b border-[#1e293b]/30 hover:bg-white/[0.02]">
                        <td className="py-2 pr-3 text-[#e2e8f0]">{c.agent_name ?? <span className="text-[#475569]">(unassigned)</span>}</td>
                        <td className="py-2 px-2 text-right text-[#94a3b8]">{c.exec_count}</td>
                        <td className="py-2 px-2 text-right text-[#94a3b8]">{c.tokens_in.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-[#94a3b8]">{c.tokens_out.toLocaleString()}</td>
                        <td className="py-2 pl-2 text-right text-amber-400">{fmtCost(c.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <div className="text-[10px] text-[#475569] text-center">
            {data.headline.cost_note}
          </div>
        </div>
      )}
    </CommandLayout>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "success" | "warning" | "danger" }) {
  const toneCls = tone === "success" ? "text-emerald-400" : tone === "warning" ? "text-amber-400" : tone === "danger" ? "text-rose-400" : "text-[#e2e8f0]";
  return (
    <div className="bg-[#141822] border border-[#1e293b] rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-[#64748b]">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${toneCls}`}>{value}</div>
      {sub ? <div className="text-[10px] text-[#475569] mt-0.5">{sub}</div> : null}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#e2e8f0]">{title}</h3>
        {subtitle ? <span className="text-[10px] text-[#64748b]">{subtitle}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="py-8 text-center text-[#64748b] text-xs">No data in this window yet.</div>;
}
