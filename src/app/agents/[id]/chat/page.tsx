"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Message { id: string; role: string; message: string; action_taken: string | null; feedback: number | null; created_at: string; provider?: string; }
interface Session { id: string; title: string; message_count: number; first_message: string | null; updated_at: string; }
interface AgentInfo { id: string; name: string; role: string; department: string; }

// Simple markdown renderer
function renderMarkdown(text: string) {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-[#0d1117] rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono text-emerald-400 relative group"><button onclick="navigator.clipboard.writeText(this.nextSibling.textContent)" class="absolute top-2 right-2 text-[9px] px-2 py-0.5 bg-[#30363d] text-[#8b949e] rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">Copy</button><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-[#21262d] px-1.5 py-0.5 rounded text-xs text-amber-400">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[#e2e8f0]">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$2</li>')
    .replace(/\n/g, '<br/>');
}

export default function AgentChatPage() {
  const params = useParams();
  const agentId = params.id as string;

  interface LLMConnection { id: string; provider: string; model: string; is_active: number; }

  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [provider, setProvider] = useState("");
  const [connections, setConnections] = useState<LLMConnection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string>("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConnections = useCallback(() => {
    fetch("/api/connections").then(r => r.json()).then((conns: LLMConnection[]) => {
      setConnections(conns);
      const active = conns.find(c => c.is_active);
      if (active && !selectedConnection) {
        setProvider(`${active.provider}${active.model ? ` (${active.model})` : ""}`);
        setSelectedConnection(active.id);
      }
    }).catch(() => {});
  }, [selectedConnection]);

  const loadSessions = useCallback(() => {
    fetch(`/api/agents/${agentId}/chat`).then(r => r.json()).then(s => {
      setSessions(Array.isArray(s) ? s : []);
      if (Array.isArray(s) && s.length > 0 && !activeSession) {
        setActiveSession(s[0].id);
      }
    });
  }, [agentId, activeSession]);

  // Load agent + sessions + refresh connections on focus
  useEffect(() => {
    fetch(`/api/agents/${agentId}`).then(r => r.json()).then(d => setAgent(d.agent));
    loadConnections();
    loadSessions();

    const onFocus = () => loadConnections();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [agentId, loadConnections, loadSessions]);

  // Load messages when session changes
  useEffect(() => {
    if (activeSession) {
      fetch(`/api/agents/${agentId}/chat?session_id=${activeSession}`).then(r => r.json()).then(setMessages);
    } else {
      setMessages([]);
    }
    setFollowups([]);
  }, [activeSession, agentId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const newSession = async () => {
    const res = await fetch(`/api/agents/${agentId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "new_session" }),
    });
    const data = await res.json();
    setActiveSession(data.session_id);
    setMessages([]);
    setFollowups([]);
    loadSessions();
  };

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);
    setFollowups([]);

    // Optimistic add
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, role: "user", message: msg, action_taken: null, feedback: null, created_at: new Date().toISOString() }]);

    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, session_id: activeSession, connection_id: selectedConnection || undefined }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Show error to user as an agent message
        const errorMsg = data.error || `Request failed (${res.status})`;
        const hint = data.hint ? `\n\n${data.hint}` : "";
        setMessages(prev => [
          ...prev.filter(m => m.id !== tempId),
          { id: `u-${Date.now()}`, role: "user", message: msg, action_taken: null, feedback: null, created_at: new Date().toISOString() },
          { id: `err-${Date.now()}`, role: "agent", message: `**Error:** ${errorMsg}${hint}`, action_taken: null, feedback: null, created_at: new Date().toISOString() },
        ]);
        setSending(false);
        return;
      }

      if (!activeSession && data.session_id) {
        setActiveSession(data.session_id);
        loadSessions();
      }

      // Update provider display from response
      if (data.provider) setProvider(data.provider);

      setMessages(prev => [
        ...prev.filter(m => m.id !== tempId),
        { id: `u-${Date.now()}`, role: "user", message: msg, action_taken: null, feedback: null, created_at: new Date().toISOString() },
        {
          id: `a-${Date.now()}`, role: "agent", message: data.response || data.error || "No response",
          action_taken: (data.action || data.delegations) ? JSON.stringify({ ...data.action, delegations: data.delegations }) : null,
          feedback: null, created_at: new Date().toISOString(), provider: data.provider,
        },
      ]);
      if (data.suggested_followups?.length) setFollowups(data.suggested_followups);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Network error — check your connection";
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempId),
        { id: `u-${Date.now()}`, role: "user", message: msg, action_taken: null, feedback: null, created_at: new Date().toISOString() },
        { id: `err-${Date.now()}`, role: "agent", message: `**Error:** ${errorMsg}`, action_taken: null, feedback: null, created_at: new Date().toISOString() },
      ]);
    }
    setSending(false);
  };

  const regenerate = async () => {
    if (!activeSession) return;
    setSending(true);
    const res = await fetch(`/api/agents/${agentId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "regenerate", session_id: activeSession }),
    });
    const data = await res.json();
    // Reload messages
    const msgsRes = await fetch(`/api/agents/${agentId}/chat?session_id=${activeSession}`);
    setMessages(await msgsRes.json());
    if (data.suggested_followups?.length) setFollowups(data.suggested_followups);
    setSending(false);
  };

  const giveFeedback = async (messageId: string, value: number) => {
    await fetch(`/api/agents/${agentId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "feedback", message_id: messageId, value }),
    });
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, feedback: value } : m));
  };

  const search = async () => {
    if (!searchQuery.trim()) return;
    const res = await fetch(`/api/agents/${agentId}/chat?action=search&q=${encodeURIComponent(searchQuery)}`);
    setSearchResults(await res.json());
  };

  const exportChat = () => {
    if (!activeSession) return;
    window.open(`/api/agents/${agentId}/chat?action=export&session_id=${activeSession}`, "_blank");
  };

  // Voice input (Web Speech API)
  const toggleVoice = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
    if (listening) { setListening(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e: any) => { setInput((prev: string) => prev + " " + e.results[0][0].transcript); setListening(false); };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Session Sidebar */}
      {showSidebar && (
        <div className="w-64 border-r border-[#30363d] flex flex-col shrink-0">
          <div className="p-3 border-b border-[#30363d] flex items-center justify-between">
            <button onClick={newSession} className="flex-1 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              + New Chat
            </button>
            <button onClick={() => setShowSearch(!showSearch)} className="ml-2 p-2 text-[#8b949e] hover:text-[#e2e8f0] rounded-lg hover:bg-[#21262d]">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>

          {/* Search */}
          {showSearch && (
            <div className="p-2 border-b border-[#30363d]">
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()}
                placeholder="Search messages..." className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-xs text-[#e2e8f0] placeholder-[#484f58]" />
              {searchResults.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto">
                  {searchResults.map(r => (
                    <div key={r.id} className="text-[10px] text-[#8b949e] p-1 border-b border-[#21262d] truncate">{r.message.slice(0, 60)}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Session List */}
          <div className="flex-1 overflow-y-auto">
            {sessions.map(s => (
              <button key={s.id} onClick={() => setActiveSession(s.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-[#21262d] transition-colors ${activeSession === s.id ? "bg-[#161b22] border-l-2 border-l-indigo-500" : "hover:bg-[#161b22]"}`}>
                <div className="text-xs text-[#e2e8f0] truncate">{s.title}</div>
                <div className="text-[9px] text-[#484f58] mt-0.5">{s.message_count} msgs &middot; {new Date(s.updated_at).toLocaleDateString()}</div>
              </button>
            ))}
            {sessions.length === 0 && <div className="p-4 text-center text-[10px] text-[#484f58]">No conversations yet</div>}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-[#30363d] px-4 py-2.5 flex items-center gap-3 shrink-0">
          <button onClick={() => setShowSidebar(!showSidebar)} className="text-[#484f58] hover:text-[#8b949e] p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <Link href="/agents" className="text-[#484f58] hover:text-[#8b949e] text-sm">&larr;</Link>
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
            {agent?.department?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-[#e2e8f0]">{agent?.name || "Agent"}</h2>
            <p className="text-[9px] text-[#484f58]">{agent?.role} {provider ? `· via ${provider}` : ""}</p>
          </div>
          <select
            value={selectedConnection}
            onChange={e => {
              setSelectedConnection(e.target.value);
              const c = connections.find(x => x.id === e.target.value);
              if (c) setProvider(`${c.provider}${c.model ? ` (${c.model})` : ""}`);
            }}
            className="text-[11px] bg-[#0d1117] border border-indigo-500/50 text-indigo-400 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 font-medium"
          >
            {connections.map(c => (
              <option key={c.id} value={c.id}>
                {c.provider} — {c.model || "default"}{c.is_active ? " ★" : ""}
              </option>
            ))}
            {connections.length === 0 && <option value="">No connections — add one in Settings</option>}
          </select>
          <button onClick={exportChat} className="text-[10px] text-[#484f58] hover:text-[#8b949e] px-2 py-1 rounded hover:bg-[#21262d]">Export</button>
          {sending && <div className="text-[10px] text-amber-400 flex items-center gap-1"><div className="w-2 h-2 border border-amber-400 border-t-transparent rounded-full animate-spin" /> Thinking...</div>}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="text-3xl mb-3 opacity-20">💬</div>
              <p className="text-[#8b949e] text-sm">{activeSession ? "Start chatting" : "Create a new chat or select one from the sidebar"}</p>
              {!activeSession && <button onClick={newSession} className="mt-3 text-indigo-400 text-sm hover:text-indigo-300">+ New Chat</button>}
            </div>
          )}
          {messages.map((msg) => {
            let parsedAction: { skill?: string; result?: string; delegations?: Array<{ agent: string; response: string }> } | null = null;
            if (msg.action_taken) { try { parsedAction = JSON.parse(msg.action_taken); } catch { /* ignore */ } }

            return (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === "user" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-[#161b22] border border-[#30363d] text-[#c9d1d9] rounded-bl-sm"}`}>
                  {msg.role === "agent" && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-indigo-400">{agent?.name}</span>
                      {msg.provider && <span className="text-[8px] px-1.5 py-0.5 bg-[#21262d] text-[#484f58] rounded-full">{msg.provider}</span>}
                    </div>
                  )}
                  <div className="text-sm" dangerouslySetInnerHTML={{ __html: msg.role === "agent" ? renderMarkdown(msg.message) : msg.message.replace(/\n/g, "<br/>") }} />

                  {parsedAction?.skill && (
                    <div className="mt-2 pt-2 border-t border-[#30363d]">
                      <p className="text-[10px] text-emerald-400">Executed: {parsedAction.skill}</p>
                      {parsedAction.result && <p className="text-[10px] text-[#8b949e] mt-0.5">{parsedAction.result.slice(0, 200)}</p>}
                    </div>
                  )}
                  {parsedAction?.delegations?.map((del, i) => (
                    <div key={i} className="mt-2 pt-2 border-t border-[#30363d] bg-[#0d1117] rounded-lg p-2">
                      <div className="text-[10px] font-bold text-amber-400">Delegated to {del.agent.replace("agent-", "")}</div>
                      <p className="text-[10px] text-[#8b949e]">{del.response.slice(0, 150)}</p>
                    </div>
                  ))}

                  <div className="flex items-center justify-between mt-1.5">
                    <span className={`text-[9px] ${msg.role === "user" ? "text-indigo-200" : "text-[#484f58]"}`}>{new Date(msg.created_at).toLocaleTimeString()}</span>
                    {msg.role === "agent" && msg.id && !msg.id.startsWith("a-") && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => giveFeedback(msg.id, 1)} className={`text-[10px] px-1 rounded ${msg.feedback === 1 ? "text-emerald-400" : "text-[#484f58] hover:text-emerald-400"}`}>👍</button>
                        <button onClick={() => giveFeedback(msg.id, -1)} className={`text-[10px] px-1 rounded ${msg.feedback === -1 ? "text-red-400" : "text-[#484f58] hover:text-red-400"}`}>👎</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Suggested follow-ups */}
        {followups.length > 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {followups.map((f, i) => (
              <button key={i} onClick={() => send(f)} className="text-[11px] px-3 py-1.5 bg-[#161b22] border border-[#30363d] text-[#8b949e] rounded-full hover:border-indigo-500 hover:text-indigo-400 transition-colors">
                {f}
              </button>
            ))}
          </div>
        )}

        {/* Regenerate button */}
        {messages.length > 0 && messages[messages.length - 1]?.role === "agent" && (
          <div className="px-4 pb-1">
            <button onClick={regenerate} disabled={sending} className="text-[10px] text-[#484f58] hover:text-[#8b949e] disabled:opacity-30">
              ↻ Regenerate response
            </button>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-[#30363d] px-4 py-3 shrink-0">
          <div className="flex gap-2">
            <button onClick={toggleVoice} className={`p-2.5 rounded-xl border transition-colors ${listening ? "bg-red-600 border-red-500 text-white" : "border-[#30363d] text-[#484f58] hover:text-[#8b949e] hover:bg-[#21262d]"}`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="5" y="1" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M3 6c0 2.2 1.8 4 4 4s4-1.8 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M7 10v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder={`Message ${agent?.name || "agent"}...`}
              disabled={sending}
              className="flex-1 px-4 py-2.5 bg-[#161b22] border border-[#30363d] rounded-xl text-sm text-[#e2e8f0] placeholder-[#484f58] focus:outline-none focus:border-indigo-500"
            />
            <button onClick={() => send()} disabled={sending || !input.trim()} className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-30 transition-colors">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
