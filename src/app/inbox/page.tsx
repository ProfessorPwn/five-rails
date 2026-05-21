"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import CommandLayout from "@/components/command/CommandLayout";

interface InboxItem {
  id: string;
  from_agent_id: string;
  from_name: string | null;
  to_agent_id: string | null;
  to_name: string | null;
  message: string;
  message_type: string;
  priority: "low" | "normal" | "high" | "urgent";
  is_read: boolean;
  seen_at: string | null;
  deadline_at: string | null;
  created_at: string;
}

const priorityDot: Record<InboxItem["priority"], string> = {
  low: "bg-[#64748b]",
  normal: "bg-sky-400",
  high: "bg-amber-400",
  urgent: "bg-rose-500",
};

const priorityLabel: Record<InboxItem["priority"], string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
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

type View = "unread" | "all" | "acked";

export default function InboxPage() {
  const [view, setView] = useState<View>("unread");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/command/inbox?view=${view}`, { cache: "no-store" });
      if (r.ok) {
        const data = (await r.json()) as { items: InboxItem[] };
        setItems(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  const ack = async (id: string, action: "ack" | "ack_and_read" | "unread") => {
    setAcking(id);
    try {
      const r = await fetch(`/api/command/inbox/${id}/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (r.ok) await load();
    } finally {
      setAcking(null);
    }
  };

  const counts = {
    unread: items.filter((i) => !i.is_read && !i.seen_at).length,
    urgent: items.filter((i) => i.priority === "urgent").length,
    high: items.filter((i) => i.priority === "high").length,
  };

  return (
    <CommandLayout
      title="Inbox"
      subtitle="Unread handoffs, requests, and alerts — sorted by priority then age."
      actions={
        <div className="flex items-center gap-1 bg-[#141822] border border-[#1e293b] rounded-lg p-1">
          {(["unread", "all", "acked"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                view === v
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : "text-[#94a3b8] hover:text-[#e2e8f0] border border-transparent"
              }`}
            >
              {v === "unread" ? "Unread" : v === "all" ? "All" : "Acked"}
            </button>
          ))}
        </div>
      }
      showRightRail={false}
    >
      {view === "unread" && counts.unread > 0 ? (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="bg-[#141822] border border-[#1e293b] rounded-lg px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-[#64748b]">Total Unread</div>
            <div className="text-xl font-semibold text-[#e2e8f0] mt-0.5">{counts.unread}</div>
          </div>
          <div className="bg-[#141822] border border-rose-500/20 rounded-lg px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-rose-400">Urgent</div>
            <div className="text-xl font-semibold text-rose-400 mt-0.5">{counts.urgent}</div>
          </div>
          <div className="bg-[#141822] border border-amber-500/20 rounded-lg px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-amber-400">High</div>
            <div className="text-xl font-semibold text-amber-400 mt-0.5">{counts.high}</div>
          </div>
        </div>
      ) : null}

      <div className="bg-[#141822] border border-[#1e293b] rounded-xl overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="py-12 text-center text-[#64748b] text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-[#64748b] text-sm">
            {view === "unread" ? "Inbox zero — nothing needs your attention." : "No messages."}
          </div>
        ) : (
          <ul className="divide-y divide-[#1e293b]/40">
            {items.map((item) => {
              const isExpanded = expanded === item.id;
              const isAcking = acking === item.id;
              return (
                <li key={item.id} id={item.id}>
                  <div className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : item.id)}
                      className="flex items-start gap-3 w-full text-left"
                    >
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${priorityDot[item.priority]}`}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[10px] uppercase tracking-widest text-[#64748b]">
                            {priorityLabel[item.priority]}
                          </span>
                          <span className="text-[10px] uppercase tracking-widest text-[#475569]">
                            {item.message_type}
                          </span>
                          <span className="text-[10px] text-[#475569]">
                            {relativeTime(item.created_at)}
                          </span>
                          {item.deadline_at ? (
                            <span className="text-[10px] text-amber-400/80">
                              ⏱ deadline {relativeTime(item.deadline_at)}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-sm text-[#e2e8f0]">
                          <span className="text-[#94a3b8]">{item.from_name ?? "Agent"}</span>
                          <span className="text-[#475569] mx-1.5">→</span>
                          <span className="text-[#94a3b8]">{item.to_name ?? "Operator"}</span>
                        </div>
                        <div className={`text-sm text-[#94a3b8] mt-1 ${isExpanded ? "" : "line-clamp-2"}`}>
                          {item.message}
                        </div>
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="mt-3 ml-5 flex items-center gap-2 flex-wrap">
                        {!item.is_read && !item.seen_at ? (
                          <button
                            type="button"
                            disabled={isAcking}
                            onClick={() => ack(item.id, "ack_and_read")}
                            className="px-3 py-1.5 text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-md hover:bg-amber-500/25 transition-colors disabled:opacity-50"
                          >
                            {isAcking ? "Acking…" : "Mark seen"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isAcking}
                            onClick={() => ack(item.id, "unread")}
                            className="px-3 py-1.5 text-xs bg-[#1a1f2c] text-[#94a3b8] border border-[#2a3348] rounded-md hover:bg-[#202636] transition-colors disabled:opacity-50"
                          >
                            {isAcking ? "Updating…" : "Mark unread"}
                          </button>
                        )}
                        <Link
                          href={`/traces/message/${item.id}`}
                          className="px-3 py-1.5 text-xs bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded-md hover:bg-sky-500/20 transition-colors"
                        >
                          See context →
                        </Link>
                        {item.from_agent_id ? (
                          <Link
                            href={`/agents/${item.from_agent_id}`}
                            className="px-3 py-1.5 text-xs text-[#94a3b8] hover:text-[#e2e8f0] border border-transparent hover:border-[#2a3348] rounded-md transition-colors"
                          >
                            Open {item.from_name ?? "agent"}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </CommandLayout>
  );
}
