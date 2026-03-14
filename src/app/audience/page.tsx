"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

interface ContentPiece {
  id: string;
  title: string;
  type: string;
  content: string;
  platform: string;
  status: string;
  project_id?: string;
  scheduled_at?: string;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
}

type ViewMode = "grid" | "calendar";

const contentTypes = ["post", "email", "script", "lead_magnet", "landing_page"];
const platforms = ["Twitter", "LinkedIn", "Blog", "Email", "YouTube", "TikTok", "Other"];
const statuses = ["draft", "scheduled", "published", "archived"];

const typeColors: Record<string, "amber" | "blue" | "emerald" | "violet" | "rose"> = {
  post: "blue",
  email: "violet",
  script: "amber",
  lead_magnet: "emerald",
  landing_page: "rose",
};

const statusColors: Record<string, "default" | "info" | "warning" | "success"> = {
  draft: "default",
  scheduled: "info",
  published: "success",
  archived: "warning",
};

export default function AudiencePage() {
  const [content, setContent] = useState<ContentPiece[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filterProject, setFilterProject] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({
    title: "",
    type: "post",
    content: "",
    platform: "Twitter",
    status: "draft",
    project_id: "",
  });

  const fetchData = () => {
    Promise.all([
      fetch("/api/content").then((r) => r.json()).catch(() => []),
      fetch("/api/projects").then((r) => r.json()).catch(() => []),
    ]).then(([ctn, proj]) => {
      setContent(Array.isArray(ctn) ? ctn : []);
      setProjects(Array.isArray(proj) ? proj : []);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ title: "", type: "post", content: "", platform: "Twitter", status: "draft", project_id: "" });
        setShowCreate(false);
        fetchData();
      }
    } finally {
      setCreating(false);
    }
  };

  const filtered = content.filter((c) => {
    if (filterProject !== "all" && c.project_id !== filterProject) return false;
    if (filterType !== "all" && c.type !== filterType) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    return true;
  });

  // Calendar view: group by week
  const getCalendarWeeks = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const weeks: { start: Date; days: Date[] }[] = [];
    for (let w = 0; w < 4; w++) {
      const weekStart = new Date(startOfWeek);
      weekStart.setDate(startOfWeek.getDate() + w * 7);
      const days: Date[] = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + d);
        days.push(day);
      }
      weeks.push({ start: weekStart, days });
    }
    return weeks;
  };

  const getContentForDate = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return filtered.filter((c) => {
      const cDate = (c.scheduled_at || c.created_at || "").split("T")[0];
      return cDate === dateStr;
    });
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Audience</h1>
          <p className="text-sm text-[#94a3b8] mt-1">Content and distribution</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-[#0f1118] border border-[#1e293b] rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                viewMode === "grid"
                  ? "bg-amber-500/10 text-amber-400"
                  : "text-[#64748b] hover:text-[#e2e8f0]"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                viewMode === "calendar"
                  ? "bg-amber-500/10 text-amber-400"
                  : "text-[#64748b] hover:text-[#e2e8f0]"
              }`}
            >
              Calendar
            </button>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Create Content
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">All Types</option>
          {contentTypes.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">All Statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {viewMode === "grid" ? (
        filtered.length === 0 ? (
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path d="M8 36V12l10-6 10 6 10-6v24l-10 6-10-6-10 6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            }
            title={filterType !== "all" || filterStatus !== "all" ? "No matching content" : "No content yet"}
            description="Create content pieces to distribute across your channels."
            actionLabel="Create Content"
            onAction={() => setShowCreate(true)}
          />
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filtered.map((piece) => (
              <Card key={piece.id}>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[#e2e8f0] pr-2 line-clamp-2">
                    {piece.title}
                  </h3>
                  <Badge variant={typeColors[piece.type] || "amber"}>
                    {piece.type?.replace(/_/g, " ")}
                  </Badge>
                </div>
                {piece.content && (
                  <p className="text-xs text-[#64748b] mb-3 line-clamp-3">{piece.content}</p>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-[#1e293b]">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusColors[piece.status] || "default"}>
                      {piece.status}
                    </Badge>
                    {piece.platform && (
                      <span className="text-[10px] text-[#64748b]">{piece.platform}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#64748b]">
                    {new Date(piece.created_at).toLocaleDateString()}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        /* Calendar View */
        <div className="bg-[#141822] border border-[#1e293b] rounded-xl overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-[#1e293b]">
            {dayNames.map((day) => (
              <div key={day} className="px-2 py-2 text-center text-[10px] font-medium text-[#64748b] uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>
          {/* Weeks */}
          {getCalendarWeeks().map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-[#1e293b]/50 last:border-0">
              {week.days.map((day, di) => {
                const dayContent = getContentForDate(day);
                const isToday = day.toDateString() === new Date().toDateString();
                return (
                  <div
                    key={di}
                    className={`min-h-[80px] p-2 border-r border-[#1e293b]/30 last:border-0 ${
                      isToday ? "bg-amber-500/5" : ""
                    }`}
                  >
                    <div className={`text-xs mb-1 ${isToday ? "text-amber-400 font-semibold" : "text-[#64748b]"}`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayContent.map((piece) => (
                        <div
                          key={piece.id}
                          className={`text-[10px] px-1.5 py-0.5 rounded truncate ${
                            typeColors[piece.type] === "blue"
                              ? "bg-blue-500/10 text-blue-400"
                              : typeColors[piece.type] === "violet"
                                ? "bg-violet-500/10 text-violet-400"
                                : typeColors[piece.type] === "emerald"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : typeColors[piece.type] === "rose"
                                    ? "bg-rose-500/10 text-rose-400"
                                    : "bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {piece.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Content">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Title"
            placeholder="Content title..."
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              options={contentTypes.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
            />
            <Select
              label="Platform"
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              options={platforms.map((p) => ({ value: p, label: p }))}
            />
          </div>
          <Textarea
            label="Content"
            placeholder="Write your content here..."
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={6}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={statuses.map((s) => ({ value: s, label: s }))}
            />
            {projects.length > 0 && (
              <Select
                label="Project"
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                options={[
                  { value: "", label: "None" },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !form.title.trim()}>
              {creating ? "Creating..." : "Create Content"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
