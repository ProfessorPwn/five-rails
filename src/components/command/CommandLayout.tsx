"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

interface KpiStripItem {
  label: string;
  value: string | number;
  href?: string;
  tone?: "default" | "warning" | "danger" | "success";
}

interface InboxPreviewItem {
  id: string;
  title: string;
  subtitle?: string;
  priority: "low" | "normal" | "high" | "urgent";
  href: string;
}

interface OverviewResponse {
  kpis?: KpiStripItem[];
  inbox?: InboxPreviewItem[];
}

interface CommandLayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  showRightRail?: boolean;
}

const toneClasses: Record<NonNullable<KpiStripItem["tone"]>, string> = {
  default: "text-[#e2e8f0]",
  warning: "text-amber-400",
  danger: "text-rose-400",
  success: "text-emerald-400",
};

const priorityDot: Record<InboxPreviewItem["priority"], string> = {
  low: "bg-[#64748b]",
  normal: "bg-sky-400",
  high: "bg-amber-400",
  urgent: "bg-rose-500",
};

export default function CommandLayout({
  title,
  subtitle,
  actions,
  children,
  showRightRail = true,
}: CommandLayoutProps) {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOverview = async () => {
      try {
        const r = await fetch("/api/command/overview", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as OverviewResponse;
        if (!cancelled) setOverview(data);
      } catch {
        // /api/command/overview lands in Stage 2; until then this layout
        // renders with empty KPI strip and inbox rail. No regression.
      }
    };
    fetchOverview();
    const id = setInterval(fetchOverview, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const kpis = overview?.kpis ?? [];
  const inbox = overview?.inbox ?? [];

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <header className="mb-6">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-[#e2e8f0] tracking-tight">{title}</h1>
              {subtitle ? (
                <p className="text-sm text-[#94a3b8] mt-1">{subtitle}</p>
              ) : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>
          {kpis.length > 0 ? (
            <div className="grid grid-flow-col auto-cols-fr gap-3 bg-[#141822] border border-[#1e293b] rounded-xl px-5 py-3">
              {kpis.map((kpi) => {
                const tone = toneClasses[kpi.tone ?? "default"];
                const inner = (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[#64748b]">{kpi.label}</div>
                    <div className={`text-lg font-semibold mt-0.5 ${tone}`}>{kpi.value}</div>
                  </div>
                );
                return kpi.href ? (
                  <Link key={kpi.label} href={kpi.href} className="hover:opacity-80 transition-opacity">
                    {inner}
                  </Link>
                ) : (
                  <div key={kpi.label}>{inner}</div>
                );
              })}
            </div>
          ) : null}
        </header>
        {children}
      </div>

      {showRightRail ? (
        <aside className="w-72 shrink-0 hidden xl:block">
          <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-4 sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase tracking-widest text-[#64748b]">Attention</div>
              <Link href="/inbox" className="text-xs text-amber-400 hover:text-amber-300">
                Inbox →
              </Link>
            </div>
            {inbox.length === 0 ? (
              <div className="text-xs text-[#64748b] py-6 text-center">All clear.</div>
            ) : (
              <ul className="space-y-2">
                {inbox.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex items-start gap-2 p-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <span
                        className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[item.priority]}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="text-sm text-[#e2e8f0] truncate">{item.title}</div>
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
        </aside>
      ) : null}
    </div>
  );
}
