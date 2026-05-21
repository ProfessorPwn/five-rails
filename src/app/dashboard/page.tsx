"use client";

import { useEffect, useState, useCallback } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import AttentionQueue from "@/components/command/AttentionQueue";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPIs {
  mrr: number;
  arr: number;
  mrr_30_ago: number;
  mrr_trend: "up" | "down" | "flat";
  active_subscriptions: number;
  pipeline_value: number;
  pipeline_deal_count: number;
  won_this_month: number;
  contacts_total: number;
  hot_leads: number;
  new_contacts_this_week: number;
  content_published: number;
  content_this_week: number;
  content_drafts: number;
  agent_actions_week: number;
  active_agents: number;
  total_agents: number;
}

interface AgentData {
  id: string;
  name: string;
  department: string;
  state: "idle" | "observing" | "thinking" | "acting";
  last_run_at: string | null;
  next_run_at: string | null;
  last_reasoning: string | null;
  last_action: string | null;
  last_decision_at: string | null;
}

interface AutomationRun {
  id: string;
  status: string;
  results: string;
  started_at: string;
  completed_at?: string | null;
  duration_ms: number;
}

interface AutomationData {
  last_run: AutomationRun | null;
  recent_runs: AutomationRun[];
  interval_minutes: number;
}

interface Activity {
  id: string;
  action: string;
  details: string;
  project_id?: string;
  rail?: string;
  skill_used?: string;
  created_at: string;
}

interface ContextData {
  project_count: number;
  active_projects: number;
  pending_tasks: number;
  connections: number;
  idea_count: number;
  unlinked_ideas: number;
  newsletters_draft: number;
  scheduled_posts: number;
}

