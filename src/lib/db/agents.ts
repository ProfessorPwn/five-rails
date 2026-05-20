// ─── Agent Tasks, Checkout, Comments, Run Audit ──────────────────────────────
// Extracted from db/index.ts during P1-3 refactor. Domain: kanban tasks,
// task checkout locking (Paperclip pattern), comment threads, run audit trail.

import { v4 as uuidv4 } from "uuid";
import { getDb } from "./core";

// ─── Agent Tasks (Kanban) ────────────────────────────────────────────────────

export interface AgentTask {
  id: string;
  name: string;
  description: string | null;
  status: 'idle' | 'queued' | 'working' | 'blocked' | 'done';
  agent_id: string;
  skill_id: string | null;
  progress_pct: number;
  current_step_label: string | null;
  blocker_reason: string | null;
  delegated_by: string | null;
  depends_on: string;
  started_at: string | null;
  completed_at: string | null;
  output_ref: string | null;
  created_at: string;
  checked_out_by: string | null;
  checked_out_at: string | null;
  run_id: string | null;
}

export interface AgentTaskWithAgent extends AgentTask {
  agent_name: string;
  department: string;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  idle: ['queued'],
  queued: ['working', 'idle'],           // Allow cancel back to idle
  working: ['blocked', 'done', 'queued'], // Allow re-queue stuck tasks
  blocked: ['queued', 'done'],            // Allow force-complete blocked tasks
  done: ['idle', 'queued'],               // Allow re-queue from done
};

export function getAgentTasks(agentId?: string, status?: string): AgentTaskWithAgent[] {
  let query = `SELECT t.*, a.name as agent_name, a.department FROM agent_tasks t JOIN agents a ON t.agent_id = a.id WHERE 1=1`;
  const params: unknown[] = [];
  if (agentId) { query += ' AND t.agent_id = ?'; params.push(agentId); }
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  query += ' ORDER BY t.created_at DESC';
  return getDb().prepare(query).all(...params) as AgentTaskWithAgent[];
}

