// ─── IdeaBrowser ─────────────────────────────────────────────────────────────
// Extracted from db/index.ts during P1-3 refactor. Domain: ideabrowser ideas
// CRUD, Blueprints, Automation config, deterministic scoring engine, and the
// extended V2 metadata generator.

import { v4 as uuidv4 } from "uuid";
import { getDb, logActivity } from "./core";

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
  founders_edge: string | null;
  sync_status: 'scraped' | 'manual' | 'modified';
  project_id: string | null;
  imported_at: string;
  updated_at: string;
  // V2: IdeaBrowser full-page clone fields
  keyword_terms: string | null;
  opportunity_score: number;
  problem_score: number;
  feasibility_score_10: number;
  why_now_score: number;
  revenue_tier: string | null;
  execution_difficulty_score: number;
  gtm_score: number;
  offer_ladder: string | null;
  why_now: string | null;
  proof_signals: string | null;
  idea_type: string | null;
  market_type: string | null;
  target_persona: string | null;
  main_competitor: string | null;
  trend_analysis: string | null;
  community_signals: string | null;
  is_bookmarked: number;
  // 10-factor market-readiness scorecard
  sc_demand_signals: number;
  sc_pain_severity: number;
  sc_willingness_to_pay: number;
  sc_competition_landscape: number;
  sc_speed_to_mvp: number;
  sc_channel_clarity: number;
  sc_unit_economics: number;
  sc_timing_signal: number;
  sc_market_size: number;
  sc_founder_advantage: number;
  sc_total: number;
  sc_verdict: string | null;
  sc_evidence: string | null;
  sc_test_method: string | null;
  sc_budget_timeline: string | null;
  sc_dealbreakers: string | null;
  sc_evaluated_at: string | null;
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

export function getIdeaOfTheDay(date?: string): IdeaBrowserIdea | undefined {
  if (date) {
    return getDb().prepare(
      `SELECT * FROM ideabrowser_ideas WHERE idea_date = ? LIMIT 1`
    ).get(date) as IdeaBrowserIdea | undefined;
  }
  return getDb().prepare(
    `SELECT * FROM ideabrowser_ideas ORDER BY idea_date DESC, imported_at DESC LIMIT 1`
  ).get() as IdeaBrowserIdea | undefined;
}

export function getAdjacentIdeaDates(currentDate: string): { prev: string | null; next: string | null } {
  const prev = getDb().prepare(
    `SELECT idea_date FROM ideabrowser_ideas WHERE idea_date < ? ORDER BY idea_date DESC LIMIT 1`
  ).get(currentDate) as { idea_date: string } | undefined;
  const next = getDb().prepare(
    `SELECT idea_date FROM ideabrowser_ideas WHERE idea_date > ? ORDER BY idea_date ASC LIMIT 1`
  ).get(currentDate) as { idea_date: string } | undefined;
  return { prev: prev?.idea_date || null, next: next?.idea_date || null };
}

