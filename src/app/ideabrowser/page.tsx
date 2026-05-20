"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

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
  founders_edge: string | null;
  sync_status: string;
  project_id: string | null;
  imported_at: string;
  updated_at: string;
  keyword_terms: string | null;
  opportunity_score: number;
  problem_score: number;
  feasibility_score_10: number;
  why_now_score: number;
  revenue_tier: string | null;
  execution_difficulty_score: number;
  gtm_score: number;
  offer_ladder: string | null;
  why_now: string | null;
  proof_signals: string | null;
  idea_type: string | null;
  market_type: string | null;
  target_persona: string | null;
  main_competitor: string | null;
  trend_analysis: string | null;
  community_signals: string | null;
  is_bookmarked: number;
  // 10-factor market-readiness scorecard
  sc_demand_signals: number;
  sc_pain_severity: number;
  sc_willingness_to_pay: number;
  sc_competition_landscape: number;
  sc_speed_to_mvp: number;
  sc_channel_clarity: number;
  sc_unit_economics: number;
  sc_timing_signal: number;
  sc_market_size: number;
  sc_founder_advantage: number;
  sc_total: number;
  sc_verdict: string | null;
  sc_evidence: string | null;
  sc_test_method: string | null;
  sc_budget_timeline: string | null;
  sc_dealbreakers: string | null;
  sc_evaluated_at: string | null;
  _nav?: { prev: string | null; next: string | null };
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

