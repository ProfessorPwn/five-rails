"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Idea {
  id: string;
  title: string;
  description: string | null;
  source_url: string | null;
  category: string | null;
  tags: string | null;
  search_volume: string | null;
  growth_rate: string | null;
  pain_level: string | null;
  feasibility: string | null;
  founder_fit: string | null;
  revenue_potential: string | null;
  execution_difficulty: string | null;
  go_to_market: string | null;
  pricing: string | null;
  target_market: string | null;
  competition: string | null;
  product_urgency: string | null;
  market_gap: string | null;
  execution_plan: string | null;
  idea_date: string | null;
  search_volume_score: number;
  growth_rate_score: number;
  pain_level_score: number;
  feasibility_score: number;
  revenue_potential_score: number;
  overall_score: number;
  google_trends_data: string | null;
  sync_status: string;
  project_id: string | null;
  imported_at: string;
  updated_at: string;
}

interface Trend {
  id: string;
  title: string;
  category: string | null;
  growth_pct: number;
  sparkline_data: string | null;
  search_volume: number;
  timeframe: string;
}

interface MarketInsight {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  metric_label: string | null;
  metric_value: string | null;
  trend_direction: "up" | "down" | "flat" | null;
  sparkline_data: string | null;
}

interface CategoryCount {
  category: string;
  count: number;
}

// ─── Sparkline SVG Component ──────────────────────────────────────────────────

function Sparkline({ data, color = "#6366f1", height = 40, width = 120 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      <polygon fill={color} fillOpacity="0.1" points={areaPoints} />
    </svg>
  );
}

// ─── Score Bar Component ──────────────────────────────────────────────────────

function ScoreBar({ label, value, score, color }: { label: string; value: string | null; score: number; color: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-gray-500 w-32 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium text-gray-700 w-16 text-right">{value || `${score}/100`}</span>
    </div>
  );
}

// ─── Idea Card (Database Grid) ────────────────────────────────────────────────

