"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Decision { id: string; observation: string; reasoning: string; action_taken: string; skill_used: string | null; result_summary: string | null; confidence: number; created_at: string; }
interface AgentMessage { id: string; from_agent_id: string; message: string; message_type: string; is_read: number; created_at: string; from_name?: string; }
interface AgentData { id: string; name: string; role: string; department: string; system_prompt: string; assigned_skills: string; memory: string; state: string; schedule: string; last_run_at: string | null; next_run_at: string | null; is_active: number; }

const STATE_CONFIG: Record<string, { label: string; color: string; pulse: boolean }> = {
  idle: { label: "Idle", color: "#484f58", pulse: false },
  observing: { label: "Observing department...", color: "#3b82f6", pulse: true },
  thinking: { label: "Analyzing & deciding...", color: "#f59e0b", pulse: true },
  acting: { label: "Executing skill...", color: "#10b981", pulse: true },
};

export default function AgentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"activity" | "traces" | "memory" | "skills" | "config">("activity");
  const [selectedTrace, setSelectedTrace] = useState<Decision | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/agents/${id}`);
    if (res.ok) {
      const d = await res.json();
      setAgent(d.agent);
      setDecisions(d.decisions || []);
      setMessages(d.messages || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll while agent is running
  useEffect(() => {
    if (!agent || agent.state === "idle") return;
    const interval = setInterval(() => {
      fetchData();
      setPollCount(p => p + 1);
    }, 2000);
    return () => clearInterval(interval);
  }, [agent?.state, fetchData]);

  const run = async () => {
    setRunning(true);
    setPollCount(0);
    // Start the run
    fetch(`/api/agents/${id}/run`, { method: "POST" }).then(() => {
      fetchData();
      setRunning(false);
    }).catch(() => setRunning(false));
    // Immediately start polling
    setTimeout(fetchData, 500);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /></div>;
  if (!agent) return <div className="min-h-screen flex items-center justify-center text-[#8b949e]">Agent not found</div>;

  const memory = JSON.parse(agent.memory || "{}");
  const skills = JSON.parse(agent.assigned_skills || "[]") as string[];
  const stateInfo = STATE_CONFIG[agent.state] || STATE_CONFIG.idle;
  const totalDecisions = decisions.length;
  const successRate = totalDecisions > 0 ? Math.round((decisions.filter(d => d.confidence >= 0.7).length / totalDecisions) * 100) : 0;
  const avgConfidence = totalDecisions > 0 ? Math.round((decisions.reduce((s, d) => s + d.confidence, 0) / totalDecisions) * 100) : 0;

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-[#484f58] mb-4">
          <Link href="/agents" className="hover:text-[#8b949e]">Agents</Link>
          <span>/</span>
          <span className="text-[#e2e8f0]">{agent.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#e2e8f0]">{agent.name}</h1>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: `${stateInfo.color}20`, border: `1px solid ${stateInfo.color}40` }}>
                {stateInfo.pulse && <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: stateInfo.color }} />}
                <span className="text-[10px] font-medium" style={{ color: stateInfo.color }}>{stateInfo.label}</span>
              </div>
            </div>
            <p className="text-sm text-[#8b949e] mt-1">{agent.role} &middot; {agent.department}</p>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-[#484f58]">
              <span>Schedule: <code className="text-[#8b949e]">{agent.schedule}</code></span>
              {agent.last_run_at && <span>Last run: {new Date(agent.last_run_at).toLocaleString()}</span>}
              {agent.next_run_at && <span>Next: {new Date(agent.next_run_at).toLocaleString()}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/agents/${id}/chat`} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">Chat</Link>
            <button onClick={run} disabled={running || agent.state !== "idle"} className="px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50">
              {running || agent.state !== "idle" ? "Running..." : "Run Now"}
            </button>
          </div>
        </div>

        {/* Live Progress Bar (shows during run) */}
        {agent.state !== "idle" && (
          <div className="mb-6 bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#e2e8f0]">Agent Loop in Progress</span>
              <span className="text-[10px] text-[#484f58]">Step {agent.state === "observing" ? "1/3" : agent.state === "thinking" ? "2/3" : "3/3"}</span>
            </div>
            <div className="flex gap-1 mb-2">
              <div className={`flex-1 h-2 rounded-full ${agent.state === "observing" || agent.state === "thinking" || agent.state === "acting" ? "bg-blue-500" : "bg-[#30363d]"}`} />
              <div className={`flex-1 h-2 rounded-full ${agent.state === "thinking" || agent.state === "acting" ? "bg-amber-500" : "bg-[#30363d]"}`} />
              <div className={`flex-1 h-2 rounded-full ${agent.state === "acting" ? "bg-emerald-500" : "bg-[#30363d]"}`} />
            </div>
            <div className="flex justify-between text-[9px] text-[#484f58]">
              <span className={agent.state === "observing" ? "text-blue-400 font-bold" : ""}>Observe</span>
              <span className={agent.state === "thinking" ? "text-amber-400 font-bold" : ""}>Think</span>
              <span className={agent.state === "acting" ? "text-emerald-400 font-bold" : ""}>Act</span>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-[#e2e8f0]">{totalDecisions}</div>
            <div className="text-[9px] text-[#484f58]">Total Decisions</div>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-emerald-400">{avgConfidence}%</div>
            <div className="text-[9px] text-[#484f58]">Avg Confidence</div>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-blue-400">{successRate}%</div>
            <div className="text-[9px] text-[#484f58]">High Confidence Rate</div>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-amber-400">{messages.filter(m => !m.is_read).length}</div>
            <div className="text-[9px] text-[#484f58]">Unread Messages</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          {(["activity", "traces", "memory", "skills", "config"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${tab === t ? "bg-indigo-600 text-white" : "text-[#8b949e] hover:bg-[#21262d]"}`}>
              {t === "activity" ? `Activity (${totalDecisions})` : t === "traces" ? "Traces" : t === "memory" ? "Memory" : t === "skills" ? `Skills (${skills.length})` : "Config"}
            </button>
          ))}
        </div>

        {/* Activity Tab */}
        {tab === "activity" && (
          <div className="space-y-3">
            {/* Inter-agent messages */}
            {messages.filter(m => !m.is_read).length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4">
                <h3 className="text-xs font-bold text-amber-400 mb-2">Incoming Messages</h3>
                {messages.filter(m => !m.is_read).map(m => (
                  <div key={m.id} className="flex items-start gap-2 mb-2 last:mb-0">
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">{m.message_type}</span>
                    <p className="text-xs text-[#c9d1d9]">{m.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Decision timeline */}
            {decisions.length === 0 ? (
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-8 text-center">
                <p className="text-[#8b949e] text-sm">No activity yet. Click &quot;Run Now&quot; to start.</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-[#30363d]" />
                {decisions.map((d, i) => (
                  <div key={d.id} className="relative pl-12 pb-4">
                    {/* Timeline dot */}
                    <div className={`absolute left-3.5 top-1 w-3 h-3 rounded-full border-2 border-[#0d1117] ${d.confidence >= 0.7 ? "bg-emerald-500" : d.confidence >= 0.5 ? "bg-amber-500" : "bg-red-500"}`} />

                    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 hover:border-[#484f58] transition-colors">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${d.confidence >= 0.7 ? "text-emerald-400" : d.confidence >= 0.5 ? "text-amber-400" : "text-red-400"}`}>
                            {(d.confidence * 100).toFixed(0)}% confidence
                          </span>
                          {d.skill_used && <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-full">{d.skill_used}</span>}
                          {d.action_taken === "No action" && <span className="text-[10px] px-2 py-0.5 bg-[#30363d] text-[#8b949e] rounded-full">Waited</span>}
                        </div>
                        <span className="text-[9px] text-[#484f58]">{new Date(d.created_at).toLocaleString()}</span>
                      </div>

                      {/* Reasoning */}
                      <p className="text-sm text-[#c9d1d9] mb-2">{d.reasoning}</p>

                      {/* Action + Result */}
                      {d.action_taken && d.action_taken !== "No action" && (
                        <div className="mt-2 pt-2 border-t border-[#21262d]">
                          <p className="text-[10px] text-[#8b949e]"><strong className="text-[#c9d1d9]">Action:</strong> {d.action_taken}</p>
                        </div>
                      )}
                      {d.result_summary && (
                        <div className="mt-1">
                          <p className="text-[10px] text-emerald-400/70"><strong>Result:</strong> {d.result_summary.slice(0, 300)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Traces Tab — Execution trace viewer (AWS Bedrock / Google Vertex pattern) */}
        {tab === "traces" && (
          <div className="space-y-3">
            {decisions.length === 0 ? (
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-8 text-center text-[#8b949e] text-sm">No execution traces yet. Run the agent to see traces.</div>
            ) : (
              <>
                {decisions.map((d) => (
                  <div key={d.id} className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                    {/* Trace header */}
                    <button onClick={() => setSelectedTrace(selectedTrace?.id === d.id ? null : d)} className="w-full flex items-center gap-3 p-4 hover:bg-[#1c2030] transition-colors text-left">
                      <div className={`w-2.5 h-2.5 rounded-full ${d.confidence >= 0.7 ? "bg-emerald-400" : d.confidence >= 0.5 ? "bg-amber-400" : "bg-red-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#e2e8f0] truncate">{d.skill_used || "No action"}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#30363d] text-[#8b949e]">{(d.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-[10px] text-[#484f58] mt-0.5">{new Date(d.created_at).toLocaleString()}</p>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-[#484f58] transition-transform ${selectedTrace?.id === d.id ? "rotate-180" : ""}`}>
                        <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    {/* Trace detail — expanded */}
                    {selectedTrace?.id === d.id && (
                      <div className="border-t border-[#30363d] p-4 space-y-4">
                        {/* Step 1: Observe */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-[9px] font-bold text-blue-400">1</div>
                            <div className="w-px flex-1 bg-[#30363d]" />
                          </div>
                          <div className="flex-1 pb-3">
                            <div className="text-xs font-bold text-blue-400 mb-1">OBSERVE</div>
                            {d.observation ? (
                              <pre className="text-[10px] text-[#8b949e] bg-[#0d1117] rounded-lg p-3 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">{(() => { try { return JSON.stringify(JSON.parse(d.observation), null, 2); } catch { return d.observation; } })()}</pre>
                            ) : <p className="text-[10px] text-[#484f58]">No observations recorded</p>}
                          </div>
                        </div>

                        {/* Step 2: Think */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-[9px] font-bold text-amber-400">2</div>
                            <div className="w-px flex-1 bg-[#30363d]" />
                          </div>
                          <div className="flex-1 pb-3">
                            <div className="text-xs font-bold text-amber-400 mb-1">THINK</div>
                            <p className="text-xs text-[#c9d1d9] leading-relaxed">{d.reasoning}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] text-[#484f58]">Confidence:</span>
                              <div className="flex-1 max-w-[120px] h-1.5 bg-[#30363d] rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${d.confidence >= 0.7 ? "bg-emerald-500" : d.confidence >= 0.5 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${d.confidence * 100}%` }} />
                              </div>
                              <span className="text-[10px] font-bold" style={{ color: d.confidence >= 0.7 ? "#10b981" : d.confidence >= 0.5 ? "#f59e0b" : "#ef4444" }}>{(d.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Step 3: Act */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[9px] font-bold text-emerald-400">3</div>
                          </div>
                          <div className="flex-1">
                            <div className="text-xs font-bold text-emerald-400 mb-1">ACT</div>
                            {d.skill_used && <div className="text-[10px] text-[#8b949e] mb-1">Skill: <span className="text-indigo-400">{d.skill_used}</span></div>}
                            <p className="text-xs text-[#c9d1d9]">{d.action_taken || "No action taken"}</p>
                            {d.result_summary && (
                              <div className="mt-2 bg-[#0d1117] rounded-lg p-3">
                                <div className="text-[9px] text-[#484f58] mb-1">Result</div>
                                <p className="text-xs text-[#8b949e] whitespace-pre-wrap">{d.result_summary}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Memory Tab */}
        {tab === "memory" && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
            {Object.keys(memory).length === 0 ? (
              <p className="text-[#8b949e] text-sm text-center py-4">No memories yet. The agent learns from interactions.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(memory).map(([key, values]) => (
                  <div key={key}>
                    <h3 className="text-[10px] text-[#484f58] uppercase tracking-wide mb-2">{key.replace(/_/g, " ")}</h3>
                    {Array.isArray(values) ? (
                      values.map((v, i) => (
                        <p key={i} className="text-xs text-[#8b949e] mb-1">
                          {typeof v === "string" ? `- ${v}` : JSON.stringify(v)}
                        </p>
                      ))
                    ) : (
                      <p className="text-xs text-[#8b949e]">{JSON.stringify(values)}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Skills Tab */}
        {tab === "skills" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {skills.map(skillId => (
              <div key={skillId} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
                <div className="text-xs font-mono text-indigo-400">{skillId}</div>
                <div className="text-[10px] text-[#484f58] mt-1">
                  Used {decisions.filter(d => d.skill_used === skillId).length} times
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Config Tab */}
        {tab === "config" && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-3">
            <div>
              <label className="text-[10px] text-[#484f58] uppercase">Department</label>
              <p className="text-sm text-[#e2e8f0]">{agent.department}</p>
            </div>
            <div>
              <label className="text-[10px] text-[#484f58] uppercase">Schedule (cron)</label>
              <p className="text-sm font-mono text-[#e2e8f0]">{agent.schedule}</p>
            </div>
            <div>
              <label className="text-[10px] text-[#484f58] uppercase">Active</label>
              <p className="text-sm text-[#e2e8f0]">{agent.is_active ? "Yes" : "No"}</p>
            </div>
            <div>
              <label className="text-[10px] text-[#484f58] uppercase">System Prompt</label>
              <pre className="text-[11px] text-[#8b949e] whitespace-pre-wrap bg-[#0d1117] rounded-lg p-3 mt-1 max-h-60 overflow-y-auto">{agent.system_prompt}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
