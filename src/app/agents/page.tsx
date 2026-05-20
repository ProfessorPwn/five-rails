"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Agent {
  id: string; name: string; department: string; state: string;
  last_run_at: string | null; next_run_at: string | null; schedule: string;
  total_decisions: number; decisions_today: number; chats_today: number; unread_messages: number;
}

interface Decision {
  id: string; agent_name: string; department: string; reasoning: string;
  action_taken: string; skill_used: string | null; confidence: number; created_at: string;
}

interface AgentMessage {
  from_name: string; to_name: string; from_dept: string; to_dept: string;
  message: string; message_type: string; is_read: number; created_at: string;
}

interface ContentPiece {
  id: string; title: string; type: string; platform: string | null; status: string; created_at: string;
}

interface KanbanTask {
  id: string; name: string; description: string | null; status: string;
  agent_id: string; agent_name: string; department: string;
  skill_id: string | null; progress_pct: number;
  current_step_label: string | null; blocker_reason: string | null;
  delegated_by: string | null; started_at: string | null;
  completed_at: string | null; output_ref: string | null; created_at: string;
}

interface KanbanBoard {
  idle: KanbanTask[]; queued: KanbanTask[]; working: KanbanTask[]; blocked: KanbanTask[]; done: KanbanTask[];
}

interface ActivityData {
  summary: { active_agents: number; decisions_today: number; chats_today: number; unread_messages: number; total_agents: number };
  agents: Agent[];
  recent_decisions: Decision[];
  recent_messages: AgentMessage[];
  recent_content: ContentPiece[];
}

