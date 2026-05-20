import { v4 as uuidv4 } from 'uuid';
import { getDb } from './schema';

// Re-export getDb for routes that need direct DB access
export { getDb };

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
  provider: 'openai' | 'anthropic' | 'ollama' | 'perplexity' | 'exa' | 'firecrawl' | 'claude-cli';
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
  media_url: string | null;
  tracked_url: string | null;
  metadata: string | null;
  created_at: string;
}

export interface ContentAnalytics {
  id: string;
  content_id: string;
  platform: string;
  impressions: number;
  clicks: number;
  likes: number;
  shares: number;
  comments: number;
  reach: number;
  platform_post_id: string | null;
  fetched_at: string;
}

export interface AdCampaign {
  id: string;
  project_id: string | null;
  platform: 'facebook' | 'google' | 'tiktok';
  name: string;
  objective: string;
  budget_daily: number | null;
  budget_total: number | null;
  targeting: string | null;
  ad_copy: string | null;
  ad_creative: string | null;
  status: 'draft' | 'ready' | 'submitted' | 'active' | 'paused' | 'completed';
  platform_campaign_id: string | null;
  platform_response: string | null;
  created_at: string;
  updated_at: string;
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
  subject_b: string | null;
  subject_c: string | null;
  subject_d: string | null;
  ab_test_sample_pct: number;
  ab_winner: string | null;
  open_rate: number;
  click_rate: number;
  unsubscribe_count: number;
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

// ─── Activity Log — moved to ./core.ts, re-exported for backward compat ─────
import { getActivity, getProjectActivity, logActivity } from "./core";
export { getActivity, getProjectActivity, logActivity };

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
  return getDb().prepare('SELECT * FROM connections ORDER BY priority ASC, created_at DESC').all() as Connection[];
}

// Get the best active connection: primary (lowest priority number) first, with fallback
export function getActiveConnection(connectionId?: string): Connection | undefined {
  if (connectionId) {
    return getDb().prepare('SELECT * FROM connections WHERE id = ?').get(connectionId) as Connection | undefined;
  }
  // Try primary first (lowest priority), then any active
  return getDb().prepare('SELECT * FROM connections WHERE is_active = 1 ORDER BY priority ASC LIMIT 1').get() as Connection | undefined;
}

// Try primary, if it fails return fallback
export function getConnectionWithFallback(): { primary: Connection | undefined; fallback: Connection | undefined } {
  const all = getDb().prepare('SELECT * FROM connections WHERE is_active = 1 ORDER BY priority ASC').all() as Connection[];
  return { primary: all[0], fallback: all[1] };
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
  media_url?: string;
  metadata?: string;
}): ContentPiece {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO content_pieces (id, project_id, type, title, content, platform, status, scheduled_at, media_url, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.project_id || null,
    data.type,
    data.title,
    data.content ?? null,
    data.platform ?? null,
    data.status ?? 'draft',
    data.scheduled_at ?? null,
    data.media_url ?? null,
    data.metadata ?? null,
  );
  return getDb().prepare('SELECT * FROM content_pieces WHERE id = ?').get(id) as ContentPiece;
}

// ─── Ad Campaigns ─────────────────────────────────────────────────────────────

export function getAdCampaigns(): AdCampaign[] {
  return getDb().prepare('SELECT * FROM ad_campaigns ORDER BY created_at DESC').all() as AdCampaign[];
}

export function getAdCampaign(id: string): AdCampaign | undefined {
  return getDb().prepare('SELECT * FROM ad_campaigns WHERE id = ?').get(id) as AdCampaign | undefined;
}

export function createAdCampaign(data: {
  project_id?: string;
  platform: AdCampaign['platform'];
  name: string;
  objective?: string;
  budget_daily?: number;
  budget_total?: number;
  targeting?: string;
  ad_copy?: string;
  ad_creative?: string;
}): AdCampaign {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO ad_campaigns (id, project_id, platform, name, objective, budget_daily, budget_total, targeting, ad_copy, ad_creative)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.project_id || null, data.platform, data.name, data.objective || 'traffic',
    data.budget_daily || null, data.budget_total || null, data.targeting || null,
    data.ad_copy || null, data.ad_creative || null);
  return getDb().prepare('SELECT * FROM ad_campaigns WHERE id = ?').get(id) as AdCampaign;
}