function IdeaCard({ idea, onClick }: { idea: Idea; onClick: () => void }) {
  const tags = idea.tags?.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 3) || [];
  const tagColors: Record<string, string> = {
    "AI-Powered": "bg-purple-50 text-purple-700 border-purple-200",
    "SaaS": "bg-blue-50 text-blue-700 border-blue-200",
    "FinTech": "bg-green-50 text-green-700 border-green-200",
    "HealthTech": "bg-red-50 text-red-700 border-red-200",
    "Health Tech": "bg-red-50 text-red-700 border-red-200",
    "Marketplace": "bg-amber-50 text-amber-700 border-amber-200",
    "FoodTech": "bg-orange-50 text-orange-700 border-orange-200",
    "EdTech": "bg-cyan-50 text-cyan-700 border-cyan-200",
    "LegalTech": "bg-indigo-50 text-indigo-700 border-indigo-200",
    "PropTech": "bg-teal-50 text-teal-700 border-teal-200",
    "Cybersecurity": "bg-rose-50 text-rose-700 border-rose-200",
    "TravelTech": "bg-sky-50 text-sky-700 border-sky-200",
  };

  return (
    <button onClick={onClick} className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all duration-200 flex flex-col h-full group">
      <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">{idea.title}</h3>
      <p className="text-xs text-gray-500 mb-3 line-clamp-3 flex-1">{idea.description || "No description available."}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {tags.map((tag) => (
          <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full border ${tagColors[tag] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
            {tag}
          </span>
        ))}
      </div>
      {idea.overall_score > 0 && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${idea.overall_score}%` }} />
          </div>
          <span className="text-[10px] font-semibold text-gray-500">{idea.overall_score}</span>
        </div>
      )}
    </button>
  );
}

// ─── Trend Card ───────────────────────────────────────────────────────────────

function TrendCard({ trend }: { trend: Trend }) {
  const sparkData = trend.sparkline_data ? JSON.parse(trend.sparkline_data) : [];
  const isPositive = trend.growth_pct > 0;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex-1 mr-2">{trend.title}</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isPositive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {isPositive ? "+" : ""}{trend.growth_pct}%
        </span>
      </div>
      <Sparkline data={sparkData} color={isPositive ? "#10b981" : "#ef4444"} height={50} width={200} />
      {trend.category && (
        <span className="inline-block mt-3 text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{trend.category}</span>
      )}
    </div>
  );
}

// ─── Market Insight Card ──────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: MarketInsight }) {
  const sparkData = insight.sparkline_data ? JSON.parse(insight.sparkline_data) : [];
  const dirIcon = insight.trend_direction === "up" ? "\u2191" : insight.trend_direction === "down" ? "\u2193" : "\u2192";
  const dirColor = insight.trend_direction === "up" ? "text-emerald-600" : insight.trend_direction === "down" ? "text-red-600" : "text-gray-500";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 flex-1 mr-2">{insight.title}</h3>
        <span className={`text-lg font-bold ${dirColor}`}>{dirIcon}</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">{insight.description}</p>
      {sparkData.length > 0 && <Sparkline data={sparkData} color="#6366f1" height={35} width={180} />}
      <div className="flex items-center justify-between mt-3">
        {insight.metric_label && (
          <span className="text-[10px] text-gray-400">{insight.metric_label}</span>
        )}
        {insight.metric_value && (
          <span className="text-xs font-bold text-gray-700">{insight.metric_value}</span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IdeaBrowserPage() {
  // Idea of the Day
  const [ideaOfDay, setIdeaOfDay] = useState<Idea | null>(null);
  // Database
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [totalIdeas, setTotalIdeas] = useState(0);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [page, setPage] = useState(1);
  const [perPage] = useState(48);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  // Trends & Insights
  const [trends, setTrends] = useState<Trend[]>([]);
  const [insights, setInsights] = useState<MarketInsight[]>([]);
  // UI
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"idea" | "database" | "trends" | "insights">("idea");
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [scoring, setScoring] = useState(false);

  const fetchIdeaOfDay = useCallback(async () => {
    try {
      const res = await fetch("/api/ideabrowser/idea-of-the-day");
      if (res.ok) setIdeaOfDay(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchIdeas = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage), sort: sortBy });
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      const res = await fetch(`/api/ideabrowser/ideas/paginated?${params}`);
      if (res.ok) {
        const data = await res.json();
        setIdeas(data.ideas);
        setTotalIdeas(data.total);
        setCategories(data.categories);
      }
    } catch { /* ignore */ }
  }, [page, perPage, search, categoryFilter, sortBy]);

  const fetchTrends = useCallback(async () => {
    try {
      const res = await fetch("/api/ideabrowser/trends");
      if (res.ok) setTrends(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch("/api/ideabrowser/market-insights");
      if (res.ok) setInsights(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    Promise.all([fetchIdeaOfDay(), fetchIdeas(), fetchTrends(), fetchInsights()]).finally(() => setLoading(false));
  }, [fetchIdeaOfDay, fetchIdeas, fetchTrends, fetchInsights]);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  const runScoring = async () => {
    setScoring(true);
    try {
      await fetch("/api/ideabrowser/score", { method: "POST" });
      await fetchIdeas();
      await fetchIdeaOfDay();
    } finally {
      setScoring(false);
    }
  };

  const totalPages = Math.ceil(totalIdeas / perPage);
  const trendsParsed = (idea: Idea): number[] => {
    if (!idea.google_trends_data) return Array.from({ length: 30 }, (_, i) => Math.round(30 + Math.sin(i / 3) * 20 + Math.random() * 15));
    try { return JSON.parse(idea.google_trends_data); } catch { return []; }
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return "#10b981";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading IdeaBrowser...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Navigation ──────────────────────────────────────────────── */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">IdeaBrowser</span>
            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">Five Rails</span>
          </div>
          <div className="flex items-center gap-1">
            {(["idea", "database", "trends", "insights"] as const).map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`px-4 py-2 text-sm rounded-lg transition-all ${activeSection === section ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
              >
                {section === "idea" ? "Idea of the Day" : section === "database" ? "Database" : section === "trends" ? "Trends" : "Market Insights"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runScoring} disabled={scoring} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {scoring ? "Scoring..." : "Score All Ideas"}
            </button>
            <span className="text-xs text-gray-400">{totalIdeas} ideas</span>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* ─── Section 1: Idea of the Day ──────────────────────────────── */}
        {activeSection === "idea" && (
          <section>
            {/* Hero Title */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent" style={{ fontFamily: "Georgia, serif" }}>
                Idea of the Day
              </h1>
              <p className="text-sm text-gray-400 mt-1">Daily startup ideas backed by data</p>
            </div>

            {ideaOfDay ? (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Date & Navigation */}
                <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100">
                  <button onClick={() => {/* TODO: prev day */}} className="text-sm text-gray-400 hover:text-gray-600">&larr; yesterday</button>
                  <span className="text-sm font-medium text-gray-600">{ideaOfDay.idea_date || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                  <span className="text-sm text-gray-300">today &rarr;</span>
                </div>

                <div className="p-8">
                  {/* Title */}
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">{ideaOfDay.title}</h2>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    {ideaOfDay.tags?.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                      <span key={tag} className="text-xs px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">{tag}</span>
                    ))}
                  </div>

                  {/* Description */}
                  <div className="prose prose-sm max-w-none text-gray-600 mb-8">
                    {ideaOfDay.description?.split("\n").map((p, i) => (
                      <p key={i} className="mb-3">{p}</p>
                    ))}
                  </div>

                  {/* Google Trends Chart */}
                  <div className="bg-gray-50 rounded-xl p-6 mb-8">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Search Interest Over Time</h3>
                    <Sparkline data={trendsParsed(ideaOfDay)} color="#6366f1" height={120} width={700} />
                  </div>

                  {/* Idea Snapshot */}
                  <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
                    <h3 className="text-sm font-bold text-gray-900 mb-4">Idea Snapshot</h3>
                    <ScoreBar label="Search Volume" value={ideaOfDay.search_volume} score={ideaOfDay.search_volume_score || 50} color={getScoreColor(ideaOfDay.search_volume_score || 50)} />
                    <ScoreBar label="Growth Rate" value={ideaOfDay.growth_rate} score={ideaOfDay.growth_rate_score || 50} color={getScoreColor(ideaOfDay.growth_rate_score || 50)} />
                    <ScoreBar label="Pain Level" value={ideaOfDay.pain_level} score={ideaOfDay.pain_level_score || 50} color={getScoreColor(ideaOfDay.pain_level_score || 50)} />
                    <ScoreBar label="Feasibility" value={ideaOfDay.feasibility} score={ideaOfDay.feasibility_score || 50} color={getScoreColor(ideaOfDay.feasibility_score || 50)} />
                    <ScoreBar label="Revenue Potential" value={ideaOfDay.revenue_potential} score={ideaOfDay.revenue_potential_score || 50} color={getScoreColor(ideaOfDay.revenue_potential_score || 50)} />
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-32">Overall Score</span>
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all duration-500" style={{ width: `${ideaOfDay.overall_score || 50}%` }} />
                      </div>
                      <span className="text-sm font-bold text-indigo-600">{ideaOfDay.overall_score || 50}/100</span>
                    </div>
                  </div>

                  {/* Analysis Sections */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Product Urgency */}
                    <div className="border border-gray-200 rounded-xl p-6">
                      <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Product Urgency
                      </h3>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {ideaOfDay.product_urgency || "Analysis shows growing demand signals. Market timing is favorable for early movers with a validated MVP approach."}
                      </p>
                    </div>

                    {/* The Market Gap */}
                    <div className="border border-gray-200 rounded-xl p-6">
                      <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        The Market Gap
                      </h3>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {ideaOfDay.market_gap || "Current solutions leave gaps in automation, pricing transparency, and user experience. A focused entrant can capture underserved segments."}
                      </p>
                    </div>
                  </div>

                  {/* Execution Plan */}
                  <div className="border border-gray-200 rounded-xl p-6 mb-6">
                    <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Execution Plan
                    </h3>
                    {ideaOfDay.execution_plan ? (
                      <ol className="space-y-2">
                        {ideaOfDay.execution_plan.split("\n").filter(Boolean).map((step, i) => (
                          <li key={i} className="flex gap-3 text-sm text-gray-600">
                            <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs flex items-center justify-center shrink-0 font-bold">{i + 1}</span>
                            <span>{step.replace(/^\d+\.\s*/, "")}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <ol className="space-y-2">
                        {["Validate demand through surveys and landing page tests", "Build MVP with core features only", "Launch to early adopters via targeted communities", "Iterate based on user feedback and retention data", "Scale with content marketing and partnerships"].map((step, i) => (
                          <li key={i} className="flex gap-3 text-sm text-gray-600">
                            <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs flex items-center justify-center shrink-0 font-bold">{i + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
                      Save to Project
                    </button>
                    <button className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                      Share
                    </button>
                    <button className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                      Generate Action Plan
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                <p className="text-gray-500">No ideas imported yet. Run a sync to get started.</p>
              </div>
            )}
          </section>
        )}

        {/* ─── Section 2: The Idea Database ────────────────────────────── */}
        {activeSection === "database" && (
          <section>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent" style={{ fontFamily: "Georgia, serif" }}>
                The Idea Database
              </h2>
              <p className="text-sm text-gray-400 mt-1">Browse {totalIdeas} startup ideas with data-driven analysis</p>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="Search ideas..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white"
                />
                <svg className="absolute left-3 top-3 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              >
                <option value="newest">Newest First</option>
                <option value="score">Highest Score</option>
                <option value="pain">Highest Pain</option>
                <option value="revenue">Revenue Potential</option>
                <option value="category">By Category</option>
              </select>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
              {ideas.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} onClick={() => setSelectedIdea(idea)} />
              ))}
            </div>

            {ideas.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                <p className="text-gray-500">No ideas match your filters.</p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50">Previous</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button key={p} onClick={() => setPage(p)} className={`px-3 py-1.5 text-sm rounded-lg ${page === p ? "bg-indigo-600 text-white" : "border border-gray-200 hover:bg-gray-50"}`}>
                      {p}
                    </button>
                  );
                })}
                {totalPages > 7 && <span className="text-gray-400">...</span>}
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50">Next</button>
              </div>
            )}
          </section>
        )}

        {/* ─── Section 3: Trends ───────────────────────────────────────── */}
        {activeSection === "trends" && (
          <section>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-rose-400 bg-clip-text text-transparent" style={{ fontFamily: "Georgia, serif" }}>
                Trends
              </h2>
              <p className="text-sm text-gray-400 mt-1">Emerging patterns across startup categories</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {trends.map((trend) => (
                <TrendCard key={trend.id} trend={trend} />
              ))}
            </div>

            {trends.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                <p className="text-gray-500">No trend data available yet. Import more ideas to generate trends.</p>
              </div>
            )}
          </section>
        )}

        {/* ─── Section 4: Market Insights ──────────────────────────────── */}
        {activeSection === "insights" && (
          <section>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 bg-clip-text text-transparent" style={{ fontFamily: "Georgia, serif" }}>
                Market Insights
              </h2>
              <p className="text-sm text-gray-400 mt-1">Community signals and opportunity tracking</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>

            {insights.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                <p className="text-gray-500">No market insights available yet.</p>
              </div>
            )}
          </section>
        )}
      </div>

      {/* ─── Idea Detail Modal ─────────────────────────────────────────── */}
      {selectedIdea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedIdea(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-8">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 flex-1 mr-4">{selectedIdea.title}</h2>
                <button onClick={() => setSelectedIdea(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {selectedIdea.tags?.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                  <span key={tag} className="text-xs px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">{tag}</span>
                ))}
              </div>

              <p className="text-sm text-gray-600 mb-6 leading-relaxed">{selectedIdea.description}</p>

              {/* Scores */}
              <div className="border border-gray-200 rounded-xl p-5 mb-6">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Idea Snapshot</h3>
                <ScoreBar label="Search Volume" value={selectedIdea.search_volume} score={selectedIdea.search_volume_score || 50} color={getScoreColor(selectedIdea.search_volume_score || 50)} />
                <ScoreBar label="Growth Rate" value={selectedIdea.growth_rate} score={selectedIdea.growth_rate_score || 50} color={getScoreColor(selectedIdea.growth_rate_score || 50)} />
                <ScoreBar label="Pain Level" value={selectedIdea.pain_level} score={selectedIdea.pain_level_score || 50} color={getScoreColor(selectedIdea.pain_level_score || 50)} />
                <ScoreBar label="Feasibility" value={selectedIdea.feasibility} score={selectedIdea.feasibility_score || 50} color={getScoreColor(selectedIdea.feasibility_score || 50)} />
                <ScoreBar label="Revenue Potential" value={selectedIdea.revenue_potential} score={selectedIdea.revenue_potential_score || 50} color={getScoreColor(selectedIdea.revenue_potential_score || 50)} />
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-32">Overall</span>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600" style={{ width: `${selectedIdea.overall_score || 50}%` }} />
                  </div>
                  <span className="text-sm font-bold text-indigo-600">{selectedIdea.overall_score || 50}</span>
                </div>
              </div>

              {/* Analysis */}
              {selectedIdea.product_urgency && (
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">Product Urgency</h3>
                  <p className="text-sm text-gray-600">{selectedIdea.product_urgency}</p>
                </div>
              )}
              {selectedIdea.market_gap && (
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">The Market Gap</h3>
                  <p className="text-sm text-gray-600">{selectedIdea.market_gap}</p>
                </div>
              )}
              {selectedIdea.execution_plan && (
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">Execution Plan</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{selectedIdea.execution_plan}</p>
                </div>
              )}

              {/* Target Market & Competition */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {selectedIdea.target_market && (
                  <div className="border border-gray-100 rounded-lg p-3">
                    <span className="text-[10px] text-gray-400 uppercase">Target Market</span>
                    <p className="text-sm text-gray-700 mt-1">{selectedIdea.target_market}</p>
                  </div>
                )}
                {selectedIdea.competition && (
                  <div className="border border-gray-100 rounded-lg p-3">
                    <span className="text-[10px] text-gray-400 uppercase">Competition</span>
                    <p className="text-sm text-gray-700 mt-1">{selectedIdea.competition}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">Save to Project</button>
                <button className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Generate Action Plan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
