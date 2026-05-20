"use client";

import { useState, useEffect } from "react";
import Badge from "@/components/ui/Badge";

interface AnalyticsData {
  totals: { published: number; impressions: number; clicks: number; likes: number; shares: number; comments: number; reach: number };
  byPlatform: Record<string, { impressions: number; likes: number; shares: number; comments: number; count: number }>;
  published: number;
}

interface FunnelStage {
  stage: string;
  count: number;
  conversion_rate: string | null;
  drop_off: number;
  drop_off_pct: string | null;
}

interface FunnelEvent {
  id: string;
  event_name: string;
  event_data: string;
  user_id: string | null;
  session_id: string | null;
  source: string | null;
  created_at: string;
}

interface QuickStats {
  events_this_week: number;
  events_today: number;
  most_active_stage: string | null;
  overall_conversion: string | null;
}

interface FunnelData {
  funnel: FunnelStage[];
  total_events: number;
  event_types: Array<{ event_name: string; count: number }>;
  recent_events: FunnelEvent[];
  quick_stats: QuickStats;
}

const STAGE_LABELS: Record<string, string> = {
  visit: "Visit",
  signup: "Sign Up",
  activate: "Activate",
  engage: "Engage",
  purchase: "Purchase",
  retain: "Retain",
  refer: "Refer",
};

const STAGE_COLORS: Record<string, { bar: string; text: string }> = {
  visit: { bar: "from-blue-500 to-blue-400", text: "text-blue-400" },
  signup: { bar: "from-blue-400 to-cyan-400", text: "text-cyan-400" },
  activate: { bar: "from-cyan-400 to-teal-400", text: "text-teal-400" },
  engage: { bar: "from-teal-400 to-emerald-400", text: "text-emerald-400" },
  purchase: { bar: "from-emerald-400 to-green-400", text: "text-green-400" },
  retain: { bar: "from-green-400 to-lime-400", text: "text-lime-400" },
  refer: { bar: "from-lime-400 to-green-300", text: "text-green-300" },
};

