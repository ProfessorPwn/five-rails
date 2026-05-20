"use client";

import { useState, useEffect } from "react";

interface Activity {
  id: string;
  project_id: string | null;
  action: string;
  details: string;
  rail: string | null;
  skill_used: string | null;
  created_at: string;
}

interface CapabilityGap {
  id: string;
  agent_id: string;
  agent_name: string | null;
  task_description: string;
  missing_capability: string;
  proposed_fix: string | null;
  install_command: string | null;
  status: string;
  created_at: string;
}

interface Handoff {
  id: string;
  from_name: string | null;
  to_name: string | null;
  message: string;
  status: string | null;
  deadline_at: string | null;
  created_at: string;
  stall_notified_at: string | null;
}

const ACTION_COLORS: Record<string, string> = {
  skill_executed: "#8b5cf6",
  contact_created: "#10b981",
  deal_created: "#3b82f6",
  deal_stage_changed: "#f59e0b",
  content_published: "#ec4899",
  blueprint_layer_executed: "#06b6d4",
  agent_run: "#ef4444",
  mcp_tool_used: "#14b8a6",
  contacts_imported: "#10b981",
  webinar_registration: "#a855f7",
};

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [gaps, setGaps] = useState<CapabilityGap[]>([]);
  const [stalled, setStalled] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    Promise.all([
      fetch("/api/activity?limit=200").then(r => r.json()).catch(() => []),
      fetch("/api/capability-gaps?status=pending").then(r => r.json()).catch(() => ({ gaps: [] })),
      fetch("/api/agents/handoffs?status=stalled").then(r => r.json()).catch(() => ({ handoffs: [] })),
    ]).then(([acts, g, h]) => {
      setActivities(Array.isArray(acts) ? acts : []);
      setGaps(g?.gaps || []);
      setStalled(h?.handoffs || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const approveGap = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/capability-gaps/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) alert(`Approve failed: ${data.error || "unknown"}\n${data.note || ""}`);
      refresh();
    } finally { setBusyId(null); }
  };

  const rejectGap = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/capability-gaps/${id}/reject`, { method: "POST" });
      refresh();
    } finally { setBusyId(null); }
  };

  const actionTypes = [...new Set(activities.map((a) => a.action))].sort();

  const filtered = activities.filter((a) => {
    if (filterAction !== "all" && a.action !== filterAction) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.action.toLowerCase().includes(q) ||
        (a.details || "").toLowerCase().includes(q) ||
        (a.rail || "").toLowerCase().includes(q) ||
        (a.skill_used || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e2e8f0]">Activity Log</h1>
            <p className="text-sm text-[#64748b] mt-1">
              {filtered.length} events{search || filterAction !== "all" ? " (filtered)" : ""}
            </p>
          </div>
          <button
            onClick={() => {
              const csv = [
                "timestamp,action,details,rail,skill",
                ...activities.map(
                  (a) =>
                    `"${a.created_at}","${a.action}","${(a.details || "").replace(/"/g, '""')}","${a.rail || ""}","${a.skill_used || ""}"`
                ),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `activity-log-${new Date().toISOString().split("T")[0]}.csv`;
              link.click();
            }}
            className="px-3 py-2 text-xs bg-[#141822] border border-[#1e293b]/50 rounded-lg text-[#94a3b8] hover:text-white hover:border-[#334155] transition-colors cursor-pointer"
          >
            Export CSV
          </button>
        </div>

        {/* Capability Gaps — agent needs tooling */}
        {gaps.length > 0 && (
          <div className="mb-6 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-400/80">Capability Gaps ({gaps.length})</h2>
            {gaps.map((g) => (
              <div key={g.id} className="p-4 bg-amber-500/5 border border-amber-500/30 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-amber-300">{g.agent_name || g.agent_id}</span>
                      <span className="text-[10px] text-[#64748b]">needs</span>
                      <span className="text-xs font-semibold text-white">{g.missing_capability}</span>
                    </div>
                    <p className="text-xs text-[#94a3b8] mb-2">Task: {g.task_description.slice(0, 200)}{g.task_description.length > 200 ? "..." : ""}</p>
                    {g.proposed_fix && <p className="text-xs text-[#94a3b8] mb-1">Proposed: {g.proposed_fix}</p>}
                    {g.install_command && (
                      <p className="text-xs font-mono text-emerald-300 bg-[#0a0c14] px-2 py-1 rounded inline-block">{g.install_command}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => approveGap(g.id)}
                      disabled={busyId === g.id}
                      className="px-3 py-1.5 text-xs bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      {busyId === g.id ? "..." : g.install_command ? "Approve & Install" : "Mark Approved"}
                    </button>
                    <button
                      onClick={() => rejectGap(g.id)}
                      disabled={busyId === g.id}
                      className="px-3 py-1.5 text-xs bg-[#141822] border border-[#334155] rounded text-[#94a3b8] hover:text-white disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stalled handoffs */}
        {stalled.length > 0 && (
          <div className="mb-6 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-red-400/80">Stalled Handoffs ({stalled.length})</h2>
            {stalled.map((h) => (
              <div key={h.id} className="p-4 bg-red-500/5 border border-red-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-red-300">{h.from_name || "?"}</span>
                  <span className="text-[10px] text-[#64748b]">&rarr;</span>
                  <span className="text-xs font-medium text-red-300">{h.to_name || "?"}</span>
                  <span className="text-[10px] text-[#484f58] ml-2">Deadline: {h.deadline_at || "n/a"}</span>
                </div>
                <p className="text-xs text-[#94a3b8]">{h.message.slice(0, 300)}{h.message.length > 300 ? "..." : ""}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activities..."
            className="flex-1 px-3 py-2 bg-[#141822] border border-[#1e293b]/50 rounded-lg text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-amber-500/50"
          />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-2 bg-[#141822] border border-[#1e293b]/50 rounded-lg text-sm text-[#e2e8f0]"
          >
            <option value="all">All actions</option>
            {actionTypes.map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        {/* Timeline */}
        <div className="space-y-1">
          {filtered.map((a) => {
            const color = ACTION_COLORS[a.action] || "#64748b";
            return (
              <div
                key={a.id}
                className="flex items-start gap-3 px-4 py-3 bg-[#141822] border border-[#1e293b]/30 rounded-lg hover:border-[#334155]/50 transition-colors"
              >
                <div
                  className="w-2 h-2 rounded-full mt-2 shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: color + "15",
                        color: color,
                      }}
                    >
                      {a.action.replace(/_/g, " ")}
                    </span>
                    {a.rail && (
                      <span className="text-[10px] text-[#484f58]">{a.rail}</span>
                    )}
                    {a.skill_used && (
                      <span className="text-[10px] text-[#64748b]">{a.skill_used}</span>
                    )}
                  </div>
                  <p className="text-sm text-[#94a3b8] mt-1 truncate">
                    {a.details || "No details"}
                  </p>
                </div>
                <span className="text-[10px] text-[#484f58] whitespace-nowrap shrink-0">
                  {timeAgo(a.created_at)}
                </span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-[#484f58] text-sm">
              {search || filterAction !== "all"
                ? "No matching activities"
                : "No activity recorded yet"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
