import { v4 as uuidv4 } from 'uuid';
import { getDb } from './schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: 'idea' | 'active' | 'shipped' | 'archived';
  niche: string | null;
  target_audience: string | null;
  score: number;
  rail_status: string;
  created_at: string;
  updated_at: string;
}

export interface MarketInsight {
  id: string;
  title: string;
  description: string | null;
  source: string | null;
  pain_point: string | null;
  solution: string | null;
  score: number;
  category: string | null;
  project_id: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  priority: number;
  rail: string | null;
  assigned_skill: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ActivityEntry {
  id: string;
  project_id: string | null;
  action: string;
  details: string | null;
  rail: string | null;
  skill_used: string | null;
  created_at: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  rail: string | null;
  sub_agents: string;
  prompt_template: string | null;
  is_active: number;
}

export interface Connection {
  id: string;
  provider: 'openai' | 'anthropic' | 'ollama' | 'perplexity' | 'exa' | 'firecrawl';
  api_key_encrypted: string | null;
  base_url: string | null;
  model: string | null;
  is_active: number;
  created_at: string;
}

export interface ContentPiece {
  id: string;
  project_id: string;
  type: 'post' | 'email' | 'script' | 'lead_magnet' | 'landing_page';
  title: string;
  content: string | null;
  platform: string | null;
  status: 'draft' | 'scheduled' | 'published';
  scheduled_at: string | null;
  created_at: string;
}

export interface OutboundContact {
  id: string;
  project_id: string;
  name: string;
  email: string | null;
  company: string | null;
  role: string | null;
  status: 'lead' | 'contacted' | 'replied' | 'converted';
  sequence_step: number;
  notes: string | null;
  created_at: string;
}

export interface FileRecord {
  id: string;
  project_id: string;
  name: string;
  path: string | null;
  type: string | null;
  content: string | null;
  created_at: string;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export function getProjects(): Project[] {
  return getDb().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Project[];
}

export function getProject(id: string): Project | undefined {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
}

export function createProject(data: {
  name: string;
  description?: string;
  status?: Project['status'];
  niche?: string;
  target_audience?: string;
  score?: number;
  rail_status?: Record<string, unknown>;
}): Project {
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO projects (id, name, description, status, niche, target_audience, score, rail_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description ?? null,
    data.status ?? 'idea',
    data.niche ?? null,
    data.target_audience ?? null,
    data.score ?? 0,
    JSON.stringify(data.rail_status ?? {}),
    now,
    now,
  );
  return getProject(id)!;
}

export function updateProject(id: string, data: Partial<{
  name: string;
  description: string;
  status: Project['status'];
  niche: string;
  target_audience: string;
  score: number;
  rail_status: Record<string, unknown>;
}>): Project | undefined {
  const existing = getProject(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.niche !== undefined) { fields.push('niche = ?'); values.push(data.niche); }
  if (data.target_audience !== undefined) { fields.push('target_audience = ?'); values.push(data.target_audience); }
  if (data.score !== undefined) { fields.push('score = ?'); values.push(data.score); }
  if (data.rail_status !== undefined) { fields.push('rail_status = ?'); values.push(JSON.stringify(data.rail_status)); }

  if (fields.length === 0) return existing;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  getDb().prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getProject(id);
}

export function deleteProject(id: string): boolean {
  const result = getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}

// ─── Market Insights ──────────────────────────────────────────────────────────

export function getInsights(): MarketInsight[] {
  return getDb().prepare('SELECT * FROM market_insights ORDER BY created_at DESC').all() as MarketInsight[];
}

export function createInsight(data: {
  title: string;
  description?: string;
  source?: string;
  pain_point?: string;
  solution?: string;
  score?: number;
  category?: string;
  project_id?: string;
}): MarketInsight {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO market_insights (id, title, description, source, pain_point, solution, score, category, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title,
    data.description ?? null,
    data.source ?? null,
    data.pain_point ?? null,
    data.solution ?? null,
    data.score ?? 0,
    data.category ?? null,
    data.project_id ?? null,
  );
  return getDb().prepare('SELECT * FROM market_insights WHERE id = ?').get(id) as MarketInsight;
}

export function attachInsightToProject(insightId: string, projectId: string): boolean {
  const result = getDb().prepare('UPDATE market_insights SET project_id = ? WHERE id = ?').run(projectId, insightId);
  return result.changes > 0;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export function getTasks(): Task[] {
  return getDb().prepare('SELECT * FROM tasks ORDER BY priority DESC, created_at DESC').all() as Task[];
}

export function getTasksByProject(projectId: string): Task[] {
  return getDb().prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY priority DESC, created_at DESC').all(projectId) as Task[];
}

export function createTask(data: {
  project_id: string;
  title: string;
  description?: string;
  status?: Task['status'];
  priority?: number;
  rail?: string;
  assigned_skill?: string;
}): Task {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO tasks (id, project_id, title, description, status, priority, rail, assigned_skill)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.project_id,
    data.title,
    data.description ?? null,
    data.status ?? 'pending',
    data.priority ?? 0,
    data.rail ?? null,
    data.assigned_skill ?? null,
  );
  return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
}

export function updateTask(id: string, data: Partial<{
  title: string;
  description: string;
  status: Task['status'];
  priority: number;
  rail: string;
  assigned_skill: string;
  completed_at: string;
}>): Task | undefined {
  const existing = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.status !== undefined) {
    fields.push('status = ?');
    values.push(data.status);
    if (data.status === 'completed' && !data.completed_at) {
      fields.push("completed_at = datetime('now')");
    }
  }
  if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
  if (data.rail !== undefined) { fields.push('rail = ?'); values.push(data.rail); }
  if (data.assigned_skill !== undefined) { fields.push('assigned_skill = ?'); values.push(data.assigned_skill); }
  if (data.completed_at !== undefined) { fields.push('completed_at = ?'); values.push(data.completed_at); }

