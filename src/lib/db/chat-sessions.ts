// ─── Chat Sessions + Agent Conversations ────────────────────────────────────
// Shared helpers for the 3 hot paths that all touch these two tables:
//   - src/lib/agents/orchestrator.ts
//   - src/app/api/agents/[id]/chat/route.ts
//   - src/app/api/agents/[id]/run/route.ts
// Before: each path inlined the same 4–6 SQL strings. After: one helper,
// one query per operation, and changing the schema means updating one file.

import { v4 as uuidv4 } from "uuid";
import { getDb } from "./core";

export interface ChatSession {
  id: string;
  agent_id: string;
  title: string;
  is_active: number;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface AgentConversationRow {
  id: string;
  agent_id: string;
  session_id: string | null;
  role: "user" | "agent";
  message: string;
  action_taken: string | null;
  feedback: number | null;
  created_at: string;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export function createChatSession(agentId: string, title: string): string {
  const id = uuidv4();
  getDb().prepare("INSERT INTO chat_sessions (id, agent_id, title) VALUES (?, ?, ?)").run(id, agentId, title);
  return id;
}

// One persistent session per (agent, Telegram chat). Lets the Telegram
// poller pass session_id to the chat endpoint so the orchestrator can
// load conversation history and the agent doesn't lose context between
// messages. The chat_id is stored as TEXT (Telegram IDs can be 64-bit
// integers and JS number precision is iffy past 2^53).
export function getOrCreateSessionForTelegram(agentId: string, chatId: string | number): string {
  const cid = String(chatId);
  const row = getDb().prepare(
    "SELECT id FROM chat_sessions WHERE agent_id = ? AND telegram_chat_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(agentId, cid) as { id: string } | undefined;
  if (row) return row.id;
  const id = uuidv4();
  getDb().prepare(
    "INSERT INTO chat_sessions (id, agent_id, title, telegram_chat_id) VALUES (?, ?, ?, ?)"
  ).run(id, agentId, `Telegram chat ${cid}`, cid);
  return id;
}

export function listSessions(agentId: string): Array<ChatSession & { first_message: string | null }> {
  return getDb().prepare(
    "SELECT cs.*, (SELECT message FROM agent_conversations WHERE session_id = cs.id ORDER BY created_at ASC LIMIT 1) as first_message FROM chat_sessions cs WHERE cs.agent_id = ? ORDER BY cs.updated_at DESC"
  ).all(agentId) as Array<ChatSession & { first_message: string | null }>;
}

export function getSessionMessages(agentId: string, sessionId: string): AgentConversationRow[] {
  return getDb().prepare(
    "SELECT * FROM agent_conversations WHERE agent_id = ? AND session_id = ? ORDER BY created_at ASC"
  ).all(agentId, sessionId) as AgentConversationRow[];
}

export function bumpSessionActivity(sessionId: string, messagesAdded = 2): void {
  getDb().prepare(
    "UPDATE chat_sessions SET message_count = message_count + ?, updated_at = datetime('now') WHERE id = ?"
  ).run(messagesAdded, sessionId);
}

// ── Conversation turns ──────────────────────────────────────────────────────

export function recordUserTurn(opts: { agentId: string; sessionId: string; message: string }): string {
  const id = uuidv4();
  getDb().prepare(
    "INSERT INTO agent_conversations (id, agent_id, session_id, role, message) VALUES (?, ?, ?, 'user', ?)"
  ).run(id, opts.agentId, opts.sessionId, opts.message);
  return id;
}

export function recordAgentTurn(opts: {
  agentId: string;
  sessionId: string;
  message: string;
  actionTaken?: Record<string, unknown>;
}): string {
  const id = uuidv4();
  const actionJson = opts.actionTaken && Object.keys(opts.actionTaken).length > 0
    ? JSON.stringify(opts.actionTaken)
    : null;
  getDb().prepare(
    "INSERT INTO agent_conversations (id, agent_id, session_id, role, message, action_taken) VALUES (?, ?, ?, 'agent', ?, ?)"
  ).run(id, opts.agentId, opts.sessionId, opts.message, actionJson);
  return id;
}

export function getRecentHistory(agentId: string, sessionId: string, limit = 20): Array<{ role: string; message: string }> {
  const rows = getDb().prepare(
    "SELECT role, message FROM agent_conversations WHERE agent_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(agentId, sessionId, limit) as Array<{ role: string; message: string }>;
  return rows.reverse();
}

export function deleteLastAgentTurn(agentId: string, sessionId: string): boolean {
  const row = getDb().prepare(
    "SELECT id FROM agent_conversations WHERE agent_id = ? AND session_id = ? AND role = 'agent' ORDER BY created_at DESC LIMIT 1"
  ).get(agentId, sessionId) as { id: string } | undefined;
  if (!row) return false;
  getDb().prepare("DELETE FROM agent_conversations WHERE id = ?").run(row.id);
  return true;
}

export function getLastUserMessage(agentId: string, sessionId: string): string | null {
  const row = getDb().prepare(
    "SELECT message FROM agent_conversations WHERE agent_id = ? AND session_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1"
  ).get(agentId, sessionId) as { message: string } | undefined;
  return row?.message ?? null;
}

export function setTurnFeedback(messageId: string, value: number): void {
  getDb().prepare("UPDATE agent_conversations SET feedback = ? WHERE id = ?").run(value, messageId);
}

export function updateAgentMemory(agentId: string, memory: Record<string, unknown>): void {
  getDb().prepare("UPDATE agents SET memory = ? WHERE id = ?").run(JSON.stringify(memory), agentId);
}
