"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CommandLayout from "@/components/command/CommandLayout";

interface RecentRun {
  id: string;
  playbook_name: string;
  trigger_entity_type: string | null;
  trigger_entity_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  result: string | null;
  error: string | null;
}

const statusColor = (status: string) => {
  if (status === "completed") return "border-emerald-500/30 text-emerald-400";
  if (status === "running") return "border-sky-500/30 text-sky-400";
  if (status === "failed") return "border-rose-500/30 text-rose-400";
  return "border-[#2a3348] text-[#94a3b8]";
};

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

export default function TracesIndexPage() {
  const [runs, setRuns] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/command/traces/recent", { cache: "no-store" });
        if (r.ok) {
          const data = (await r.json()) as { runs: RecentRun[] };
          setRuns(data.runs);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <CommandLayout
      title="Traces"
      subtitle="Recent playbook runs. Click any row to drill into the full reasoning chain."
      showRightRail={false}
    >
      <div className="bg-[#141822] border border-[#1e293b] rounded-xl overflow-hidden">
        {loading && runs.length === 0 ? (
          <div className="py-12 text-center text-[#64748b] text-sm">Loading recent traces…</div>
        ) : runs.length === 0 ? (
          <div className="py-12 text-center text-[#64748b] text-sm">
            No playbook runs yet. Traces will appear here as soon as a playbook fires.
          </div>
        ) : (
          <ul className="divide-y divide-[#1e293b]/40">
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/traces/playbook_run/${run.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border rounded ${statusColor(run.status)}`}>
                    {run.status}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#e2e8f0] truncate">{run.playbook_name}</div>
                    <div className="text-xs text-[#94a3b8] truncate">
                      {run.trigger_entity_type ? `on ${run.trigger_entity_type}` : "no trigger"}
                      {run.trigger_entity_id ? ` ${run.trigger_entity_id.slice(0, 8)}` : ""}
                      {run.result ? ` — ${run.result.slice(0, 120)}` : ""}
                      {run.error ? ` — error: ${run.error.slice(0, 120)}` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-[#475569] shrink-0">
                    {relativeTime(run.started_at)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CommandLayout>
  );
}
