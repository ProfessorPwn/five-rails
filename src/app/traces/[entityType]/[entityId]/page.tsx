"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import CommandLayout from "@/components/command/CommandLayout";

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

interface TracePayload {
  entity: { type: string; id: string };
  nodes: TraceNode[];
  count: number;
}

const kindLabel: Record<TraceNode["kind"], string> = {
  trigger: "Trigger",
  playbook_start: "Playbook",
  playbook_step: "Step",
  skill_execution: "Skill",
  handoff: "Handoff",
  playbook_complete: "Playbook End",
  agent_run: "Agent Run",
  agent_decision: "Decision",
  activity: "Activity",
  watchdog_fix: "Code Fix",
  event: "Event",
};

const kindColor: Record<TraceNode["kind"], string> = {
  trigger: "border-amber-500/40 text-amber-400",
  playbook_start: "border-sky-500/40 text-sky-400",
  playbook_step: "border-[#2a3348] text-[#94a3b8]",
  skill_execution: "border-indigo-500/40 text-indigo-400",
  handoff: "border-amber-500/40 text-amber-400",
  playbook_complete: "border-sky-500/40 text-sky-400",
  agent_run: "border-emerald-500/40 text-emerald-400",
  agent_decision: "border-emerald-500/40 text-emerald-400",
  activity: "border-[#2a3348] text-[#64748b]",
  watchdog_fix: "border-rose-500/40 text-rose-400",
  event: "border-[#2a3348] text-[#64748b]",
};

const statusColor = (status?: TraceNode["status"]) => {
  if (!status) return "text-[#64748b]";
  if (status === "ok" || status === "completed") return "text-emerald-400";
  if (status === "running") return "text-sky-400";
  if (status === "skipped") return "text-[#64748b]";
  return "text-rose-400";
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z"));
    return d.toLocaleString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", month: "short", day: "2-digit" });
  } catch {
    return iso;
  }
}

export default function TracePage() {
  const params = useParams<{ entityType: string; entityId: string }>();
  const [data, setData] = useState<TracePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(
          `/api/command/traces/${encodeURIComponent(params.entityType)}/${encodeURIComponent(params.entityId)}`,
          { cache: "no-store" }
        );
        if (!r.ok) {
          const errBody = await r.json().catch(() => ({}));
          if (!cancelled) setError(errBody.error ?? `HTTP ${r.status}`);
          return;
        }
        const json = (await r.json()) as TracePayload;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load trace");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
  }, [params.entityType, params.entityId]);

  return (
    <CommandLayout
      title="Trace"
      subtitle={`${params.entityType} / ${params.entityId}`}
      actions={
        <Link
          href="/traces"
          className="text-xs text-[#94a3b8] hover:text-[#e2e8f0] px-3 py-1.5 border border-[#1e293b] hover:border-[#2a3348] rounded-md transition-colors"
        >
          ← All traces
        </Link>
      }
      showRightRail={false}
    >
      {loading ? (
        <div className="bg-[#141822] border border-[#1e293b] rounded-xl py-12 text-center text-[#64748b] text-sm">
          Assembling trace…
        </div>
      ) : error ? (
        <div className="bg-[#141822] border border-rose-500/30 rounded-xl px-5 py-4 text-rose-400 text-sm">
          {error}
        </div>
      ) : !data || data.nodes.length === 0 ? (
        <div className="bg-[#141822] border border-[#1e293b] rounded-xl py-12 text-center text-[#64748b] text-sm">
          No trace nodes found for this entity. The originating playbook may have completed before
          event emission was wired, or this entity has no chain yet.
        </div>
      ) : (
        <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-5">
          <div className="mb-4 flex items-center gap-3 text-xs text-[#94a3b8]">
            <span>{data.count} step{data.count === 1 ? "" : "s"}</span>
            <span className="text-[#475569]">•</span>
            <span className="text-[#475569]">first → last</span>
          </div>
          <ol className="relative border-l border-[#1e293b]/60 ml-3 space-y-4">
            {data.nodes.map((node, idx) => (
              <li key={`${node.at}-${idx}`} className="ml-5">
                <span
                  className={`absolute -left-[5px] w-2.5 h-2.5 rounded-full border-2 ${kindColor[node.kind]} bg-[#141822]`}
                  aria-hidden="true"
                />
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 border rounded ${kindColor[node.kind]}`}>
                    {kindLabel[node.kind]}
                  </span>
                  <span className="text-[10px] text-[#475569]">
                    {formatTimestamp(node.at)}
                  </span>
                  {node.status ? (
                    <span className={`text-[10px] uppercase tracking-widest ${statusColor(node.status)}`}>
                      {node.status}
                    </span>
                  ) : null}
                </div>
                <div className="text-sm text-[#e2e8f0]">{node.title}</div>
                {node.subtitle ? (
                  <div className="text-xs text-[#94a3b8] mt-0.5">{node.subtitle}</div>
                ) : null}
                {node.detail ? (
                  <pre className="mt-2 text-xs text-[#94a3b8] bg-[#0d0f17] border border-[#1e293b]/60 rounded-md px-3 py-2 whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {node.detail.length > 1500 ? `${node.detail.slice(0, 1500)}\n…` : node.detail}
                  </pre>
                ) : null}
                {node.link ? (
                  <Link
                    href={node.link}
                    className="inline-block mt-2 text-xs text-amber-400 hover:text-amber-300"
                  >
                    Open →
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}
    </CommandLayout>
  );
}