  if (fields.length === 0) return existing;

  values.push(id);
  getDb().prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

export function getActivity(limit: number = 50): ActivityEntry[] {
  return getDb().prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit) as ActivityEntry[];
}

export function getProjectActivity(projectId: string, limit: number = 50): ActivityEntry[] {
  return getDb().prepare('SELECT * FROM activity_log WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(projectId, limit) as ActivityEntry[];
}

export function logActivity(data: {
  project_id?: string;
  action: string;
  details?: string;
  rail?: string;
  skill_used?: string;
}): ActivityEntry {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO activity_log (id, project_id, action, details, rail, skill_used)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.project_id ?? null,
    data.action,
    data.details ?? null,
    data.rail ?? null,
    data.skill_used ?? null,
  );
  return getDb().prepare('SELECT * FROM activity_log WHERE id = ?').get(id) as ActivityEntry;
}

// ─── Skills ───────────────────────────────────────────────────────────────────

export function getSkills(): Skill[] {
  return getDb().prepare('SELECT * FROM skills ORDER BY rail, name').all() as Skill[];
}

export function getSkill(id: string): Skill | undefined {
  return getDb().prepare('SELECT * FROM skills WHERE id = ?').get(id) as Skill | undefined;
}

export function getActiveSkills(): Skill[] {
  return getDb().prepare('SELECT * FROM skills WHERE is_active = 1 ORDER BY rail, name').all() as Skill[];
}

// ─── Connections ──────────────────────────────────────────────────────────────

export function getConnections(): Connection[] {
  return getDb().prepare('SELECT * FROM connections ORDER BY created_at DESC').all() as Connection[];
}

export function createConnection(data: {
  provider: Connection['provider'];
  api_key_encrypted?: string;
  base_url?: string;
  model?: string;
  is_active?: boolean;
}): Connection {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO connections (id, provider, api_key_encrypted, base_url, model, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.provider,
    data.api_key_encrypted ?? null,
    data.base_url ?? null,
    data.model ?? null,
    data.is_active !== false ? 1 : 0,
  );
  return getDb().prepare('SELECT * FROM connections WHERE id = ?').get(id) as Connection;
}

export function updateConnection(id: string, data: Partial<{
  provider: Connection['provider'];
  api_key_encrypted: string;
  base_url: string;
  model: string;
  is_active: boolean;
}>): Connection | undefined {
  const existing = getDb().prepare('SELECT * FROM connections WHERE id = ?').get(id) as Connection | undefined;
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.provider !== undefined) { fields.push('provider = ?'); values.push(data.provider); }
  if (data.api_key_encrypted !== undefined) { fields.push('api_key_encrypted = ?'); values.push(data.api_key_encrypted); }
  if (data.base_url !== undefined) { fields.push('base_url = ?'); values.push(data.base_url); }
  if (data.model !== undefined) { fields.push('model = ?'); values.push(data.model); }
  if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active ? 1 : 0); }

  if (fields.length === 0) return existing;

  values.push(id);
  getDb().prepare(`UPDATE connections SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getDb().prepare('SELECT * FROM connections WHERE id = ?').get(id) as Connection;
}

export function deleteConnection(id: string): boolean {
  const result = getDb().prepare('DELETE FROM connections WHERE id = ?').run(id);
  return result.changes > 0;
}

// ─── Content Pieces ───────────────────────────────────────────────────────────

export function getContent(): ContentPiece[] {
  return getDb().prepare('SELECT * FROM content_pieces ORDER BY created_at DESC').all() as ContentPiece[];
}

export function getProjectContent(projectId: string): ContentPiece[] {
  return getDb().prepare('SELECT * FROM content_pieces WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as ContentPiece[];
}

export function createContent(data: {
  project_id?: string;
  type: ContentPiece['type'];
  title: string;
  content?: string;
  platform?: string;
  status?: ContentPiece['status'];
  scheduled_at?: string;
}): ContentPiece {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO content_pieces (id, project_id, type, title, content, platform, status, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.project_id || null,
    data.type,
    data.title,
    data.content ?? null,
    data.platform ?? null,
    data.status ?? 'draft',
    data.scheduled_at ?? null,
  );
  return getDb().prepare('SELECT * FROM content_pieces WHERE id = ?').get(id) as ContentPiece;
}

export function updateContent(id: string, data: Partial<{
  type: ContentPiece['type'];
  title: string;
  content: string;
  platform: string;
  status: ContentPiece['status'];
  scheduled_at: string;
}>): ContentPiece | undefined {
  const existing = getDb().prepare('SELECT * FROM content_pieces WHERE id = ?').get(id) as ContentPiece | undefined;
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
  if (data.platform !== undefined) { fields.push('platform = ?'); values.push(data.platform); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.scheduled_at !== undefined) { fields.push('scheduled_at = ?'); values.push(data.scheduled_at); }

  if (fields.length === 0) return existing;

  values.push(id);
  getDb().prepare(`UPDATE content_pieces SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getDb().prepare('SELECT * FROM content_pieces WHERE id = ?').get(id) as ContentPiece;
}