export function updateAdCampaign(id: string, data: Partial<AdCampaign>): AdCampaign | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (key === 'id' || key === 'created_at') continue;
    fields.push(`${key} = ?`);
    values.push(val);
  }
  if (fields.length === 0) return getAdCampaign(id);
  fields.push('updated_at = datetime(\'now\')');
  values.push(id);
  getDb().prepare(`UPDATE ad_campaigns SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getAdCampaign(id);
}

// ─── Content Analytics ────────────────────────────────────────────────────────

export function getContentAnalytics(contentId: string): ContentAnalytics[] {
  return getDb().prepare('SELECT * FROM content_analytics WHERE content_id = ? ORDER BY fetched_at DESC').all(contentId) as ContentAnalytics[];
}

export function getAllContentAnalytics(): ContentAnalytics[] {
  return getDb().prepare('SELECT * FROM content_analytics ORDER BY fetched_at DESC').all() as ContentAnalytics[];
}

export function upsertContentAnalytics(data: {
  content_id: string;
  platform: string;
  impressions?: number;
  clicks?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  reach?: number;
  platform_post_id?: string;
}): void {
  const existing = getDb().prepare(
    'SELECT id FROM content_analytics WHERE content_id = ? AND platform = ?'
  ).get(data.content_id, data.platform) as { id: string } | undefined;

  if (existing) {
    getDb().prepare(`
      UPDATE content_analytics SET impressions = ?, clicks = ?, likes = ?, shares = ?, comments = ?, reach = ?, fetched_at = datetime('now')
      WHERE id = ?
    `).run(data.impressions || 0, data.clicks || 0, data.likes || 0, data.shares || 0, data.comments || 0, data.reach || 0, existing.id);
  } else {
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO content_analytics (id, content_id, platform, impressions, clicks, likes, shares, comments, reach, platform_post_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.content_id, data.platform, data.impressions || 0, data.clicks || 0, data.likes || 0, data.shares || 0, data.comments || 0, data.reach || 0, data.platform_post_id || null);
  }
}

export function updateContent(id: string, data: Partial<{
  type: ContentPiece['type'];
  title: string;
  content: string;
  platform: string;
  status: ContentPiece['status'];
  scheduled_at: string;
  project_id: string;
  metadata: string;
  media_url: string;
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
  if (data.media_url !== undefined) { fields.push('media_url = ?'); values.push(data.media_url); }

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
  tags?: string;
}): OutboundContact {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO outbound_contacts (id, project_id, name, email, company, role, status, sequence_step, notes, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    data.tags ?? null,
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
  subject_b?: string;
  subject_c?: string;
  ab_test_sample_pct?: number;
}): Newsletter {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO newsletters (id, project_id, title, subject, content, status, newsletter_type, recipients, subject_b, subject_c, ab_test_sample_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.project_id ?? null,
    data.title,
    data.subject ?? null,
    data.content ?? null,
    data.status ?? 'draft',
    data.newsletter_type ?? 'weekly',
    data.recipients ?? null,
    data.subject_b ?? null,
    data.subject_c ?? null,
    data.ab_test_sample_pct ?? 20,
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
  subject_b: string | null;
  subject_c: string | null;
  ab_test_sample_pct: number;
  ab_winner: string | null;
  open_rate: number;
  click_rate: number;
  unsubscribe_count: number;
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
  if (data.subject_b !== undefined) { fields.push('subject_b = ?'); values.push(data.subject_b); }
  if (data.subject_c !== undefined) { fields.push('subject_c = ?'); values.push(data.subject_c); }
  if (data.ab_test_sample_pct !== undefined) { fields.push('ab_test_sample_pct = ?'); values.push(data.ab_test_sample_pct); }
  if (data.ab_winner !== undefined) { fields.push('ab_winner = ?'); values.push(data.ab_winner); }
  if (data.open_rate !== undefined) { fields.push('open_rate = ?'); values.push(data.open_rate); }
  if (data.click_rate !== undefined) { fields.push('click_rate = ?'); values.push(data.click_rate); }
  if (data.unsubscribe_count !== undefined) { fields.push('unsubscribe_count = ?'); values.push(data.unsubscribe_count); }

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

// ─── IdeaBrowser — moved to ./ideabrowser.ts ───────────────────────────────
export * from "./ideabrowser";


// ─── Agent Tasks — moved to ./agents.ts ────────────────────────────────────
export * from "./agents";

// ─── Domain Re-exports ───────────────────────────────────────────────────────
// Kept here so existing `import { ... } from "@/lib/db"` keeps working.
// The actual implementation lives in domain modules.

export * from "./watchdog";
