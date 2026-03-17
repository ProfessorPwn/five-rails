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
  action_plan: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionPlanStep {
  id: string;
  label: string;
  desc: string;
  actionType: 'define-niche' | 'define-offer' | 'add-contacts' | 'skill';
  skillId?: string;
  skillName?: string;
  promptContext?: string;
  badge: string;
  badgeVariant: 'default' | 'info' | 'warning' | 'rose' | 'amber';
  saveAs?: 'insight' | 'landing_page' | 'email' | 'post' | 'lead_magnet' | 'script';
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
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  scheduled_at: string | null;
  published_url: string | null;
  published_at: string | null;
  created_at: string;
}

export interface PlatformConnection {
  id: string;
  platform: 'twitter' | 'linkedin' | 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'email';
  label: string | null;
  api_key: string | null;
  api_secret: string | null;
  access_token: string | null;
  access_token_secret: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  account_id: string | null;
  username: string | null;
  profile_image: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  from_email: string | null;
  is_active: number;
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

export interface Newsletter {
  id: string;
  project_id: string | null;
  title: string;
  subject: string | null;
  content: string | null;
  status: 'draft' | 'generating' | 'ready' | 'sent';
  newsletter_type: 'weekly' | 'monthly' | 'roundup' | 'announcement' | 'educational' | 'promotional';
  recipients: string | null;
  sent_at: string | null;
  sent_count: number;
  created_at: string;
  updated_at: string;
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

// ─── Action Plan ──────────────────────────────────────────────────────────────

export function saveProjectPlan(projectId: string, plan: ActionPlanStep[]): void {
  getDb().prepare('UPDATE projects SET action_plan = ?, updated_at = datetime(\'now\') WHERE id = ?').run(JSON.stringify(plan), projectId);
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

export function getProjectInsights(projectId: string): MarketInsight[] {
  return getDb().prepare('SELECT * FROM market_insights WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as MarketInsight[];
}

// ─── Market Insight Update/Delete ────────────────────────────────────────────

export function updateInsight(id: string, data: Partial<{
  title: string;
  description: string;
  source: string;
  pain_point: string;
  solution: string;
  score: number;
  category: string;
  project_id: string;
}>): MarketInsight | undefined {
  const existing = getDb().prepare('SELECT * FROM market_insights WHERE id = ?').get(id) as MarketInsight | undefined;
  if (!existing) return undefined;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.source !== undefined) { fields.push('source = ?'); values.push(data.source); }
  if (data.pain_point !== undefined) { fields.push('pain_point = ?'); values.push(data.pain_point); }
  if (data.solution !== undefined) { fields.push('solution = ?'); values.push(data.solution); }
  if (data.score !== undefined) { fields.push('score = ?'); values.push(data.score); }
  if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
  if (data.project_id !== undefined) { fields.push('project_id = ?'); values.push(data.project_id); }
  if (fields.length === 0) return existing;
  values.push(id);
  getDb().prepare(`UPDATE market_insights SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getDb().prepare('SELECT * FROM market_insights WHERE id = ?').get(id) as MarketInsight;
}

export function deleteInsight(id: string): boolean {
  const result = getDb().prepare('DELETE FROM market_insights WHERE id = ?').run(id);
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

export function deleteTask(id: string): boolean {
  const result = getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
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
  project_id: string;
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
  if (data.project_id !== undefined) { fields.push('project_id = ?'); values.push(data.project_id); }

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

export function deleteContact(id: string): boolean {
  const result = getDb().prepare('DELETE FROM outbound_contacts WHERE id = ?').run(id);
  return result.changes > 0;
}

// ─── Content Deletion ────────────────────────────────────────────────────────

export function deleteContent(id: string): boolean {
  const result = getDb().prepare('DELETE FROM content_pieces WHERE id = ?').run(id);
  return result.changes > 0;
}

// ─── Platform Connections ────────────────────────────────────────────────────

export function getPlatformConnections(): PlatformConnection[] {
  return getDb().prepare('SELECT * FROM platform_connections ORDER BY created_at DESC').all() as PlatformConnection[];
}

export function getPlatformConnection(id: string): PlatformConnection | undefined {
  return getDb().prepare('SELECT * FROM platform_connections WHERE id = ?').get(id) as PlatformConnection | undefined;
}

export function getActivePlatformConnection(platform: string): PlatformConnection | undefined {
  return getDb().prepare('SELECT * FROM platform_connections WHERE platform = ? AND is_active = 1 LIMIT 1').get(platform) as PlatformConnection | undefined;
}

export function createPlatformConnection(data: {
  platform: PlatformConnection['platform'];
  label?: string;
  api_key?: string;
  api_secret?: string;
  access_token?: string;
  access_token_secret?: string;
  refresh_token?: string;
  token_expires_at?: string;
  account_id?: string;
  username?: string;
  profile_image?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  from_email?: string;
  is_active?: boolean;
}): PlatformConnection {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO platform_connections (id, platform, label, api_key, api_secret, access_token, access_token_secret, refresh_token, token_expires_at, account_id, username, profile_image, smtp_host, smtp_port, smtp_user, smtp_pass, from_email, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.platform,
    data.label ?? null,
    data.api_key ?? null,
    data.api_secret ?? null,
    data.access_token ?? null,
    data.access_token_secret ?? null,
    data.refresh_token ?? null,
    data.token_expires_at ?? null,
    data.account_id ?? null,
    data.username ?? null,
    data.profile_image ?? null,
    data.smtp_host ?? null,
    data.smtp_port ?? null,
    data.smtp_user ?? null,
    data.smtp_pass ?? null,
    data.from_email ?? null,
    data.is_active !== false ? 1 : 0,
  );
  return getDb().prepare('SELECT * FROM platform_connections WHERE id = ?').get(id) as PlatformConnection;
}

export function updatePlatformConnection(id: string, data: Partial<{
  label: string;
  api_key: string;
  api_secret: string;
  access_token: string;
  access_token_secret: string;
  refresh_token: string;
  token_expires_at: string;
  account_id: string;
  username: string;
  profile_image: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  from_email: string;
  is_active: boolean;
}>): PlatformConnection | undefined {
  const existing = getPlatformConnection(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.label !== undefined) { fields.push('label = ?'); values.push(data.label); }
  if (data.api_key !== undefined) { fields.push('api_key = ?'); values.push(data.api_key); }
  if (data.api_secret !== undefined) { fields.push('api_secret = ?'); values.push(data.api_secret); }
  if (data.access_token !== undefined) { fields.push('access_token = ?'); values.push(data.access_token); }
  if (data.access_token_secret !== undefined) { fields.push('access_token_secret = ?'); values.push(data.access_token_secret); }
  if (data.refresh_token !== undefined) { fields.push('refresh_token = ?'); values.push(data.refresh_token); }
  if (data.token_expires_at !== undefined) { fields.push('token_expires_at = ?'); values.push(data.token_expires_at); }
  if (data.account_id !== undefined) { fields.push('account_id = ?'); values.push(data.account_id); }
  if (data.username !== undefined) { fields.push('username = ?'); values.push(data.username); }
  if (data.profile_image !== undefined) { fields.push('profile_image = ?'); values.push(data.profile_image); }
  if (data.smtp_host !== undefined) { fields.push('smtp_host = ?'); values.push(data.smtp_host); }
  if (data.smtp_port !== undefined) { fields.push('smtp_port = ?'); values.push(data.smtp_port); }
  if (data.smtp_user !== undefined) { fields.push('smtp_user = ?'); values.push(data.smtp_user); }
  if (data.smtp_pass !== undefined) { fields.push('smtp_pass = ?'); values.push(data.smtp_pass); }
  if (data.from_email !== undefined) { fields.push('from_email = ?'); values.push(data.from_email); }
  if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active ? 1 : 0); }

  if (fields.length === 0) return existing;

  values.push(id);
  getDb().prepare(`UPDATE platform_connections SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getPlatformConnection(id);
}

export function deletePlatformConnection(id: string): boolean {
  const result = getDb().prepare('DELETE FROM platform_connections WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getContentPiece(id: string): ContentPiece | undefined {
  return getDb().prepare('SELECT * FROM content_pieces WHERE id = ?').get(id) as ContentPiece | undefined;
}

export function getOutboundContact(id: string): OutboundContact | undefined {
  return getDb().prepare('SELECT * FROM outbound_contacts WHERE id = ?').get(id) as OutboundContact | undefined;
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

// ─── Newsletters ──────────────────────────────────────────────────────────────

export function getNewsletters(): Newsletter[] {
  return getDb().prepare('SELECT * FROM newsletters ORDER BY created_at DESC').all() as Newsletter[];
}

export function getProjectNewsletters(projectId: string): Newsletter[] {
  return getDb().prepare('SELECT * FROM newsletters WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Newsletter[];
}

export function getNewsletter(id: string): Newsletter | undefined {
  return getDb().prepare('SELECT * FROM newsletters WHERE id = ?').get(id) as Newsletter | undefined;
}

export function createNewsletter(data: {
  project_id?: string;
  title: string;
  subject?: string;
  content?: string;
  status?: Newsletter['status'];
  newsletter_type?: Newsletter['newsletter_type'];
  recipients?: string;
}): Newsletter {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO newsletters (id, project_id, title, subject, content, status, newsletter_type, recipients)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.project_id ?? null,
    data.title,
    data.subject ?? null,
    data.content ?? null,
    data.status ?? 'draft',
    data.newsletter_type ?? 'weekly',
    data.recipients ?? null,
  );
  return getDb().prepare('SELECT * FROM newsletters WHERE id = ?').get(id) as Newsletter;
}

export function updateNewsletter(id: string, data: Partial<{
  title: string;
  subject: string;
  content: string;
  status: Newsletter['status'];
  newsletter_type: Newsletter['newsletter_type'];
  recipients: string;
  sent_at: string;
  sent_count: number;
  project_id: string | null;
}>): Newsletter | undefined {
  const existing = getNewsletter(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.subject !== undefined) { fields.push('subject = ?'); values.push(data.subject); }
  if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.newsletter_type !== undefined) { fields.push('newsletter_type = ?'); values.push(data.newsletter_type); }
  if (data.recipients !== undefined) { fields.push('recipients = ?'); values.push(data.recipients); }
  if (data.sent_at !== undefined) { fields.push('sent_at = ?'); values.push(data.sent_at); }
  if (data.sent_count !== undefined) { fields.push('sent_count = ?'); values.push(data.sent_count); }
  if (data.project_id !== undefined) { fields.push('project_id = ?'); values.push(data.project_id); }

  if (fields.length === 0) return existing;

  fields.push("updated_at = datetime('now')");
  values.push(id);
  getDb().prepare(`UPDATE newsletters SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getNewsletter(id);
}

export function deleteNewsletter(id: string): boolean {
  const result = getDb().prepare('DELETE FROM newsletters WHERE id = ?').run(id);
  return result.changes > 0;
}

// Gather all project data for newsletter generation
export function getNewsletterContext(projectId: string): {
  project: Project | undefined;
  content: ContentPiece[];
  insights: MarketInsight[];
  contacts: OutboundContact[];
  activity: ActivityEntry[];
  tasks: Task[];
  newsletters: Newsletter[];
} {
  return {
    project: getProject(projectId),
    content: getProjectContent(projectId),
    insights: getProjectInsights(projectId),
    contacts: getProjectContacts(projectId),
    activity: getProjectActivity(projectId),
    tasks: getTasksByProject(projectId),
    newsletters: getProjectNewsletters(projectId),
  };
}

// ─── IdeaBrowser ──────────────────────────────────────────────────────────────

export interface IdeaBrowserIdea {
  id: string;
  title: string;
  description: string | null;
  source_url: string | null;
  category: string | null;
  tags: string | null;
  search_volume: string | null;
  growth_rate: string | null;
  pain_level: string | null;
  feasibility: string | null;
  founder_fit: string | null;
  revenue_potential: string | null;
  execution_difficulty: string | null;
  go_to_market: string | null;
  pricing: string | null;
  target_market: string | null;
  competition: string | null;
  raw_data: string | null;
  product_urgency: string | null;
  market_gap: string | null;
  execution_plan: string | null;
  idea_date: string | null;
  search_volume_score: number;
  growth_rate_score: number;
  pain_level_score: number;
  feasibility_score: number;
  revenue_potential_score: number;
  overall_score: number;
  google_trends_data: string | null;
  sync_status: 'scraped' | 'manual' | 'modified';
  project_id: string | null;
  imported_at: string;
  updated_at: string;
}

export interface IdeaBrowserTrend {
  id: string;
  title: string;
  category: string | null;
  growth_pct: number;
  sparkline_data: string | null;
  search_volume: number;
  timeframe: string;
  source: string;
  created_at: string;
}

export interface IdeaBrowserMarketInsight {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  metric_label: string | null;
  metric_value: string | null;
  trend_direction: 'up' | 'down' | 'flat' | null;
  source: string | null;
  sparkline_data: string | null;
  created_at: string;
}

export function getIdeaBrowserIdeas(): IdeaBrowserIdea[] {
  return getDb().prepare('SELECT * FROM ideabrowser_ideas ORDER BY imported_at DESC').all() as IdeaBrowserIdea[];
}

export function getIdeaBrowserIdea(id: string): IdeaBrowserIdea | undefined {
  return getDb().prepare('SELECT * FROM ideabrowser_ideas WHERE id = ?').get(id) as IdeaBrowserIdea | undefined;
}

export function getProjectIdeaBrowserIdeas(projectId: string): IdeaBrowserIdea[] {
  return getDb().prepare('SELECT * FROM ideabrowser_ideas WHERE project_id = ? ORDER BY imported_at DESC').all(projectId) as IdeaBrowserIdea[];
}

export function createIdeaBrowserIdea(data: {
  title: string;
  description?: string;
  source_url?: string;
  category?: string;
  tags?: string;
  search_volume?: string;
  growth_rate?: string;
  pain_level?: string;
  feasibility?: string;
  founder_fit?: string;
  revenue_potential?: string;
  execution_difficulty?: string;
  go_to_market?: string;
  pricing?: string;
  target_market?: string;
  competition?: string;
  raw_data?: string;
  sync_status?: string;
  project_id?: string;
}): IdeaBrowserIdea {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO ideabrowser_ideas (id, title, description, source_url, category, tags, search_volume, growth_rate, pain_level, feasibility, founder_fit, revenue_potential, execution_difficulty, go_to_market, pricing, target_market, competition, raw_data, sync_status, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title,
    data.description || null,
    data.source_url || null,
    data.category || null,
    data.tags || null,
    data.search_volume || null,
    data.growth_rate || null,
    data.pain_level || null,
    data.feasibility || null,
    data.founder_fit || null,
    data.revenue_potential || null,
    data.execution_difficulty || null,
    data.go_to_market || null,
    data.pricing || null,
    data.target_market || null,
    data.competition || null,
    data.raw_data || null,
    data.sync_status || 'manual',
    data.project_id || null,
  );
  return getIdeaBrowserIdea(id)!;
}

export function updateIdeaBrowserIdea(id: string, data: Partial<IdeaBrowserIdea>): IdeaBrowserIdea | undefined {
  const existing = getIdeaBrowserIdea(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.source_url !== undefined) { fields.push('source_url = ?'); values.push(data.source_url); }
  if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
  if (data.tags !== undefined) { fields.push('tags = ?'); values.push(data.tags); }
  if (data.search_volume !== undefined) { fields.push('search_volume = ?'); values.push(data.search_volume); }
  if (data.growth_rate !== undefined) { fields.push('growth_rate = ?'); values.push(data.growth_rate); }
  if (data.pain_level !== undefined) { fields.push('pain_level = ?'); values.push(data.pain_level); }
  if (data.feasibility !== undefined) { fields.push('feasibility = ?'); values.push(data.feasibility); }
  if (data.founder_fit !== undefined) { fields.push('founder_fit = ?'); values.push(data.founder_fit); }
  if (data.revenue_potential !== undefined) { fields.push('revenue_potential = ?'); values.push(data.revenue_potential); }
  if (data.execution_difficulty !== undefined) { fields.push('execution_difficulty = ?'); values.push(data.execution_difficulty); }
  if (data.go_to_market !== undefined) { fields.push('go_to_market = ?'); values.push(data.go_to_market); }
  if (data.pricing !== undefined) { fields.push('pricing = ?'); values.push(data.pricing); }
  if (data.target_market !== undefined) { fields.push('target_market = ?'); values.push(data.target_market); }
  if (data.competition !== undefined) { fields.push('competition = ?'); values.push(data.competition); }
  if (data.raw_data !== undefined) { fields.push('raw_data = ?'); values.push(data.raw_data); }
  if (data.sync_status !== undefined) { fields.push('sync_status = ?'); values.push(data.sync_status); }
  if (data.project_id !== undefined) { fields.push('project_id = ?'); values.push(data.project_id); }

  if (fields.length === 0) return existing;

  fields.push("updated_at = datetime('now')");
  values.push(id);
  getDb().prepare(`UPDATE ideabrowser_ideas SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getIdeaBrowserIdea(id);
}

export function deleteIdeaBrowserIdea(id: string): boolean {
  const result = getDb().prepare('DELETE FROM ideabrowser_ideas WHERE id = ?').run(id);
  return result.changes > 0;
}

export function bulkImportIdeaBrowserIdeas(ideas: Array<{
  title: string;
  description?: string;
  source_url?: string;
  category?: string;
  tags?: string;
  search_volume?: string;
  growth_rate?: string;
  pain_level?: string;
  feasibility?: string;
  founder_fit?: string;
  revenue_potential?: string;
  execution_difficulty?: string;
  go_to_market?: string;
  pricing?: string;
  target_market?: string;
  competition?: string;
  raw_data?: string;
  sync_status?: string;
}>): { imported: IdeaBrowserIdea[]; skipped: number } {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO ideabrowser_ideas (id, title, description, source_url, category, tags, search_volume, growth_rate, pain_level, feasibility, founder_fit, revenue_potential, execution_difficulty, go_to_market, pricing, target_market, competition, raw_data, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const checkExisting = db.prepare('SELECT id FROM ideabrowser_ideas WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) LIMIT 1');

  const imported: IdeaBrowserIdea[] = [];
  let skipped = 0;

  const tx = db.transaction(() => {
    for (const idea of ideas) {
      if (!idea.title) { skipped++; continue; }
      // Deduplicate by normalized title
      const existing = checkExisting.get(idea.title);
      if (existing) { skipped++; continue; }
      const id = uuidv4();
      insert.run(
        id, idea.title, idea.description || null, idea.source_url || null,
        idea.category || null, idea.tags || null, idea.search_volume || null,
        idea.growth_rate || null, idea.pain_level || null, idea.feasibility || null,
        idea.founder_fit || null, idea.revenue_potential || null, idea.execution_difficulty || null,
        idea.go_to_market || null, idea.pricing || null, idea.target_market || null,
        idea.competition || null, idea.raw_data || null, idea.sync_status || 'scraped',
      );
      imported.push(getIdeaBrowserIdea(id)!);
    }
  });

  tx();
  return { imported, skipped };
}

export function linkIdeaToProject(ideaId: string, projectId: string): boolean {
  const result = getDb().prepare("UPDATE ideabrowser_ideas SET project_id = ?, updated_at = datetime('now') WHERE id = ?").run(projectId, ideaId);
  return result.changes > 0;
}

export function getIdeaBrowserConfig(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM ideabrowser_config').all() as { key: string; value: string }[];
  const config: Record<string, string> = {};
  for (const row of rows) config[row.key] = row.value;
  return config;
}

export function setIdeaBrowserConfig(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO ideabrowser_config (key, value) VALUES (?, ?)').run(key, value);
}

export function getIdeaBrowserIdeaCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) as cnt FROM ideabrowser_ideas').get() as { cnt: number };
  return row.cnt;
}

export function getIdeaOfTheDay(): IdeaBrowserIdea | undefined {
  // Get the most recently imported idea, or one matching today's date
  return getDb().prepare(
    `SELECT * FROM ideabrowser_ideas ORDER BY idea_date DESC, imported_at DESC LIMIT 1`
  ).get() as IdeaBrowserIdea | undefined;
}

export function getIdeaBrowserIdeasPaginated(opts: {
  page?: number;
  perPage?: number;
  search?: string;
  category?: string;
  sortBy?: string;
}): { ideas: IdeaBrowserIdea[]; total: number } {
  const page = opts.page || 1;
  const perPage = opts.perPage || 48;
  const offset = (page - 1) * perPage;

  let where = '1=1';
  const params: unknown[] = [];

  if (opts.search) {
    where += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(tags) LIKE ?)';
    const s = `%${opts.search.toLowerCase()}%`;
    params.push(s, s, s);
  }
  if (opts.category) {
    where += ' AND LOWER(category) = ?';
    params.push(opts.category.toLowerCase());
  }

  let orderBy = 'imported_at DESC';
  if (opts.sortBy === 'score') orderBy = 'overall_score DESC';
  else if (opts.sortBy === 'pain') orderBy = 'pain_level_score DESC';
  else if (opts.sortBy === 'revenue') orderBy = 'revenue_potential_score DESC';
  else if (opts.sortBy === 'newest') orderBy = 'idea_date DESC, imported_at DESC';
  else if (opts.sortBy === 'category') orderBy = 'category ASC, title ASC';

  const total = (getDb().prepare(`SELECT COUNT(*) as cnt FROM ideabrowser_ideas WHERE ${where}`).get(...params) as { cnt: number }).cnt;
  const ideas = getDb().prepare(`SELECT * FROM ideabrowser_ideas WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, perPage, offset) as IdeaBrowserIdea[];

  return { ideas, total };
}

export function getIdeaBrowserCategories(): { category: string; count: number }[] {
  return getDb().prepare(
    `SELECT category, COUNT(*) as count FROM ideabrowser_ideas WHERE category IS NOT NULL AND category != '' GROUP BY category ORDER BY count DESC`
  ).all() as { category: string; count: number }[];
}

// Trends
export function getIdeaBrowserTrends(): IdeaBrowserTrend[] {
  return getDb().prepare('SELECT * FROM ideabrowser_trends ORDER BY growth_pct DESC').all() as IdeaBrowserTrend[];
}

export function upsertIdeaBrowserTrend(data: Omit<IdeaBrowserTrend, 'created_at'>): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO ideabrowser_trends (id, title, category, growth_pct, sparkline_data, search_volume, timeframe, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.id, data.title, data.category || null, data.growth_pct, data.sparkline_data || null, data.search_volume, data.timeframe, data.source);
}

// Market Insights
export function getIdeaBrowserMarketInsights(): IdeaBrowserMarketInsight[] {
  return getDb().prepare('SELECT * FROM ideabrowser_market_insights ORDER BY created_at DESC').all() as IdeaBrowserMarketInsight[];
}

export function upsertIdeaBrowserMarketInsight(data: Omit<IdeaBrowserMarketInsight, 'created_at'>): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO ideabrowser_market_insights (id, title, description, category, metric_label, metric_value, trend_direction, source, sparkline_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.id, data.title, data.description || null, data.category || null, data.metric_label || null, data.metric_value || null, data.trend_direction || null, data.source || null, data.sparkline_data || null);
}

// Scoring engine - compute scores from text fields
export function scoreIdeaBrowserIdea(id: string): IdeaBrowserIdea | undefined {
  const idea = getIdeaBrowserIdea(id);
  if (!idea) return undefined;

  const textToScore = (text: string | null, highKeywords: string[], lowKeywords: string[]): number => {
    if (!text) return 50;
    const t = text.toLowerCase();
    for (const k of highKeywords) if (t.includes(k)) return 85;
    for (const k of lowKeywords) if (t.includes(k)) return 30;
    return 60;
  };

  const sv = textToScore(idea.search_volume, ['high', 'strong', '10k', '50k', '100k'], ['low', 'minimal', 'niche']);
  const gr = textToScore(idea.growth_rate, ['high', 'rapid', 'surging', 'explosive', '50%', '100%'], ['low', 'declining', 'flat', 'stagnant']);
  const pl = textToScore(idea.pain_level, ['high', 'severe', 'critical', 'acute', 'extreme'], ['low', 'mild', 'minimal']);
  const fe = textToScore(idea.feasibility, ['high', 'easy', 'straightforward', 'proven'], ['low', 'complex', 'difficult', 'hard']);
  const rp = textToScore(idea.revenue_potential, ['high', 'massive', 'large', 'significant', '$1m', '$10m'], ['low', 'small', 'limited', 'niche']);

  const overall = Math.round((sv + gr + pl + fe + rp) / 5);

  getDb().prepare(`
    UPDATE ideabrowser_ideas
    SET search_volume_score = ?, growth_rate_score = ?, pain_level_score = ?, feasibility_score = ?, revenue_potential_score = ?, overall_score = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(sv, gr, pl, fe, rp, overall, id);

  return getIdeaBrowserIdea(id);
}

export function scoreAllIdeaBrowserIdeas(): number {
  const ideas = getIdeaBrowserIdeas();
  let scored = 0;
  for (const idea of ideas) {
    scoreIdeaBrowserIdea(idea.id);
    scored++;
  }
  return scored;
}