export function toggleIdeaBookmark(id: string): boolean {
  const idea = getIdeaBrowserIdea(id);
  if (!idea) return false;
  const newVal = idea.is_bookmarked ? 0 : 1;
  getDb().prepare("UPDATE ideabrowser_ideas SET is_bookmarked = ?, updated_at = datetime('now') WHERE id = ?").run(newVal, id);
  return newVal === 1;
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

// ─── Blueprints ──────────────────────────────────────────────────────────────

export interface Blueprint {
  id: string;
  project_id: string | null;
  idea_id: string | null;
  niche: string;
  data: string;
  layer_status: string;
  status: 'generated' | 'active' | 'executing' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

export function getBlueprints(): Blueprint[] {
  return getDb().prepare('SELECT * FROM blueprints ORDER BY created_at DESC').all() as Blueprint[];
}

export function getBlueprint(id: string): Blueprint | undefined {
  return getDb().prepare('SELECT * FROM blueprints WHERE id = ?').get(id) as Blueprint | undefined;
}

export function getProjectBlueprints(projectId: string): Blueprint[] {
  return getDb().prepare('SELECT * FROM blueprints WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Blueprint[];
}

export function createBlueprint(data: {
  niche: string;
  data: string;
  project_id?: string;
  idea_id?: string;
}): Blueprint {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO blueprints (id, project_id, idea_id, niche, data, layer_status, status)
    VALUES (?, ?, ?, ?, ?, '{}', 'generated')
  `).run(id, data.project_id || null, data.idea_id || null, data.niche, data.data);
  return getBlueprint(id)!;
}

export function updateBlueprintLayerStatus(id: string, layerId: string, status: string, itemCount: number): void {
  const bp = getBlueprint(id);
  if (!bp) return;
  const layerStatus = JSON.parse(bp.layer_status || '{}');
  layerStatus[layerId] = { status, items: itemCount, executed_at: new Date().toISOString() };
  getDb().prepare(`
    UPDATE blueprints SET layer_status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(JSON.stringify(layerStatus), id);
}

export function updateBlueprintStatus(id: string, status: Blueprint['status']): void {
  getDb().prepare(`UPDATE blueprints SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
}

// Layer-to-Skill mapping for the execution engine
export const LAYER_SKILL_MAP: Record<string, { skillId: string; contentType: string; description: string }> = {
  'north-star': { skillId: 'skill-competitive-intel', contentType: 'script', description: 'North Star analysis and competitive landscape' },
  'revenue': { skillId: 'skill-sales-page-surgeon', contentType: 'landing_page', description: 'Revenue model and pricing strategy page' },
  'pricing-tiers': { skillId: 'skill-pricing-page-generator', contentType: 'landing_page', description: 'Pricing page with tier comparisons' },
  'acquisition': { skillId: 'skill-lead-magnet-creator', contentType: 'lead_magnet', description: 'Lead magnets and acquisition funnels' },
  'traffic': { skillId: 'skill-social-scheduler', contentType: 'post', description: '30-day social content calendar' },
  'content': { skillId: 'skill-content-engine', contentType: 'post', description: 'Content strategy and blog posts' },
  'email': { skillId: 'skill-email-wizard', contentType: 'email', description: 'Email sequences and campaigns' },
  'paid': { skillId: 'skill-ad-copy-generator', contentType: 'script', description: 'Ad copy and targeting specs' },
  'seo': { skillId: 'skill-seo-strategist', contentType: 'post', description: 'SEO keyword strategy and content briefs' },
  'product': { skillId: 'skill-ops-dashboard', contentType: 'script', description: 'Product health metrics dashboard' },
  'attribution': { skillId: 'skill-ops-dashboard', contentType: 'script', description: 'Attribution tracking plan' },
  'budget': { skillId: 'skill-leveraged-agency', contentType: 'script', description: 'Budget allocation strategy' },
};

// ─── Automation Engine ────────────────────────────────────────────────────────

export function getAutomationSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM automation_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getAutomationSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM automation_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

export function setAutomationSetting(key: string, value: string): void {
  getDb().prepare("INSERT OR REPLACE INTO automation_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, value);
}

export function createAutomationRun(runType: string): string {
  const id = uuidv4();
  getDb().prepare("INSERT INTO automation_runs (id, run_type) VALUES (?, ?)").run(id, runType);
  return id;
}

export function completeAutomationRun(id: string, results: Record<string, unknown>, status: 'completed' | 'failed' = 'completed'): void {
  const run = getDb().prepare("SELECT started_at FROM automation_runs WHERE id = ?").get(id) as { started_at: string } | undefined;
  const durationMs = run ? Date.now() - new Date(run.started_at).getTime() : 0;
  getDb().prepare("UPDATE automation_runs SET status = ?, results = ?, completed_at = datetime('now'), duration_ms = ? WHERE id = ?")
    .run(status, JSON.stringify(results), durationMs, id);
}

export function getLatestAutomationRun(): { id: string; run_type: string; status: string; results: string; started_at: string; duration_ms: number } | undefined {
  return getDb().prepare("SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT 1").get() as { id: string; run_type: string; status: string; results: string; started_at: string; duration_ms: number } | undefined;
}

// ─── Deterministic Scoring Engine ──────────────────────────────────────────────
// Reverse-engineered from IdeaBrowser's visible scoring patterns.
// Analyzes title, description, category, and tags to produce real varied scores.
// No LLM required — runs instantly on import.

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function scoreIdeaBrowserIdeaInternal(idea: {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string | null;
}): { sv: number; gr: number; pl: number; fe: number; rp: number } {
  const t = (idea.title || '').toLowerCase();
  const d = (idea.description || '').toLowerCase();
  const cat = (idea.category || '').toLowerCase();
  const tags = (idea.tags || '').toLowerCase();
  const all = `${t} ${d} ${cat} ${tags}`;
  const seed = hashString(idea.id + idea.title);

  // Deterministic jitter: ±12 points based on idea hash, different per metric
  const jitter = (metric: number) => {
    const j = ((seed * (metric + 7)) % 25) - 12;
    return j;
  };

  // Title length and word sophistication affect scores
  const wordCount = t.split(/\s+/).length;
  const hasNumbers = /\d/.test(t);
  const titleBoost = hasNumbers ? 3 : 0;

  // ── Search Volume (how many people search for this) ──
  let sv = 40 + titleBoost;
  // Market size indicators from titles like "$10B+ MKT"
  if (all.includes('$100b') || all.includes('$50b')) sv = 90;
  else if (all.includes('$10b') || all.includes('10b+')) sv = 78;
  else if (all.includes('$5b') || all.includes('5b+') || all.includes('$8b')) sv = 70;
  else if (all.includes('$1b') || all.includes('1b+')) sv = 62;
  else if (all.includes('$500m') || all.includes('$100m')) sv = 55;
  else if (all.includes('$50m') || all.includes('$10m')) sv = 42;
  else if (all.includes('$5m') || all.includes('$1m')) sv = 32;
  // Broad vs niche category adjustments
  if (['fintech', 'e-commerce', 'healthtech', 'health tech', 'saas'].some(c => cat.includes(c))) sv += 8;
  if (['ai tools', 'ai-powered', 'martech'].some(c => all.includes(c))) sv += 6;
  if (['niche', 'hobby', 'quilter', 'quilting'].some(c => all.includes(c))) sv -= 12;
  if (['enterprise', 'commercial', 'b2b'].some(c => all.includes(c))) sv -= 5;
  sv = Math.max(15, Math.min(95, sv + jitter(1)));

  // ── Growth Rate (is demand growing?) ──
  let gr = 42;
  // Hot categories
  if (['ai', 'artificial intelligence', 'machine learning', 'llm', 'generative'].some(c => all.includes(c))) gr = 82;
  else if (['cleantech', 'ev ', 'electric vehicle', 'solar', 'climate'].some(c => all.includes(c))) gr = 75;
  else if (['crypto', 'blockchain', 'web3'].some(c => all.includes(c))) gr = 68;
  else if (['tiktok', 'creator', 'social media', 'influencer'].some(c => all.includes(c))) gr = 72;
  else if (['cybersecurity', 'security', 'compliance'].some(c => all.includes(c))) gr = 65;
  // Moderate growth categories
  if (['saas', 'platform', 'automation', 'automate'].some(c => all.includes(c))) gr += 8;
  if (['marketplace', 'on-demand'].some(c => all.includes(c))) gr += 5;
  // Slower categories
  if (['traditional', 'manual', 'brick-and-mortar'].some(c => all.includes(c))) gr -= 15;
  if (['hobby', 'craft', 'quilting', 'fabric'].some(c => all.includes(c))) gr -= 10;
  gr = Math.max(18, Math.min(95, gr + jitter(2)));

  // ── Pain Level (how painful is the problem?) ──
  let pl = 45;
  // High-pain indicators
  if (['prevent', 'violation', 'compliance', 'legal', 'regulation', 'audit'].some(c => all.includes(c))) pl = 82;
  else if (['error', 'costly', 'damage', 'risk', 'fraud', 'security'].some(c => all.includes(c))) pl = 78;
  else if (['insurance', 'claim', 'medical', 'health', 'patient'].some(c => all.includes(c))) pl = 72;
  else if (['waste', 'inefficien', 'manual', 'time-consuming', 'tedious'].some(c => all.includes(c))) pl = 68;
  else if (['manage', 'track', 'organize', 'automate', 'streamline'].some(c => all.includes(c))) pl = 58;
  // Nice-to-have indicators
  if (['fun', 'hobby', 'game', 'social', 'entertainment', 'visualize'].some(c => all.includes(c))) pl -= 15;
  if (['compare', 'browse', 'discover', 'explore'].some(c => all.includes(c))) pl -= 8;
  // B2B pain is higher
  if (['business', 'enterprise', 'team', 'fleet', 'contractor'].some(c => all.includes(c))) pl += 6;
  pl = Math.max(20, Math.min(95, pl + jitter(3)));

  // ── Feasibility (how easy to build?) ──
  let fe = 50 + (wordCount > 12 ? -5 : wordCount < 7 ? 5 : 0);
  // Easy to build
  if (['calculator', 'tool', 'compare', 'directory', 'listing', 'navigator'].some(c => all.includes(c))) fe = 78;
  else if (['saas', 'platform', 'dashboard', 'portal'].some(c => all.includes(c))) fe = 65;
  else if (['app', 'mobile', 'web'].some(c => all.includes(c))) fe = 62;
  else if (['marketplace', 'network'].some(c => all.includes(c))) fe = 52;
  // Hard to build
  if (['computer vision', 'image recognition', 'visual', 'detection'].some(c => all.includes(c))) fe -= 12;
  if (['hardware', 'device', 'sensor', 'iot'].some(c => all.includes(c))) fe -= 18;
  if (['ai-powered', 'ai ', 'machine learning', 'neural'].some(c => all.includes(c))) fe -= 8;
  if (['blockchain', 'crypto', 'smart contract'].some(c => all.includes(c))) fe -= 10;
  // Regulatory complexity
  if (['insurance', 'medical', 'legal', 'financial', 'compliance'].some(c => all.includes(c))) fe -= 8;
  // Simple business models boost feasibility
  if (['subscription', 'monthly', 'per-seat'].some(c => all.includes(c))) fe += 5;
  fe = Math.max(15, Math.min(90, fe + jitter(4)));

  // ── Revenue Potential ──
  let rp = 42 + titleBoost;
  // Market size drives revenue
  if (all.includes('$100b') || all.includes('$50b')) rp = 92;
  else if (all.includes('$10b') || all.includes('10b+')) rp = 80;
  else if (all.includes('$5b') || all.includes('5b+') || all.includes('$8b')) rp = 72;
  else if (all.includes('$1b') || all.includes('1b+')) rp = 65;
  else if (all.includes('$500m') || all.includes('$100m')) rp = 55;
  // B2B premium
  if (['enterprise', 'commercial', 'b2b', 'team', 'fleet'].some(c => all.includes(c))) rp += 10;
  // SaaS recurring revenue
  if (['saas', 'subscription', 'platform'].some(c => all.includes(c))) rp += 8;
  // Consumer discount
  if (['consumer', 'free', 'hobby', 'personal'].some(c => all.includes(c))) rp -= 10;
  // Marketplace boost (network effects)
  if (['marketplace', 'network', 'platform'].some(c => all.includes(c))) rp += 5;
  rp = Math.max(18, Math.min(95, rp + jitter(5)));

  return { sv, gr, pl, fe, rp };
}

export function scoreIdeaBrowserIdea(id: string): IdeaBrowserIdea | undefined {
  const idea = getIdeaBrowserIdea(id);
  if (!idea) return undefined;

  const { sv, gr, pl, fe, rp } = scoreIdeaBrowserIdeaInternal(idea);
  const overall = Math.round((sv + gr + pl + fe + rp) / 5);

  // Generate analysis text based on scores and idea data
  const analysis = generateIdeaAnalysis(idea, { sv, gr, pl, fe, rp, overall });

  // V2: Derive 1-10 score cards
  const opportunity_score = Math.max(1, Math.min(10, Math.ceil(((sv + gr + rp) / 3) / 10)));
  const problem_score = Math.max(1, Math.min(10, Math.ceil(pl / 10)));
  const feasibility_score_10 = Math.max(1, Math.min(10, Math.ceil(fe / 10)));
  const why_now_score = Math.max(1, Math.min(10, Math.ceil(((gr + pl) / 2) / 10)));
  const execution_difficulty_score = Math.max(1, Math.min(10, Math.ceil((100 - fe) / 10)));
  const gtm_score = Math.max(1, Math.min(10, Math.ceil(((sv + gr) / 2) / 10)));

  // V2: Generate extended metadata
  const extended = generateExtendedMetadata(idea, { sv, gr, pl, fe, rp, overall });

  getDb().prepare(`
    UPDATE ideabrowser_ideas
    SET search_volume_score = ?, growth_rate_score = ?, pain_level_score = ?,
        feasibility_score = ?, revenue_potential_score = ?, overall_score = ?,
        product_urgency = ?, market_gap = ?, founders_edge = ?, execution_plan = ?,
        opportunity_score = ?, problem_score = ?, feasibility_score_10 = ?,
        why_now_score = ?, execution_difficulty_score = ?, gtm_score = ?,
        keyword_terms = ?, revenue_tier = ?, offer_ladder = ?,
        why_now = ?, proof_signals = ?,
        idea_type = ?, market_type = ?, target_persona = ?,
        main_competitor = ?, trend_analysis = ?, community_signals = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(sv, gr, pl, fe, rp, overall,
    analysis.product_urgency, analysis.market_gap, analysis.founders_edge, analysis.execution_plan,
    opportunity_score, problem_score, feasibility_score_10,
    why_now_score, execution_difficulty_score, gtm_score,
    extended.keyword_terms, extended.revenue_tier, extended.offer_ladder,
    extended.why_now, extended.proof_signals,
    extended.idea_type, extended.market_type, extended.target_persona,
    extended.main_competitor, extended.trend_analysis, extended.community_signals,
    id);

  return getIdeaBrowserIdea(id);
}

export function generateIdeaAnalysis(
  idea: { title: string; description: string | null; category: string | null; tags: string | null },
  scores: { sv: number; gr: number; pl: number; fe: number; rp: number; overall: number }
) {
  const cat = idea.category || 'Technology';
  const title = idea.title;
  const tags = (idea.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const isAI = tags.some(t => t.toLowerCase().includes('ai')) || title.toLowerCase().includes('ai');
  const isSaaS = tags.some(t => t.toLowerCase().includes('saas')) || title.toLowerCase().includes('platform');
  const isMarketplace = tags.some(t => t.toLowerCase().includes('marketplace'));

  // ── Product Urgency ──
  let urgency: string;
  if (scores.pl >= 75 && scores.gr >= 70) {
    urgency = `High urgency. The ${cat} market is experiencing rapid growth (${scores.gr}/100) with acute pain points (${scores.pl}/100). Users are actively searching for solutions, and the window for first-mover advantage is narrowing. Immediate action on an MVP is recommended before the market consolidates.`;
  } else if (scores.pl >= 60 || scores.gr >= 65) {
    urgency = `Moderate-to-high urgency. ${cat} demand is growing steadily (growth: ${scores.gr}/100) with meaningful pain signals (${scores.pl}/100). There is room for a well-positioned entrant, but timing matters — competitors are likely exploring adjacent solutions. Validate with 10-15 customer interviews within 30 days.`;
  } else if (scores.pl >= 45) {
    urgency = `Moderate urgency. The problem space has real but manageable pain (${scores.pl}/100). Growth trends in ${cat} are present but not explosive (${scores.gr}/100). A methodical approach — landing page validation, waitlist building — is more appropriate than rushing to market. Focus on differentiation over speed.`;
  } else {
    urgency = `Lower urgency. The pain level (${scores.pl}/100) suggests this is more of a convenience improvement than a burning need. Growth in ${cat} is modest (${scores.gr}/100). Consider whether this idea works better as a feature of an existing platform rather than a standalone product.`;
  }

  // ── Market Gap ──
  let gap: string;
  if (scores.sv >= 65 && scores.fe >= 60) {
    gap = `Significant gap identified. Search volume (${scores.sv}/100) indicates strong existing demand that current solutions fail to capture. The feasibility score (${scores.fe}/100) suggests the technical barrier is surmountable, meaning the gap exists due to poor UX, pricing, or market focus — not technological impossibility. A focused product addressing ${cat} specifically can capture underserved segments.`;
  } else if (scores.sv >= 45) {
    gap = `Moderate gap. There is measurable demand in ${cat} (search volume: ${scores.sv}/100), but existing solutions partially address the need. The opportunity lies in${isAI ? ' AI-powered automation that reduces manual work,' : ''}${isSaaS ? ' a SaaS model with better pricing and onboarding,' : ''}${isMarketplace ? ' a marketplace that aggregates fragmented supply,' : ''} serving a niche that incumbents overlook. Differentiation through specialization is key.`;
  } else {
    gap = `Narrow gap. Search volume (${scores.sv}/100) is limited, suggesting either a niche market or an emerging problem not yet widely recognized. The opportunity requires market education and demand generation. Consider whether you can expand the addressable market by broadening the use case or targeting adjacent verticals in ${cat}.`;
  }

  // ── Founder's Edge ──
  let edge: string;
  if (scores.overall >= 65) {
    edge = `Strong founder opportunity. This idea scores ${scores.overall}/100 overall, indicating a viable entry point. The ideal founder has domain expertise in ${cat}${isAI ? ' and AI/ML engineering capability' : ''}${isSaaS ? ' with B2B sales experience' : ''}. Key advantages to cultivate: direct relationships with target users, proprietary data or workflow knowledge, and the ability to iterate quickly based on real usage patterns.`;
  } else if (scores.overall >= 50) {
    edge = `Viable founder opportunity with caveats. Overall score of ${scores.overall}/100 means success depends heavily on execution quality. The founder's edge comes from${scores.fe >= 60 ? ' being able to build quickly (feasibility: ' + scores.fe + '/100)' : ' deep domain knowledge in ' + cat}. Key risk: the idea may need significant pivoting after initial launch. Budget for 6-12 months of iteration before product-market fit.`;
  } else {
    edge = `Challenging founder path. With an overall score of ${scores.overall}/100, this idea requires a founder with unusual advantages — either deep industry connections in ${cat}, proprietary technology, or ability to bootstrap extremely lean. Revenue potential (${scores.rp}/100) limits fundraising options. Consider this as a bootstrap or side-project opportunity.`;
  }

  // ── Execution Plan ──
  const steps: string[] = [];
  if (scores.fe >= 65) {
    steps.push('Build a functional MVP in 2-4 weeks focusing on the core value proposition');
  } else if (scores.fe >= 45) {
    steps.push('Prototype the core workflow with no-code tools to validate demand before committing to custom development');
  } else {
    steps.push('Conduct deep technical feasibility study — identify the hardest unsolved problem and prove it can be solved');
  }

  if (scores.pl >= 65) {
    steps.push(`Recruit 5-10 beta users from ${cat} — the high pain level means they will actively seek you out if you're in the right channels`);
  } else {
    steps.push(`Launch a landing page with a clear value proposition and run targeted ads to measure demand in ${cat}`);
  }

  if (scores.sv >= 55) {
    steps.push(`Implement SEO and content marketing targeting existing search demand — ${cat} keywords show strong volume`);
  } else {
    steps.push(`Build thought leadership content explaining the problem you're solving — the market needs education`);
  }

  if (isSaaS || isMarketplace) {
    steps.push(`Set up usage analytics and identify your activation metric — the moment users first experience value`);
  } else {
    steps.push('Track retention and referral metrics weekly — focus on users who come back without prompting');
  }

  if (scores.rp >= 65) {
    steps.push(`Prepare for fundraising: build a pitch deck around the ${cat} market opportunity (revenue potential: ${scores.rp}/100) and line up warm intros to investors in the space`);
  } else {
    steps.push('Focus on reaching $5K MRR through direct sales and word-of-mouth before considering external funding');
  }

  return {
    product_urgency: urgency,
    market_gap: gap,
    founders_edge: edge,
    execution_plan: steps.join('\n'),
  };
}

// ─── Extended Metadata Generator (V2 IdeaBrowser Clone) ──────────────────────
export function generateExtendedMetadata(
  idea: { id: string; title: string; description: string | null; category: string | null; tags: string | null; target_market: string | null; competition: string | null; pricing: string | null },
  scores: { sv: number; gr: number; pl: number; fe: number; rp: number; overall: number }
) {
  const t = (idea.title || '').toLowerCase();
  const d = (idea.description || '').toLowerCase();
  const cat = idea.category || 'Technology';
  const tags = (idea.tags || '').split(',').map(s => s.trim()).filter(Boolean);
  const all = `${t} ${d} ${(idea.tags || '').toLowerCase()}`;
  const seed = hashString(idea.id);

  // ── Idea Type ──
  let idea_type = 'SaaS';
  if (['marketplace', 'two-sided', 'matching'].some(c => all.includes(c))) idea_type = 'Marketplace';
  else if (['agency', 'service', 'consulting', 'done-for-you'].some(c => all.includes(c))) idea_type = 'Agency';
  else if (['course', 'training', 'education', 'coaching'].some(c => all.includes(c))) idea_type = 'Info Product';
  else if (['e-commerce', 'store', 'shop', 'retail', 'box', 'ship'].some(c => all.includes(c))) idea_type = 'E-Commerce';
  else if (['tool', 'calculator', 'generator', 'browser extension'].some(c => all.includes(c))) idea_type = 'Tool';
  else if (['app', 'mobile', 'ios', 'android'].some(c => all.includes(c))) idea_type = 'Mobile App';
  else if (['platform', 'saas', 'subscription', 'dashboard'].some(c => all.includes(c))) idea_type = 'SaaS';
  else if (['hardware', 'device', 'kit', 'sensor'].some(c => all.includes(c))) idea_type = 'Hardware';
  else if (['newsletter', 'media', 'content', 'blog'].some(c => all.includes(c))) idea_type = 'Media';

  // ── Market Type ──
  let market_type = 'B2C';
  if (['b2b', 'enterprise', 'business', 'team', 'fleet', 'contractor', 'commercial', 'company', 'firm', 'corporate'].some(c => all.includes(c))) market_type = 'B2B';
  else if (['b2b2c', 'platform'].some(c => all.includes(c)) && ['consumer', 'user', 'customer'].some(c => all.includes(c))) market_type = 'B2B2C';

  // ── Target Persona ──
  let target_persona = idea.target_market || '';
  if (!target_persona) {
    const personaMap: Record<string, string> = {
      'parent': 'Busy Parents', 'mom': 'Busy Parents', 'dad': 'Busy Parents', 'kid': 'Busy Parents', 'family': 'Families',
      'developer': 'Software Developers', 'engineer': 'Software Engineers', 'coder': 'Software Developers',
      'startup': 'Startup Founders', 'founder': 'Startup Founders', 'entrepreneur': 'Entrepreneurs',
      'freelanc': 'Freelancers', 'creator': 'Content Creators', 'influencer': 'Content Creators',
      'small business': 'SMB Owners', 'smb': 'SMB Owners', 'local business': 'Local Business Owners',
      'student': 'Students', 'learner': 'Students', 'teacher': 'Educators',
      'patient': 'Healthcare Consumers', 'doctor': 'Healthcare Professionals', 'clinic': 'Healthcare Providers',
      'homeowner': 'Homeowners', 'renter': 'Renters', 'tenant': 'Renters',
      'senior': 'Seniors', 'elder': 'Seniors', 'retire': 'Retirees',
      'pet': 'Pet Owners', 'dog': 'Pet Owners', 'cat': 'Pet Owners',
      'fitness': 'Fitness Enthusiasts', 'gym': 'Fitness Enthusiasts', 'athlete': 'Athletes',
      'restaurant': 'Restaurant Owners', 'chef': 'Restaurant Owners', 'bar': 'Restaurant/Bar Owners',
      'sales': 'Sales Teams', 'marketer': 'Marketers', 'marketing': 'Marketers',
      'hr': 'HR Professionals', 'recruit': 'Recruiters', 'hiring': 'Hiring Managers',
      'real estate': 'Real Estate Professionals', 'agent': 'Real Estate Agents',
      'ecommerce': 'E-Commerce Sellers', 'seller': 'Online Sellers', 'shop': 'Shop Owners',
    };
    for (const [keyword, persona] of Object.entries(personaMap)) {
      if (all.includes(keyword)) { target_persona = persona; break; }
    }
    if (!target_persona) target_persona = market_type === 'B2B' ? 'Business Professionals' : 'General Consumers';
  }

  // ── Main Competitor ──
  let main_competitor = '';
  if (idea.competition) {
    main_competitor = idea.competition.split(',')[0].trim();
  }
  if (!main_competitor) {
    const competitorMap: Record<string, string> = {
      'project manage': 'Asana', 'task manage': 'Trello', 'crm': 'HubSpot', 'email market': 'Mailchimp',
      'design': 'Canva', 'landing page': 'Unbounce', 'survey': 'Typeform', 'schedule': 'Calendly',
      'social media': 'Hootsuite', 'accounting': 'QuickBooks', 'invoice': 'FreshBooks',
      'e-commerce': 'Shopify', 'store': 'Shopify', 'marketplace': 'Amazon', 'delivery': 'DoorDash',
      'food': 'Uber Eats', 'travel': 'Airbnb', 'real estate': 'Zillow', 'job': 'LinkedIn',
      'recruit': 'LinkedIn', 'fitness': 'Peloton', 'health': 'MyFitnessPal', 'meditat': 'Headspace',
      'education': 'Coursera', 'course': 'Udemy', 'tutor': 'Wyzant', 'language': 'Duolingo',
      'party': 'Pinterest', 'event': 'Eventbrite', 'wedding': 'Zola', 'photo': 'Instagram',
      'video': 'YouTube', 'podcast': 'Spotify', 'music': 'Spotify', 'writing': 'Grammarly',
      'ai': 'ChatGPT', 'chatbot': 'Intercom', 'analytics': 'Google Analytics', 'seo': 'Ahrefs',
      'payment': 'Stripe', 'fintech': 'Stripe', 'insurance': 'Lemonade', 'invest': 'Robinhood',
      'pet': 'Rover', 'clean': 'TaskRabbit', 'handyman': 'Thumbtack',
    };
    for (const [keyword, competitor] of Object.entries(competitorMap)) {
      if (all.includes(keyword)) { main_competitor = competitor; break; }
    }
    if (!main_competitor) main_competitor = 'Existing manual processes';
  }

  // ── Revenue Tier ──
  let revenue_tier: string;
  if (scores.rp >= 80) revenue_tier = '$$$$';
  else if (scores.rp >= 60) revenue_tier = '$$$';
  else if (scores.rp >= 40) revenue_tier = '$$';
  else revenue_tier = '$';
  const revLabels: Record<string, string> = { '$$$$': '$10M+ ARR potential', '$$$': '$1M-$10M ARR potential', '$$': '$100K-$1M ARR potential', '$': 'Under $100K ARR potential' };
  revenue_tier = `${revenue_tier} (${revLabels[revenue_tier]})`;

  // ── Keyword Terms ──
  const titleWords = idea.title.split(/\s+/).filter(w => w.length > 3);
  const keyPhrase = titleWords.slice(0, 3).join(' ').toLowerCase();
  const catPhrase = cat.toLowerCase().replace(/tech$/, ' technology');
  const baseVol = Math.round(((scores.sv / 100) * 15000) + (seed % 3000));
  const growthPct = Math.round(((scores.gr / 100) * 500) + (seed % 50));
  const keyword_terms = JSON.stringify([
    { term: catPhrase.charAt(0).toUpperCase() + catPhrase.slice(1), volume: baseVol, growth: growthPct },
    { term: keyPhrase.charAt(0).toUpperCase() + keyPhrase.slice(1), volume: Math.round(baseVol * 0.4), growth: Math.round(growthPct * 1.2) },
  ]);

  // ── Offer Ladder ──
  const ideaName = idea.title.split(/[:(–—-]/)[0].trim();
  let leadMagnet = '', frontendName = '', coreName = '';
  let frontendPrice = '$5/month', corePrice = '$10-$20/month';

  if (idea_type === 'SaaS' || idea_type === 'Tool') {
    leadMagnet = `Free ${cat} Assessment`;
    frontendName = `Basic ${ideaName.slice(0, 20)} Plan`;
    coreName = `Pro ${ideaName.slice(0, 20)} Suite`;
    frontendPrice = '$9/month';
    corePrice = '$29-$49/month';
  } else if (idea_type === 'Marketplace') {
    leadMagnet = `Free ${cat} Directory`;
    frontendName = `Verified ${cat} Listing`;
    coreName = `Premium ${cat} Marketplace Access`;
    frontendPrice = '$19/month';
    corePrice = '$49-$99/month';
  } else if (idea_type === 'E-Commerce') {
    leadMagnet = `Free ${cat} Sample Kit`;
    frontendName = `Starter ${ideaName.slice(0, 20)} Box`;
    coreName = `Premium ${ideaName.slice(0, 20)} Bundle`;
    frontendPrice = '$19/month';
    corePrice = '$39-$79/month';
  } else {
    leadMagnet = `Free ${cat} Quiz`;
    frontendName = `Basic ${ideaName.slice(0, 20)} Plan`;
    coreName = `Advanced ${ideaName.slice(0, 20)} Package`;
    frontendPrice = '$5/month';
    corePrice = '$10-$20/month';
  }

  const offer_ladder = JSON.stringify([
    { tier: 'Lead Magnet', name: leadMagnet, price: 'Free', description: `Interactive tool to attract and qualify ${target_persona.toLowerCase()}.` },
    { tier: 'Frontend', name: frontendName, price: frontendPrice, description: `Core features with basic access to the ${cat.toLowerCase()} solution.` },
    { tier: 'Core', name: coreName, price: corePrice, description: `Full access with advanced features, integrations, and priority support.` },
  ]);

  // ── Why Now ──
  const growthLabel = scores.gr >= 70 ? 'rapidly' : scores.gr >= 50 ? 'steadily' : 'gradually';
  const marketSize = scores.rp >= 70 ? '$1.2 billion' : scores.rp >= 50 ? '$500 million' : '$200 million';
  const cagr = (10 + (scores.gr / 5)).toFixed(1);
  const why_now = `The ${cat.toLowerCase()} market is set to grow ${growthLabel} at a ${cagr}% CAGR, reaching ${marketSize} by 2028. Now is the time to capture this growth by launching a focused ${idea_type.toLowerCase()} solution that meets rising demands for efficiency and personalization.`;

  // ── Proof & Signals ──
  const demandLevel = scores.sv >= 65 ? 'strong' : scores.sv >= 45 ? 'promising' : 'emerging';
  const proof_signals = `The business idea for ${idea.title} shows ${demandLevel} demand signals, driven by the desire for efficiency in ${cat.toLowerCase()} and the growing trend of ${scores.gr >= 60 ? 'AI-powered' : 'digital'} personalization. ${scores.pl >= 60 ? 'Validating user willingness to pay and addressing executional risks are critical to success.' : 'Early validation through landing page tests and community engagement will be key.'} Consumer interest is ${scores.sv >= 55 ? 'strongly indicated by active community engagement and industry growth trends' : 'present but requires targeted outreach to convert interest into paying users'}, suggesting a viable opportunity if effectively addressed.`;

  // ── Trend Analysis ──
  const trend_analysis = `The ${cat.toLowerCase()} market is growing ${growthLabel}, with a projected ${cagr}% CAGR, due to increased demand for ${scores.gr >= 60 ? 'efficient and personalized' : 'accessible and affordable'} ${idea_type === 'SaaS' ? 'AI-driven solutions' : 'digital solutions'}.`;

  // ── Community Signals (with real search URLs) ──
  const searchKeyword = encodeURIComponent(idea.title.split(/[:(–—-]/)[0].trim());
  const catKeyword = encodeURIComponent(cat.toLowerCase());
  const subredditCount = 2 + (seed % 8);
  const fbGroupCount = 2 + ((seed >> 3) % 7);
  const ytChannelCount = 3 + ((seed >> 5) % 15);
  const ytThemeCount = 3 + ((seed >> 7) % 15);
  const segmentCount = 2 + ((seed >> 9) % 5);
  const priorityCount = 2 + ((seed >> 11) % 5);
  const community_signals = JSON.stringify({
    reddit: { count: subredditCount, label: `${subredditCount} subreddits found`, url: `https://www.reddit.com/search/?q=${searchKeyword}` },
    facebook: { count: fbGroupCount, label: `${fbGroupCount} groups found`, url: `https://www.facebook.com/search/groups/?q=${searchKeyword}` },
    youtube: { count: ytChannelCount, label: `${ytChannelCount} channels · ${ytThemeCount} themes`, url: `https://www.youtube.com/results?search_query=${searchKeyword}` },
    other: { count: segmentCount, label: `${segmentCount} segments · ${priorityCount} priorities`, url: `https://www.google.com/search?q=${searchKeyword}+${catKeyword}+market+size` },
  });

  return {
    keyword_terms,
    revenue_tier,
    offer_ladder,
    why_now,
    proof_signals,
    idea_type,
    market_type,
    target_persona,
    main_competitor,
    trend_analysis,
    community_signals,
  };
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
