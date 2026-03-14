"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

interface Project {
  id: string;
  name: string;
  description: string;
  niche: string;
  target_audience: string;
  score: number;
  status: string;
  created_at: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    niche: "",
    target_audience: "",
  });

  const fetchProjects = () => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ name: "", description: "", niche: "", target_audience: "" });
        setShowCreate(false);
        fetchProjects();
      }
    } finally {
      setCreating(false);
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
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Projects</h1>
          <p className="text-sm text-[#94a3b8] mt-1">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New Project
        </Button>
      </div>

      {/* Grid */}
      {projects.length === 0 ? (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="8" y="8" width="32" height="32" rx="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M24 16v16M16 24h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          title="No projects yet"
          description="Create your first project to start building your business idea with AI."
          actionLabel="Create Project"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} onClick={() => router.push(`/projects/${project.id}`)}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-base font-semibold text-[#e2e8f0] truncate pr-2">
                  {project.name}
                </h3>
                {project.score > 0 && (
                  <Badge
                    variant={
                      project.score >= 70
                        ? "success"
                        : project.score >= 40
                          ? "warning"
                          : "default"
                    }
                  >
                    {project.score}
                  </Badge>
                )}
              </div>
              {project.niche && (
                <p className="text-xs text-[#94a3b8] mb-3">{project.niche}</p>
              )}
              {project.description && (
                <p className="text-xs text-[#64748b] mb-3 line-clamp-2">
                  {project.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-auto pt-2 border-t border-[#1e293b]">
                <Badge variant={project.status === "active" ? "success" : "default"}>
                  {project.status || "draft"}
                </Badge>
                <span className="text-[10px] text-[#64748b] ml-auto">
                  {new Date(project.created_at).toLocaleDateString()}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Project">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Project Name"
            placeholder="e.g. AI Newsletter SaaS"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Textarea
            label="Description"
            placeholder="What does this project do?"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Input
            label="Niche"
            placeholder="e.g. B2B SaaS, Creator Economy"
            value={form.niche}
            onChange={(e) => setForm({ ...form, niche: e.target.value })}
          />
          <Input
            label="Target Audience"
            placeholder="e.g. Solo founders, Small agencies"
            value={form.target_audience}
            onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !form.name.trim()}>
              {creating ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