function IdeaCard({ idea, onClick, onLaunch }: { idea: Idea; onClick: () => void; onLaunch: (idea: Idea) => void }) {
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

  const isLaunched = !!idea.project_id;

  return (
    <div className="relative text-left bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all duration-200 flex flex-col h-full group">
      <button onClick={onClick} className="text-left flex-1 flex flex-col">
        <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">{idea.title}</h3>
        <p className="text-xs text-gray-500 mb-3 line-clamp-3 flex-1">{idea.description || "No description available."}</p>
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.map((tag) => (
            <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full border ${tagColors[tag] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
              {tag}
            </span>
          ))}
        </div>
      </button>
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        {idea.overall_score > 0 && (
          <>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${idea.overall_score}%` }} />
            </div>
            <span className="text-[10px] font-semibold text-gray-500 mr-1">{idea.overall_score}</span>
          </>
        )}
        {!idea.overall_score && <div className="flex-1" />}
        {isLaunched ? (
          <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Launched
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onLaunch(idea); }}
            className="text-[10px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium hover:bg-amber-100 transition-colors flex items-center gap-1"
            title="Launch this idea"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1L5 3M5 3L8 7H2L5 3Z" fill="currentColor" /><path d="M3 8h4" stroke="currentColor" strokeWidth="0.8" /></svg>
            Launch
          </button>
        )}
      </div>
    </div>
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
  const [navDates, setNavDates] = useState<{ prev: string | null; next: string | null }>({ prev: null, next: null });
  const [selectedKeyword, setSelectedKeyword] = useState(0);
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
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [launchingIdea, setLaunchingIdea] = useState<Idea | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<{ success: boolean; message: string; project_id?: string } | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ engine: string; message: string } | null>(null);
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [scorecardLive, setScorecardLive] = useState<{
    scores: Record<string, number>;
    evidence: Record<string, string>;
    total: number;
    verdict: string;
    dealbreakers: string[];
    test_method: string;
    budget_timeline: string;
  } | null>(null);
  const router = useRouter();

  // Save idea to a new project
  const saveToProject = async (idea: Idea) => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: idea.title,
          description: idea.description || "",
          niche: idea.category || "",
          target_audience: idea.target_market || "",
        }),
      });
      if (res.ok) {
        const project = await res.json();
        // Link the idea to the project
        await fetch(`/api/ideabrowser/ideas/${idea.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: project.id }),
        }).catch(() => {});
        setSaveMessage(`Saved as project "${project.name}"`);
        setTimeout(() => router.push(`/projects/${project.id}`), 1500);
      } else {
        setSaveMessage("Failed to create project");
      }
    } catch {
      setSaveMessage("Failed to create project");
    }
    setSaving(false);
  };

  // Generate action plan from idea
  const generateActionPlan = async (idea: Idea) => {
    setSaving(true);
    setSaveMessage(null);
    try {
      // First create a project if none exists
      const projRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: idea.title,
          description: idea.description || "",
          niche: idea.category || "",
          target_audience: idea.target_market || "",
        }),
      });
      if (!projRes.ok) throw new Error("Failed to create project");
      const project = await projRes.json();

      // Then generate the action plan
      const planRes = await fetch(`/api/projects/${project.id}/generate-plan`, { method: "POST" });
      if (planRes.ok) {
        setSaveMessage("Action plan generated! Redirecting...");
        setTimeout(() => router.push(`/projects/${project.id}`), 1500);
      } else {
        const err = await planRes.json();
        setSaveMessage(err.error || "Failed to generate plan — check LLM connection");
        // Still redirect to the project
        setTimeout(() => router.push(`/projects/${project.id}`), 2000);
      }
    } catch {
      setSaveMessage("Failed — check LLM connection");
    }
    setSaving(false);
  };

  // Validate idea with AI engine
  const validateIdeaWithAI = async (ideaId: string) => {
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch(`/api/ideabrowser/ideas/${ideaId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setValidationResult({ engine: data._engine, message: data._message });
        await fetchIdeaOfDay(ideaOfDay?.idea_date || undefined);
        await fetchIdeas();
      } else {
        setValidationResult({ engine: "error", message: data.error || "Validation failed" });
      }
    } catch {
      setValidationResult({ engine: "error", message: "Validation failed — check LLM connection" });
    }
    setValidating(false);
  };

  // Run 10-factor market-readiness scorecard
  const runScorecard = async (ideaId: string) => {
    setScorecardLoading(true);
    setScorecardLive(null);
    try {
      const res = await fetch("/api/ideabrowser/scorecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea_id: ideaId }),
      });
      if (res.ok) {
        const data = await res.json();
        setScorecardLive(data);
        await fetchIdeaOfDay(ideaOfDay?.idea_date || undefined);
      }
    } catch { /* handled by loading state */ }
    setScorecardLoading(false);
  };

  // Launch idea pipeline: idea -> project -> blueprint -> agents
  const launchIdea = async (idea: Idea) => {
    setLaunching(true);
    setLaunchResult(null);
    try {
      const res = await fetch(`/api/ideabrowser/ideas/${idea.id}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        setLaunchResult({
          success: true,
          message: `Launched "${idea.title}" with ${data.tasks_created} agent tasks`,
          project_id: data.project_id,
        });
        await fetchIdeas();
        setTimeout(() => {
          router.push(`/projects/${data.project_id}`);
        }, 2000);
      } else {
        if (res.status === 409 && data.project_id) {
          setLaunchResult({
            success: false,
            message: "Already launched. Redirecting to project...",
            project_id: data.project_id,
          });
          setTimeout(() => router.push(`/projects/${data.project_id}`), 1500);
        } else {
          setLaunchResult({ success: false, message: data.error || "Launch failed" });
        }
      }
    } catch {
      setLaunchResult({ success: false, message: "Launch failed - check connection" });
    }
    setLaunching(false);
  };

  const fetchIdeaOfDay = useCallback(async (date?: string) => {
    try {
      const url = date
        ? `/api/ideabrowser/idea-of-the-day?date=${encodeURIComponent(date)}`
        : "/api/ideabrowser/idea-of-the-day";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setIdeaOfDay(data);
        setNavDates(data._nav || { prev: null, next: null });
        setSelectedKeyword(0);
      }
    } catch { /* ignore */ }
  }, []);

  const navigateIdea = (direction: "prev" | "next") => {
    const targetDate = direction === "prev" ? navDates.prev : navDates.next;
    if (targetDate) {
      setScorecardLive(null);
      fetchIdeaOfDay(targetDate);
    }
  };

  const toggleBookmark = async () => {
    if (!ideaOfDay) return;
    try {
      const res = await fetch(`/api/ideabrowser/ideas/${ideaOfDay.id}/bookmark`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIdeaOfDay((prev) => prev ? { ...prev, is_bookmarked: data.is_bookmarked ? 1 : 0 } : null);
      }
    } catch { /* ignore */ }
  };

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

  const [scoreResult, setScoreResult] = useState<string | null>(null);

  const runScoring = async () => {
    setScoring(true);
    setScoreResult(null);
    try {
      const res = await fetch("/api/ideabrowser/score", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setScoreResult(`Scored ${data.scored} ideas`);
        await fetchIdeas();
        await fetchIdeaOfDay();
      } else {
        setScoreResult(data.error || "Scoring failed");
      }
    } catch {
      setScoreResult("Scoring failed — check LLM connection");
    } finally {
      setScoring(false);
    }
  };

  const totalPages = Math.ceil(totalIdeas / perPage);
  const trendsParsed = (idea: Idea): number[] => {
    if (!idea.google_trends_data) return [];
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
            {scoreResult && <span className="text-xs text-emerald-600">{scoreResult}</span>}
            <span className="text-xs text-gray-400">{totalIdeas} ideas</span>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* ─── Section 1: Idea of the Day ──────────────────────────────── */}
        {activeSection === "idea" && (() => {
          // Helper functions scoped to this section
          const getScoreLabel10 = (type: string, score: number) => {
            if (type === "opportunity") return score >= 9 ? "Exceptional" : score >= 7 ? "Strong" : score >= 5 ? "Moderate" : "Low";
            if (type === "problem") return score >= 9 ? "Severe Pain" : score >= 7 ? "Real Pain" : score >= 5 ? "Moderate" : "Mild";
            if (type === "feasibility") return score >= 9 ? "Easy" : score >= 7 ? "Manageable" : score >= 5 ? "Moderate" : "Challenging";
            if (type === "whynow") return score >= 9 ? "Perfect Timing" : score >= 7 ? "Good Timing" : score >= 5 ? "Decent" : "Wait";
            return "";
          };
          const getScore10Color = (score: number) => {
            if (score >= 9) return { bg: "bg-emerald-500", text: "text-emerald-700", light: "bg-emerald-50", border: "border-emerald-200" };
            if (score >= 7) return { bg: "bg-blue-500", text: "text-blue-700", light: "bg-blue-50", border: "border-blue-200" };
            if (score >= 5) return { bg: "bg-amber-500", text: "text-amber-700", light: "bg-amber-50", border: "border-amber-200" };
            return { bg: "bg-gray-400", text: "text-gray-600", light: "bg-gray-50", border: "border-gray-200" };
          };
          const parseJsonSafe = <T,>(val: string | null, fallback: T): T => {
            if (!val) return fallback;
            try { return JSON.parse(val); } catch { return fallback; }
          };
          const formatDate = (dateStr: string | null) => {
            if (!dateStr) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            try {
              const d = new Date(dateStr + "T00:00:00");
              return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            } catch { return dateStr; }
          };

          return (
          <section>
            {/* Hero Title */}
            <div className="text-center mb-6">
              <h1 className="text-4xl font-bold italic bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent" style={{ fontFamily: "Georgia, serif" }}>
                Idea of the Day
              </h1>
              <p className="text-sm text-gray-400 mt-1">Daily startup ideas backed by data</p>
            </div>

            {ideaOfDay ? (() => {
              const keywords: { term: string; volume: number; growth: number }[] = parseJsonSafe(ideaOfDay.keyword_terms, []);
              const offerLadder: { tier: string; name: string; price: string; description: string }[] = parseJsonSafe(ideaOfDay.offer_ladder, []);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const communitySignalsRaw = parseJsonSafe<Record<string, any>>(ideaOfDay.community_signals, {});
              // Normalize: signals can be {count, label, url} objects or flat numbers
              const getCommunityData = (key: string): { count: number; label: string; url: string | null } => {
                const val = communitySignalsRaw[key];
                if (typeof val === 'number') return { count: val, label: `${val} found`, url: null };
                if (val && typeof val === 'object') return { count: val.count || 0, label: val.label || `${val.count || 0} found`, url: (val as { url?: string }).url || null };
                return { count: 0, label: '0 found', url: null };
              };
              // v2 rich community signal data (when AI-validated)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const v2Signals = communitySignalsRaw._v2 as Record<string, any> | undefined;
              const hasV2 = !!(v2Signals?.reddit?.subreddits?.length || v2Signals?.youtube?.videos?.length || v2Signals?.google_trends?.primary_keyword);
              const trendsData: number[] = trendsParsed(ideaOfDay);
              const allTags = ideaOfDay.tags?.split(",").map((t) => t.trim()).filter(Boolean) || [];
              const badges: { label: string; color: string }[] = [];
              if (ideaOfDay.opportunity_score >= 9) badges.push({ label: "10x Better", color: "bg-emerald-50 text-emerald-700 border-emerald-200" });
              if (ideaOfDay.why_now_score >= 9) badges.push({ label: "Perfect Timing", color: "bg-orange-50 text-orange-700 border-orange-200" });
              if (ideaOfDay.overall_score >= 70) badges.push({ label: "Proven Founder Fit", color: "bg-purple-50 text-purple-700 border-purple-200" });
              const remainingBadges = Math.max(0, allTags.length - 3);
              const formatVolume = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v);
              const selectedKw = keywords[selectedKeyword] || null;

              return (
              <>
                {/* Navigation Bar */}
                <div className="flex items-center justify-between mb-6">
                  <button
                    onClick={() => navigateIdea("prev")}
                    disabled={!navDates.prev}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Previous
                  </button>
                  <span className="text-sm font-medium text-gray-600">{formatDate(ideaOfDay.idea_date)}</span>
                  <button
                    onClick={() => navigateIdea("next")}
                    disabled={!navDates.next}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next Idea
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>

                {/* Action Bar */}
                <div className="flex items-center justify-end gap-2 mb-6">
                  <button onClick={toggleBookmark} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors" title="Bookmark">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={ideaOfDay.is_bookmarked ? "#f59e0b" : "none"} stroke={ideaOfDay.is_bookmarked ? "#f59e0b" : "#9ca3af"} strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(window.location.href); const btn = document.activeElement as HTMLButtonElement; btn?.setAttribute('title', 'Link copied!'); setTimeout(() => btn?.setAttribute('title', 'Share'), 2000); }} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors" title="Share">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  </button>
                  <button
                    onClick={() => validateIdeaWithAI(ideaOfDay.id)}
                    disabled={validating}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-all flex items-center gap-1.5"
                    title="Run full AI validation with community signals, scoring rationale, and market analysis"
                  >
                    {validating ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M2.8 11.2l1.4-1.4M9.8 4.2l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        Validate with AI
                      </>
                    )}
                  </button>
                  {validationResult && (
                    <span className={`text-xs px-2 py-1 rounded-full ${validationResult.engine === "llm" ? "bg-violet-50 text-violet-600" : validationResult.engine === "error" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                      {validationResult.message}
                    </span>
                  )}
                  {!ideaOfDay.project_id ? (
                    <button
                      onClick={() => setLaunchingIdea(ideaOfDay)}
                      className="px-5 py-2 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 transition-all flex items-center gap-1.5"
                    >
                      Build This Idea
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  ) : (
                    <span className="px-5 py-2 text-sm font-medium rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Launched
                    </span>
                  )}
                </div>

                {/* Two Column Layout */}
                <div className="flex gap-6">
                  {/* ──── Main Content Column (~70%) ──── */}
                  <div className="flex-1 min-w-0 space-y-6">
                    {/* Title */}
                    <h2 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "Georgia, serif" }}>{ideaOfDay.title}</h2>

                    {/* Badge Strip */}
                    <div className="flex flex-wrap gap-2">
                      {badges.map((b) => (
                        <span key={b.label} className={`text-xs px-3 py-1 rounded-full border font-medium ${b.color}`}>{b.label}</span>
                      ))}
                      {remainingBadges > 0 && (
                        <span className="text-xs px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-500 font-medium">+{remainingBadges} More</span>
                      )}
                    </div>

                    {/* Description */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                      <div className="prose prose-sm max-w-none text-gray-600">
                        {ideaOfDay.description?.split("\n").filter(Boolean).map((p, i) => (
                          <p key={i} className="mb-3 leading-relaxed">{p}</p>
                        ))}
                      </div>
                    </div>

                    {/* Metrics Bar - Keyword selector + Volume + Growth */}
                    {keywords.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-200 p-6">
                        <div className="flex items-center gap-4 flex-wrap">
                          <select
                            value={selectedKeyword}
                            onChange={(e) => setSelectedKeyword(Number(e.target.value))}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
                          >
                            {keywords.map((kw, i) => (
                              <option key={i} value={i}>{kw.term}</option>
                            ))}
                          </select>
                          {selectedKw && (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Volume</span>
                                <span className="text-lg font-bold text-gray-900">{formatVolume(selectedKw.volume)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Growth</span>
                                <span className="text-lg font-bold text-emerald-600">+{selectedKw.growth}%</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Score Cards - 2x2 grid */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Validation Scores</span>
                      {ideaOfDay.overall_score > 0 && (() => {
                        let isAIValidated = false;
                        try {
                          const cs = JSON.parse(ideaOfDay.community_signals || "{}");
                          isAIValidated = !!(cs.reddit?.url && cs.reddit.label && cs.reddit.count > 0 && ideaOfDay.product_urgency && ideaOfDay.product_urgency.length > 100);
                        } catch { /* ignore */ }
                        return isAIValidated ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 font-medium">AI Validated</span>
                        ) : (
                          <button onClick={() => validateIdeaWithAI(ideaOfDay.id)} disabled={validating} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 font-medium hover:bg-violet-50 hover:text-violet-600 hover:border-violet-200 transition-colors">
                            {validating ? "Validating..." : "Estimated — Click to validate"}
                          </button>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { key: "opportunity" as const, label: "Opportunity", score: ideaOfDay.opportunity_score },
                        { key: "problem" as const, label: "Problem", score: ideaOfDay.problem_score },
                        { key: "feasibility" as const, label: "Feasibility", score: ideaOfDay.feasibility_score_10 },
                        { key: "whynow" as const, label: "Why Now", score: ideaOfDay.why_now_score },
                      ].map((card) => {
                        const colors = getScore10Color(card.score);
                        return (
                          <div key={card.key} className={`bg-white rounded-2xl border border-gray-200 p-5 relative overflow-hidden`}>
                            <div className={`absolute top-0 left-0 right-0 h-1 ${colors.bg}`} />
                            <div className="flex items-start justify-between mt-1">
                              <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{card.label}</p>
                                <p className={`text-sm font-semibold ${colors.text}`}>{getScoreLabel10(card.key, card.score)}</p>
                              </div>
                              <div className={`text-2xl font-bold ${colors.text}`}>{card.score}</div>
                            </div>
                            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${colors.bg} transition-all duration-500`} style={{ width: `${card.score * 10}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Google Trends Chart */}
                    {trendsData.length >= 2 && (() => {
                      const max = Math.max(...trendsData);
                      const min = Math.min(...trendsData);
                      const range = max - min || 1;
                      const chartW = 700;
                      const chartH = 180;
                      const padY = 20;
                      const padX = 40;
                      const innerW = chartW - padX;
                      const innerH = chartH - padY * 2;
                      const points = trendsData.map((v, i) => ({
                        x: padX + (i / (trendsData.length - 1)) * innerW,
                        y: padY + innerH - ((v - min) / range) * innerH,
                      }));
                      const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
                      const areaPath = `${linePath} L${points[points.length - 1].x},${chartH - padY} L${padX},${chartH - padY} Z`;
                      const yearCount = Math.min(trendsData.length, 6);
                      const yearLabels = Array.from({ length: yearCount }, (_, i) => {
                        const idx = Math.round((i / (yearCount - 1)) * (trendsData.length - 1));
                        const year = new Date().getFullYear() - Math.floor((trendsData.length - 1 - idx) / 12);
                        return { x: padX + (idx / (trendsData.length - 1)) * innerW, label: String(year) };
                      });
                      const gridLines = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
                        y: padY + innerH * (1 - pct),
                        label: Math.round(min + range * pct),
                      }));
                      return (
                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Google Trends - Search Interest Over Time</h3>
                          <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet" className="overflow-visible">
                            {gridLines.map((g, i) => (
                              <g key={i}>
                                <line x1={padX} y1={g.y} x2={chartW} y2={g.y} stroke="#e5e7eb" strokeWidth="0.5" />
                                <text x={padX - 6} y={g.y + 3} textAnchor="end" fill="#9ca3af" fontSize="9">{g.label}</text>
                              </g>
                            ))}
                            <defs>
                              <linearGradient id="trendsGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
                              </linearGradient>
                            </defs>
                            <path d={areaPath} fill="url(#trendsGrad)" />
                            <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2" />
                            {yearLabels.map((yl, i) => (
                              <text key={i} x={yl.x} y={chartH - 2} textAnchor="middle" fill="#9ca3af" fontSize="10">{yl.label}</text>
                            ))}
                          </svg>
                        </div>
                      );
                    })()}

                    {/* Business Fit Panel */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                      <h3 className="text-sm font-bold text-gray-900 mb-4">Business Fit</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-600">Revenue Potential</span>
                          <span className="text-sm font-semibold text-gray-900">{ideaOfDay.revenue_tier || ideaOfDay.revenue_potential || "N/A"}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-600">Execution Difficulty</span>
                          <span className="text-sm font-semibold text-gray-900">{ideaOfDay.execution_difficulty_score || 0}/10</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-600">Go-To-Market</span>
                          <span className="text-sm font-semibold text-gray-900">{ideaOfDay.gtm_score || 0}/10</span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm text-gray-600">Right for You?</span>
                          <a href="/blueprint" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">Find Out &rarr;</a>
                        </div>
                      </div>
                    </div>

                    {/* Offer / Value Ladder */}
                    {offerLadder.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-200 p-6">
                        <h3 className="text-sm font-bold text-gray-900 mb-5">Offer / Value Ladder</h3>
                        <div className="space-y-4">
                          {offerLadder.map((step, i) => {
                            const tierLabels = ["LEAD MAGNET", "FRONTEND", "CORE"];
                            const tierLabel = tierLabels[i] || step.tier?.toUpperCase() || `STEP ${i + 1}`;
                            return (
                              <div key={i} className="flex gap-4">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-sm font-bold flex items-center justify-center shrink-0">{i + 1}</div>
                                <div className="flex-1">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{tierLabel}</span>
                                  <div className="flex items-baseline gap-2 mt-0.5">
                                    <span className="text-sm font-semibold text-gray-900">{step.name}</span>
                                    {step.price && <span className="text-xs font-medium text-emerald-600">{step.price}</span>}
                                  </div>
                                  {step.description && <p className="text-xs text-gray-500 mt-1">{step.description}</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Why Now? */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                      <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        Why Now?
                      </h3>
                      {ideaOfDay.why_now ? (
                        <p className="text-sm text-gray-600 leading-relaxed">{ideaOfDay.why_now}</p>
                      ) : ideaOfDay.product_urgency ? (
                        <p className="text-sm text-gray-600 leading-relaxed">{ideaOfDay.product_urgency}</p>
                      ) : (
                        <button onClick={runScoring} disabled={scoring} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50">
                          {scoring ? "Generating..." : "Generate Analysis →"}
                        </button>
                      )}
                      <a href={`/metrics?niche=${encodeURIComponent(ideaOfDay.title)}&ideaId=${ideaOfDay.id}`} className="inline-block mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium">See why this opportunity matters now &rarr;</a>
                    </div>

                    {/* Proof & Signals */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                      <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        Proof &amp; Signals
                      </h3>
                      {ideaOfDay.proof_signals ? (
                        <p className="text-sm text-gray-600 leading-relaxed">{ideaOfDay.proof_signals}</p>
                      ) : ideaOfDay.founders_edge ? (
                        <p className="text-sm text-gray-600 leading-relaxed">{ideaOfDay.founders_edge}</p>
                      ) : (
                        <button onClick={runScoring} disabled={scoring} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50">
                          {scoring ? "Generating..." : "Generate Analysis →"}
                        </button>
                      )}
                      <a href={`/metrics?niche=${encodeURIComponent(ideaOfDay.title)}&ideaId=${ideaOfDay.id}`} className="inline-block mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium">Explore proof &amp; signals &rarr;</a>
                    </div>

                    {/* The Market Gap */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                      <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        The Market Gap
                      </h3>
                      {ideaOfDay.market_gap ? (
                        <p className="text-sm text-gray-600 leading-relaxed">{ideaOfDay.market_gap}</p>
                      ) : (
                        <button onClick={runScoring} disabled={scoring} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50">
                          {scoring ? "Generating..." : "Generate Market Gap Analysis →"}
                        </button>
                      )}
                      <a href={`/metrics?niche=${encodeURIComponent(ideaOfDay.title)}&ideaId=${ideaOfDay.id}`} className="inline-block mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium">Understand the market opportunity &rarr;</a>
                    </div>

                    {/* Execution Plan */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
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
                        <button onClick={runScoring} disabled={scoring} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50">
                          {scoring ? "Generating..." : "Generate Execution Plan →"}
                        </button>
                      )}
                      <a href={`/metrics?niche=${encodeURIComponent(ideaOfDay.title)}&ideaId=${ideaOfDay.id}`} className="inline-block mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium">View detailed execution strategy &rarr;</a>
                    </div>

                    {/* ─── 10-Factor Market-Readiness Scorecard ─── */}
                    {(() => {
                      // Use live scorecard if just evaluated, otherwise pull from DB
                      const sc = scorecardLive || (ideaOfDay.sc_total > 0 ? {
                        scores: {
                          demand_signals: ideaOfDay.sc_demand_signals,
                          pain_severity: ideaOfDay.sc_pain_severity,
                          willingness_to_pay: ideaOfDay.sc_willingness_to_pay,
                          competition_landscape: ideaOfDay.sc_competition_landscape,
                          speed_to_mvp: ideaOfDay.sc_speed_to_mvp,
                          channel_clarity: ideaOfDay.sc_channel_clarity,
                          unit_economics: ideaOfDay.sc_unit_economics,
                          timing_signal: ideaOfDay.sc_timing_signal,
                          market_size: ideaOfDay.sc_market_size,
                          founder_advantage: ideaOfDay.sc_founder_advantage,
                        },
                        evidence: ideaOfDay.sc_evidence ? JSON.parse(ideaOfDay.sc_evidence) : {},
                        total: ideaOfDay.sc_total,
                        verdict: ideaOfDay.sc_verdict || "pass",
                        dealbreakers: ideaOfDay.sc_dealbreakers ? JSON.parse(ideaOfDay.sc_dealbreakers) : [],
                        test_method: ideaOfDay.sc_test_method || "",
                        budget_timeline: ideaOfDay.sc_budget_timeline || "",
                      } : null);

                      const factorLabels: Record<string, string> = {
                        demand_signals: "Demand Signals",
                        pain_severity: "Pain Severity",
                        willingness_to_pay: "Willingness to Pay",
                        competition_landscape: "Competition Landscape",
                        speed_to_mvp: "Speed to MVP",
                        channel_clarity: "Channel Clarity",
                        unit_economics: "Unit Economics",
                        timing_signal: "Timing Signal",
                        market_size: "Market Size",
                        founder_advantage: "Founder Advantage",
                      };

                      const scoreColor = (v: number) =>
                        v >= 4 ? "bg-emerald-500" : v === 3 ? "bg-blue-500" : v === 2 ? "bg-amber-500" : "bg-red-500";

                      const scoreBg = (v: number) =>
                        v >= 4 ? "bg-emerald-50 border-emerald-200" : v === 3 ? "bg-blue-50 border-blue-200" : v === 2 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";

                      const scoreText = (v: number) =>
                        v >= 4 ? "text-emerald-700" : v === 3 ? "text-blue-700" : v === 2 ? "text-amber-700" : "text-red-700";

                      const verdictStyle = (v: string) =>
                        v === "recommend" ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : v === "conditional" ? "bg-amber-100 text-amber-800 border-amber-300"
                          : "bg-red-100 text-red-800 border-red-300";

                      const verdictLabel = (v: string) =>
                        v === "recommend" ? "Recommend for Market Testing"
                          : v === "conditional" ? "Conditional — Gaps to Address"
                          : "Pass — Not Ready";

                      return (
                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-orange-500" />
                              Market-Readiness Scorecard
                            </h3>
                            <button
                              onClick={() => runScorecard(ideaOfDay.id)}
                              disabled={scorecardLoading}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50 transition-all flex items-center gap-1.5"
                            >
                              {scorecardLoading ? (
                                <><div className="w-3 h-3 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" /> Evaluating...</>
                              ) : sc ? "Re-evaluate" : "Run Scorecard"}
                            </button>
                          </div>

                          {!sc && !scorecardLoading && (
                            <p className="text-sm text-gray-400 text-center py-6">Click &ldquo;Run Scorecard&rdquo; to evaluate this idea across 10 market-readiness factors.</p>
                          )}

                          {sc && (
                            <div className="space-y-4">
                              {/* Verdict Banner */}
                              <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${verdictStyle(sc.verdict)}`}>
                                <div>
                                  <div className="text-sm font-bold">{verdictLabel(sc.verdict)}</div>
                                  <div className="text-xs mt-0.5 opacity-80">
                                    {sc.total}/50 total
                                    {sc.total >= 35 ? " — strong signal" : sc.total >= 25 ? " — needs work" : " — weak signal"}
                                  </div>
                                </div>
                                <div className="text-2xl font-black">{sc.total}<span className="text-sm font-normal opacity-60">/50</span></div>
                              </div>

                              {/* Dealbreakers */}
                              {sc.dealbreakers.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                                  <div className="text-xs font-bold text-red-700 mb-1">Dealbreakers</div>
                                  <div className="text-xs text-red-600">{sc.dealbreakers.join(" · ")}</div>
                                </div>
                              )}

                              {/* Score Grid */}
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(sc.scores).map(([key, val]) => (
                                  <div key={key} className={`rounded-xl border p-3 ${scoreBg(val)}`}>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[11px] font-semibold text-gray-700">{factorLabels[key] || key}</span>
                                      <span className={`text-sm font-black ${scoreText(val)}`}>{val}<span className="text-[9px] font-normal opacity-60">/5</span></span>
                                    </div>
                                    {/* Bar */}
                                    <div className="flex gap-0.5 mb-1.5">
                                      {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= val ? scoreColor(val) : "bg-gray-200"}`} />
                                      ))}
                                    </div>
                                    {/* Evidence */}
                                    {sc.evidence[key] && sc.evidence[key] !== "" && (
                                      <p className="text-[10px] text-gray-500 leading-tight line-clamp-3">{sc.evidence[key]}</p>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {/* Test Method + Budget */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Recommended Test</div>
                                  <p className="text-xs text-gray-700">{sc.test_method}</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Budget & Timeline</div>
                                  <p className="text-xs text-gray-700">{sc.budget_timeline}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Action Buttons */}
                    {saveMessage && (
                      <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                        {saveMessage}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {ideaOfDay.project_id ? (
                        <span className="px-4 py-2 bg-emerald-50 text-emerald-600 text-sm rounded-lg border border-emerald-200 flex items-center gap-1.5">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          Launched
                        </span>
                      ) : (
                        <button
                          onClick={() => setLaunchingIdea(ideaOfDay)}
                          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium rounded-lg hover:from-emerald-600 hover:to-teal-600 transition-all flex items-center gap-1.5"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L7 4M7 4L11 10H3L7 4Z" fill="currentColor" /><path d="M4 12h6" stroke="currentColor" strokeWidth="1" /></svg>
                          Launch Idea
                        </button>
                      )}
                      <button
                        onClick={() => saveToProject(ideaOfDay)}
                        disabled={saving}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save to Project"}
                      </button>
                      <a
                        href={`/metrics?niche=${encodeURIComponent(ideaOfDay.title)}&ideaId=${ideaOfDay.id}`}
                        className="px-4 py-2 border border-orange-300 text-orange-600 text-sm rounded-lg hover:bg-orange-50 transition-colors inline-flex items-center gap-1.5"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 11V5l3-2 3 4 3-5 1.5 2v7H2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
                        Generate Metrics Blueprint
                      </a>
                      <button
                        onClick={() => generateActionPlan(ideaOfDay)}
                        disabled={saving}
                        className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {saving ? "Generating..." : "Generate Action Plan"}
                      </button>
                    </div>
                  </div>

                  {/* ──── Sidebar Column (~30%) ──── */}
                  <div className="w-80 shrink-0 space-y-6 hidden lg:block">
                    {/* Categorization Card */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                      <h3 className="text-sm font-bold text-gray-900 mb-4">Categorization</h3>
                      <div className="space-y-3">
                        {[
                          { label: "Type", value: ideaOfDay.idea_type },
                          { label: "Market", value: ideaOfDay.market_type },
                          { label: "Target", value: ideaOfDay.target_persona || ideaOfDay.target_market },
                        ].map((item) => (
                          <div key={item.label}>
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{item.label}</span>
                            <p className="text-sm text-gray-700 mt-0.5">{item.value || "N/A"}</p>
                          </div>
                        ))}
                        <div>
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Main Competitor</span>
                          {(() => {
                            const raw = ideaOfDay.main_competitor || ideaOfDay.competition || '';
                            // Try to parse as JSON object (v2 format: {name, website, weakness})
                            let compObj: { name?: string; website?: string; weakness?: string } | null = null;
                            try { compObj = JSON.parse(raw); } catch { /* plain string */ }
                            if (compObj && typeof compObj === 'object' && compObj.name) {
                              return (
                                <div className="mt-0.5">
                                  <a href={compObj.website || `https://www.google.com/search?q=${encodeURIComponent(compObj.name)}`} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
                                    {compObj.name}
                                  </a>
                                  {compObj.weakness && (
                                    <p className="text-[11px] text-gray-400 mt-0.5 italic">{compObj.weakness}</p>
                                  )}
                                </div>
                              );
                            }
                            return raw ? (
                              <a href={`https://www.google.com/search?q=${encodeURIComponent(raw)}`} target="_blank" rel="noopener noreferrer" className="block text-sm text-emerald-600 hover:text-emerald-700 mt-0.5 font-medium">
                                {raw}
                              </a>
                            ) : (
                              <p className="text-sm text-gray-700 mt-0.5">N/A</p>
                            );
                          })()}
                        </div>
                        {ideaOfDay.trend_analysis && (
                          <div>
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Trend Analysis</span>
                            <p className="text-sm text-gray-500 mt-0.5 italic leading-relaxed">{ideaOfDay.trend_analysis}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Community Signals Card */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-gray-900">Community Signals</h3>
                        {hasV2 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 font-medium">Real Data</span>}
                      </div>

                      {hasV2 ? (
                        <div className="space-y-4">
                          {/* Reddit — specific subreddits */}
                          {v2Signals?.reddit?.subreddits?.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Reddit</span>
                                <span className="text-[10px] text-gray-400">{v2Signals.reddit.subreddits.length} subreddit{v2Signals.reddit.subreddits.length !== 1 ? "s" : ""} linked</span>
                              </div>
                              <div className="space-y-1.5 ml-5">
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {v2Signals.reddit.subreddits.slice(0, 4).map((sub: any, i: number) => (
                                  <div key={i} className="p-2 rounded-lg">
                                    <a href={sub.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between hover:bg-red-50/50 rounded transition-colors">
                                      <span className="text-sm font-medium text-red-600">{sub.name}</span>
                                      <span className="text-[10px] text-gray-400">{sub.members ? `${(sub.members / 1000).toFixed(0)}K members` : ""}</span>
                                    </a>
                                    {sub.recent_post?.url && (
                                      <a href={sub.recent_post.url} target="_blank" rel="noopener noreferrer" className="block text-xs text-gray-500 mt-0.5 line-clamp-1 hover:text-red-600 transition-colors">
                                        {sub.recent_post.title}{sub.recent_post.upvotes ? ` · ${sub.recent_post.upvotes} upvotes` : ""}
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {v2Signals.reddit.pain_quotes?.length > 0 && (
                                <div className="ml-5 mt-2 space-y-1">
                                  {v2Signals.reddit.pain_quotes.slice(0, 2).map((q: string, i: number) => (
                                    <p key={i} className="text-[11px] text-gray-500 italic border-l-2 border-red-200 pl-2">&ldquo;{q}&rdquo;</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Facebook — specific groups */}
                          {(v2Signals?.facebook_groups?.groups?.length > 0 || v2Signals?.facebook_groups?.note) && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Facebook Groups</span>
                                {v2Signals.facebook_groups.groups?.length > 0 && (
                                  <span className="text-[10px] text-gray-400">{v2Signals.facebook_groups.groups.length} group{v2Signals.facebook_groups.groups.length !== 1 ? "s" : ""} linked</span>
                                )}
                              </div>
                              <div className="space-y-1.5 ml-5">
                                {v2Signals.facebook_groups.groups?.length > 0 ? (
                                  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                                  v2Signals.facebook_groups.groups.slice(0, 3).map((g: any, i: number) => (
                                    <a key={i} href={g.url} target="_blank" rel="noopener noreferrer" className="block p-2 rounded-lg hover:bg-blue-50/50 transition-colors">
                                      <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-blue-600">{g.name}</span>
                                        <span className="text-[10px] text-gray-400">{g.members ? `${(g.members / 1000).toFixed(0)}K` : ""} · {g.visibility}</span>
                                      </div>
                                    </a>
                                  ))
                                ) : (
                                  <p className="text-xs text-gray-400 italic">{v2Signals.facebook_groups.note || "No dedicated groups found"}</p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* YouTube — specific videos */}
                          {v2Signals?.youtube?.videos?.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full bg-red-600 shrink-0" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">YouTube</span>
                                <span className="text-[10px] text-gray-400">{v2Signals.youtube.videos.length} video{v2Signals.youtube.videos.length !== 1 ? "s" : ""} linked</span>
                              </div>
                              <div className="space-y-1.5 ml-5">
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {v2Signals.youtube.videos.slice(0, 3).map((v: any, i: number) => (
                                  <a key={i} href={v.url} target="_blank" rel="noopener noreferrer" className="block p-2 rounded-lg hover:bg-red-50/50 transition-colors">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-medium text-red-600 line-clamp-1 flex-1">{v.title}</span>
                                      <span className="text-[10px] text-gray-400 shrink-0">{v.views ? `${(v.views / 1000).toFixed(0)}K views` : ""}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{v.channel}</p>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Google Trends */}
                          {v2Signals?.google_trends?.primary_keyword && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Google Trends</span>
                              </div>
                              <a href={v2Signals.google_trends.primary_keyword.url} target="_blank" rel="noopener noreferrer" className="block ml-5 p-2 rounded-lg hover:bg-emerald-50/50 transition-colors">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-emerald-600">{v2Signals.google_trends.primary_keyword.term}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-400">Interest: {v2Signals.google_trends.primary_keyword.current_interest}/100</span>
                                    {v2Signals.google_trends.primary_keyword.yoy_growth_percent > 0 && (
                                      <span className="text-[10px] font-semibold text-emerald-600">+{v2Signals.google_trends.primary_keyword.yoy_growth_percent}% YoY</span>
                                    )}
                                  </div>
                                </div>
                                <span className={`text-[10px] mt-0.5 inline-block px-1.5 py-0.5 rounded-full ${
                                  v2Signals.google_trends.primary_keyword.trajectory === "rising" || v2Signals.google_trends.primary_keyword.trajectory === "breakout"
                                    ? "bg-emerald-50 text-emerald-600"
                                    : v2Signals.google_trends.primary_keyword.trajectory === "declining"
                                    ? "bg-red-50 text-red-600"
                                    : "bg-gray-50 text-gray-500"
                                }`}>{v2Signals.google_trends.primary_keyword.trajectory}</span>
                              </a>
                              {v2Signals.google_trends.related_rising_queries?.length > 0 && (
                                <div className="ml-5 mt-1.5 flex flex-wrap gap-1.5">
                                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                  {v2Signals.google_trends.related_rising_queries.slice(0, 3).map((q: any, i: number) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                                      {q.term} <span className="font-semibold">{q.growth}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Legacy flat format rendering */
                        <div className="space-y-3">
                          {[
                            { name: "Reddit", key: "reddit", color: "bg-red-500" },
                            { name: "Facebook", key: "facebook", color: "bg-blue-500" },
                            { name: "YouTube", key: "youtube", color: "bg-red-600" },
                            { name: "Other", key: "other", color: "bg-gray-400" },
                          ].map((sig) => {
                            const data = getCommunityData(sig.key);
                            const inner = (
                              <div className="flex items-center gap-3 w-full">
                                <div className={`w-3 h-3 rounded-full ${sig.color} shrink-0`} />
                                <span className="text-sm text-gray-600 flex-1">{sig.name}</span>
                                <span className="text-xs text-gray-500">{data.label}</span>
                              </div>
                            );
                            return data.url ? (
                              <a key={sig.name} href={data.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:bg-gray-50 rounded-lg p-1 -m-1 transition-colors">
                                {inner}
                              </a>
                            ) : (
                              <div key={sig.name}>{inner}</div>
                            );
                          })}
                        </div>
                      )}
                      <a href={`https://www.reddit.com/search/?q=${encodeURIComponent(ideaOfDay.category || ideaOfDay.title)}`} target="_blank" rel="noopener noreferrer" className="inline-block mt-4 text-xs text-emerald-600 hover:text-emerald-700 font-medium">View detailed breakdown &rarr;</a>
                    </div>

                    {/* Start Building Card */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                      <h3 className="text-sm font-bold text-gray-900 mb-4">Start Building</h3>
                      <div className="space-y-2">
                        {[
                          { label: "Ad Creatives", href: "/skills" },
                          { label: "Brand Package", href: "/skills" },
                          { label: "Landing Page", href: "/skills" },
                        ].map((link) => (
                          <a key={link.label} href={link.href} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors group">
                            <span className="text-sm text-gray-600 group-hover:text-gray-900">{link.label}</span>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-300 group-hover:text-gray-500"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </a>
                        ))}
                      </div>
                    </div>

                    {/* Idea Actions Card */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                      <h3 className="text-sm font-bold text-gray-900 mb-4">Idea Actions</h3>
                      <div className="space-y-2">
                        <a href="/dashboard" className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors group">
                          <span className="text-sm text-gray-600 group-hover:text-gray-900">Get Instant Answers</span>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-300 group-hover:text-gray-500"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </a>
                        <a href="/blueprint" className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors group">
                          <span className="text-sm text-gray-600 group-hover:text-gray-900">Founder Fit</span>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-300 group-hover:text-gray-500"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </>
              );
            })() : (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                <p className="text-gray-500">No ideas imported yet. Run a sync to get started.</p>
              </div>
            )}
          </section>
          );
        })()}

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
                <IdeaCard key={idea.id} idea={idea} onClick={() => setSelectedIdea(idea)} onLaunch={(i) => setLaunchingIdea(i)} />
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
                <ScoreBar label="Search Volume" value={selectedIdea.search_volume} score={selectedIdea.search_volume_score} color={getScoreColor(selectedIdea.search_volume_score || 50)} />
                <ScoreBar label="Growth Rate" value={selectedIdea.growth_rate} score={selectedIdea.growth_rate_score} color={getScoreColor(selectedIdea.growth_rate_score || 50)} />
                <ScoreBar label="Pain Level" value={selectedIdea.pain_level} score={selectedIdea.pain_level_score} color={getScoreColor(selectedIdea.pain_level_score || 50)} />
                <ScoreBar label="Feasibility" value={selectedIdea.feasibility} score={selectedIdea.feasibility_score} color={getScoreColor(selectedIdea.feasibility_score || 50)} />
                <ScoreBar label="Revenue Potential" value={selectedIdea.revenue_potential} score={selectedIdea.revenue_potential_score} color={getScoreColor(selectedIdea.revenue_potential_score || 50)} />
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-32">Overall</span>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600" style={{ width: `${selectedIdea.overall_score}%` }} />
                  </div>
                  <span className="text-sm font-bold text-indigo-600">{selectedIdea.overall_score}</span>
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
              {selectedIdea.founders_edge && (
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">The Founder&apos;s Edge</h3>
                  <p className="text-sm text-gray-600">{selectedIdea.founders_edge}</p>
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

              {saveMessage && (
                <div className="mb-4 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                  {saveMessage}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                {selectedIdea.project_id ? (
                  <span className="px-4 py-2 bg-emerald-50 text-emerald-600 text-sm rounded-lg border border-emerald-200 flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Launched
                  </span>
                ) : (
                  <button
                    onClick={() => { setSelectedIdea(null); setLaunchingIdea(selectedIdea); }}
                    className="px-4 py-2 bg-amber-500 text-black text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-1.5"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L7 4M7 4L11 10H3L7 4Z" fill="currentColor" /><path d="M4 12h6" stroke="currentColor" strokeWidth="1" /></svg>
                    Launch Idea
                  </button>
                )}
                <button onClick={() => saveToProject(selectedIdea)} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? "Saving..." : "Save to Project"}
                </button>
                <a
                  href={`/metrics?niche=${encodeURIComponent(selectedIdea.title)}&ideaId=${selectedIdea.id}`}
                  className="px-4 py-2 border border-orange-300 text-orange-600 text-sm rounded-lg hover:bg-orange-50 inline-flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 11V5l3-2 3 4 3-5 1.5 2v7H2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
                  Metrics Blueprint
                </a>
                <button onClick={() => generateActionPlan(selectedIdea)} disabled={saving} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  {saving ? "Generating..." : "Generate Action Plan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Launch Confirmation Modal ──────────────────────────────────── */}
      {launchingIdea && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !launching && setLaunchingIdea(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2L10 5M10 5L15 13H5L10 5Z" fill="#f59e0b" />
                    <path d="M6 16h8" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Launch Idea</h3>
                  <p className="text-sm text-gray-500">Start the full pipeline</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-1">{launchingIdea.title}</h4>
                <p className="text-xs text-gray-500 line-clamp-2">{launchingIdea.description}</p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">1</div>
                  <span className="text-sm text-gray-700">Create project from idea</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-xs font-bold">2</div>
                  <span className="text-sm text-gray-700">Generate metrics blueprint</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center text-xs font-bold">3</div>
                  <span className="text-sm text-gray-700">Assign to agents for execution</span>
                </div>
              </div>

              {launchResult && (
                <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${
                  launchResult.success
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}>
                  {launchResult.message}
                  {launchResult.project_id && launchResult.success && (
                    <span className="block text-xs mt-1 opacity-75">Redirecting to project...</span>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setLaunchingIdea(null); setLaunchResult(null); }}
                  disabled={launching}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => launchIdea(launchingIdea)}
                  disabled={launching || (launchResult?.success === true)}
                  className="flex-1 px-4 py-2.5 bg-amber-500 text-black text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {launching ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                      Launching...
                    </>
                  ) : launchResult?.success ? (
                    "Launched!"
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L7 4M7 4L11 10H3L7 4Z" fill="currentColor" /><path d="M4 12h6" stroke="currentColor" strokeWidth="1" /></svg>
                      Confirm Launch
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
