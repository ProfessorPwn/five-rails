"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

interface IdeaBrowserIdea {
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
  raw_data: string | null;
  sync_status: string;
  project_id: string | null;
  imported_at: string;
  updated_at: string;
}

interface Project {
  id: string;
  name: string;
}

interface SyncConfig {
  last_sync_at: string | null;
  sync_enabled: boolean;
  auto_sync_interval: number | null;
}

type SortOption = "newest" | "pain" | "revenue";
type LinkedFilter = "all" | "linked" | "unlinked";
type ImportTab = "json" | "manual";

export default function IdeaBrowserPage() {
  const [ideas, setIdeas] = useState<IdeaBrowserIdea[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLinked, setFilterLinked] = useState<LinkedFilter>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  // Sync
  const [syncing, setSyncing] = useState(false);

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState<ImportTab>("json");
  const [jsonInput, setJsonInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [manualForm, setManualForm] = useState({
    title: "",
    description: "",
    source_url: "",
    category: "",
    search_volume: "",
    growth_rate: "",
    pain_level: "",
    feasibility: "",
    founder_fit: "",
    revenue_potential: "",
    execution_difficulty: "",
    go_to_market: "",
    pricing: "",
    target_market: "",
    competition: "",
    tags: "",
  });

  // Detail modal
  const [selectedIdea, setSelectedIdea] = useState<IdeaBrowserIdea | null>(null);
  const [showRawData, setShowRawData] = useState(false);

  // Link to project
  const [linkProject, setLinkProject] = useState("");
  const [createNewProject, setCreateNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [linking, setLinking] = useState(false);

  // Generate actions
  const [generating, setGenerating] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState("");

  // Bookmarklet
  const [showBookmarklet, setShowBookmarklet] = useState(false);

  const fetchData = () => {
    Promise.all([
      fetch("/api/ideabrowser/ideas").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/projects").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/ideabrowser/config").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([ideasData, proj, config]) => {
      setIdeas(Array.isArray(ideasData) ? ideasData : []);
      setProjects(Array.isArray(proj) ? proj : []);
      setSyncConfig(config);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ─── Sync ──────────────────────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/ideabrowser/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const errorList = Array.isArray(data.errors) ? data.errors : [];
        if (data.hint) {
          // Bot protection detected — show as error with guidance
          setError(data.hint);
        } else if (errorList.length > 0 && data.imported === 0) {
          setError(`Sync failed: ${errorList[0]}`);
        } else {
          setSuccess(
            `Sync complete: ${data.imported ?? 0} imported, ${data.skipped ?? 0} skipped${errorList.length > 0 ? ` (${errorList.length} errors)` : ""}`
          );
        }
        fetchData();
      } else {
        setError(data.error || "Sync failed");
      }
    } catch {
      setError("Sync failed. Check your connection.");
    } finally {
      setSyncing(false);
    }
  };

  // ─── Import ────────────────────────────────────────────────────────────

  const handleJsonImport = async () => {
    if (!jsonInput.trim()) return;
    setImporting(true);
    setError("");
    try {
      const parsed = JSON.parse(jsonInput);
      const ideasArray = Array.isArray(parsed) ? parsed : parsed.ideas;
      if (!Array.isArray(ideasArray)) {
        setError("JSON must be an array of ideas or an object with an 'ideas' array.");
        setImporting(false);
        return;
      }
      const res = await fetch("/api/ideabrowser/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideas: ideasArray }),
      });
      if (res.ok) {
        setJsonInput("");
        setShowImport(false);
        setSuccess(`Imported ${ideasArray.length} idea${ideasArray.length !== 1 ? "s" : ""}`);
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || "Import failed");
      }
    } catch {
      setError("Invalid JSON. Please check your input and try again.");
    } finally {
      setImporting(false);
    }
  };

  const handleManualImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.title.trim()) return;
    setImporting(true);
    setError("");
    try {
      const payload: Record<string, unknown> = { title: manualForm.title };
      if (manualForm.description) payload.description = manualForm.description;
      if (manualForm.source_url) payload.source_url = manualForm.source_url;
      if (manualForm.category) payload.category = manualForm.category;
      if (manualForm.search_volume) payload.search_volume = manualForm.search_volume;
      if (manualForm.growth_rate) payload.growth_rate = manualForm.growth_rate;
      if (manualForm.pain_level) payload.pain_level = manualForm.pain_level;
      if (manualForm.feasibility) payload.feasibility = manualForm.feasibility;
      if (manualForm.founder_fit) payload.founder_fit = manualForm.founder_fit;
      if (manualForm.revenue_potential) payload.revenue_potential = manualForm.revenue_potential;
      if (manualForm.execution_difficulty) payload.execution_difficulty = manualForm.execution_difficulty;
      if (manualForm.go_to_market) payload.go_to_market = manualForm.go_to_market;
      if (manualForm.pricing) payload.pricing = manualForm.pricing;
      if (manualForm.target_market) payload.target_market = manualForm.target_market;
      if (manualForm.competition) payload.competition = manualForm.competition;
      if (manualForm.tags) payload.tags = manualForm.tags;

      const res = await fetch("/api/ideabrowser/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideas: [payload] }),
      });
      if (res.ok) {
        setManualForm({
          title: "", description: "", source_url: "", category: "",
          search_volume: "", growth_rate: "", pain_level: "", feasibility: "",
          founder_fit: "", revenue_potential: "", execution_difficulty: "",
          go_to_market: "", pricing: "", target_market: "", competition: "", tags: "",
        });
        setShowImport(false);
        setSuccess("Idea imported successfully");
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || "Import failed");
      }
    } catch {
      setError("Import failed");
    } finally {
      setImporting(false);
    }
  };

  // ─── Delete ────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this idea?")) return;
    try {
      const res = await fetch(`/api/ideabrowser/ideas/${id}`, { method: "DELETE" });
      if (!res.ok) setError("Failed to delete idea");
      if (selectedIdea?.id === id) setSelectedIdea(null);
      fetchData();
    } catch {
      setError("Failed to delete idea");
    }
  };

  // ─── Link to Project ──────────────────────────────────────────────────

  const handleLink = async () => {
    if (!selectedIdea) return;
    setLinking(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {};
      if (createNewProject) {
        payload.create_project = true;
        payload.project_name = newProjectName;
      } else {
        payload.project_id = linkProject;
      }
      const res = await fetch(`/api/ideabrowser/ideas/${selectedIdea.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSuccess("Idea linked to project");
        setLinkProject("");
        setCreateNewProject(false);
        setNewProjectName("");
        fetchData();
        // Refresh selected idea
        const updated = await fetch(`/api/ideabrowser/ideas/${selectedIdea.id}`).then((r) =>
          r.ok ? r.json() : null
        );
        if (updated) setSelectedIdea(updated);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to link idea");
      }
    } catch {
      setError("Failed to link idea");
    } finally {
      setLinking(false);
    }
  };

  // ─── Generate ──────────────────────────────────────────────────────────

  const handleGenerate = async (type: "insights" | "content" | "action_plan") => {
    if (!selectedIdea) return;
    setGenerating(type);
    setGenerateResult("");
    try {
      const res = await fetch(`/api/ideabrowser/ideas/${selectedIdea.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (res.ok) {
        setGenerateResult(data.output || data.result || JSON.stringify(data, null, 2));
        setSuccess(`${type === "insights" ? "Insights" : type === "content" ? "Content" : "Action plan"} generated successfully`);
      } else {
        setError(data.error || `Failed to generate ${type}`);
      }
    } catch {
      setError(`Failed to generate ${type}`);
    } finally {
      setGenerating(null);
    }
  };

  // ─── Filtering & Sorting ──────────────────────────────────────────────

  const categories = [...new Set(ideas.map((i) => i.category).filter(Boolean))] as string[];

  const filtered = ideas
    .filter((idea) => {
      if (filterCategory !== "all" && idea.category !== filterCategory) return false;
      if (filterLinked === "linked" && !idea.project_id) return false;
      if (filterLinked === "unlinked" && idea.project_id) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          idea.title?.toLowerCase().includes(q) ||
          idea.description?.toLowerCase().includes(q) ||
          idea.category?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "newest") {
        return new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime();
      }
      if (sort === "pain") {
        const aVal = parseFloat(a.pain_level || "0");
        const bVal = parseFloat(b.pain_level || "0");
        return bVal - aVal;
      }
      if (sort === "revenue") {
        const aVal = parseFloat(a.revenue_potential?.replace(/[^0-9.]/g, "") || "0");
        const bVal = parseFloat(b.revenue_potential?.replace(/[^0-9.]/g, "") || "0");
        return bVal - aVal;
      }
      return 0;
    });

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId)?.name || null;
  };

  const parseTags = (tags: string | null): string[] => {
    if (!tags) return [];
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall back to comma-separated
      return tags.split(",").map((t) => t.trim()).filter(Boolean);
    }
    return [];
  };

  const getExecutionBadgeVariant = (difficulty: string | null): "rose" | "warning" | "default" => {
    if (!difficulty) return "default";
    const lower = difficulty.toLowerCase();
    if (lower.includes("hard") || lower.includes("high") || lower.includes("difficult")) return "rose";
    if (lower.includes("medium") || lower.includes("moderate") || lower.includes("mid")) return "warning";
    return "default";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e2e8f0]">IdeaBrowser</h1>
          <p className="text-sm text-[#94a3b8] mt-1">
            Discover and import startup ideas from IdeaBrowser.com
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                Syncing...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M1.5 7a5.5 5.5 0 019.36-3.89M12.5 7a5.5 5.5 0 01-9.36 3.89"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path d="M11 1v2.5h-2.5M3 11v-2.5h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sync Now
              </>
            )}
          </Button>
          <Button onClick={() => setShowImport(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Import
          </Button>
        </div>
      </div>

      {/* Sync status line */}
      <div className="flex items-center gap-4 text-xs text-[#64748b]">
        <span>
          {syncConfig?.last_sync_at
            ? `Last sync: ${new Date(syncConfig.last_sync_at).toLocaleString()}`
            : "Never synced"}
        </span>
        <span className="text-[#1e293b]">|</span>
        <span>
          {ideas.length} idea{ideas.length !== 1 ? "s" : ""} total
        </span>
        <span className="text-[#1e293b]">|</span>
        <button
          onClick={() => setShowBookmarklet(!showBookmarklet)}
          className="text-amber-500 hover:text-amber-400 transition-colors cursor-pointer"
        >
          {showBookmarklet ? "Hide" : "Show"} Browser Capture
        </button>
      </div>

      {/* Bookmarklet Instructions */}
      {showBookmarklet && (
        <Card hover={false} className="!bg-amber-500/5 !border-amber-500/20">
          <h3 className="text-sm font-semibold text-amber-400 mb-2">Browser Capture — Pull ideas from IdeaBrowser.com</h3>
          <p className="text-xs text-[#94a3b8] mb-3">
            IdeaBrowser.com blocks automated scraping. Use this bookmarklet to capture ideas directly from your browser:
          </p>
          <ol className="text-xs text-[#94a3b8] space-y-2 mb-4 list-decimal list-inside">
            <li>Drag the button below to your browser&apos;s bookmarks bar</li>
            <li>Visit <a href="https://www.ideabrowser.com/database" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline">ideabrowser.com/database</a>, <a href="https://www.ideabrowser.com/top-ideas" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline">/top-ideas</a>, or <a href="https://www.ideabrowser.com/idea-of-the-day" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline">/idea-of-the-day</a></li>
            <li>Click the bookmarklet — it will extract all ideas and send them here</li>
          </ol>
          <div className="flex items-center gap-3">
            {/* The bookmarklet — must be an <a> with href="javascript:..." for drag-to-bookmarks-bar */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href={`javascript:void(function(){var s=document.createElement('script');s.src='${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/ideabrowser/bookmarklet.js';document.body.appendChild(s)}())`}
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-[#0a0c14] text-xs font-bold cursor-grab active:cursor-grabbing hover:bg-amber-400 transition-colors select-none"
              title="Drag this to your bookmarks bar"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M7 1l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              Capture IdeaBrowser
            </a>
            <span className="text-[10px] text-[#64748b]">Drag to bookmarks bar</span>
          </div>
        </Card>
      )}

      {/* Error / Success banners */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300 cursor-pointer text-sm">
            &#x2715;
          </button>
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-emerald-400">{success}</span>
          <button onClick={() => setSuccess("")} className="text-emerald-400 hover:text-emerald-300 cursor-pointer text-sm">
            &#x2715;
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search ideas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#64748b] focus:outline-none focus:border-amber-500"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <select
          value={filterLinked}
          onChange={(e) => setFilterLinked(e.target.value as LinkedFilter)}
          className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">All</option>
          <option value="linked">Linked</option>
          <option value="unlinked">Unlinked</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="newest">Newest</option>
          <option value="pain">Pain Level</option>
          <option value="revenue">Revenue</option>
        </select>
      </div>

      {/* Grid or Empty State */}
      {ideas.length === 0 ? (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path
                d="M24 6C20 6 17 9 17 13c0 3 1.5 5.5 4 7v3h6v-3c2.5-1.5 4-4 4-7 0-4-3-7-7-7z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M20 28h8M21 32h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M24 38v4M16 40l2-3M32 40l-2-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          title="No ideas yet"
          description="Click Sync to pull ideas from IdeaBrowser.com, or Import to add your own."
          actionLabel="Sync Now"
          onAction={handleSync}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matching ideas"
          description="Try adjusting your search or filters."
        />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((idea) => {
            const projectName = getProjectName(idea.project_id);
            return (
              <Card key={idea.id}>
                <div className="flex flex-col h-full">
                  <h3
                    className="text-sm font-semibold text-[#e2e8f0] mb-1 cursor-pointer hover:text-amber-400 transition-colors"
                    onClick={() => {
                      setSelectedIdea(idea);
                      setShowRawData(false);
                      setGenerateResult("");
                      setLinkProject(idea.project_id || "");
                      setCreateNewProject(false);
                      setNewProjectName("");
                    }}
                  >
                    {idea.title}
                  </h3>
                  {idea.description && (
                    <p className="text-xs text-[#64748b] mb-3 line-clamp-3">{idea.description}</p>
                  )}

                  {/* Metric badges */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {idea.search_volume && (
                      <Badge variant="blue">{idea.search_volume} vol</Badge>
                    )}
                    {idea.growth_rate && (
                      <Badge variant="success">{idea.growth_rate} growth</Badge>
                    )}
                    {idea.pain_level && (
                      <Badge variant="amber">Pain: {idea.pain_level}</Badge>
                    )}
                    {idea.revenue_potential && (
                      <Badge variant="emerald">{idea.revenue_potential}</Badge>
                    )}
                    {idea.execution_difficulty && (
                      <Badge variant={getExecutionBadgeVariant(idea.execution_difficulty)}>
                        {idea.execution_difficulty}
                      </Badge>
                    )}
                  </div>

                  {/* Category + linked project */}
                  <div className="flex items-center gap-2 mt-auto pt-2 border-t border-[#1e293b]">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {idea.category && (
                        <Badge variant="violet">{idea.category}</Badge>
                      )}
                      {projectName && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 truncate">
                          {projectName}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(idea.id);
                      }}
                      className="text-[#64748b] hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 3.5h8M5.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1M4 3.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Import Modal ──────────────────────────────────────────────────── */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Ideas" wide>
        <div className="space-y-4">
          {/* Tab switcher */}
          <div className="flex bg-[#0f1118] border border-[#1e293b] rounded-lg overflow-hidden">
            <button
              onClick={() => setImportTab("json")}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors cursor-pointer ${
                importTab === "json"
                  ? "bg-amber-500/10 text-amber-400"
                  : "text-[#64748b] hover:text-[#e2e8f0]"
              }`}
            >
              Paste JSON
            </button>
            <button
              onClick={() => setImportTab("manual")}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors cursor-pointer ${
                importTab === "manual"
                  ? "bg-amber-500/10 text-amber-400"
                  : "text-[#64748b] hover:text-[#e2e8f0]"
              }`}
            >
              Manual Entry
            </button>
          </div>

          {importTab === "json" ? (
            <div className="space-y-4">
              <Textarea
                label="JSON Data"
                placeholder={`[\n  {\n    "title": "AI Resume Builder",\n    "description": "Tool that uses AI to generate tailored resumes",\n    "category": "SaaS",\n    "search_volume": "12K",\n    "pain_level": "8",\n    "revenue_potential": "$50K MRR"\n  }\n]`}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                rows={12}
              />
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setShowImport(false)}>
                  Cancel
                </Button>
                <Button onClick={handleJsonImport} disabled={importing || !jsonInput.trim()}>
                  {importing ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                      Importing...
                    </>
                  ) : (
                    "Parse & Import"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleManualImport} className="space-y-4">
              <Input
                label="Title"
                placeholder="Idea title..."
                value={manualForm.title}
                onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                required
              />
              <Textarea
                label="Description"
                placeholder="What does this idea solve?"
                value={manualForm.description}
                onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                rows={3}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Source URL"
                  placeholder="https://..."
                  value={manualForm.source_url}
                  onChange={(e) => setManualForm({ ...manualForm, source_url: e.target.value })}
                />
                <Input
                  label="Category"
                  placeholder="e.g. SaaS, Marketplace"
                  value={manualForm.category}
                  onChange={(e) => setManualForm({ ...manualForm, category: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input
                  label="Search Volume"
                  placeholder="e.g. 12K"
                  value={manualForm.search_volume}
                  onChange={(e) => setManualForm({ ...manualForm, search_volume: e.target.value })}
                />
                <Input
                  label="Growth Rate"
                  placeholder="e.g. +15%"
                  value={manualForm.growth_rate}
                  onChange={(e) => setManualForm({ ...manualForm, growth_rate: e.target.value })}
                />
                <Input
                  label="Pain Level"
                  placeholder="e.g. 8/10"
                  value={manualForm.pain_level}
                  onChange={(e) => setManualForm({ ...manualForm, pain_level: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input
                  label="Feasibility"
                  placeholder="e.g. High"
                  value={manualForm.feasibility}
                  onChange={(e) => setManualForm({ ...manualForm, feasibility: e.target.value })}
                />
                <Input
                  label="Founder Fit"
                  placeholder="e.g. Strong"
                  value={manualForm.founder_fit}
                  onChange={(e) => setManualForm({ ...manualForm, founder_fit: e.target.value })}
                />
                <Input
                  label="Revenue Potential"
                  placeholder="e.g. $50K MRR"
                  value={manualForm.revenue_potential}
                  onChange={(e) => setManualForm({ ...manualForm, revenue_potential: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input
                  label="Execution Difficulty"
                  placeholder="e.g. Medium"
                  value={manualForm.execution_difficulty}
                  onChange={(e) => setManualForm({ ...manualForm, execution_difficulty: e.target.value })}
                />
                <Input
                  label="Pricing"
                  placeholder="e.g. $29/mo"
                  value={manualForm.pricing}
                  onChange={(e) => setManualForm({ ...manualForm, pricing: e.target.value })}
                />
                <Input
                  label="Tags"
                  placeholder='e.g. ["ai","saas"]'
                  value={manualForm.tags}
                  onChange={(e) => setManualForm({ ...manualForm, tags: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Textarea
                  label="Go-to-Market"
                  placeholder="GTM strategy..."
                  value={manualForm.go_to_market}
                  onChange={(e) => setManualForm({ ...manualForm, go_to_market: e.target.value })}
                  rows={2}
                />
                <Textarea
                  label="Target Market"
                  placeholder="Who is this for?"
                  value={manualForm.target_market}
                  onChange={(e) => setManualForm({ ...manualForm, target_market: e.target.value })}
                  rows={2}
                />
              </div>
              <Textarea
                label="Competition"
                placeholder="Competitive landscape..."
                value={manualForm.competition}
                onChange={(e) => setManualForm({ ...manualForm, competition: e.target.value })}
                rows={2}
              />
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" type="button" onClick={() => setShowImport(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={importing || !manualForm.title.trim()}>
                  {importing ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                      Importing...
                    </>
                  ) : (
                    "Import Idea"
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* ─── Detail Modal ──────────────────────────────────────────────────── */}
      <Modal
        open={!!selectedIdea}
        onClose={() => {
          setSelectedIdea(null);
          setGenerateResult("");
        }}
        title={selectedIdea?.title || "Idea Details"}
        wide
      >
        {selectedIdea && (
          <div className="space-y-6">
            {/* Description */}
            {selectedIdea.description && (
              <p className="text-sm text-[#94a3b8] leading-relaxed">{selectedIdea.description}</p>
            )}

            {/* Metrics grid */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Search Volume", value: selectedIdea.search_volume, color: "blue" },
                { label: "Growth Rate", value: selectedIdea.growth_rate, color: "emerald" },
                { label: "Pain Level", value: selectedIdea.pain_level, color: "amber" },
                { label: "Feasibility", value: selectedIdea.feasibility, color: "blue" },
                { label: "Founder Fit", value: selectedIdea.founder_fit, color: "violet" },
                { label: "Revenue Potential", value: selectedIdea.revenue_potential, color: "emerald" },
                { label: "Exec. Difficulty", value: selectedIdea.execution_difficulty, color: "rose" },
              ]
                .filter((m) => m.value)
                .map((metric) => (
                  <div
                    key={metric.label}
                    className={`bg-${metric.color}-500/5 border border-${metric.color}-500/20 rounded-lg p-3`}
                  >
                    <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1">
                      {metric.label}
                    </div>
                    <div className={`text-sm font-semibold text-${metric.color}-400`}>
                      {metric.value}
                    </div>
                  </div>
                ))}
            </div>

            {/* Text sections */}
            {selectedIdea.go_to_market && (
              <div>
                <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1.5">
                  Go-to-Market
                </div>
                <p className="text-sm text-[#94a3b8] bg-[#0f1118] border border-[#1e293b] rounded-lg p-3">
                  {selectedIdea.go_to_market}
                </p>
              </div>
            )}

            {selectedIdea.pricing && (
              <div>
                <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1.5">
                  Pricing
                </div>
                <p className="text-sm text-[#94a3b8] bg-[#0f1118] border border-[#1e293b] rounded-lg p-3">
                  {selectedIdea.pricing}
                </p>
              </div>
            )}

            {selectedIdea.target_market && (
              <div>
                <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1.5">
                  Target Market
                </div>
                <p className="text-sm text-[#94a3b8] bg-[#0f1118] border border-[#1e293b] rounded-lg p-3">
                  {selectedIdea.target_market}
                </p>
              </div>
            )}

            {selectedIdea.competition && (
              <div>
                <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1.5">
                  Competition
                </div>
                <p className="text-sm text-[#94a3b8] bg-[#0f1118] border border-[#1e293b] rounded-lg p-3">
                  {selectedIdea.competition}
                </p>
              </div>
            )}

            {/* Tags */}
            {selectedIdea.tags && parseTags(selectedIdea.tags).length > 0 && (
              <div>
                <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1.5">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {parseTags(selectedIdea.tags).map((tag) => (
                    <Badge key={tag} variant="default">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Source URL */}
            {selectedIdea.source_url && (
              <div>
                <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1.5">
                  Source
                </div>
                <a
                  href={selectedIdea.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2 flex items-center gap-1 transition-colors"
                >
                  {selectedIdea.source_url}
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M4 10L10 4M10 4H5M10 4v5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </div>
            )}

            {/* Raw data (collapsible) */}
            {selectedIdea.raw_data && (
              <div>
                <button
                  onClick={() => setShowRawData(!showRawData)}
                  className="flex items-center gap-2 text-[10px] text-[#64748b] uppercase tracking-wider hover:text-[#94a3b8] transition-colors cursor-pointer"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    className={`transition-transform ${showRawData ? "rotate-90" : ""}`}
                  >
                    <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Raw Data
                </button>
                {showRawData && (
                  <pre className="mt-2 text-xs text-[#94a3b8] bg-[#0f1118] border border-[#1e293b] rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(selectedIdea.raw_data!), null, 2);
                      } catch {
                        return selectedIdea.raw_data;
                      }
                    })()}
                  </pre>
                )}
              </div>
            )}

            {/* ─── Actions ───────────────────────────────────────────────── */}
            <div className="border-t border-[#1e293b] pt-4 space-y-4">
              {/* Link to Project */}
              <div>
                <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-2">
                  Link to Project
                </div>
                <div className="flex items-end gap-3">
                  {!createNewProject ? (
                    <div className="flex-1">
                      <select
                        value={linkProject}
                        onChange={(e) => {
                          if (e.target.value === "__create_new__") {
                            setCreateNewProject(true);
                            setLinkProject("");
                          } else {
                            setLinkProject(e.target.value);
                          }
                        }}
                        className="w-full bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        <option value="">Select a project...</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                        <option value="__create_new__">+ Create New Project</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <Input
                        label="New Project Name"
                        placeholder="My New Project"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCreateNewProject(false);
                          setNewProjectName("");
                        }}
                        className="text-xs text-[#64748b] hover:text-[#94a3b8] mt-1 cursor-pointer"
                      >
                        Back to existing projects
                      </button>
                    </div>
                  )}
                  <Button
                    size="sm"
                    onClick={handleLink}
                    disabled={linking || (!createNewProject && !linkProject) || (createNewProject && !newProjectName.trim())}
                  >
                    {linking ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                        Linking...
                      </>
                    ) : (
                      "Link"
                    )}
                  </Button>
                </div>
                {selectedIdea.project_id && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Currently linked: {getProjectName(selectedIdea.project_id) || selectedIdea.project_id}
                    </span>
                  </div>
                )}
              </div>

              {/* Generate actions */}
              <div>
                <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-2">
                  AI Actions
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleGenerate("insights")}
                    disabled={generating !== null}
                  >
                    {generating === "insights" ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        Generate Insights
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleGenerate("content")}
                    disabled={generating !== null}
                  >
                    {generating === "content" ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                          <path d="M3 2h8a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M5 5h4M5 7h4M5 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        Create Content
                      </>
                    )}
                  </Button>
                  {selectedIdea.source_url && (
                    <a
                      href={selectedIdea.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#141822] border border-[#1e293b] text-[#94a3b8] hover:text-[#e2e8f0] hover:border-amber-500/30 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M4 10L10 4M10 4H5M10 4v5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Open on IdeaBrowser
                    </a>
                  )}
                </div>
              </div>

              {/* Generate result */}
              {generateResult && (
                <div className="bg-[#0f1118] border border-[#1e293b] rounded-lg p-4 max-h-64 overflow-y-auto">
                  <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-2">Result</div>
                  <pre className="text-sm text-[#e2e8f0] whitespace-pre-wrap font-mono">{generateResult}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
