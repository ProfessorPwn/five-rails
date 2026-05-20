"use client";

import { useEffect, useState } from "react";

interface Idea {
  id: string;
  title: string;
  category: string | null;
  overall_score: number;
  revenue_tier: string | null;
  validation_status: string | null;
  idea_date: string | null;
  description: string;
  stage_detail: string | null;
  campaign_id?: string | null;
  gate1_passed_at?: string | null;
  gate2_passed_at?: string | null;
  gate2_failure_reason?: string | null;
  actual_signups?: number | null;
  target_signups?: number | null;
  actual_ctr_pct?: number | null;
  actual_cpl_usd?: number | null;
  project_id?: string | null;
  landing_page_slug?: string | null;
  pipeline_state?: string; // for Worth Pursuing: not_started | queued | in_testing | failed_gate2 | passed_all_gates
}

interface Response {
  counts: {
    total: { c: number };
    worth_pursuing: number;
    skip: number;
    unreviewed: number;
    rejected_gate1: number;
    in_testing: number;
    failed_gate2: number;
    passed_all_gates: number;
  };
  worth_pursuing: Idea[];
  skip: Idea[];
  unreviewed: Idea[];
  rejected_gate1: Idea[];
  in_testing: Idea[];
  failed_gate2: Idea[];
  passed_all_gates: Idea[];
}

// Two groups of tabs:
//   Curation — score-based "should we even validate this?"
//   Pipeline — actual Gate 1/Gate 2 outcomes
const CURATION_STAGES: Array<{ key: string; label: string; color: string; description: string }> = [
  { key: "worth_pursuing", label: "Worth Pursuing", color: "emerald", description: "High-scoring ideas (overall ≥60) — these should go through validation first. Tier S = ≥70, Tier A = 60-69." },
  { key: "skip",           label: "Skip",           color: "rose",    description: "Low-scoring ideas (overall <50) — the scoring engine says pass. Only pursue if you see something it missed." },
];

const PIPELINE_STAGES: Array<{ key: string; label: string; color: string; description: string }> = [
  { key: "passed_all_gates", label: "Passed All Gates",    color: "emerald", description: "Validated end-to-end. Thiel approved, market test hit targets, build triggered." },
  { key: "in_testing",       label: "In Testing",          color: "sky",     description: "Passed Gate 1 (Thiel ≥ 7/10). Running live market test — CTR, signups, CPL." },
  { key: "unreviewed",       label: "Unreviewed",          color: "amber",   description: "Imported from IdeaBrowser, waiting for Peter's Gate 1 scoring." },
  { key: "failed_gate2",     label: "Failed Gate 2",       color: "rose",    description: "Passed Thiel, but market test fell short of targets (signups/CTR/CPL)." },
  { key: "rejected_gate1",   label: "Rejected at Gate 1",  color: "slate",   description: "Peter rejected — usually below 7/10 threshold or marked mimetic/saturated." },
];

const STAGES = [...CURATION_STAGES, ...PIPELINE_STAGES];

