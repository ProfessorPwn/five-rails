"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface InboxItem {
  id: string;
  title: string;
  subtitle?: string;
  priority: "low" | "normal" | "high" | "urgent";
  href: string;
  kind: "handoff" | "fix" | "gap";
  created_at: string;
}

interface AttentionSummary {
  unread_messages: number;
  pending_watchdog_fixes: number;
  pending_capability_gaps: number;
  blocked_tasks: number;
}

interface OverviewPayload {
  inbox?: InboxItem[];
  attention?: AttentionSummary;
}

const priorityDot: Record<InboxItem["priority"], string> = {
  low: "bg-[#64748b]",
  normal: "bg-sky-400",
  high: "bg-amber-400",
  urgent: "bg-rose-500",
};

const kindLabel: Record<InboxItem["kind"], string> = {
  handoff: "Handoff",
  fix: "Code Fix",
  gap: "Capability Gap",
};

function relativeTime(iso: string): string {
  const then = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z")).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AttentionQueue() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/command/overview", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as OverviewPayload;
        if (!cancelled) setData(json);
      } catch {
        // silent — endpoint may be temporarily unavailable
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const inbox = data?.inbox ?? [];
  const summary = data?.attention;
  const totalAttention =
    (summary?.unread_messages ?? 0) +
    (summary?.pending_watchdog_fixes ?? 0) +
    (summary?.pending_capability_gaps ?? 0);

  return (
    <div className="bg-[#141822] border border-[#1e293b] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#1e293b]/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5L1.5 5v4l6.5 5.5L14.5 9V5L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-amber-400" />
            <path d="M8 5v3.5M8 11v0.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-amber-400" />
          </svg>
          <h2 className="text-sm font-semibold text-[#e2e8f0]">Attention Queue</h2>
          {totalAttention > 0 ? (
            <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
              {totalAttention}
            </span>
          ) : null}
        </div>
        <Link
          href="/inbox"
          className="text-xs text-[#64748b] hover:text-amber-400 transition-colors"
        >
          Open Inbox &rarr;
        </Link>
      </div>

      {summary ? (
        <div className="grid grid-cols-4 divide-x divide-[#1e293b]/50 border-b border-[#1e293b]/50">
          <SummaryCell label="Handoffs" value={summary.unread_messages} href="/inbox" />
          <SummaryCell label="Code Fixes" value={summary.pending_watchdog_fixes} href="/agents/watchdog/fixes" />
          <SummaryCell label="Capability Gaps" value={summary.pending_capability_gaps} href="/agents/watchdog" />
          <SummaryCell label="Blocked Tasks" value={summary.blocked_tasks} href="/agents" />
        </div>
      ) : null}

      <div>
        {loading && inbox.length === 0 ? (
          <div className="py-8 text-center text-[#64748b] text-sm">Loading…</div>
        ) : inbox.length === 0 ? (
          <div className="py-8 text-center text-[#64748b] text-sm">All clear. No items need your attention.</div>
        ) : (
          <ul className="divide-y divide-[#1e293b]/40">
            {inbox.slice(0, 6).map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${priorityDot[item.priority]}`}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-[#64748b]">
                        {kindLabel[item.kind]}
                      </span>
                      <span className="text-[10px] text-[#475569]">
                        {relativeTime(item.created_at)}
                      </span>
                    </div>
                    <div className="text-sm text-[#e2e8f0] truncate mt-0.5">
                      {item.title}
                    </div>
                    {item.subtitle ? (
                      <div className="text-xs text-[#94a3b8] truncate">{item.subtitle}</div>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SummaryCell({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="px-5 py-3 hover:bg-white/[0.02] transition-colors block"
    >
      <div className="text-[10px] uppercase tracking-widest text-[#64748b]">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${value > 0 ? "text-[#e2e8f0]" : "text-[#475569]"}`}>
        {value}
      </div>
    </Link>
  );
}