const DEPT_COLORS: Record<string, string> = {
  marketing: "#3b82f6", sales: "#10b981", product: "#8b5cf6", research: "#f59e0b", executive: "#ef4444", operations: "#dc2626",
};
const STATE_COLORS: Record<string, string> = {
  idle: "#484f58", observing: "#3b82f6", thinking: "#f59e0b", acting: "#10b981",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AgentsPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAll, setRunningAll] = useState(false);
  const [tab, setTab] = useState<"overview" | "decisions" | "messages" | "content" | "kanban">("overview");
  const [kanbanBoard, setKanbanBoard] = useState<KanbanBoard | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskAgent, setNewTaskAgent] = useState("");

  const fetchData = useCallback(() => {
    fetch("/api/agents/activity").then(r => r.json()).then(setData).finally(() => setLoading(false));
    fetch("/api/agents/tasks?grouped=true").then(r => r.json()).then(setKanbanBoard).catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
    // Poll every 5 seconds for live updates
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const runAll = async () => {
    setRunningAll(true);
    await fetch("/api/agents/run-all", { method: "POST" });
    fetchData();
    setRunningAll(false);
  };

  if (loading || !data) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /></div>;

  const { summary, agents, recent_decisions, recent_messages, recent_content } = data;

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e2e8f0]">Agent Command Center</h1>
            <p className="text-sm text-[#8b949e] mt-1">Live view of all 6 agents — auto-refreshes every 5s</p>
          </div>
          <div className="flex gap-2">
            <button onClick={runAll} disabled={runningAll} className="px-5 py-2.5 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2">
              {runningAll ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Running...</> : "Run All Agents"}
            </button>
            <button onClick={fetchData} className="px-3 py-2.5 border border-[#30363d] text-[#8b949e] text-sm rounded-lg hover:bg-[#21262d]">
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Active Now", value: summary.active_agents, total: summary.total_agents, color: "#10b981" },
            { label: "Decisions Today", value: summary.decisions_today, total: null, color: "#3b82f6" },
            { label: "Chats Today", value: summary.chats_today, total: null, color: "#8b5cf6" },
            { label: "Unread Messages", value: summary.unread_messages, total: null, color: summary.unread_messages > 0 ? "#f59e0b" : "#484f58" },
          ].map(s => (
            <div key={s.label} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
              <div className="text-2xl font-bold" style={{ color: s.color }}>
                {s.value}{s.total !== null ? <span className="text-sm text-[#484f58]">/{s.total}</span> : ""}
              </div>
              <div className="text-[10px] text-[#484f58] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Agent Cards — always visible */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-6">
          {agents.map(agent => {
            const color = DEPT_COLORS[agent.department] || "#8b949e";
            const stateColor = STATE_COLORS[agent.state] || "#484f58";
            const isActive = agent.state !== "idle";
            return (
              <div key={agent.id} className={`bg-[#161b22] border rounded-xl p-4 transition-all ${isActive ? "border-amber-500/50 shadow-lg shadow-amber-500/5" : "border-[#30363d]"}`}>
                {/* Status dot + name */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${isActive ? "animate-pulse" : ""}`} style={{ backgroundColor: stateColor }} />
                  <span className="text-xs font-bold text-[#e2e8f0] truncate">{agent.name.split("(")[0].trim()}</span>
                </div>

                {/* State */}
                <div className="text-[9px] mb-3" style={{ color: stateColor }}>
                  {agent.state === "idle" ? (agent.last_run_at ? `Last: ${timeAgo(agent.last_run_at)}` : "Never run") : agent.state.charAt(0).toUpperCase() + agent.state.slice(1) + "..."}
                </div>

                {/* Stats row */}
                <div className="flex justify-between text-[9px] text-[#484f58] mb-3">
                  <span>{agent.decisions_today}d</span>
                  <span>{agent.chats_today}c</span>
                  <span className={agent.unread_messages > 0 ? "text-amber-400 font-bold" : ""}>{agent.unread_messages}m</span>
                </div>

                {/* Next run */}
                {agent.next_run_at && (
                  <div className="text-[8px] text-[#30363d] mb-2">
                    Next: {new Date(agent.next_run_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-1">
                  <Link href={`/agents/${agent.id}/chat`} className="flex-1 py-1.5 text-center text-[9px] font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Chat</Link>
                  <Link href={`/agents/${agent.id}`} className="flex-1 py-1.5 text-center text-[9px] font-medium border border-[#30363d] text-[#8b949e] rounded-md hover:bg-[#21262d]">Log</Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-[#30363d] pb-2">
          {([
            { key: "overview" as const, label: "Live Feed", count: recent_decisions.length },
            { key: "kanban" as const, label: "Activity Board", count: kanbanBoard ? Object.values(kanbanBoard).reduce((s, t) => s + t.length, 0) : 0 },
            { key: "decisions" as const, label: "All Decisions", count: recent_decisions.length },
            { key: "messages" as const, label: "Agent Comms", count: recent_messages.length },
            { key: "content" as const, label: "Created Content", count: recent_content.length },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors ${tab === t.key ? "bg-[#161b22] text-[#e2e8f0] border border-[#30363d] border-b-transparent -mb-[3px]" : "text-[#8b949e] hover:text-[#e2e8f0]"}`}>
              {t.label} <span className="text-[#484f58]">({t.count})</span>
            </button>
          ))}
        </div>

        {/* Live Feed — interleaved timeline of decisions + messages + content */}
        {tab === "overview" && (
          <div className="space-y-2">
            {recent_decisions.length === 0 && recent_messages.length === 0 && (
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-8 text-center">
                <p className="text-[#8b949e]">No activity yet. Click &quot;Run All Agents&quot; to start.</p>
              </div>
            )}
            {/* Merge and sort by time */}
            {[
              ...recent_decisions.map(d => ({ type: "decision" as const, time: d.created_at, data: d })),
              ...recent_messages.map(m => ({ type: "message" as const, time: m.created_at, data: m })),
              ...recent_content.map(c => ({ type: "content" as const, time: c.created_at, data: c })),
            ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 30).map((item, i) => (
              <div key={i} className="bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-3 flex items-start gap-3">
                {/* Type icon */}
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  item.type === "decision" ? "bg-blue-500/20 text-blue-400" :
                  item.type === "message" ? "bg-amber-500/20 text-amber-400" :
                  "bg-emerald-500/20 text-emerald-400"
                }`}>
                  {item.type === "decision" ? "D" : item.type === "message" ? "M" : "C"}
                </div>

                <div className="flex-1 min-w-0">
                  {item.type === "decision" && (() => {
                    const d = item.data as Decision;
                    return (<>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold" style={{ color: DEPT_COLORS[d.department] || "#8b949e" }}>{d.agent_name.split("(")[0].trim()}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${d.confidence >= 0.7 ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>{(d.confidence * 100).toFixed(0)}%</span>
                        {d.skill_used && <span className="text-[9px] text-indigo-400">{d.skill_used}</span>}
                      </div>
                      <p className="text-[11px] text-[#c9d1d9] line-clamp-2">{d.reasoning}</p>
                      {d.action_taken && d.action_taken !== "No action" && <p className="text-[10px] text-[#484f58] mt-0.5">Action: {d.action_taken.slice(0, 100)}</p>}
                    </>);
                  })()}

                  {item.type === "message" && (() => {
                    const m = item.data as AgentMessage;
                    return (<>
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-xs font-bold text-amber-400">{m.from_name?.split("(")[0].trim()}</span>
                        <span className="text-[9px] text-[#484f58]">→</span>
                        <span className="text-xs font-bold text-[#8b949e]">{m.to_name?.split("(")[0].trim() || "All"}</span>
                        <span className={`text-[8px] px-1 py-0.5 rounded ${m.message_type === "handoff" ? "bg-orange-500/20 text-orange-400" : "bg-[#30363d] text-[#484f58]"}`}>{m.message_type}</span>
                      </div>
                      <p className="text-[11px] text-[#c9d1d9] line-clamp-2">{m.message}</p>
                    </>);
                  })()}

                  {item.type === "content" && (() => {
                    const c = item.data as ContentPiece;
                    return (<>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-emerald-400">Content Created</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-[#30363d] text-[#8b949e] rounded">{c.type}</span>
                        {c.platform && <span className="text-[9px] text-[#484f58]">{c.platform}</span>}
                      </div>
                      <p className="text-[11px] text-[#c9d1d9]">{c.title}</p>
                    </>);
                  })()}
                </div>

                <span className="text-[9px] text-[#30363d] shrink-0 whitespace-nowrap">{timeAgo(item.time)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Kanban Activity Board Tab */}
        {tab === "kanban" && (() => {
          const board = kanbanBoard || { idle: [], queued: [], working: [], blocked: [], done: [] };
          const columns: Array<{ key: string; label: string; color: string }> = [
            { key: "idle", label: "Idle", color: "#484f58" },
            { key: "queued", label: "Queued", color: "#3b82f6" },
            { key: "working", label: "Working", color: "#10b981" },
            { key: "blocked", label: "Blocked", color: "#f59e0b" },
            { key: "done", label: "Done", color: "#10b981" },
          ];

          const resolveTask = async (taskId: string) => {
            await fetch(`/api/agents/tasks/${taskId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "resolve" }),
            });
            fetchData();
          };

          const advanceTask = async (taskId: string, newStatus: string) => {
            await fetch(`/api/agents/tasks/${taskId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: newStatus }),
            });
            fetchData();
          };

          const forceCompleteTask = async (taskId: string) => {
            await fetch(`/api/agents/tasks/${taskId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "force_complete" }),
            });
            fetchData();
          };

          const deleteTask = async (taskId: string) => {
            await fetch(`/api/agents/tasks/${taskId}`, { method: "DELETE" });
            fetchData();
          };

          const createTask = async () => {
            if (!newTaskName || !newTaskAgent) return;
            await fetch("/api/agents/tasks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: newTaskName, description: newTaskDesc || null, agent_id: newTaskAgent }),
            });
            setNewTaskName("");
            setNewTaskDesc("");
            setNewTaskAgent("");
            setShowCreateTask(false);
            fetchData();
          };

          const elapsedTime = (startedAt: string | null): string => {
            if (!startedAt) return "";
            const diff = Date.now() - new Date(startedAt).getTime();
            const secs = Math.floor(diff / 1000);
            if (secs < 60) return `${secs}s`;
            const mins = Math.floor(secs / 60);
            if (mins < 60) return `${mins}m`;
            const hrs = Math.floor(mins / 60);
            return `${hrs}h ${mins % 60}m`;
          };

          return (
            <div>
              {/* Agent Roster Bar */}
              <div className="grid grid-cols-6 gap-2 mb-4">
                {agents.map(agent => {
                  const deptColor = DEPT_COLORS[agent.department] || "#8b949e";
                  const agentTasks = Object.values(board).flat().filter(t => t.agent_id === agent.id);
                  const workingTasks = agentTasks.filter(t => t.status === "working");
                  const currentTask = workingTasks[0];
                  return (
                    <div key={agent.id} className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: deptColor + "33", color: deptColor }}>
                          {agent.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-bold text-[#e2e8f0] truncate">{agent.name.split("(")[0].trim()}</div>
                          <div className="text-[8px] truncate" style={{ color: deptColor }}>{agent.department}</div>
                        </div>
                      </div>
                      {currentTask ? (
                        <div className="mt-1">
                          <div className="text-[8px] text-emerald-400 truncate">{currentTask.current_step_label || "Working..."}</div>
                          <div className="w-full bg-[#30363d] rounded-full h-1 mt-1">
                            <div className="h-1 rounded-full bg-emerald-500 transition-all" style={{ width: `${currentTask.progress_pct}%` }} />
                          </div>
                        </div>
                      ) : (
                        <div className="text-[8px] text-[#484f58] mt-1">{agentTasks.length} task{agentTasks.length !== 1 ? "s" : ""}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Create Task Button */}
              <div className="flex justify-end mb-3">
                <button onClick={() => setShowCreateTask(true)} className="px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-1.5">
                  <span className="text-sm">+</span> Create Task
                </button>
              </div>

              {/* Create Task Modal */}
              {showCreateTask && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowCreateTask(false)}>
                  <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                    <h3 className="text-sm font-bold text-[#e2e8f0] mb-4">Create Agent Task</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-[#8b949e] block mb-1">Task Name *</label>
                        <input value={newTaskName} onChange={e => setNewTaskName(e.target.value)} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-indigo-500 outline-none" placeholder="e.g. Write weekly newsletter" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8b949e] block mb-1">Description</label>
                        <textarea value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} rows={2} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-indigo-500 outline-none resize-none" placeholder="Optional details..." />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8b949e] block mb-1">Assign to Agent *</label>
                        <select value={newTaskAgent} onChange={e => setNewTaskAgent(e.target.value)} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-indigo-500 outline-none">
                          <option value="">Select agent...</option>
                          {agents.map(a => (
                            <option key={a.id} value={a.id}>{a.name.split("(")[0].trim()} ({a.department})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-5">
                      <button onClick={() => setShowCreateTask(false)} className="px-4 py-2 text-xs text-[#8b949e] border border-[#30363d] rounded-lg hover:bg-[#21262d]">Cancel</button>
                      <button onClick={createTask} disabled={!newTaskName || !newTaskAgent} className="px-4 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">Create Task</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Kanban Columns */}
              <div className="grid grid-cols-5 gap-2">
                {columns.map(col => {
                  const tasks = board[col.key as keyof KanbanBoard] || [];
                  return (
                    <div key={col.key} className="min-h-[200px]">
                      {/* Column Header */}
                      <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                          <span className="text-[10px] font-bold text-[#e2e8f0]">{col.label}</span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 bg-[#30363d] text-[#8b949e] rounded-full">{tasks.length}</span>
                      </div>

                      {/* Task Cards */}
                      <div className="space-y-2">
                        {tasks.map(task => {
                          const deptColor = DEPT_COLORS[task.department] || "#8b949e";
                          return (
                            <div key={task.id} className={`bg-[#161b22] border rounded-lg p-3 ${
                              task.status === "working" ? "border-emerald-500/40 shadow-sm shadow-emerald-500/10" :
                              task.status === "blocked" ? "border-amber-500/40" :
                              "border-[#30363d]"
                            }`}>
                              {/* Task name */}
                              <div className="text-[11px] font-semibold text-[#e2e8f0] mb-1 line-clamp-2">{task.name}</div>

                              {/* Description */}
                              {task.description && (
                                <p className="text-[9px] text-[#8b949e] mb-2 line-clamp-1">{task.description}</p>
                              )}

                              {/* Agent badge */}
                              <div className="flex items-center gap-1 mb-2">
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: deptColor }} />
                                <span className="text-[9px] font-medium" style={{ color: deptColor }}>{task.agent_name.split("(")[0].trim()}</span>
                              </div>

                              {/* Current step label */}
                              {task.current_step_label && (
                                <div className={`text-[8px] mb-1.5 ${task.status === "working" ? "text-emerald-400" : "text-[#8b949e]"}`}>
                                  {task.current_step_label}
                                </div>
                              )}

                              {/* Progress bar */}
                              {task.progress_pct > 0 && task.status !== "done" && (
                                <div className="w-full bg-[#30363d] rounded-full h-1 mb-2">
                                  <div className={`h-1 rounded-full transition-all ${task.status === "working" ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${task.progress_pct}%` }} />
                                </div>
                              )}

                              {/* Time elapsed */}
                              {task.started_at && (
                                <div className="text-[8px] text-[#484f58] mb-1">
                                  {task.status === "done" ? "Completed" : "Running"} {elapsedTime(task.started_at)}
                                </div>
                              )}

                              {/* Delegated by */}
                              {task.delegated_by && (
                                <div className="text-[8px] text-indigo-400 mb-1">
                                  Delegated by {task.delegated_by}
                                </div>
                              )}

                              {/* Idle: Queue / Delete */}
                              {task.status === "idle" && (
                                <div className="mt-2 flex gap-1">
                                  <button onClick={() => advanceTask(task.id, "queued")} className="flex-1 py-1 text-[8px] font-medium bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30 border border-blue-600/30">
                                    Queue
                                  </button>
                                  <button onClick={() => deleteTask(task.id)} className="py-1 px-2 text-[8px] font-medium bg-red-600/10 text-red-400 rounded hover:bg-red-600/20 border border-red-600/20" title="Delete task">
                                    &times;
                                  </button>
                                </div>
                              )}

                              {/* Queued: Start / Cancel / Delete */}
                              {task.status === "queued" && (
                                <div className="mt-2 flex gap-1">
                                  <button onClick={() => advanceTask(task.id, "working")} className="flex-1 py-1 text-[8px] font-medium bg-emerald-600/20 text-emerald-400 rounded hover:bg-emerald-600/30 border border-emerald-600/30">
                                    Start
                                  </button>
                                  <button onClick={() => advanceTask(task.id, "idle")} className="py-1 px-2 text-[8px] font-medium border border-[#30363d] text-[#8b949e] rounded hover:bg-[#21262d]" title="Cancel back to idle">
                                    Cancel
                                  </button>
                                  <button onClick={() => deleteTask(task.id)} className="py-1 px-2 text-[8px] font-medium bg-red-600/10 text-red-400 rounded hover:bg-red-600/20 border border-red-600/20" title="Delete task">
                                    &times;
                                  </button>
                                </div>
                              )}

                              {/* Working: Complete / Re-queue / Block */}
                              {task.status === "working" && (
                                <div className="mt-2">
                                  <div className="flex items-center gap-1 mb-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[8px] text-emerald-400">In progress</span>
                                  </div>
                                  <div className="flex gap-1">
                                    <button onClick={() => advanceTask(task.id, "done")} className="flex-1 py-1 text-[8px] font-medium bg-emerald-600/20 text-emerald-400 rounded hover:bg-emerald-600/30 border border-emerald-600/30">
                                      Complete
                                    </button>
                                    <button onClick={() => advanceTask(task.id, "queued")} className="py-1 px-2 text-[8px] font-medium border border-[#30363d] text-[#8b949e] rounded hover:bg-[#21262d]" title="Re-queue">
                                      Re-queue
                                    </button>
                                    <button onClick={() => advanceTask(task.id, "blocked")} className="py-1 px-2 text-[8px] font-medium bg-amber-600/20 text-amber-400 rounded hover:bg-amber-600/30 border border-amber-600/30">
                                      Block
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Blocked: Resolve / Force Complete / Delete */}
                              {task.status === "blocked" && (
                                <div className="mt-2">
                                  {task.blocker_reason && (
                                    <div className="text-[8px] text-amber-400 mb-1.5 line-clamp-2">{task.blocker_reason}</div>
                                  )}
                                  <div className="flex gap-1">
                                    <button onClick={() => resolveTask(task.id)} className="flex-1 py-1 text-[8px] font-medium bg-amber-600/20 text-amber-400 rounded hover:bg-amber-600/30 border border-amber-600/30">
                                      Re-queue
                                    </button>
                                    <button onClick={() => forceCompleteTask(task.id)} className="py-1 px-2 text-[8px] font-medium bg-emerald-600/10 text-emerald-400 rounded hover:bg-emerald-600/20 border border-emerald-600/20" title="Force complete">
                                      Done
                                    </button>
                                    <button onClick={() => deleteTask(task.id)} className="py-1 px-2 text-[8px] font-medium bg-red-600/10 text-red-400 rounded hover:bg-red-600/20 border border-red-600/20" title="Delete task">
                                      &times;
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Done: Re-queue / Reset / Delete */}
                              {task.status === "done" && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                      <span className="text-[8px] text-emerald-400">Complete</span>
                                    </div>
                                    <div className="flex gap-1">
                                      <button onClick={() => advanceTask(task.id, "queued")} className="py-1 px-2 text-[8px] font-medium border border-[#30363d] text-[#8b949e] rounded hover:bg-[#21262d] hover:text-[#e2e8f0]" title="Re-queue for another run">
                                        Re-run
                                      </button>
                                      <button onClick={() => deleteTask(task.id)} className="py-1 px-2 text-[8px] font-medium bg-red-600/10 text-red-400 rounded hover:bg-red-600/20 border border-red-600/20" title="Remove from board">
                                        &times;
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {tasks.length === 0 && (
                          <div className="bg-[#161b22]/50 border border-dashed border-[#30363d] rounded-lg p-4 text-center">
                            <span className="text-[9px] text-[#484f58]">No tasks</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* All Decisions Tab */}
        {tab === "decisions" && (
          <div className="space-y-2">
            {recent_decisions.map(d => (
              <div key={d.id} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: DEPT_COLORS[d.department] }}>{d.agent_name.split("(")[0].trim()}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${d.confidence >= 0.7 ? "bg-emerald-500/20 text-emerald-400" : d.confidence >= 0.5 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>{(d.confidence * 100).toFixed(0)}%</span>
                    {d.skill_used && <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-full">{d.skill_used}</span>}
                  </div>
                  <span className="text-[9px] text-[#484f58]">{timeAgo(d.created_at)}</span>
                </div>
                <p className="text-sm text-[#c9d1d9]">{d.reasoning}</p>
                {d.action_taken && d.action_taken !== "No action" && <p className="text-xs text-[#8b949e] mt-1">Action: {d.action_taken.slice(0, 200)}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Agent Comms Tab */}
        {tab === "messages" && (
          <div className="space-y-2">
            {recent_messages.map((m, i) => (
              <div key={i} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 flex items-start gap-3">
                <div className={`px-2 py-1 rounded text-[8px] font-bold ${m.message_type === "handoff" ? "bg-orange-500/20 text-orange-400" : m.message_type === "request" ? "bg-blue-500/20 text-blue-400" : "bg-[#30363d] text-[#484f58]"}`}>
                  {m.message_type.toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-bold" style={{ color: DEPT_COLORS[m.from_dept] }}>{m.from_name?.split("(")[0].trim()}</span>
                    <span className="text-[#484f58]">→</span>
                    <span className="text-xs font-bold" style={{ color: DEPT_COLORS[m.to_dept] }}>{m.to_name?.split("(")[0].trim() || "All"}</span>
                  </div>
                  <p className="text-sm text-[#c9d1d9]">{m.message}</p>
                </div>
                <span className="text-[9px] text-[#484f58] shrink-0">{timeAgo(m.created_at)}</span>
              </div>
            ))}
            {recent_messages.length === 0 && <div className="text-center py-8 text-[#484f58] text-sm">No inter-agent messages yet</div>}
          </div>
        )}

        {/* Created Content Tab */}
        {tab === "content" && (
          <div className="space-y-2">
            {recent_content.map(c => (
              <div key={c.id} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-[#e2e8f0]">{c.title}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-[#30363d] text-[#8b949e] rounded">{c.type}</span>
                    {c.platform && <span className="text-[9px] text-[#484f58]">{c.platform}</span>}
                  </div>
                  <span className="text-[9px] text-[#484f58]">{timeAgo(c.created_at)} · {c.status}</span>
                </div>
              </div>
            ))}
            {recent_content.length === 0 && <div className="text-center py-8 text-[#484f58] text-sm">No content created in the last 24 hours</div>}
          </div>
        )}
      </div>
    </div>
  );
}
