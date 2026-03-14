"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

interface Insight {
  id: string;
  title: string;
  description: string;
  pain_point: string;
  source: string;
  category: string;
  score: number;
  project_id?: string;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
}

type SortKey = "score" | "date";

export default function BrowsePage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [attachProject, setAttachProject] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    pain_point: "",
    source: "",
    category: "market",
    score: 50,
  });

  const fetchData = () => {
    Promise.all([
      fetch("/api/insights").then((r) => r.json()).catch(() => []),
      fetch("/api/projects").then((r) => r.json()).catch(() => []),
    ]).then(([ins, proj]) => {
      setInsights(Array.isArray(ins) ? ins : []);
      setProjects(Array.isArray(proj) ? proj : []);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const categories = [...new Set(insights.map((i) => i.category).filter(Boolean))];

  const filtered = insights
    .filter((i) => {
      if (filterCategory !== "all" && i.category !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          i.title?.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q) ||
          i.pain_point?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "score") return (b.score || 0) - (a.score || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ title: "", description: "", pain_point: "", source: "", category: "market", score: 50 });
        setShowCreate(false);
        fetchData();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleAttach = async (insightId: string) => {
    if (!attachProject) return;
    try {
      await fetch(`/api/insights/${insightId}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: attachProject }),
      });
      setAttachingId(null);
      setAttachProject("");
      fetchData();
    } catch {
      // ignore
    }
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
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Browse</h1>
          <p className="text-sm text-[#94a3b8] mt-1">Market insights and opportunities</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add Insight
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search insights..."
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
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="score">Sort by Score</option>
          <option value="date">Sort by Date</option>
        </select>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="22" cy="22" r="12" stroke="currentColor" strokeWidth="1.5" />
              <path d="M31 31l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          title={search || filterCategory !== "all" ? "No matching insights" : "No insights yet"}
          description={
            search || filterCategory !== "all"
              ? "Try adjusting your filters."
              : "Add market insights manually or run search skills to populate."
          }
          actionLabel="Add Insight"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((insight) => (
            <Card key={insight.id}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-[#e2e8f0] pr-2 line-clamp-2">
                  {insight.title}
                </h3>
                {insight.score > 0 && (
                  <Badge
                    variant={
                      insight.score >= 70 ? "success" : insight.score >= 40 ? "warning" : "default"
                    }
                  >
                    {insight.score}
                  </Badge>
                )}
              </div>
              {insight.description && (
                <p className="text-xs text-[#64748b] mb-2 line-clamp-3">{insight.description}</p>
              )}
              {insight.pain_point && (
                <div className="mb-3">
                  <span className="text-[10px] text-[#94a3b8] uppercase tracking-wider">Pain Point</span>
                  <p className="text-xs text-[#e2e8f0] mt-0.5">{insight.pain_point}</p>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-[#1e293b]">
                <div className="flex items-center gap-2">
                  {insight.category && <Badge variant="info">{insight.category}</Badge>}
                  {insight.source && (
                    <span className="text-[10px] text-[#64748b]">{insight.source}</span>
                  )}
                </div>
                <div className="relative">
                  {attachingId === insight.id ? (
                    <div className="flex items-center gap-1">
                      <select
                        value={attachProject}
                        onChange={(e) => setAttachProject(e.target.value)}
                        className="bg-[#0f1118] border border-[#1e293b] rounded px-2 py-1 text-[10px] text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        <option value="">Select project</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleAttach(insight.id)}
                        disabled={!attachProject}
                        className="!px-2 !py-1 !text-[10px]"
                      >
                        Go
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAttachingId(null);
                          setAttachProject("");
                        }}
                        className="!px-1 !py-1 !text-[10px]"
                      >
                        x
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAttachingId(insight.id)}
                      className="!text-[10px]"
                    >
                      Attach
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Insight">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Title"
            placeholder="What did you find?"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <Textarea
            label="Description"
            placeholder="Details about this insight..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Input
            label="Pain Point"
            placeholder="What problem does this address?"
            value={form.pain_point}
            onChange={(e) => setForm({ ...form, pain_point: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Source"
              placeholder="e.g. Reddit, Twitter, Manual"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
            <Select
              label="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              options={[
                { value: "market", label: "Market" },
                { value: "competitor", label: "Competitor" },
                { value: "trend", label: "Trend" },
                { value: "pain_point", label: "Pain Point" },
                { value: "opportunity", label: "Opportunity" },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
              Score: {form.score}
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={form.score}
              onChange={(e) => setForm({ ...form, score: parseInt(e.target.value) })}
              className="w-full accent-amber-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !form.title.trim()}>
              {creating ? "Adding..." : "Add Insight"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