export function createAgentTask(data: {
  name: string;
  description?: string;
  agent_id: string;
  skill_id?: string;
  status?: AgentTask['status'];
  delegated_by?: string;
}): AgentTask {
  const id = uuidv4();
  const status = data.status || 'queued';
  const startedAt = status === 'working' ? new Date().toISOString() : null;
  getDb().prepare(`
    INSERT INTO agent_tasks (id, name, description, status, agent_id, skill_id, delegated_by, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.description ?? null, status, data.agent_id, data.skill_id ?? null, data.delegated_by ?? null, startedAt);
  return getDb().prepare('SELECT * FROM agent_tasks WHERE id = ?').get(id) as AgentTask;
}

export function updateAgentTaskStatus(
  taskId: string,
  newStatus: AgentTask['status'],
  extras?: {
    current_step_label?: string;
    progress_pct?: number;
    blocker_reason?: string;
    output_ref?: string;
  }
): { success: boolean; task?: AgentTask; error?: string } {
  const task = getDb().prepare('SELECT * FROM agent_tasks WHERE id = ?').get(taskId) as AgentTask | undefined;
  if (!task) return { success: false, error: 'Task not found' };

  const allowed = VALID_TRANSITIONS[task.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return { success: false, error: `Invalid transition: ${task.status} -> ${newStatus}. Allowed: ${allowed?.join(', ') || 'none'}` };
  }

  const fields: string[] = ['status = ?'];
  const values: unknown[] = [newStatus];

  if (newStatus === 'working' && !task.started_at) {
    fields.push('started_at = ?');
    values.push(new Date().toISOString());
  }
  if (newStatus === 'done') {
    fields.push('completed_at = ?');
    values.push(new Date().toISOString());
  }
  if (newStatus === 'queued' || newStatus === 'idle') {
    fields.push('blocker_reason = NULL');
  }

  if (extras?.current_step_label !== undefined) { fields.push('current_step_label = ?'); values.push(extras.current_step_label); }
  if (extras?.progress_pct !== undefined) { fields.push('progress_pct = ?'); values.push(extras.progress_pct); }
  if (extras?.blocker_reason !== undefined) { fields.push('blocker_reason = ?'); values.push(extras.blocker_reason); }
  if (extras?.output_ref !== undefined) { fields.push('output_ref = ?'); values.push(extras.output_ref); }

  values.push(taskId);
  getDb().prepare(`UPDATE agent_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  // Create transition record
  const transId = uuidv4();
  getDb().prepare(
    'INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)'
  ).run(transId, taskId, task.status, newStatus);

  return { success: true, task: getDb().prepare('SELECT * FROM agent_tasks WHERE id = ?').get(taskId) as AgentTask };
}

export function updateAgentTaskProgress(
  taskId: string,
  extras: {
    current_step_label?: string;
    progress_pct?: number;
    blocker_reason?: string;
    output_ref?: string;
  }
): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (extras.current_step_label !== undefined) { fields.push('current_step_label = ?'); values.push(extras.current_step_label); }
  if (extras.progress_pct !== undefined) { fields.push('progress_pct = ?'); values.push(extras.progress_pct); }
  if (extras.blocker_reason !== undefined) { fields.push('blocker_reason = ?'); values.push(extras.blocker_reason); }
  if (extras.output_ref !== undefined) { fields.push('output_ref = ?'); values.push(extras.output_ref); }
  if (fields.length === 0) return;
  values.push(taskId);
  getDb().prepare(`UPDATE agent_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getAgentTaskBoard(): Record<string, AgentTaskWithAgent[]> {
  const tasks = getDb().prepare(`
    SELECT t.*, a.name as agent_name, a.department
    FROM agent_tasks t
    JOIN agents a ON t.agent_id = a.id
    ORDER BY t.created_at DESC
  `).all() as AgentTaskWithAgent[];

  const board: Record<string, AgentTaskWithAgent[]> = {
    idle: [],
    queued: [],
    working: [],
    blocked: [],
    done: [],
  };

  for (const task of tasks) {
    if (board[task.status]) {
      board[task.status].push(task);
    }
  }

  return board;
}

// ─── Task Checkout Locking (Paperclip pattern) ───────────────────────────────

export function checkoutTask(taskId: string, agentId: string, runId: string): { success: boolean; error?: string } {
  const task = getDb().prepare('SELECT * FROM agent_tasks WHERE id = ?').get(taskId) as AgentTask | undefined;
  if (!task) return { success: false, error: 'Task not found' };

  // Already checked out by another agent
  if (task.checked_out_by && task.checked_out_by !== agentId) {
    return { success: false, error: `Task checked out by ${task.checked_out_by}` };
  }

  // Already checked out by this agent (idempotent)
  if (task.checked_out_by === agentId) return { success: true };

  getDb().prepare(
    'UPDATE agent_tasks SET checked_out_by = ?, checked_out_at = datetime(\'now\'), run_id = ? WHERE id = ?'
  ).run(agentId, runId, taskId);

  addTaskComment(taskId, agentId, `Checked out task for run ${runId}`, 'system', runId);
  return { success: true };
}

export function releaseTask(taskId: string, agentId: string): void {
  getDb().prepare(
    'UPDATE agent_tasks SET checked_out_by = NULL, checked_out_at = NULL WHERE id = ? AND checked_out_by = ?'
  ).run(taskId, agentId);
}

// ─── Task Comments (agent discussion threads) ───────────────────────────────

export interface TaskComment {
  id: string;
  task_id: string;
  agent_id: string | null;
  agent_name?: string;
  author_type: 'agent' | 'system' | 'user';
  message: string;
  run_id: string | null;
  created_at: string;
}

export function addTaskComment(
  taskId: string, agentId: string | null, message: string,
  authorType: 'agent' | 'system' | 'user' = 'agent', runId?: string
): TaskComment {
  const id = uuidv4();
  getDb().prepare(
    'INSERT INTO agent_task_comments (id, task_id, agent_id, author_type, message, run_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, taskId, agentId, authorType, message, runId || null);
  return getDb().prepare('SELECT * FROM agent_task_comments WHERE id = ?').get(id) as TaskComment;
}

export function getTaskComments(taskId: string, limit = 50): TaskComment[] {
  return getDb().prepare(`
    SELECT c.*, a.name as agent_name
    FROM agent_task_comments c
    LEFT JOIN agents a ON c.agent_id = a.id
    WHERE c.task_id = ?
    ORDER BY c.created_at DESC
    LIMIT ?
  `).all(taskId, limit) as TaskComment[];
}

// ─── Agent Run Audit Trail ───────────────────────────────────────────────────

export interface AgentRun {
  id: string;
  agent_id: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  started_at: string;
  completed_at: string | null;
  decision_id: string | null;
  task_id: string | null;
  skill_used: string | null;
  action_taken: string | null;
  delegations: string;
  error: string | null;
  duration_ms: number | null;
}

export function startAgentRun(agentId: string): AgentRun {
  const id = uuidv4();
  getDb().prepare(
    'INSERT INTO agent_runs (id, agent_id, status) VALUES (?, ?, \'running\')'
  ).run(id, agentId);
  return getDb().prepare('SELECT * FROM agent_runs WHERE id = ?').get(id) as AgentRun;
}

export function completeAgentRun(
  runId: string,
  data: {
    status: 'completed' | 'failed' | 'timeout';
    decision_id?: string;
    task_id?: string;
    skill_used?: string;
    action_taken?: string;
    delegations?: string[];
    error?: string;
  }
): void {
  const run = getDb().prepare('SELECT started_at FROM agent_runs WHERE id = ?').get(runId) as { started_at: string } | undefined;
  const durationMs = run ? Date.now() - new Date(run.started_at).getTime() : null;

  getDb().prepare(`
    UPDATE agent_runs SET status = ?, completed_at = datetime('now'), decision_id = ?,
    task_id = ?, skill_used = ?, action_taken = ?, delegations = ?, error = ?, duration_ms = ?
    WHERE id = ?
  `).run(
    data.status, data.decision_id || null, data.task_id || null,
    data.skill_used || null, data.action_taken || null,
    JSON.stringify(data.delegations || []), data.error || null,
    durationMs, runId
  );
}

export function getAgentRuns(agentId: string, limit = 20): AgentRun[] {
  return getDb().prepare(
    'SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?'
  ).all(agentId, limit) as AgentRun[];
}


