"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

type Tab = "overview" | "tasks" | "activity" | "skills";

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

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed";
  priority: number;
  created_at: string;
  completed_at: string | null;
}

interface Activity {
  id: string;
  action: string;
  details: string;
  rail?: string;
  skill_used?: string;
  created_at: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  rail: string;
  sub_agents?: string;
  prompt_template?: string;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);

  // Edit project
  const [showEditProject, setShowEditProject] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    niche: "",
    target_audience: "",
    status: "idea",
    score: 0,
  });
  const [savingProject, setSavingProject] = useState(false);

  // Delete project
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

  // Skill execution
  const [execSkill, setExecSkill] = useState<Skill | null>(null);
  const [execInput, setExecInput] = useState("");
  const [execResult, setExecResult] = useState("");
  const [execRunning, setExecRunning] = useState(false);

  // Task creation
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "" });
  const [creatingTask, setCreatingTask] = useState(false);

  // Task deletion
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);

  // Toggling task status (track in-flight toggles)
  const [togglingTaskIds, setTogglingTaskIds] = useState<Set<string>>(new Set());

  // Recommended action execution
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{
    actionId: string;
    title: string;
    output: string;
    skillName: string;
  } | null>(null);
  const [savingResult, setSavingResult] = useState(false);
  const [resultSaved, setResultSaved] = useState(false);

  // Add contact form (for the outbound recommended action)
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", email: "", company: "", role: "", notes: "" });
  const [creatingContact, setCreatingContact] = useState(false);

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) {
      const data = await res.json();
      setProject(data);
      return data;
    }
    return null;
  }, [id]);

  const fetchTasks = useCallback(async () => {
    const res = await fetch(`/api/tasks?project_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    }
  }, [id]);

  const fetchActivity = useCallback(async () => {
    const res = await fetch(`/api/activity?project_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setActivity(Array.isArray(data) ? data : []);
    }
  }, [id]);

  useEffect(() => {
    Promise.all([
      fetchProject(),
      fetchTasks(),
      fetchActivity(),
      fetch("/api/skills").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([, , , sk]) => {
      setSkills(Array.isArray(sk) ? sk : []);
      setLoading(false);
    });
  }, [fetchProject, fetchTasks, fetchActivity]);

  // Open edit modal -- populate form with current project data
  const openEditModal = () => {
    if (!project) return;
    setEditForm({
      name: project.name || "",
      description: project.description || "",
      niche: project.niche || "",
      target_audience: project.target_audience || "",
      status: project.status || "idea",
      score: project.score ?? 0,
    });
    setShowEditProject(true);
  };

  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProject(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          niche: editForm.niche,
          target_audience: editForm.target_audience,
          status: editForm.status,
          score: Number(editForm.score),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        setShowEditProject(false);
      }
    } finally {
      setSavingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    setDeletingProject(true);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/projects");
      }
    } finally {
      setDeletingProject(false);
    }
  };

  const handleRunSkill = async () => {
    if (!execSkill || !execInput.trim()) return;
    setExecRunning(true);
    setExecResult("");
    try {
      const res = await fetch(`/api/skills/${execSkill.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, input: execInput }),
      });
      const data = await res.json();
      setExecResult(data.output || data.error || JSON.stringify(data));
    } catch {
      setExecResult("Execution failed");
    } finally {
      setExecRunning(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTask(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id,
          title: taskForm.title,
          description: taskForm.description || undefined,
        }),
      });
      if (res.ok) {
        setTaskForm({ title: "", description: "" });
        setShowCreateTask(false);
        await fetchTasks();
      }
    } finally {
      setCreatingTask(false);
    }
  };

  const handleToggleTask = async (task: Task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    setTogglingTaskIds((prev) => new Set(prev).add(task.id));
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: newStatus, completed_at: newStatus === "completed" ? new Date().toISOString() : null }
          : t
      )
    );
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        // Revert on failure
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? task : t))
        );
      }
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? task : t))
      );
    } finally {
      setTogglingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteTaskId) return;
    setDeletingTask(true);
    try {
      const res = await fetch(`/api/tasks/${deleteTaskId}`, { method: "DELETE" });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== deleteTaskId));
        setDeleteTaskId(null);
      }
    } finally {
      setDeletingTask(false);
    }
  };

  // ── Recommended Action Handlers ──────────────────────────────────────────

  const actionConfig: Record<string, { skillId: string; buildInput: (p: Project) => string }> = {
    "competitive-analysis": {
      skillId: "skill-competitive-intel",
      buildInput: (p) => [
        `Analyze the competitive landscape for: ${p.niche || p.name}`,
        p.target_audience ? `Target audience: ${p.target_audience}` : "",
        p.description ? `Context: ${p.description}` : "",
      ].filter(Boolean).join("\n"),
    },
    "landing-page": {
      skillId: "skill-sales-page-surgeon",
      buildInput: (p) => [
        `Create a high-converting landing page for: ${p.name}`,
        p.niche ? `Niche: ${p.niche}` : "",
        p.target_audience ? `Target audience: ${p.target_audience}` : "",
        p.description ? `Description: ${p.description}` : "",
      ].filter(Boolean).join("\n"),
    },
    "market-monitoring": {
      skillId: "skill-market-research",
      buildInput: (p) => [
        `Conduct comprehensive market research for: ${p.niche || p.name}`,
        p.target_audience ? `Target audience: ${p.target_audience}` : "",
        p.description ? `Context: ${p.description}` : "",
        "Focus on: current market trends, emerging competitors, underserved segments, and actionable opportunities.",
      ].filter(Boolean).join("\n"),
    },
  };

  const actionTitles: Record<string, (p: Project) => string> = {
    "competitive-analysis": (p) => `Competitive Analysis: ${p.niche || p.name}`,
    "landing-page": (p) => `Landing Page Draft: ${p.name}`,
    "market-monitoring": (p) => `Market Research: ${p.niche || p.name}`,
  };

  const handleRunAction = async (actionId: string) => {
    if (!project) return;

    if (actionId === "add-contacts") {
      setContactForm({ name: "", email: "", company: "", role: "", notes: "" });
      setShowAddContact(true);
      return;
    }

    const config = actionConfig[actionId];
    if (!config) return;

    setRunningAction(actionId);
    setActionResult(null);
    setResultSaved(false);

    try {
      const res = await fetch(`/api/skills/${config.skillId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id,
          input: config.buildInput(project),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setActionResult({
          actionId,
          title: "Error",
          output: data.error + (data.hint ? `\n\n${data.hint}` : ""),
          skillName: "",
        });
        return;
      }

      setActionResult({
        actionId,
        title: actionTitles[actionId]?.(project) || "Result",
        output: data.output || "",
        skillName: data.skill_name || "",
      });

      fetchActivity();
    } catch {
      setActionResult({
        actionId,
        title: "Error",
        output: "Failed to connect to the skill execution endpoint.",
        skillName: "",
      });
    } finally {
      setRunningAction(null);
    }
  };

  const handleSaveActionResult = async () => {
    if (!actionResult || !project) return;
    setSavingResult(true);

    try {
      if (actionResult.actionId === "competitive-analysis") {
        await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: actionResult.title,
            description: actionResult.output,
            source: actionResult.skillName,
            category: "competitive_analysis",
            project_id: id,
          }),
        });
      } else if (actionResult.actionId === "landing-page") {
        await fetch("/api/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "landing_page",
            title: actionResult.title,
            content: actionResult.output,
            project_id: id,
          }),
        });
      } else if (actionResult.actionId === "market-monitoring") {
        await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: actionResult.title,
            description: actionResult.output,
            source: actionResult.skillName,
            category: "market_research",
            project_id: id,
          }),
        });
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: id,
            title: "Review market changes and update analysis",
            description: `Re-run market research for "${project.niche || project.name}" to track shifts in the competitive landscape, new entrants, and emerging trends.`,
          }),
        });
        fetchTasks();
      }

      setResultSaved(true);
      fetchActivity();
    } finally {
      setSavingResult(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingContact(true);
    try {
      const res = await fetch("/api/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id,
          name: contactForm.name,
          email: contactForm.email || undefined,
          company: contactForm.company || undefined,
          role: contactForm.role || undefined,
          notes: contactForm.notes || undefined,
        }),
      });
      if (res.ok) {
        setContactForm({ name: "", email: "", company: "", role: "", notes: "" });
        setShowAddContact(false);
        fetchActivity();
      }
    } finally {
      setCreatingContact(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto">
        <EmptyState
          title="Project not found"
          description="This project may have been deleted."
          actionLabel="Back to Projects"
          onAction={() => router.push("/projects")}
        />
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "tasks", label: "Tasks" },
    { key: "activity", label: "Activity" },
    { key: "skills", label: "Skills" },
  ];

  const railColors: Record<string, { color: string; badge: "amber" | "blue" | "emerald" | "violet" | "rose" }> = {
    agent_harness: { color: "text-amber-400", badge: "amber" },
    search: { color: "text-blue-400", badge: "blue" },
    ops_brain: { color: "text-emerald-400", badge: "emerald" },
    outbound: { color: "text-violet-400", badge: "violet" },
    audience: { color: "text-rose-400", badge: "rose" },
  };

  const railStatus = [
    { name: "Agent Harness", key: "agent_harness", color: "bg-amber-400", active: skills.length > 0 },
    { name: "Search Layer", key: "search", color: "bg-blue-400", active: true },
    { name: "Ops Brain", key: "ops_brain", color: "bg-emerald-400", active: true },
    { name: "Outbound Spine", key: "outbound", color: "bg-violet-400", active: false },
    { name: "Audience Rail", key: "audience", color: "bg-rose-400", active: false },
  ];

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const pendingCount = tasks.filter((t) => t.status !== "completed").length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => router.push("/projects")}
        className="text-sm text-[#64748b] hover:text-[#e2e8f0] transition-colors flex items-center gap-1 cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Projects
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e2e8f0]">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-[#94a3b8] mt-1 max-w-2xl">{project.description}</p>
          )}
          <div className="flex items-center gap-3 mt-3">
            <Badge variant={project.status === "active" ? "success" : "default"}>
              {project.status || "draft"}
            </Badge>
            {project.niche && <Badge variant="info">{project.niche}</Badge>}
            {project.score > 0 && (
              <Badge variant={project.score >= 70 ? "success" : project.score >= 40 ? "warning" : "default"}>
                Score: {project.score}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="secondary" onClick={openEditModal}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M10.5 1.5l2 2-8 8H2.5v-2l8-8z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4m1.5 0v7.5a1 1 0 01-1 1h-5a1 1 0 01-1-1V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#1e293b]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] cursor-pointer ${
              activeTab === tab.key
                ? "text-amber-400 border-amber-400"
                : "text-[#64748b] border-transparent hover:text-[#e2e8f0]"
            }`}
          >
            {tab.label}
            {tab.key === "tasks" && tasks.length > 0 && (
              <span className="ml-1.5 text-[10px] text-[#64748b]">
                {completedCount}/{tasks.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Project Details */}
            {(project.target_audience || project.niche) && (
              <div>
                <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
                  Project Details
                </h2>
                <Card hover={false}>
                  <div className="grid grid-cols-2 gap-4">
                    {project.niche && (
                      <div>
                        <div className="text-xs text-[#64748b] mb-1">Niche</div>
                        <div className="text-sm text-[#e2e8f0]">{project.niche}</div>
                      </div>
                    )}
                    {project.target_audience && (
                      <div>
                        <div className="text-xs text-[#64748b] mb-1">Target Audience</div>
                        <div className="text-sm text-[#e2e8f0]">{project.target_audience}</div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {/* Rail Status */}
            <div>
              <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
                Rail Status
              </h2>
              <div className="grid grid-cols-5 gap-3">
                {railStatus.map((rail) => (
                  <Card key={rail.key} hover={false} className="!p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${rail.active ? rail.color : "bg-[#64748b]"}`} />
                      <span className="text-xs font-medium text-[#e2e8f0]">{rail.name}</span>
                    </div>
                    <span className="text-[10px] text-[#64748b]">
                      {rail.active ? "Connected" : "Idle"}
                    </span>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
                Quick Stats
              </h2>
              <div className="grid grid-cols-4 gap-4">
                <Card hover={false}>
                  <div className="text-xs text-[#64748b] mb-1">Tasks</div>
                  <div className="text-2xl font-bold text-[#e2e8f0]">{tasks.length}</div>
                  {tasks.length > 0 && (
                    <div className="text-[10px] text-[#64748b] mt-1">
                      {completedCount} done, {pendingCount} remaining
                    </div>
                  )}
                </Card>
                <Card hover={false}>
                  <div className="text-xs text-[#64748b] mb-1">Activities</div>
                  <div className="text-2xl font-bold text-[#e2e8f0]">{activity.length}</div>
                </Card>
                <Card hover={false}>
                  <div className="text-xs text-[#64748b] mb-1">Available Skills</div>
                  <div className="text-2xl font-bold text-[#e2e8f0]">{skills.length}</div>
                </Card>
                <Card hover={false}>
                  <div className="text-xs text-[#64748b] mb-1">Created</div>
                  <div className="text-sm font-medium text-[#e2e8f0]">
                    {new Date(project.created_at).toLocaleDateString()}
                  </div>
                </Card>
              </div>
            </div>

            {/* Recommended Actions */}
            <div>
              <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
                Recommended Actions
              </h2>
              <div className="space-y-2">
                {([
                  {
                    id: "competitive-analysis",
                    label: "Run competitive analysis to validate your niche",
                    desc: "Analyzes competitors, positioning, and market opportunities",
                    badge: "Search",
                    badgeVariant: "info" as const,
                  },
                  {
                    id: "add-contacts",
                    label: "Add target contacts for outbound outreach",
                    desc: "Create contacts to begin outreach for this project",
                    badge: "Outbound",
                    badgeVariant: "default" as const,
                  },
                  {
                    id: "landing-page",
                    label: "Generate a landing page draft",
                    desc: "Creates a high-converting sales page with proven copy frameworks",
                    badge: "Agent",
                    badgeVariant: "warning" as const,
                  },
                  {
                    id: "market-monitoring",
                    label: "Set up automated market monitoring",
                    desc: "Researches market trends and creates a recurring review task",
                    badge: "Search",
                    badgeVariant: "info" as const,
                  },
                ] as const).map((action) => {
                  const isRunning = runningAction === action.id;
                  return (
                    <button
                      key={action.id}
                      onClick={() => handleRunAction(action.id)}
                      disabled={!!runningAction}
                      className={`w-full text-left cursor-pointer rounded-lg border border-[#1e293b] bg-[#141822] p-3 flex items-center gap-3 transition-all ${
                        isRunning
                          ? "opacity-80 border-amber-500/30"
                          : runningAction
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-amber-500/40 hover:bg-[#1a1f2e]"
                      }`}
                    >
                      <div className="text-amber-500 shrink-0">
                        {isRunning ? (
                          <div className="w-[14px] h-[14px] animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M3 7h8M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-[#e2e8f0]">{action.label}</span>
                        <p className="text-[10px] text-[#64748b] mt-0.5">{action.desc}</p>
                      </div>
                      <Badge variant={action.badgeVariant}>{action.badge}</Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowCreateTask(true)}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Add Task
              </Button>
            </div>
            {tasks.length === 0 ? (
              <EmptyState
                title="No tasks yet"
                description="Create tasks to track your project progress."
                actionLabel="Add Task"
                onAction={() => setShowCreateTask(true)}
              />
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => {
                  const isCompleted = task.status === "completed";
                  const isToggling = togglingTaskIds.has(task.id);
                  return (
                    <Card key={task.id} hover={false} className="!p-3">
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <button
                          onClick={() => handleToggleTask(task)}
                          disabled={isToggling}
                          className={`w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors cursor-pointer ${
                            isCompleted
                              ? "bg-amber-500 border-amber-500"
                              : "border-[#1e293b] hover:border-amber-500/50"
                          } ${isToggling ? "opacity-50" : ""}`}
                        >
                          {isCompleted && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2.5 6l2.5 2.5 4.5-5" stroke="#0a0c14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>

                        {/* Task content */}
                        <div className="flex-1 min-w-0">
                          <span
                            className={`text-sm ${
                              isCompleted
                                ? "text-[#64748b] line-through"
                                : "text-[#e2e8f0]"
                            }`}
                          >
                            {task.title}
                          </span>
                          {task.description && (
                            <p
                              className={`text-xs mt-0.5 ${
                                isCompleted ? "text-[#475569] line-through" : "text-[#64748b]"
                              }`}
                            >
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] text-[#64748b]">
                              {new Date(task.created_at).toLocaleDateString()}
                            </span>
                            {task.completed_at && (
                              <span className="text-[10px] text-emerald-500/70">
                                Completed {new Date(task.completed_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Delete button */}
                        <button
                          onClick={() => setDeleteTaskId(task.id)}
                          className="text-[#64748b] hover:text-red-400 transition-colors p-1 cursor-pointer shrink-0"
                          title="Delete task"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4m1.5 0v7.5a1 1 0 01-1 1h-5a1 1 0 01-1-1V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Create Task Modal */}
            <Modal open={showCreateTask} onClose={() => setShowCreateTask(false)} title="Add Task">
              <form onSubmit={handleCreateTask} className="space-y-4">
                <Input
                  label="Task Title"
                  placeholder="What needs to be done?"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  required
                />
                <Textarea
                  label="Description"
                  placeholder="Additional details..."
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                />
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" type="button" onClick={() => setShowCreateTask(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creatingTask || !taskForm.title.trim()}>
                    {creatingTask ? "Creating..." : "Add Task"}
                  </Button>
                </div>
              </form>
            </Modal>

            {/* Delete Task Confirmation Modal */}
            <Modal
              open={!!deleteTaskId}
              onClose={() => setDeleteTaskId(null)}
              title="Delete Task"
            >
              <div className="space-y-4">
                <p className="text-sm text-[#94a3b8]">
                  Are you sure you want to delete this task? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setDeleteTaskId(null)}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={handleDeleteTask} disabled={deletingTask}>
                    {deletingTask ? "Deleting..." : "Delete Task"}
                  </Button>
                </div>
              </div>
            </Modal>
          </div>
        )}

        {activeTab === "activity" && (
          <div className="space-y-0">
            {activity.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Activity will be logged as you work on this project."
              />
            ) : (
              <div className="relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#1e293b]" />
                <div className="space-y-4">
                  {activity.map((item) => (
                    <div key={item.id} className="flex gap-4 relative">
                      <div className="w-4 h-4 rounded-full bg-[#141822] border-2 border-amber-500/40 shrink-0 mt-0.5 z-10" />
                      <div className="flex-1 pb-2">
                        <p className="text-sm text-[#e2e8f0]">{item.details}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="default">
                            {(item.action || "").replace(/_/g, " ")}
                          </Badge>
                          <span className="text-[10px] text-[#64748b]">
                            {new Date(item.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "skills" && (
          <div className="space-y-4">
            {skills.length === 0 ? (
              <EmptyState
                title="No skills available"
                description="Skills will appear here once configured."
              />
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {skills.map((skill) => {
                  const rc = railColors[skill.rail] || { color: "text-[#94a3b8]", badge: "default" as const };
                  return (
                    <Card key={skill.id} hover={false}>
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-semibold text-[#e2e8f0]">{skill.name}</h3>
                        <Badge variant={rc.badge}>{skill.rail?.replace(/_/g, " ") || "general"}</Badge>
                      </div>
                      {skill.description && (
                        <p className="text-xs text-[#64748b] mb-3 line-clamp-2">{skill.description}</p>
                      )}
                      {skill.sub_agents && (
                        <p className="text-[10px] text-[#94a3b8] mb-3">
                          Agents: {(() => {
                            try { return (JSON.parse(skill.sub_agents) as string[]).join(", ").replace(/_/g, " "); } catch { return skill.sub_agents; }
                          })()}
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setExecSkill(skill);
                          setExecInput("");
                          setExecResult("");
                        }}
                      >
                        Run
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Skill Execution Modal */}
            <Modal
              open={!!execSkill}
              onClose={() => setExecSkill(null)}
              title={execSkill ? `Run: ${execSkill.name}` : "Run Skill"}
              wide
            >
              <div className="space-y-4">
                {execSkill?.description && (
                  <p className="text-sm text-[#94a3b8]">{execSkill.description}</p>
                )}
                <Textarea
                  label="Input"
                  placeholder="Provide input for this skill..."
                  value={execInput}
                  onChange={(e) => setExecInput(e.target.value)}
                  rows={4}
                />
                <div className="flex justify-end">
                  <Button onClick={handleRunSkill} disabled={execRunning || !execInput.trim()}>
                    {execRunning ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                        Running...
                      </>
                    ) : (
                      "Execute"
                    )}
                  </Button>
                </div>
                {execResult && (
                  <div className="bg-[#0f1118] border border-[#1e293b] rounded-lg p-4">
                    <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-2">
                      Output
                    </div>
                    <pre className="text-sm text-[#e2e8f0] whitespace-pre-wrap font-mono">
                      {execResult}
                    </pre>
                  </div>
                )}
              </div>
            </Modal>
          </div>
        )}
      </div>

      {/* Edit Project Modal */}
      <Modal open={showEditProject} onClose={() => setShowEditProject(false)} title="Edit Project">
        <form onSubmit={handleEditProject} className="space-y-4">
          <Input
            label="Project Name"
            placeholder="Project name"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
          />
          <Textarea
            label="Description"
            placeholder="What is this project about?"
            value={editForm.description}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
          />
          <Input
            label="Niche"
            placeholder="e.g. SaaS, e-commerce, coaching..."
            value={editForm.niche}
            onChange={(e) => setEditForm({ ...editForm, niche: e.target.value })}
          />
          <Input
            label="Target Audience"
            placeholder="Who is this for?"
            value={editForm.target_audience}
            onChange={(e) => setEditForm({ ...editForm, target_audience: e.target.value })}
          />
          <Select
            label="Status"
            value={editForm.status}
            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
            options={[
              { value: "idea", label: "Idea" },
              { value: "active", label: "Active" },
              { value: "shipped", label: "Shipped" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <Input
            label="Score"
            type="number"
            min={0}
            max={100}
            placeholder="0-100"
            value={editForm.score}
            onChange={(e) => setEditForm({ ...editForm, score: Number(e.target.value) })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowEditProject(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingProject || !editForm.name.trim()}>
              {savingProject ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Project Confirmation Modal */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Project">
        <div className="space-y-4">
          <p className="text-sm text-[#94a3b8]">
            Are you sure you want to delete <strong className="text-[#e2e8f0]">{project.name}</strong>?
            This will permanently remove the project and all associated tasks, content, and contacts.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteProject} disabled={deletingProject}>
              {deletingProject ? "Deleting..." : "Delete Project"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Action Result Modal */}
      <Modal
        open={!!actionResult}
        onClose={() => { setActionResult(null); setResultSaved(false); }}
        title={actionResult?.title || "Action Result"}
        wide
      >
        {actionResult && (
          <div className="space-y-4">
            {actionResult.skillName && (
              <div className="flex items-center gap-2">
                <Badge variant="info">{actionResult.skillName}</Badge>
                {resultSaved && <Badge variant="success">Saved to project</Badge>}
              </div>
            )}

            <div className="bg-[#0f1118] border border-[#1e293b] rounded-lg p-4 max-h-[60vh] overflow-y-auto">
              <pre className="text-sm text-[#e2e8f0] whitespace-pre-wrap font-mono leading-relaxed">
                {actionResult.output}
              </pre>
            </div>

            {actionResult.title !== "Error" && (
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => { setActionResult(null); setResultSaved(false); }}
                >
                  {resultSaved ? "Close" : "Discard"}
                </Button>
                {!resultSaved && (
                  <Button onClick={handleSaveActionResult} disabled={savingResult}>
                    {savingResult ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                        Saving...
                      </>
                    ) : actionResult.actionId === "landing-page" ? (
                      "Save as Landing Page"
                    ) : actionResult.actionId === "market-monitoring" ? (
                      "Save Insight & Create Task"
                    ) : (
                      "Save as Insight"
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add Contact Modal */}
      <Modal open={showAddContact} onClose={() => setShowAddContact(false)} title="Add Outbound Contact">
        <form onSubmit={handleAddContact} className="space-y-4">
          <Input
            label="Name"
            placeholder="Contact name"
            value={contactForm.name}
            onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            placeholder="email@company.com"
            value={contactForm.email}
            onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Company"
              placeholder="Company name"
              value={contactForm.company}
              onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
            />
            <Input
              label="Role"
              placeholder="e.g. CEO, VP Marketing"
              value={contactForm.role}
              onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
            />
          </div>
          <Textarea
            label="Notes"
            placeholder="Any notes about this contact..."
            value={contactForm.notes}
            onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowAddContact(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creatingContact || !contactForm.name.trim()}>
              {creatingContact ? "Adding..." : "Add Contact"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
