"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

type Tab = "overview" | "tasks" | "files" | "activity" | "skills";

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
  const [activity, setActivity] = useState<Activity[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);

  // Skill execution
  const [execSkill, setExecSkill] = useState<Skill | null>(null);
  const [execInput, setExecInput] = useState("");
  const [execResult, setExecResult] = useState("");
  const [execRunning, setExecRunning] = useState(false);

  // Task creation
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "" });
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/activity?project_id=${id}`).then((r) => r.json()).catch(() => []),
      fetch("/api/skills").then((r) => r.json()).catch(() => []),
    ]).then(([proj, act, sk]) => {
      setProject(proj);
      setActivity(Array.isArray(act) ? act : []);
      setSkills(Array.isArray(sk) ? sk : []);
      setLoading(false);
    });
  }, [id]);

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
    } catch (err) {
      setExecResult("Execution failed");
    } finally {
      setExecRunning(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    // Tasks are logged as activity for now
    setCreatingTask(true);
    try {
      await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ last_task: taskForm.title }),
      });
      setTaskForm({ title: "", description: "" });
      setShowCreateTask(false);
      // Refresh activity
      const act = await fetch(`/api/activity?project_id=${id}`).then((r) => r.json()).catch(() => []);
      setActivity(Array.isArray(act) ? act : []);
    } finally {
      setCreatingTask(false);
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
    { key: "files", label: "Files" },
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
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "overview" && (
          <div className="space-y-6">
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
            <div className="grid grid-cols-3 gap-4">
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

            {/* What's Next */}
            <div>
              <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
                Recommended Actions
              </h2>
              <div className="space-y-2">
                {[
                  "Run competitive analysis skill to validate your niche",
                  "Add target contacts for outbound outreach",
                  "Generate a landing page draft with the content skill",
                  "Set up automated market monitoring",
                ].map((action) => (
                  <Card key={action} hover className="!p-3 flex items-center gap-3">
                    <div className="text-amber-500">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 7h8M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-sm text-[#e2e8f0]">{action}</span>
                  </Card>
                ))}
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
            {activity.filter((a) => (a.action || "").includes("task") || (a.action || "").includes("project")).length === 0 ? (
              <EmptyState
                title="No tasks yet"
                description="Create tasks to track your project progress."
                actionLabel="Add Task"
                onAction={() => setShowCreateTask(true)}
              />
            ) : (
              <div className="space-y-2">
                {activity
                  .filter((a) => (a.action || "").includes("task") || (a.action || "").includes("project"))
                  .map((item) => (
                    <Card key={item.id} hover={false} className="!p-3 flex items-center gap-3">
                      <div className="w-4 h-4 rounded border border-[#1e293b] flex-shrink-0" />
                      <span className="text-sm text-[#e2e8f0] flex-1">{item.details}</span>
                      <span className="text-[10px] text-[#64748b]">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </Card>
                  ))}
              </div>
            )}

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
          </div>
        )}

        {activeTab === "files" && (
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path d="M12 8h16l8 8v24a2 2 0 01-2 2H14a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M28 8v8h8" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            }
            title="No files yet"
            description="Files generated by skill executions will appear here."
          />
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
                          Agents: {skill.sub_agents}
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
    </div>
  );
}