const EVENT_BADGE_VARIANT: Record<string, "info" | "success" | "warning" | "emerald" | "violet" | "amber" | "rose" | "blue" | "default"> = {
  visit: "info",
  signup: "blue",
  activate: "violet",
  engage: "emerald",
  purchase: "success",
  retain: "amber",
  refer: "rose",
};

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<"content" | "funnel">("funnel");
  const [contentData, setContentData] = useState<AnalyticsData | null>(null);
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/analytics").then((r) => r.json()).catch(() => null),
      fetch("/api/funnels").then((r) => r.json()).catch(() => null),
    ]).then(([content, funnel]) => {
      setContentData(content);
      setFunnelData(funnel);
      setLoading(false);
    });
  }, []);

  const refreshContent = async () => {
    setRefreshing(true);
    await fetch("/api/analytics", { method: "POST" });
    const res = await fetch("/api/analytics");
    setContentData(await res.json());
    setRefreshing(false);
  };

  const refreshFunnel = async () => {
    setRefreshing(true);
    const res = await fetch("/api/funnels");
    setFunnelData(await res.json());
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const t = contentData?.totals || { published: 0, impressions: 0, clicks: 0, likes: 0, shares: 0, comments: 0, reach: 0 };
  const platforms = Object.entries(contentData?.byPlatform || {});

  const funnel = funnelData?.funnel || [];
  const recentEvents = funnelData?.recent_events || [];
  const quickStats = funnelData?.quick_stats || { events_this_week: 0, events_today: 0, most_active_stage: null, overall_conversion: null };
  const maxCount = funnel.length > 0 ? Math.max(...funnel.map((s) => s.count)) : 1;

  // Filter events by selected stage
  const filteredEvents = selectedStage
    ? recentEvents.filter((e) => e.event_name.toLowerCase().includes(selectedStage))
    : recentEvents;

  function parseEventData(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function formatTimestamp(ts: string): string {
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDays = Math.floor(diffHr / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return ts;
    }
  }

  function getBadgeVariant(eventName: string) {
    for (const [key, variant] of Object.entries(EVENT_BADGE_VARIANT)) {
      if (eventName.toLowerCase().includes(key)) return variant;
    }
    return "default" as const;
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e2e8f0]">Analytics</h1>
            <p className="text-sm text-[#8b949e] mt-1">Conversion funnel and content performance</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-8 bg-[#0f1118] rounded-lg p-1 w-fit border border-[#1e293b]">
          <button
            onClick={() => setActiveTab("funnel")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${
              activeTab === "funnel"
                ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                : "text-[#94a3b8] hover:text-[#e2e8f0] border border-transparent"
            }`}
          >
            Conversion Funnel
          </button>
          <button
            onClick={() => setActiveTab("content")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${
              activeTab === "content"
                ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                : "text-[#94a3b8] hover:text-[#e2e8f0] border border-transparent"
            }`}
          >
            Content Performance
          </button>
        </div>

        {/* ============================================================= */}
        {/* SECTION: Conversion Funnel */}
        {/* ============================================================= */}
        {activeTab === "funnel" && (
          <div className="space-y-6">
            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#141822] rounded-xl border border-[#1e293b] p-5">
                <div className="text-xs text-[#8b949e] mb-1">Events This Week</div>
                <div className="text-2xl font-bold text-indigo-400">{quickStats.events_this_week.toLocaleString()}</div>
              </div>
              <div className="bg-[#141822] rounded-xl border border-[#1e293b] p-5">
                <div className="text-xs text-[#8b949e] mb-1">Overall Conversion</div>
                <div className="text-2xl font-bold text-emerald-400">{quickStats.overall_conversion || "--"}</div>
              </div>
              <div className="bg-[#141822] rounded-xl border border-[#1e293b] p-5">
                <div className="text-xs text-[#8b949e] mb-1">Most Active Stage</div>
                <div className="text-2xl font-bold text-amber-400 capitalize truncate">
                  {quickStats.most_active_stage || "--"}
                </div>
              </div>
              <div className="bg-[#141822] rounded-xl border border-[#1e293b] p-5">
                <div className="text-xs text-[#8b949e] mb-1">Events Today</div>
                <div className="text-2xl font-bold text-blue-400">{quickStats.events_today.toLocaleString()}</div>
              </div>
            </div>

            {/* Funnel Visualization */}
            {funnel.length > 0 ? (
              <div className="bg-[#141822] rounded-xl border border-[#1e293b] p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-sm font-bold text-[#e2e8f0] uppercase tracking-wider">Funnel Stages</h2>
                  <button
                    onClick={refreshFunnel}
                    disabled={refreshing}
                    className="text-xs text-[#64748b] hover:text-[#e2e8f0] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                <div className="space-y-3">
                  {funnel.map((stage, i) => {
                    const widthPct = maxCount > 0 ? Math.max((stage.count / maxCount) * 100, 4) : 4;
                    const colors = STAGE_COLORS[stage.stage] || { bar: "from-gray-500 to-gray-400", text: "text-gray-400" };
                    const isSelected = selectedStage === stage.stage;

                    return (
                      <div key={stage.stage}>
                        {/* Conversion rate between stages */}
                        {i > 0 && stage.conversion_rate && (
                          <div className="flex items-center gap-2 ml-2 mb-1.5 -mt-1">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#484f58]">
                              <path d="M6 2v8M3 7l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="text-xs font-medium text-amber-400">
                              {stage.conversion_rate} conversion
                            </span>
                            {stage.drop_off_pct && (
                              <span className="text-xs text-red-400/70">
                                ({stage.drop_off_pct} drop-off, -{stage.drop_off})
                              </span>
                            )}
                          </div>
                        )}

                        {/* Stage bar */}
                        <button
                          onClick={() => setSelectedStage(isSelected ? null : stage.stage)}
                          className={`w-full text-left group cursor-pointer transition-all rounded-lg p-1 ${
                            isSelected ? "bg-white/5 ring-1 ring-indigo-500/30" : "hover:bg-white/[0.02]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Label */}
                            <div className="w-20 flex-shrink-0 text-right">
                              <span className={`text-xs font-semibold uppercase tracking-wide ${colors.text}`}>
                                {STAGE_LABELS[stage.stage] || stage.stage}
                              </span>
                            </div>

                            {/* Bar */}
                            <div className="flex-1 relative">
                              <div className="h-9 rounded-lg bg-[#0f1118] overflow-hidden">
                                <div
                                  className={`h-full rounded-lg bg-gradient-to-r ${colors.bar} transition-all duration-500 relative`}
                                  style={{ width: `${widthPct}%` }}
                                >
                                  <div className="absolute inset-0 bg-white/5" />
                                </div>
                              </div>
                            </div>

                            {/* Count */}
                            <div className="w-16 flex-shrink-0 text-right">
                              <span className="text-sm font-bold text-[#e2e8f0]">{stage.count.toLocaleString()}</span>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="mt-4 pt-4 border-t border-[#1e293b] flex items-center gap-4 text-[10px] text-[#64748b]">
                  <span>Click a stage to filter the event timeline below</span>
                  {selectedStage && (
                    <button onClick={() => setSelectedStage(null)} className="text-indigo-400 hover:text-indigo-300 cursor-pointer">
                      Clear filter
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-[#141822] rounded-xl border border-[#1e293b] p-12 text-center">
                <div className="mb-3 text-[#484f58]">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="mx-auto">
                    <path d="M8 12h32v6l-10 8v10l-12 2V26L8 18V12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-[#8b949e] mb-2 font-medium">No funnel events tracked yet</p>
                <p className="text-sm text-[#484f58] max-w-md mx-auto">
                  Track funnel events via POST /api/funnels with event names like &quot;visit&quot;, &quot;signup&quot;, &quot;activate&quot;, &quot;engage&quot;, &quot;purchase&quot;, &quot;retain&quot;, or &quot;refer&quot; to see your conversion funnel here.
                </p>
              </div>
            )}

            {/* Event Timeline */}
            <div className="bg-[#141822] rounded-xl border border-[#1e293b] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#1e293b] flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#e2e8f0] uppercase tracking-wider">
                  Event Timeline
                  {selectedStage && (
                    <span className="ml-2 text-indigo-400 normal-case font-normal">
                      — filtering: {STAGE_LABELS[selectedStage] || selectedStage}
                    </span>
                  )}
                </h2>
                <span className="text-xs text-[#64748b]">{filteredEvents.length} events</span>
              </div>

              {filteredEvents.length > 0 ? (
                <div className="divide-y divide-[#1e293b]/50 max-h-96 overflow-y-auto">
                  {filteredEvents.map((event) => {
                    const data = parseEventData(event.event_data);
                    const dataKeys = Object.keys(data).filter((k) => data[k] !== undefined && data[k] !== null && data[k] !== "");
                    return (
                      <div key={event.id} className="px-6 py-3 hover:bg-white/[0.02] transition-colors flex items-center gap-4">
                        <Badge variant={getBadgeVariant(event.event_name)} className="min-w-[80px] justify-center">
                          {event.event_name}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          {dataKeys.length > 0 ? (
                            <span className="text-xs text-[#94a3b8] truncate block">
                              {dataKeys.slice(0, 3).map((k) => `${k}: ${String(data[k])}`).join(" | ")}
                              {dataKeys.length > 3 && ` +${dataKeys.length - 3} more`}
                            </span>
                          ) : (
                            <span className="text-xs text-[#484f58] italic">No additional data</span>
                          )}
                        </div>
                        {event.source && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-[#64748b] flex-shrink-0">
                            {event.source}
                          </span>
                        )}
                        <span className="text-xs text-[#64748b] flex-shrink-0 w-16 text-right">
                          {formatTimestamp(event.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm text-[#484f58]">
                    {selectedStage ? `No events matching "${STAGE_LABELS[selectedStage] || selectedStage}"` : "No events recorded yet"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* SECTION: Content Performance */}
        {/* ============================================================= */}
        {activeTab === "content" && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button
                onClick={refreshContent}
                disabled={refreshing}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {refreshing ? "Refreshing..." : "Refresh from Platforms"}
              </button>
            </div>

            {/* Hero Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Published", value: t.published, color: "text-indigo-400" },
                { label: "Impressions", value: t.impressions, color: "text-blue-400" },
                { label: "Likes", value: t.likes, color: "text-rose-400" },
                { label: "Total Engagement", value: t.likes + t.shares + t.comments, color: "text-emerald-400" },
              ].map((m) => (
                <div key={m.label} className="bg-[#141822] rounded-xl border border-[#1e293b] p-5">
                  <div className="text-xs text-[#8b949e] mb-1">{m.label}</div>
                  <div className={`text-2xl font-bold ${m.color}`}>{m.value.toLocaleString()}</div>
                </div>
              ))}
            </div>

            {/* Platform Breakdown */}
            {platforms.length > 0 ? (
              <div className="bg-[#141822] rounded-xl border border-[#1e293b] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#1e293b]">
                  <h2 className="text-sm font-bold text-[#e2e8f0]">Platform Breakdown</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-[#8b949e] border-b border-[#1e293b]">
                      <th className="text-left px-6 py-3">Platform</th>
                      <th className="text-right px-4 py-3">Posts</th>
                      <th className="text-right px-4 py-3">Impressions</th>
                      <th className="text-right px-4 py-3">Likes</th>
                      <th className="text-right px-4 py-3">Shares</th>
                      <th className="text-right px-4 py-3">Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platforms.map(([platform, stats]) => (
                      <tr key={platform} className="border-b border-[#1e293b]/50 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-6 py-3 text-sm font-medium text-[#e2e8f0] capitalize">{platform}</td>
                        <td className="px-4 py-3 text-sm text-right text-[#8b949e]">{stats.count}</td>
                        <td className="px-4 py-3 text-sm text-right text-[#8b949e]">{stats.impressions.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-[#8b949e]">{stats.likes.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-[#8b949e]">{stats.shares.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-[#8b949e]">{stats.comments.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-[#141822] rounded-xl border border-[#1e293b] p-12 text-center">
                <p className="text-[#8b949e] mb-2">Publish content and refresh to see metrics</p>
                <p className="text-sm text-[#484f58]">Publish content to Twitter, LinkedIn, or Facebook, then click &quot;Refresh from Platforms&quot; to pull metrics.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