interface DashboardStats {
  kpis: KPIs;
  agents: AgentData[];
  automation: AutomationData;
  activity: Activity[];
  context: ContextData;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPT_COLORS: Record<string, string> = {
  marketing: "#3b82f6",
  sales: "#10b981",
  product: "#8b5cf6",
  research: "#f59e0b",
  executive: "#ef4444",
  operations: "#dc2626",
};

const DEPT_BG: Record<string, string> = {
  marketing: "bg-blue-500/10",
  sales: "bg-emerald-500/10",
  product: "bg-violet-500/10",
  research: "bg-amber-500/10",
  executive: "bg-red-500/10",
};

const DEPT_TEXT: Record<string, string> = {
  marketing: "text-blue-400",
  sales: "text-emerald-400",
  product: "text-violet-400",
  research: "text-amber-400",
  executive: "text-red-400",
};

const STATE_DOT: Record<string, string> = {
  idle: "bg-[#64748b]",
  observing: "bg-blue-400",
  thinking: "bg-amber-400",
  acting: "bg-emerald-400",
};

const STATE_LABEL: Record<string, string> = {
  idle: "Idle",
  observing: "Observing",
  thinking: "Thinking",
  acting: "Acting",
};

// Action type to icon + department color mapping
const ACTION_ICONS: Record<string, { icon: string; dept: string }> = {
  skill_executed: { icon: "zap", dept: "marketing" },
  project_created: { icon: "folder", dept: "product" },
  content_created: { icon: "file-text", dept: "marketing" },
  contact_created: { icon: "user-plus", dept: "sales" },
  deal_created: { icon: "briefcase", dept: "sales" },
  deal_updated: { icon: "trending-up", dept: "sales" },
  agent_run: { icon: "cpu", dept: "executive" },
  automation_run: { icon: "settings", dept: "product" },
  connection_created: { icon: "link", dept: "product" },
  insight_created: { icon: "lightbulb", dept: "research" },
  newsletter_created: { icon: "mail", dept: "marketing" },
  idea_imported: { icon: "download", dept: "research" },
  blueprint_created: { icon: "layers", dept: "product" },
};

// ─── Automation Step Labels ─────────────────────────────────────────────────

const AUTOMATION_STEPS = [
  { key: "scheduled_posts", label: "Scheduled Posts" },
  { key: "email_sequences", label: "Email Sequences" },
  { key: "payment_retries", label: "Payment Retries" },
  { key: "deal_tasks", label: "Deal Follow-ups" },
  { key: "skill_schedules", label: "Skill Schedules" },
  { key: "agents", label: "Agent Runs" },
  { key: "ideabrowser_sync", label: "IdeaBrowser Sync" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [runningAutomation, setRunningAutomation] = useState(false);

  const fetchStats = useCallback(() => {
    fetch("/api/dashboard/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRunAgent = async (agentId: string) => {
    setRunningAgent(agentId);
    try {
      await fetch(`/api/agents/${agentId}/run`, { method: "POST" });
      // Refresh after a short delay to let the agent complete
      setTimeout(fetchStats, 2000);
    } catch {
      // silently handle
    } finally {
      setTimeout(() => setRunningAgent(null), 3000);
    }
  };

  const handleRunAutomation = async () => {
    setRunningAutomation(true);
    try {
      await fetch("/api/automation/process", { method: "POST" });
      setTimeout(fetchStats, 2000);
    } catch {
      // silently handle
    } finally {
      setTimeout(() => setRunningAutomation(false), 3000);
    }
  };

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const { kpis, agents, automation, activity, context } = stats;

  // Build context-aware next actions
  const nextActions = buildNextActions(context, kpis);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Command Center</h1>
          <p className="text-sm text-[#94a3b8] mt-1">
            Real-time business intelligence across all systems
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-[#64748b]">
            <div className={`w-2 h-2 rounded-full ${kpis.active_agents > 0 ? "bg-emerald-400 animate-pulse" : "bg-[#64748b]"}`} />
            {kpis.active_agents} agent{kpis.active_agents !== 1 ? "s" : ""} active
          </div>
          <Button variant="secondary" size="sm" onClick={fetchStats}>
            <RefreshIcon />
            Refresh
          </Button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ROW 1: Hero KPI Cards
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-5 gap-4">
        {/* MRR/ARR */}
        <KPICard
          label="MRR / ARR"
          value={formatCurrency(kpis.mrr)}
          subValue={`${formatCurrency(kpis.arr)} ARR`}
          trend={kpis.mrr_trend}
          trendLabel={kpis.mrr_30_ago > 0 ? `${((kpis.mrr - kpis.mrr_30_ago) / kpis.mrr_30_ago * 100).toFixed(1)}% vs 30d` : "No prior data"}
          detail={`${kpis.active_subscriptions} active subs`}
          accentColor="text-emerald-400"
          icon={<DollarIcon />}
        />

        {/* Pipeline Value */}
        <KPICard
          label="Pipeline Value"
          value={formatCurrency(kpis.pipeline_value)}
          subValue={`${kpis.pipeline_deal_count} open deal${kpis.pipeline_deal_count !== 1 ? "s" : ""}`}
          trend={kpis.won_this_month > 0 ? "up" : "flat"}
          trendLabel={kpis.won_this_month > 0 ? `${formatCurrency(kpis.won_this_month)} won this month` : "No wins yet"}
          accentColor="text-blue-400"
          icon={<PipelineIcon />}
        />

        {/* Contacts */}
        <KPICard
          label="Contacts"
          value={kpis.contacts_total.toLocaleString()}
          subValue={`${kpis.hot_leads} hot lead${kpis.hot_leads !== 1 ? "s" : ""}`}
          trend={kpis.new_contacts_this_week > 0 ? "up" : "flat"}
          trendLabel={`+${kpis.new_contacts_this_week} this week`}
          accentColor="text-violet-400"
          icon={<ContactsIcon />}
        />

        {/* Content Published */}
        <KPICard
          label="Content Published"
          value={kpis.content_published.toLocaleString()}
          subValue={`${kpis.content_drafts} draft${kpis.content_drafts !== 1 ? "s" : ""} pending`}
          trend={kpis.content_this_week > 0 ? "up" : "flat"}
          trendLabel={`+${kpis.content_this_week} this week`}
          accentColor="text-amber-400"
          icon={<ContentIcon />}
        />

        {/* Agent Actions */}
        <KPICard
          label="Agent Actions"
          value={kpis.agent_actions_week.toLocaleString()}
          subValue={`${kpis.active_agents} of ${kpis.total_agents} active`}
          trend={kpis.agent_actions_week > 0 ? "up" : "flat"}
          trendLabel="past 7 days"
          accentColor="text-rose-400"
          icon={<AgentIcon />}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Attention Queue (Command Center Stage 2)
          ═══════════════════════════════════════════════════════════════════════ */}
      <AttentionQueue />

      {/* ═══════════════════════════════════════════════════════════════════════
          ROW 2: Agent Status Bar
          ═══════════════════════════════════════════════════════════════════════ */}
      <Card hover={false} className="!p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e293b]/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AgentIcon />
            <h2 className="text-sm font-semibold text-[#e2e8f0]">Agent Fleet</h2>
            <Badge variant={kpis.active_agents > 0 ? "success" : "default"}>
              {kpis.active_agents} active
            </Badge>
          </div>
          <button
            onClick={() => router.push("/agents")}
            className="text-xs text-[#64748b] hover:text-amber-400 transition-colors cursor-pointer"
          >
            View All &rarr;
          </button>
        </div>
        <div className="grid grid-cols-6 divide-x divide-[#1e293b]/50">
          {agents.map((agent) => (
            <AgentStatusCard
              key={agent.id}
              agent={agent}
              running={runningAgent === agent.id}
              onRun={() => handleRunAgent(agent.id)}
            />
          ))}
          {/* Fill empty slots if fewer than 6 agents */}
          {agents.length < 6 &&
            Array.from({ length: 6 - agents.length }).map((_, i) => (
              <div key={`empty-${i}`} className="p-4 opacity-30">
                <div className="text-xs text-[#64748b]">No agent</div>
              </div>
            ))}
        </div>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
          ROW 3: Activity Feed + Automation Health
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-6">
        {/* Activity Feed (2/3) */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#e2e8f0]">Activity Feed</h2>
            <span className="text-xs text-[#64748b]">Last 20 actions</span>
          </div>
          <Card hover={false} className="!p-0 divide-y divide-[#1e293b]/50 max-h-[420px] overflow-y-auto">
            {activity.length === 0 ? (
              <div className="py-10 text-center text-[#64748b] text-sm">
                No activity yet. Create a project or run an agent to get started.
              </div>
            ) : (
              activity.map((item) => {
                const meta = ACTION_ICONS[item.action] || { icon: "circle", dept: "product" };
                const deptColor = DEPT_COLORS[meta.dept] || "#64748b";
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors"
                  >
                    <div
                      className="mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${deptColor}15` }}
                    >
                      <ActivityIcon type={meta.icon} color={deptColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#e2e8f0] leading-snug">{item.details || item.action}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: `${deptColor}15`, color: deptColor }}
                        >
                          {formatActivityType(item.action)}
                        </span>
                        {item.skill_used && (
                          <span className="text-[10px] text-[#64748b]">via {item.skill_used}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-[#64748b] shrink-0 mt-1">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                );
              })
            )}
          </Card>
        </div>

        {/* Automation Health (1/3) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#e2e8f0]">Automation Health</h2>
            <Badge variant={automation.last_run?.status === "completed" ? "success" : automation.last_run?.status === "running" ? "warning" : "default"}>
              {automation.last_run?.status || "never run"}
            </Badge>
          </div>
          <Card hover={false} className="space-y-4">
            {/* Last Run Info */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748b]">Last Heartbeat</span>
                <span className="text-xs text-[#e2e8f0]">
                  {automation.last_run ? formatDate(automation.last_run.started_at) : "Never"}
                </span>
              </div>
              {automation.last_run && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#64748b]">Duration</span>
                  <span className="text-xs text-[#e2e8f0]">
                    {automation.last_run.duration_ms ? `${(automation.last_run.duration_ms / 1000).toFixed(1)}s` : "—"}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748b]">Interval</span>
                <span className="text-xs text-[#e2e8f0]">Every {automation.interval_minutes}m</span>
              </div>
            </div>

            {/* 7-Step Status Indicators */}
            <div className="space-y-1.5 pt-2 border-t border-[#1e293b]/50">
              <span className="text-xs font-medium text-[#94a3b8]">Pipeline Steps</span>
              {AUTOMATION_STEPS.map((step) => {
                const stepResult = getAutomationStepStatus(automation.last_run, step.key);
                return (
                  <div key={step.key} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${stepResult.color}`} />
                      <span className="text-xs text-[#94a3b8]">{step.label}</span>
                    </div>
                    <span className="text-[10px] text-[#64748b]">{stepResult.detail}</span>
                  </div>
                );
              })}
            </div>

            {/* Run Now Button */}
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={handleRunAutomation}
              disabled={runningAutomation}
            >
              {runningAutomation ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border border-amber-500 border-t-transparent" />
                  Running...
                </>
              ) : (
                <>
                  <PlayIcon />
                  Run Heartbeat Now
                </>
              )}
            </Button>
          </Card>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ROW 4: Quick Actions Grid
          ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <h2 className="text-lg font-semibold text-[#e2e8f0] mb-4">What&apos;s Next</h2>
        <div className="grid grid-cols-3 gap-4">
          {nextActions.map((action) => (
            <Card
              key={action.title}
              onClick={() => router.push(action.link)}
              className="group relative overflow-hidden"
            >
              {/* Progress bar at top */}
              {action.progress !== undefined && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#1e293b]">
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${action.progress}%`,
                      backgroundColor: DEPT_COLORS[action.dept] || "#f59e0b",
                    }}
                  />
                </div>
              )}
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${DEPT_COLORS[action.dept] || "#f59e0b"}15` }}
                >
                  <ActionIcon type={action.icon} color={DEPT_COLORS[action.dept] || "#f59e0b"} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[#e2e8f0] group-hover:text-amber-400 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-xs text-[#64748b] mt-1 leading-relaxed">{action.description}</p>
                  {action.progress !== undefined && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1 rounded-full bg-[#1e293b]">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${action.progress}%`,
                            backgroundColor: DEPT_COLORS[action.dept] || "#f59e0b",
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-[#64748b]">{action.progress}%</span>
                    </div>
                  )}
                </div>
                <div className="text-[#64748b] group-hover:text-amber-400 transition-colors mt-1">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7h8M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Agent Status Card ──────────────────────────────────────────────────────

function AgentStatusCard({
  agent,
  running,
  onRun,
}: {
  agent: AgentData;
  running: boolean;
  onRun: () => void;
}) {
  const isActive = agent.state !== "idle";
  const deptColor = DEPT_COLORS[agent.department] || "#64748b";

  return (
    <div className="p-4 space-y-3">
      {/* Name + State */}
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${STATE_DOT[agent.state] || STATE_DOT.idle} ${isActive ? "animate-pulse" : ""}`}
            />
            <span className="text-xs font-semibold text-[#e2e8f0] truncate">{agent.name}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${deptColor}15`, color: deptColor }}
            >
              {agent.department}
            </span>
            <span className="text-[10px] text-[#64748b]">{STATE_LABEL[agent.state] || "Idle"}</span>
          </div>
        </div>
      </div>

      {/* Last Action */}
      <div className="min-h-[32px]">
        {agent.last_reasoning ? (
          <p className="text-[11px] text-[#94a3b8] leading-relaxed line-clamp-2">
            {agent.last_reasoning.slice(0, 120)}{agent.last_reasoning.length > 120 ? "..." : ""}
          </p>
        ) : (
          <p className="text-[11px] text-[#4a5568] italic">No decisions yet</p>
        )}
      </div>

      {/* Time + Run */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#64748b]">
          {agent.last_run_at ? formatDate(agent.last_run_at) : "Never run"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
          disabled={running || isActive}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all cursor-pointer
            ${running || isActive
              ? "bg-[#1e293b] text-[#64748b] cursor-not-allowed"
              : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20"
            }`}
        >
          {running ? (
            <div className="animate-spin rounded-full h-2.5 w-2.5 border border-amber-500 border-t-transparent" />
          ) : (
            <PlayIcon size={10} />
          )}
          {running ? "Running" : "Run"}
        </button>
      </div>
    </div>
  );
}

// ─── KPI Card Component ─────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  subValue,
  trend,
  trendLabel,
  detail,
  accentColor,
  icon,
}: {
  label: string;
  value: string;
  subValue: string;
  trend: "up" | "down" | "flat";
  trendLabel: string;
  detail?: string;
  accentColor: string;
  icon: React.ReactNode;
}) {
  return (
    <Card hover={false} className="relative overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-[#64748b] uppercase tracking-wider">{label}</span>
        <div className={`${accentColor} opacity-40`}>{icon}</div>
      </div>
      <div className={`text-2xl font-bold ${accentColor} mb-1`}>{value}</div>
      <div className="text-xs text-[#94a3b8] mb-2">{subValue}</div>
      <div className="flex items-center gap-1.5">
        <TrendArrow direction={trend} />
        <span className={`text-[10px] ${trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-[#64748b]"}`}>
          {trendLabel}
        </span>
      </div>
      {detail && (
        <div className="mt-2 pt-2 border-t border-[#1e293b]/50">
          <span className="text-[10px] text-[#64748b]">{detail}</span>
        </div>
      )}
    </Card>
  );
}

// ─── Trend Arrow ────────────────────────────────────────────────────────────

function TrendArrow({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-emerald-400">
        <path d="M6 9V3M3 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (direction === "down") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-red-400">
        <path d="M6 3v6M3 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#64748b]">
      <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function DollarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2v16M13 6H8.5a2.5 2.5 0 000 5h3a2.5 2.5 0 010 5H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 3v14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 13l3-4 3 2 4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ContactsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 17c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="7" r="2" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M15 12c1.7 0 3 1.3 3 3v2" stroke="currentColor" strokeWidth="1" opacity="0.5" strokeLinecap="round" />
    </svg>
  );
}

function ContentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 6h6M7 10h6M7 14h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="8" r="1" fill="currentColor" />
      <circle cx="11" cy="8" r="1" fill="currentColor" />
      <path d="M7 12c0 0 1 1.5 2 1.5s2-1.5 2-1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M9 1v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11 3A5 5 0 103.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 1v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M3 2l7 4-7 4V2z" fill="currentColor" />
    </svg>
  );
}

function ActivityIcon({ type, color }: { type: string; color: string }) {
  const s = 14;
  switch (type) {
    case "zap":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <path d="M7.5 1L3 8h4l-.5 5L11 6H7l.5-5z" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "folder":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <path d="M2 4V3a1 1 0 011-1h3l1.5 1.5H11a1 1 0 011 1V11a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke={color} strokeWidth="1.2" />
        </svg>
      );
    case "file-text":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <rect x="2" y="1" width="10" height="12" rx="1.5" stroke={color} strokeWidth="1.2" />
          <path d="M5 4h4M5 7h4M5 10h2" stroke={color} strokeWidth="1" strokeLinecap="round" />
        </svg>
      );
    case "user-plus":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="5" r="2.5" stroke={color} strokeWidth="1.2" />
          <path d="M2 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M11 5v3M12.5 6.5h-3" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "briefcase":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <rect x="1" y="4" width="12" height="8" rx="1.5" stroke={color} strokeWidth="1.2" />
          <path d="M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke={color} strokeWidth="1.2" />
        </svg>
      );
    case "trending-up":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <path d="M2 10l3-3 2 2 5-5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 4h4v4" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "cpu":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="1" stroke={color} strokeWidth="1.2" />
          <rect x="5" y="5" width="4" height="4" rx="0.5" stroke={color} strokeWidth="0.8" />
          <path d="M7 1v2M7 11v2M1 7h2M11 7h2" stroke={color} strokeWidth="1" strokeLinecap="round" />
        </svg>
      );
    case "settings":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="2" stroke={color} strokeWidth="1.2" />
          <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M3 3l1 1M10 10l1 1M3 11l1-1M10 4l1-1" stroke={color} strokeWidth="1" strokeLinecap="round" />
        </svg>
      );
    case "link":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <path d="M6 8l2-2M4.5 9.5L3 11a1.4 1.4 0 010-2l2-2a1.4 1.4 0 012 0M7.5 4.5L9 3a1.4 1.4 0 012 0l0 0a1.4 1.4 0 010 2l-2 2a1.4 1.4 0 01-2 0" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "lightbulb":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <path d="M5 10v1a2 2 0 004 0v-1M7 1a4 4 0 00-2.5 7.1c.3.3.5.6.5 1V10h4V9.1c0-.4.2-.7.5-1A4 4 0 007 1z" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "mail":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <rect x="1" y="3" width="12" height="8" rx="1.5" stroke={color} strokeWidth="1.2" />
          <path d="M1 4l6 4 6-4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "download":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <path d="M7 1v8M4 6l3 3 3-3M2 11v1.5h10V11" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "layers":
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <path d="M7 1L1 5l6 4 6-4-6-4z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M1 9l6 4 6-4" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="3" stroke={color} strokeWidth="1.2" />
        </svg>
      );
  }
}

function ActionIcon({ type, color }: { type: string; color: string }) {
  return <ActivityIcon type={type} color={color} />;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatActivityType(type: string): string {
  if (!type) return "";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function getAutomationStepStatus(
  lastRun: AutomationRun | null,
  stepKey: string
): { color: string; detail: string } {
  if (!lastRun || !lastRun.results) {
    return { color: "bg-[#64748b]", detail: "Never run" };
  }
  try {
    const results = typeof lastRun.results === "string" ? JSON.parse(lastRun.results) : lastRun.results;
    const step = results[stepKey];
    if (!step) return { color: "bg-[#64748b]", detail: "Skipped" };
    if (step.error) return { color: "bg-red-400", detail: "Error" };
    // Check for meaningful results
    const processed = step.processed || step.due || step.checked || 0;
    const acted = step.posted || step.sent || step.run || step.created || step.retried || 0;
    if (processed > 0 && acted > 0) return { color: "bg-emerald-400", detail: `${acted}/${processed}` };
    if (processed > 0) return { color: "bg-amber-400", detail: `${processed} checked` };
    if (step.skipped) return { color: "bg-[#64748b]", detail: typeof step.skipped === "string" ? step.skipped : "Skipped" };
    if (step.imported) return { color: "bg-emerald-400", detail: "Synced" };
    return { color: "bg-emerald-400", detail: "OK" };
  } catch {
    return { color: "bg-[#64748b]", detail: "—" };
  }
}

interface NextAction {
  title: string;
  description: string;
  link: string;
  icon: string;
  dept: string;
  progress?: number;
}

function buildNextActions(context: ContextData, kpis: KPIs): NextAction[] {
  const actions: NextAction[] = [];

  if (context.connections === 0) {
    actions.push({
      title: "Connect your first LLM",
      description: "Add an Ollama, Anthropic, or OpenAI connection to power your AI agents and skills.",
      link: "/connections",
      icon: "link",
      dept: "product",
      progress: 0,
    });
  }

  if (context.project_count === 0) {
    actions.push({
      title: "Create your first project",
      description: "Start with a business idea and let agents generate a tailored action plan.",
      link: "/projects",
      icon: "folder",
      dept: "product",
      progress: 0,
    });
  }

  if (kpis.contacts_total === 0 && context.project_count > 0) {
    actions.push({
      title: "Build your pipeline",
      description: "Add outbound contacts to start prospecting and building deals.",
      link: "/outbound",
      icon: "user-plus",
      dept: "sales",
      progress: 10,
    });
  }

  if (kpis.pipeline_deal_count === 0 && kpis.contacts_total > 0) {
    actions.push({
      title: "Create your first deal",
      description: `You have ${kpis.contacts_total} contacts. Convert them into deals to track revenue.`,
      link: "/pipeline",
      icon: "briefcase",
      dept: "sales",
      progress: 25,
    });
  }

  if (kpis.content_published === 0 && context.project_count > 0) {
    actions.push({
      title: "Publish your first content",
      description: "Use skills to generate landing pages, emails, and posts for your project.",
      link: "/audience",
      icon: "file-text",
      dept: "marketing",
      progress: 15,
    });
  }

  if (context.unlinked_ideas > 0) {
    actions.push({
      title: `Review ${context.unlinked_ideas} unlinked idea${context.unlinked_ideas !== 1 ? "s" : ""}`,
      description: "Link imported IdeaBrowser ideas to projects for scoring and analysis.",
      link: "/ideabrowser",
      icon: "lightbulb",
      dept: "research",
    });
  }

  if (context.pending_tasks > 0) {
    actions.push({
      title: `${context.pending_tasks} pending task${context.pending_tasks !== 1 ? "s" : ""}`,
      description: "Review and complete pending tasks across your projects.",
      link: "/metrics",
      icon: "layers",
      dept: "executive",
      progress: context.pending_tasks > 10 ? 30 : 60,
    });
  }

  if (context.newsletters_draft > 0) {
    actions.push({
      title: `Send ${context.newsletters_draft} draft newsletter${context.newsletters_draft !== 1 ? "s" : ""}`,
      description: "Review and send newsletters to grow your audience.",
      link: "/newsletters",
      icon: "mail",
      dept: "marketing",
      progress: 70,
    });
  }

  if (context.scheduled_posts > 0) {
    actions.push({
      title: `${context.scheduled_posts} post${context.scheduled_posts !== 1 ? "s" : ""} scheduled`,
      description: "Content queued for publishing across your connected platforms.",
      link: "/audience",
      icon: "trending-up",
      dept: "marketing",
      progress: 80,
    });
  }

  if (kpis.agent_actions_week === 0 && kpis.total_agents > 0) {
    actions.push({
      title: "Activate your agents",
      description: "Run the automation heartbeat or trigger individual agents to start working.",
      link: "/agents",
      icon: "cpu",
      dept: "executive",
      progress: 5,
    });
  }

  // Always have at least one action
  if (actions.length === 0) {
    actions.push({
      title: "Keep building",
      description: "Run more skills, grow your pipeline, and let your agents work for you.",
      link: "/dashboard",
      icon: "zap",
      dept: "executive",
      progress: 90,
    });
  }

  // Cap at 6 actions
  return actions.slice(0, 6);
}