// ─── Outbound Contacts ────────────────────────────────────────────────────────

export function getContacts(): OutboundContact[] {
  return getDb().prepare('SELECT * FROM outbound_contacts ORDER BY created_at DESC').all() as OutboundContact[];
}

export function getProjectContacts(projectId: string): OutboundContact[] {
  return getDb().prepare('SELECT * FROM outbound_contacts WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as OutboundContact[];
}

export function createContact(data: {
  project_id?: string;
  name: string;
  email?: string;
  company?: string;
  role?: string;
  status?: OutboundContact['status'];
  sequence_step?: number;
  notes?: string;
}): OutboundContact {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO outbound_contacts (id, project_id, name, email, company, role, status, sequence_step, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.project_id || null,
    data.name,
    data.email ?? null,
    data.company ?? null,
    data.role ?? null,
    data.status ?? 'lead',
    data.sequence_step ?? 0,
    data.notes ?? null,
  );
  return getDb().prepare('SELECT * FROM outbound_contacts WHERE id = ?').get(id) as OutboundContact;
}

export function updateContact(id: string, data: Partial<{
  name: string;
  email: string;
  company: string;
  role: string;
  status: OutboundContact['status'];
  sequence_step: number;
  notes: string;
}>): OutboundContact | undefined {
  const existing = getDb().prepare('SELECT * FROM outbound_contacts WHERE id = ?').get(id) as OutboundContact | undefined;
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
  if (data.company !== undefined) { fields.push('company = ?'); values.push(data.company); }
  if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.sequence_step !== undefined) { fields.push('sequence_step = ?'); values.push(data.sequence_step); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }

  if (fields.length === 0) return existing;

  values.push(id);
  getDb().prepare(`UPDATE outbound_contacts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getDb().prepare('SELECT * FROM outbound_contacts WHERE id = ?').get(id) as OutboundContact;
}

// ─── Files ────────────────────────────────────────────────────────────────────

export function getFiles(): FileRecord[] {
  return getDb().prepare('SELECT * FROM files ORDER BY created_at DESC').all() as FileRecord[];
}

export function getProjectFiles(projectId: string): FileRecord[] {
  return getDb().prepare('SELECT * FROM files WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as FileRecord[];
}

export function createFile(data: {
  project_id: string;
  name: string;
  path?: string;
  type?: string;
  content?: string;
}): FileRecord {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO files (id, project_id, name, path, type, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.project_id,
    data.name,
    data.path ?? null,
    data.type ?? null,
    data.content ?? null,
  );
  return getDb().prepare('SELECT * FROM files WHERE id = ?').get(id) as FileRecord;
}
