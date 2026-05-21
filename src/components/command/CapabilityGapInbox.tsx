"use client";

import { useEffect, useState, useCallback } from "react";

interface Gap {
  id: string;
  agent_id: string;
  agent_name: string | null;
  blocked_agent_id: string | null;
  blocked_agent_name: string | null;
  task_description: string;
  missing_capability: string;
  proposed_fix: string | null;
  install_command: string | null;
  status: "pending" | "approved" | "resolved" | "rejected";
  created_at: string;
  resolved_at: string | null;
}

interface AgentLite {
  id: string;
  name: string;
  department: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z")).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function CapabilityGapInbox() {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, a] = await Promise.all([
        fetch(`/api/capability-gaps?status=${showResolved ? "" : "pending"}`, { cache: "no-store" }),
        fetch("/api/agents", { cache: "no-store" }),
      ]);
      if (g.ok) {
        const data = (await g.json()) as { gaps: Gap[] };
        setGaps(data.gaps);
      }
      if (a.ok) {
        const data = (await a.json()) as AgentLite[];
        setAgents(data);
      }
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  const callAction = async (
    gapId: string,
    action: "approve" | "reject" | "convert-to-task",
    body?: Record<string, unknown>
  ) => {
    setBusy(`${gapId}:${action}`);
    try {
      const r = await fetch(`/api/capability-gaps/${gapId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err.error ?? `Action failed (HTTP ${r.status})`);
      }
      await load();
      setExpanded(null);
    } finally {
      setBusy(null);
    }
  };

  const pendingCount = gaps.filter((g) => g.status === "pending").length;

  return (
    <div id="capability-gaps" className="mb-8 bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#30363d] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8a6 6 0 1112 0A6 6 0 012 8z" stroke="currentColor" strokeWidth="1.5" className="text-amber-400" />
            <path d="M8 5v3l2 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-amber-400" />
          </svg>
          <h2 className="text-sm font-semibold text-[#e2e8f0]">Capability Gap Inbox</h2>
          {pendingCount > 0 ? (
            <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
              {pendingCount} pending
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className="text-[10px] uppercase tracking-widest text-[#64748b] hover:text-[#e2e8f0] transition-colors"
          >
            {showResolved ? "Hide resolved" : "Show all"}
          </button>
        </div>
      </div>

      {loading && gaps.length === 0 ? (
        <div className="py-8 text-center text-[#64748b] text-sm">Loading…</div>
      ) : gaps.length === 0 ? (
        <div className="py-8 text-center text-[#64748b] text-sm">
          No capability gaps. Agents are unblocked.
        </div>
      ) : (
        <ul className="divide-y divide-[#30363d]/40">
          {gaps.map((gap) => {
            const isExpanded = expanded === gap.id;
            const isPending = gap.status === "pending";
            const blocked = gap.blocked_agent_name ?? gap.blocked_agent_id;
            const reporter = gap.agent_name ?? gap.agent_id;
            return (
              <li key={gap.id} id={`gap-${gap.id}`}>
                <div className="px-5 py-3 hover:bg-white/[0.02] transition-colors">
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : gap.id)}
                    className="w-full text-left flex items-start gap-3"
                  >
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      gap.status === "pending" ? "bg-amber-400" :
                      gap.status === "approved" ? "bg-emerald-400" :
                      gap.status === "resolved" ? "bg-sky-400" :
                      "bg-[#64748b]"
                    }`} aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 border rounded ${
                          gap.status === "pending" ? "border-amber-500/30 text-amber-400" :
                          gap.status === "approved" ? "border-emerald-500/30 text-emerald-400" :
                          gap.status === "resolved" ? "border-sky-500/30 text-sky-400" :
                          "border-[#30363d] text-[#64748b]"
                        }`}>
                          {gap.status}
                        </span>
                        {blocked ? (
                          <span className="text-[10px] text-rose-300">
                            {blocked} blocked
                          </span>
                        ) : null}
                        <span className="text-[10px] text-[#64748b]">
                          reporter: {reporter}
                        </span>
                        <span className="text-[10px] text-[#475569]">{relativeTime(gap.created_at)}</span>
                      </div>
                      <div className="text-sm text-[#e2e8f0] truncate">
                        {gap.missing_capability}
                      </div>
                      {!isExpanded ? (
                        <div className="text-xs text-[#94a3b8] truncate mt-0.5">
                          {gap.task_description}
                        </div>
                      ) : null}
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="mt-3 ml-5 space-y-3">
                      <ExpandedDetail label="Original task">{gap.task_description}</ExpandedDetail>
                      {gap.proposed_fix ? (
                        <ExpandedDetail label="Proposed fix">{gap.proposed_fix}</ExpandedDetail>
                      ) : null}
                      {gap.install_command ? (
                        <ExpandedDetail label="Install command" mono>
                          {gap.install_command}
                        </ExpandedDetail>
                      ) : null}

                      {isPending ? (
                        <ConvertControls
                          gap={gap}
                          agents={agents}
                          busy={busy}
                          onAction={callAction}
                        />
                      ) : (
                        <div className="text-xs text-[#64748b]">
                          {gap.resolved_at ? `Resolved ${relativeTime(gap.resolved_at)}` : null}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ExpandedDetail({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[#64748b] mb-1">{label}</div>
      <div className={`text-xs text-[#cbd5e1] p-3 bg-[#0d0f17] border border-[#1e293b]/60 rounded-md whitespace-pre-wrap break-words ${mono ? "font-mono" : ""}`}>
        {children}
      </div>
    </div>
  );
}

function ConvertControls({
  gap,
  agents,
  busy,
  onAction,
}: {
  gap: Gap;
  agents: AgentLite[];
  busy: string | null;
  onAction: (
    gapId: string,
    action: "approve" | "reject" | "convert-to-task",
    body?: Record<string, unknown>
  ) => Promise<void>;
}) {
  const [target, setTarget] = useState(gap.blocked_agent_id ?? gap.agent_id ?? "");
  const [note, setNote] = useState("");
  const id = gap.id;
  const isBusy = busy?.startsWith(`${id}:`);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[10px] uppercase tracking-widest text-[#64748b]">
          Assign to
        </label>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="bg-[#0d0f17] border border-[#1e293b] rounded-md px-2 py-1 text-xs text-[#e2e8f0]"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.department})</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Optional note for the assignee…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="flex-1 min-w-[200px] bg-[#0d0f17] border border-[#1e293b] rounded-md px-2 py-1 text-xs text-[#e2e8f0] placeholder:text-[#475569]"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={!!isBusy || !target}
          onClick={() => onAction(id, "convert-to-task", { target_agent_id: target, note: note || undefined })}
          className="px-3 py-1.5 text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-md hover:bg-amber-500/25 transition-colors disabled:opacity-50"
        >
          {isBusy ? "Converting…" : "Convert to task"}
        </button>
        {gap.install_command ? (
          <button
            type="button"
            disabled={!!isBusy}
            onClick={() => onAction(id, "approve")}
            className="px-3 py-1.5 text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-md hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            title="Auto-run the install command (npm install allow-listed only)"
          >
            Auto-install
          </button>
        ) : null}
        <button
          type="button"
          disabled={!!isBusy}
          onClick={() => onAction(id, "reject")}
          className="px-3 py-1.5 text-xs bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-md hover:bg-rose-500/20 transition-colors disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