const COLOR_CLASSES: Record<string, { badge: string; border: string; bar: string }> = {
  emerald: { badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", border: "border-emerald-500/40", bar: "bg-emerald-500" },
  sky:     { badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",             border: "border-sky-500/40",     bar: "bg-sky-500" },
  amber:   { badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",       border: "border-amber-500/40",   bar: "bg-amber-500" },
  rose:    { badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",          border: "border-rose-500/40",    bar: "bg-rose-500" },
  slate:   { badge: "bg-slate-500/15 text-slate-300 border-slate-500/30",       border: "border-slate-500/40",   bar: "bg-slate-500" },
};

export default function ValidationPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState<string>("worth_pursuing");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Idea | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const reload = () => {
    fetch("/api/validation")
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const startValidation = async (ideaId: string) => {
    setStarting(ideaId);
    try {
      const res = await fetch("/api/validation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea_id: ideaId }),
      });
      const data = await res.json();
      alert(data.message || (res.ok ? "Started" : `Failed: ${data.error}`));
      reload();
    } finally {
      setStarting(null);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return null;

  const items = (data[activeStage as keyof Response] as unknown as Idea[]) || [];
  const filtered = q.trim()
    ? items.filter(i =>
        i.title.toLowerCase().includes(q.toLowerCase())
        || (i.category || "").toLowerCase().includes(q.toLowerCase())
        || (i.description || "").toLowerCase().includes(q.toLowerCase())
      )
    : items;

  const totalIdeas = data.counts.total.c;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Validation Pipeline</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Every IdeaBrowser idea, grouped by where it is in the two-gate pipeline.
            Gate 1 = Peter Thiel&apos;s scoring (≥7/10). Gate 2 = market test (signups, CTR, CPL).
          </p>
        </div>

        {/* Funnel — split into Curation (what to validate) + Pipeline (results) */}
        <div className="mb-6 space-y-4">
          {/* Curation row */}
          <div className="p-5 bg-[#141822] border border-[#1e293b]/40 rounded-2xl">
            <div className="text-xs text-[#64748b] uppercase tracking-wide mb-3">
              Curation — should we validate this? ({totalIdeas} total ideas)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CURATION_STAGES.map(s => {
                const count = (data.counts as Record<string, number>)[s.key] ?? 0;
                const pct = totalIdeas > 0 ? Math.round((count / totalIdeas) * 100) : 0;
                const c = COLOR_CLASSES[s.color];
                const active = activeStage === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveStage(s.key)}
                    className={`text-left rounded-xl p-3 border transition-colors ${
                      active ? `${c.border} bg-[#0a0c14]` : "border-[#1e293b]/40 bg-[#0a0c14] hover:border-[#334155]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-2 h-2 rounded-full ${c.bar}`} />
                      <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">{s.label}</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{count}</div>
                    <div className="text-[10px] text-[#64748b]">{pct}% of pipeline</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pipeline outcome row */}
          <div className="p-5 bg-[#141822] border border-[#1e293b]/40 rounded-2xl">
            <div className="text-xs text-[#64748b] uppercase tracking-wide mb-3">
              Pipeline outcomes — where ideas actually landed
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PIPELINE_STAGES.map(s => {
                const count = (data.counts as Record<string, number>)[s.key] ?? 0;
                const pct = totalIdeas > 0 ? Math.round((count / totalIdeas) * 100) : 0;
                const c = COLOR_CLASSES[s.color];
                const active = activeStage === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveStage(s.key)}
                    className={`text-left rounded-xl p-3 border transition-colors ${
                      active ? `${c.border} bg-[#0a0c14]` : "border-[#1e293b]/40 bg-[#0a0c14] hover:border-[#334155]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-2 h-2 rounded-full ${c.bar}`} />
                      <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">{s.label}</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{count}</div>
                    <div className="text-[10px] text-[#64748b]">{pct}% of pipeline</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stage description + search */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-[#e2e8f0]">
              {STAGES.find(s => s.key === activeStage)?.label} · {filtered.length}
            </h2>
            <p className="text-xs text-[#64748b] mt-0.5">{STAGES.find(s => s.key === activeStage)?.description}</p>
          </div>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter by title, category..."
            className="w-64 px-3 py-2 bg-[#141822] border border-[#1e293b]/50 rounded-lg text-xs text-white placeholder-[#484f58] focus:outline-none focus:border-amber-500/50"
          />
        </div>

        {/* Idea grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[#484f58] text-sm bg-[#141822] rounded-2xl border border-[#1e293b]/30">
            Nothing here yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(i => {
              const stage = STAGES.find(s => s.key === activeStage);
              const c = COLOR_CLASSES[stage?.color || "slate"];
              const isWorthPursuing = activeStage === "worth_pursuing";

              // Pipeline status badge for Worth Pursuing
              const pipelineBadge = (() => {
                if (!isWorthPursuing || !i.pipeline_state) return null;
                const map: Record<string, { text: string; cls: string }> = {
                  not_started:      { text: "Not validated",     cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
                  queued:           { text: "Queued",             cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
                  in_testing:       { text: "In testing",         cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
                  failed_gate2:     { text: "Failed Gate 2",      cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
                  passed_all_gates: { text: "Passed all gates",   cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
                };
                const s = map[i.pipeline_state];
                return s ? <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${s.cls}`}>{s.text}</span> : null;
              })();

              return (
                <div
                  key={i.id}
                  className="relative p-4 bg-[#141822] border border-[#1e293b]/40 rounded-xl hover:border-[#334155] transition-colors"
                >
                  <button onClick={() => setSelected(i)} className="block text-left w-full">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${c.badge}`}>
                        {i.category || "uncategorized"}
                      </span>
                      {i.overall_score > 0 && (
                        <span className="text-[10px] text-[#64748b]">score {i.overall_score}</span>
                      )}
                      {i.revenue_tier && (
                        <span className="text-[10px] text-[#64748b]">· {i.revenue_tier.split(" ")[0]}</span>
                      )}
                      {pipelineBadge}
                    </div>
                    <h3 className="text-sm font-semibold text-[#e2e8f0] mb-2 line-clamp-2">{i.title}</h3>
                    {i.stage_detail && (
                      <p className="text-[11px] text-[#94a3b8] line-clamp-3 mb-2">{i.stage_detail}</p>
                    )}
                    {i.idea_date && (
                      <div className="text-[10px] text-[#64748b]">{i.idea_date}</div>
                    )}
                  </button>

                  {/* Worth Pursuing CTA: "Start Validation" if not yet in pipeline */}
                  {isWorthPursuing && i.pipeline_state === "not_started" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); startValidation(i.id); }}
                      disabled={starting === i.id}
                      className="mt-3 w-full px-3 py-2 text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
                    >
                      {starting === i.id ? "Starting..." : "Start Validation →"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && <IdeaDrawer item={selected} stage={activeStage} onClose={() => setSelected(null)} />}
    </div>
  );
}

function IdeaDrawer({ item, stage, onClose }: { item: Idea; stage: string; onClose: () => void }) {
  const stageConf = STAGES.find(s => s.key === stage);
  const c = COLOR_CLASSES[stageConf?.color || "slate"];

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={e => e.stopPropagation()}
        className="relative ml-auto h-full w-full max-w-2xl bg-[#0a0c14] border-l border-[#1e293b] overflow-y-auto"
      >
        <div className="sticky top-0 bg-[#0a0c14] border-b border-[#1e293b]/40 px-6 py-4 flex items-center justify-between">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${c.badge}`}>
            {stageConf?.label}
          </span>
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-6">
          <h2 className="text-xl font-bold text-white mb-3">{item.title}</h2>

          <div className="flex flex-wrap gap-2 mb-5">
            {item.category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#141822] border border-[#1e293b] text-[#94a3b8]">{item.category}</span>}
            {item.overall_score > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#141822] border border-[#1e293b] text-[#94a3b8]">score {item.overall_score}</span>}
            {item.revenue_tier && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#141822] border border-[#1e293b] text-[#94a3b8]">{item.revenue_tier}</span>}
            {item.idea_date && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#141822] border border-[#1e293b] text-[#94a3b8]">{item.idea_date}</span>}
          </div>

          {item.stage_detail && (
            <div className="mb-5 p-4 bg-[#141822] border border-[#1e293b]/40 rounded-xl">
              <div className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1.5">Stage detail</div>
              <p className="text-sm text-[#cbd5e1]">{item.stage_detail}</p>
            </div>
          )}

          {/* Test metrics (for in_testing / failed_gate2 / passed) */}
          {(item.actual_signups !== null && item.actual_signups !== undefined) && (
            <div className="mb-5 grid grid-cols-3 gap-2">
              <div className="p-3 bg-[#141822] border border-[#1e293b]/40 rounded-lg">
                <div className="text-[10px] text-[#64748b] uppercase tracking-wide">Signups</div>
                <div className="text-lg font-bold text-white">
                  {item.actual_signups}
                  {item.target_signups ? <span className="text-xs font-normal text-[#64748b]"> / {item.target_signups}</span> : null}
                </div>
              </div>
              <div className="p-3 bg-[#141822] border border-[#1e293b]/40 rounded-lg">
                <div className="text-[10px] text-[#64748b] uppercase tracking-wide">CTR</div>
                <div className="text-lg font-bold text-white">{item.actual_ctr_pct ?? 0}%</div>
              </div>
              <div className="p-3 bg-[#141822] border border-[#1e293b]/40 rounded-lg">
                <div className="text-[10px] text-[#64748b] uppercase tracking-wide">CPL</div>
                <div className="text-lg font-bold text-white">${item.actual_cpl_usd ?? 0}</div>
              </div>
            </div>
          )}

          {/* Public landing-page URL — share this anywhere to drive validation traffic. */}
          {item.landing_page_slug && (
            <PublicTestUrl slug={item.landing_page_slug} />
          )}

          <div className="mb-5 p-4 bg-[#141822] border border-[#1e293b]/40 rounded-xl">
            <div className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1.5">Description</div>
            <p className="text-sm text-[#cbd5e1] whitespace-pre-wrap">{item.description || "(no description)"}</p>
          </div>

          <div className="flex gap-2">
            <a
              href={`/ideabrowser?idea=${item.id}`}
              className="px-4 py-2 text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/25"
            >
              Open in IdeaBrowser
            </a>
            {item.project_id && (
              <a
                href={`/projects/${item.project_id}`}
                className="px-4 py-2 text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/25"
              >
                View project
              </a>
            )}
            {item.campaign_id && (
              <a
                href={`/validation/campaigns/${item.campaign_id}`}
                className="px-4 py-2 text-xs bg-sky-500/15 text-sky-300 border border-sky-500/30 rounded-lg hover:bg-sky-500/25"
              >
                View campaign
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PublicTestUrl({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  // Build the absolute URL on the client so it survives prod/dev port changes.
  const url = typeof window !== "undefined" ? `${window.location.origin}/p/${slug}` : `/p/${slug}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in non-secure contexts; the user can still
      // select the URL text manually.
    }
  };

  return (
    <div className="mb-5 p-4 bg-[#141822] border border-indigo-500/30 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wide text-indigo-300">Public test page</div>
        <a
          href={`/p/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] uppercase tracking-wide text-[#64748b] hover:text-white"
        >
          Open ↗
        </a>
      </div>
      <div className="flex gap-2">
        <code className="flex-1 px-3 py-2 bg-[#0a0c14] border border-[#1e293b] rounded-lg text-xs text-[#cbd5e1] truncate">
          {url}
        </code>
        <button
          onClick={copy}
          className="px-3 py-2 bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs hover:bg-indigo-500/25 whitespace-nowrap"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-[10px] text-[#64748b]">
        Share this anywhere — Reddit, DMs, cold email, ads. Every signup increments the campaign&apos;s actual_signups.
      </p>
    </div>
  );
}
