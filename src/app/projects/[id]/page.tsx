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
  action_plan: string | null;
  created_at: string;
}

interface ActionPlanStep {
  id: string;
  label: string;
  desc: string;
  actionType: "define-niche" | "define-offer" | "add-contacts" | "skill";
  skillId?: string;
  skillName?: string;
  promptContext?: string;
  badge: string;
  badgeVariant: "default" | "info" | "warning" | "rose" | "amber";
  saveAs?: "insight" | "landing_page" | "email" | "post" | "lead_magnet" | "script";
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
  const [contacts, setContacts] = useState<{ id: string; name: string; status: string }[]>([]);
  const [contentPieces, setContentPieces] = useState<{ id: string; type: string; title: string }[]>([]);
  const [projectInsights, setProjectInsights] = useState<{ id: string; title: string; category: string | null }[]>([]);
  const [ideaBrowserIdeas, setIdeaBrowserIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  // Dynamic action plan
  const [actionPlan, setActionPlan] = useState<ActionPlanStep[]>([]);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  // Recommended action execution
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{
    actionId: string;
    title: string;
    output: string;
    skillName: string;
    saveAs?: string;
  } | null>(null);
  const [savingResult, setSavingResult] = useState(false);
  const [resultSaved, setResultSaved] = useState(false);
  const [savedActionContentId, setSavedActionContentId] = useState<string | null>(null);
  const [publishingAction, setPublishingAction] = useState(false);

  // Add contact form (for the outbound recommended action)
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", email: "", company: "", role: "", notes: "" });
  const [creatingContact, setCreatingContact] = useState(false);

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) {
      const data = await res.json();
      setProject(data);
      // Load stored action plan
      if (data.action_plan) {
        try {
          const plan = JSON.parse(data.action_plan);
          if (Array.isArray(plan)) setActionPlan(plan);
        } catch { /* ignore parse errors */ }
      }
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
      fetch(`/api/outbound?project_id=${id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/content?project_id=${id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/insights").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/ideabrowser/ideas?project_id=${id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([, , , sk, cts, cnt, ins, ib]) => {
      setSkills(Array.isArray(sk) ? sk : []);
      setContacts(Array.isArray(cts) ? cts : []);
      setContentPieces(Array.isArray(cnt) ? cnt : []);
      setProjectInsights(
        (Array.isArray(ins) ? ins : []).filter((i: any) => i.project_id === id)
      );
      setIdeaBrowserIdeas(Array.isArray(ib) ? ib : []);
      setLoading(false);
    });
  }, [fetchProject, fetchTasks, fetchActivity, id]);

  // Refresh data that drives step completion
  const refreshStepData = useCallback(async () => {
    const [cts, cnt, ins, tsk] = await Promise.all([
      fetch(`/api/outbound?project_id=${id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/content?project_id=${id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/insights").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/tasks?project_id=${id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setContacts(Array.isArray(cts) ? cts : []);
    setContentPieces(Array.isArray(cnt) ? cnt : []);
    setProjectInsights((Array.isArray(ins) ? ins : []).filter((i: any) => i.project_id === id));
    setTasks(Array.isArray(tsk) ? tsk : []);
  }, [id]);

  // Generate context-aware action plan from project summary
  const handleGeneratePlan = async () => {
    setGeneratingPlan(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${id}/generate-plan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error + (data.hint ? ` ${data.hint}` : ""));
        return;
      }
      if (Array.isArray(data.plan)) {
        setActionPlan(data.plan);
      }
    } catch {
      setError("Failed to generate action plan");
    } finally {
      setGeneratingPlan(false);
    }
  };

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
        // If niche, audience, or description changed, invalidate the action plan
        const contextChanged =
          updated.niche !== project?.niche ||
          updated.target_audience !== project?.target_audience ||
          updated.description !== project?.description;
        setProject(updated);
        if (contextChanged && actionPlan.length > 0) {
          setActionPlan([]);
        }
        setShowEditProject(false);
      } else {
        setError("Failed to update project");
      }
    } catch {
      setError("Failed to update project");
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
      } else {
        setError("Failed to delete project");
      }
    } catch {
      setError("Failed to delete project");
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
      if (!res.ok) {
        setError("Skill execution failed");
      }
      setExecResult(data.output || data.error || JSON.stringify(data));
    } catch {
      setExecResult("Execution failed");
      setError("Skill execution failed");
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
      } else {
        setError("Failed to create task");
      }
    } catch {
      setError("Failed to create task");
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

  // ── Recommended Action Handlers (dynamic, plan-driven) ──────────────────

  const handleRunAction = async (stepId: string) => {
    if (!project) return;

    const step = actionPlan.find((s) => s.id === stepId);
    if (!step) return;

    // Built-in actions
    if (step.actionType === "define-niche" || step.actionType === "define-offer") {
      openEditModal();
      return;
    }
    if (step.actionType === "add-contacts") {
      setContactForm({ name: "", email: "", company: "", role: "", notes: "" });
      setShowAddContact(true);
      return;
    }

    // Skill execution
    if (step.actionType !== "skill" || !step.skillId) return;

    setRunningAction(stepId);
    setActionResult(null);
    setResultSaved(false);

    // Build input from the step's promptContext (generated by LLM to match THIS project)
    const input = step.promptContext || [
      step.label,
      project.niche ? `Niche: ${project.niche}` : "",
      project.target_audience ? `Target audience: ${project.target_audience}` : "",
      project.description ? `Context: ${project.description}` : "",
    ].filter(Boolean).join("\n");

    try {
      const res = await fetch(`/api/skills/${step.skillId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, input }),
      });

      const data = await res.json();

      if (!res.ok) {
        setActionResult({
          actionId: stepId,
          title: "Error",
          output: data.error + (data.hint ? `\n\n${data.hint}` : ""),
          skillName: "",
        });
        return;
      }

      setActionResult({
        actionId: stepId,
        title: `${step.label}: ${project.name}`,
        output: data.output || "",
        skillName: data.skill_name || "",
        saveAs: step.saveAs,
      });

      fetchActivity();
    } catch {
      setActionResult({
        actionId: stepId,
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
      const saveAs = actionResult.saveAs || "insight";

      if (saveAs === "insight") {
        // Save as market insight
        const res = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: actionResult.title,
            description: actionResult.output,
            source: actionResult.skillName,
            category: "analysis",
            project_id: id,
          }),
        });
        if (!res.ok) {
          setError("Failed to save insight.");
          return;
        }
      } else {
        // Save as content piece (landing_page, email, post, lead_magnet, script)
        // Map saveAs type to default platform (only publishable types get a platform)
        const platformMap: Record<string, string> = {
          post: "Twitter",
          email: "Email",
          script: "YouTube",
        };
        const res = await fetch("/api/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: saveAs,
            title: actionResult.title,
            content: actionResult.output,
            platform: platformMap[saveAs] || undefined,
            project_id: id,
          }),
        });
        if (!res.ok) {
          setError("Failed to save content.");
          return;
        }
        const savedContent = await res.json();
        // Track the saved content ID for potential publishing
        if (savedContent.id && ["post", "email"].includes(saveAs)) {
          setSavedActionContentId(savedContent.id);
        }
      }

      // Log activity for the save — this is what drives step completion
      await fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id,
          action: "result_saved",
          details: `Saved ${saveAs} from ${actionResult.skillName}: ${actionResult.title}`,
          skill_used: actionResult.skillName,
        }),
      });

      setResultSaved(true);
      fetchActivity();
      refreshStepData();
    } catch {
      setError("Failed to save action result");
    } finally {
      setSavingResult(false);
    }
  };

  const handlePublishActionContent = async () => {
    if (!savedActionContentId) return;
    setPublishingAction(true);
    try {
      const res = await fetch(`/api/content/${savedActionContentId}/publish`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setActionResult(null);
        setSavedActionContentId(null);
        refreshStepData();
      } else {
        setError(data.error || "Publishing failed");
      }
    } catch {
      setError("Network error while publishing");
    } finally {
      setPublishingAction(false);
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
        refreshStepData();
      } else {
        setError("Failed to add contact");
      }
    } catch {
      setError("Failed to add contact");
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
    { name: "Search Layer", key: "search", color: "bg-blue-400", active: projectInsights.length > 0 },
    { name: "Ops Brain", key: "ops_brain", color: "bg-emerald-400", active: tasks.length > 0 },
    { name: "Outbound Spine", key: "outbound", color: "bg-violet-400", active: contacts.length > 0 },
    { name: "Audience Rail", key: "audience", color: "bg-rose-400", active: contentPieces.length > 0 },
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300 cursor-pointer text-sm">&#x2715;</button>
        </div>
      )}

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
          <Button size="sm" variant="secondary" onClick={async () => {
            try {
              const res = await fetch("/api/newsletters", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: `${project.name} — Update`,
                  newsletter_type: "weekly",
                  project_id: id,
                }),
              });
              if (res.ok) {
                router.push("/newsletters");
              }
            } catch { /* ignore */ }
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="3" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M1.5 5.5l5.5 3 5.5-3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            Newsletter
          </Button>
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
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
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
                  <div className="text-xs text-[#64748b] mb-1">Skills</div>
                  <div className="text-2xl font-bold text-[#e2e8f0]">{skills.length}</div>
                </Card>
                <Card hover={false}>
                  <div className="text-xs text-[#64748b] mb-1">Contacts</div>
                  <div className="text-2xl font-bold text-[#e2e8f0]">{contacts.length}</div>
                </Card>
                <Card hover={false}>
                  <div className="text-xs text-[#64748b] mb-1">Content</div>
                  <div className="text-2xl font-bold text-[#e2e8f0]">{contentPieces.length}</div>
                </Card>
                <Card hover={false}>
                  <div className="text-xs text-[#64748b] mb-1">Insights</div>
                  <div className="text-2xl font-bold text-[#e2e8f0]">{projectInsights.length}</div>
                </Card>
              </div>
            </div>

            {/* IdeaBrowser Ideas */}
            {ideaBrowserIdeas.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
                  IdeaBrowser Ideas
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {ideaBrowserIdeas.map((idea: any) => (
                    <Card key={idea.id} hover={false} className="!p-3">
                      <h4 className="text-sm font-medium text-[#e2e8f0] mb-1">{idea.title}</h4>
                      {idea.description && (
                        <p className="text-xs text-[#64748b] line-clamp-2 mb-2">{idea.description}</p>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {idea.search_volume && <Badge variant="blue">SV: {idea.search_volume}</Badge>}
                        {idea.pain_level && <Badge variant="amber">Pain: {idea.pain_level}</Badge>}
                        {idea.revenue_potential && <Badge variant="emerald">{idea.revenue_potential}</Badge>}
                        {idea.execution_difficulty && <Badge variant="rose">Exec: {idea.execution_difficulty}</Badge>}
                        {idea.category && <Badge variant="default">{idea.category}</Badge>}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Guided Action Plan — generated from project summary */}
            {(() => {
              // Determine completion for each step dynamically
              const isStepCompleted = (step: ActionPlanStep): boolean => {
                if (step.actionType === "define-niche") {
                  return !!(project.niche?.trim() && project.target_audience?.trim());
                }
                if (step.actionType === "define-offer") {
                  return !!(project.description?.trim() && project.description.trim().length > 20);
                }
                if (step.actionType === "add-contacts") {
                  return contacts.length > 0;
                }
                if (step.actionType === "skill" && step.skillName) {
                  // Only mark complete when the result was SAVED, not just executed
                  return activity.some((a) => a.action === "result_saved" && a.skill_used === step.skillName);
                }
                return false;
              };

              // No plan generated yet — show generate button or prompt
              if (actionPlan.length === 0) {
                const hasSummary = !!(project.description?.trim() || project.niche?.trim());
                return (
                  <div>
                    <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
                      Action Plan
                    </h2>
                    <div className="border border-dashed border-[#334155] rounded-lg p-6 text-center">
                      {hasSummary ? (
                        <>
                          <p className="text-sm text-[#94a3b8] mb-3">
                            Generate a tailored action plan based on your project summary.
                          </p>
                          <Button onClick={handleGeneratePlan} disabled={generatingPlan}>
                            {generatingPlan ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                                Analyzing project...
                              </>
                            ) : (
                              "Generate Action Plan"
                            )}
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-[#94a3b8] mb-2">
                            Add a project description or niche first.
                          </p>
                          <p className="text-xs text-[#64748b]">
                            The action plan is generated from your project details — without them, there&apos;s nothing to base recommendations on.
                          </p>
                          <Button size="sm" variant="secondary" className="mt-3" onClick={openEditModal}>
                            Edit Project Details
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              }

              // Plan exists — render it
              const completedSteps = actionPlan.filter(isStepCompleted).length;
              const firstIncomplete = actionPlan.find((s) => !isStepCompleted(s));

              return (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider">
                      Action Plan
                    </h2>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-[#64748b]">
                        {completedSteps}/{actionPlan.length} completed
                      </span>
                      <button
                        onClick={handleGeneratePlan}
                        disabled={generatingPlan}
                        className="text-[10px] text-amber-500 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {generatingPlan ? "Regenerating..." : "Regenerate"}
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1 bg-[#1e293b] rounded-full mb-4 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${(completedSteps / actionPlan.length) * 100}%` }}
                    />
                  </div>

                  <div className="space-y-1">
                    {actionPlan.map((step, idx) => {
                      const completed = isStepCompleted(step);
                      const isNext = firstIncomplete?.id === step.id;
                      const isRunning = runningAction === step.id;

                      return (
                        <button
                          key={step.id}
                          onClick={() => handleRunAction(step.id)}
                          disabled={!!runningAction}
                          className={`w-full text-left rounded-lg border p-3 flex items-center gap-3 transition-all ${
                            completed
                              ? "border-emerald-500/20 bg-emerald-500/5 opacity-70"
                              : isNext
                              ? "border-amber-500/40 bg-amber-500/5 cursor-pointer hover:bg-amber-500/10"
                              : "border-[#1e293b] bg-[#141822] cursor-pointer hover:border-[#334155] hover:bg-[#1a1f2e]"
                          } ${isRunning ? "border-amber-500/30 animate-pulse" : ""}`}
                        >
                          {/* Step indicator */}
                          <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold">
                            {isRunning ? (
                              <div className="w-4 h-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                            ) : completed ? (
                              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                  <path d="M2.5 6l2.5 2.5 4.5-5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </div>
                            ) : (
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                isNext ? "bg-amber-500/20 text-amber-400" : "bg-[#1e293b] text-[#64748b]"
                              }`}>
                                {idx + 1}
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm ${
                              completed ? "text-emerald-400 line-through" : isNext ? "text-[#e2e8f0] font-medium" : "text-[#e2e8f0]"
                            }`}>
                              {step.label}
                            </span>
                            <p className="text-[10px] text-[#64748b] mt-0.5 truncate">
                              {step.desc}
                            </p>
                          </div>

                          {/* Badge */}
                          <div className="shrink-0">
                            <Badge variant={step.badgeVariant}>{step.badge}</Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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
                    <div className="flex gap-2 mt-3 pt-3 border-t border-[#1e293b]">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const res = await fetch("/api/insights", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              title: `${execSkill?.name}: ${project.name}`,
                              description: execResult,
                              source: execSkill?.name,
                              category: "analysis",
                              project_id: id,
                            }),
                          });
                          if (res.ok) {
                            await fetch("/api/activity", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                project_id: id,
                                action: "result_saved",
                                details: `Saved insight from ${execSkill?.name}`,
                                skill_used: execSkill?.name,
                              }),
                            });
                            refreshStepData();
                            fetchActivity();
                            setExecSkill(null);
                          } else {
                            setError("Failed to save as insight");
                          }
                        }}
                      >
                        Save as Insight
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const res = await fetch("/api/content", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              type: "post",
                              title: `${execSkill?.name}: ${project.name}`,
                              content: execResult,
                              project_id: id,
                            }),
                          });
                          if (res.ok) {
                            await fetch("/api/activity", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                project_id: id,
                                action: "result_saved",
                                details: `Saved content from ${execSkill?.name}`,
                                skill_used: execSkill?.name,
                              }),
                            });
                            refreshStepData();
                            fetchActivity();
                            setExecSkill(null);
                          } else {
                            setError("Failed to save as content");
                          }
                        }}
                      >
                        Save as Content
                      </Button>
                    </div>
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
                    ) : actionResult.saveAs === "landing_page" ? (
                      "Save as Landing Page"
                    ) : actionResult.saveAs === "email" ? (
                      "Save Email Sequence"
                    ) : actionResult.saveAs === "post" ? (
                      "Save Content"
                    ) : actionResult.saveAs === "lead_magnet" ? (
                      "Save Lead Magnet"
                    ) : actionResult.saveAs === "script" ? (
                      "Save Script"
                    ) : (
                      "Save as Insight"
                    )}
                  </Button>
                )}
                {resultSaved && savedActionContentId && (
                  <Button
                    onClick={handlePublishActionContent}
                    disabled={publishingAction}
                    variant="secondary"
                  >
                    {publishingAction ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2 12L12 2M12 2H5M12 2v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Publish to Platform
                      </>
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
