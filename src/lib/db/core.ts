// ─── DB Core ─────────────────────────────────────────────────────────────────
// Foundational DB access + activity_log + shared utility types.
// This module is imported by all domain modules; it cannot itself import from
// any of them (would create cycles). Everything in here is intentionally tiny.

import { v4 as uuidv4 } from "uuid";
import { getDb } from "./schema";

export { getDb };

// ── Activity log ─────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  project_id: string | null;
  action: string;
  details: string | null;
  rail: string | null;
  skill_used: string | null;
  created_at: string;
}

export function getActivity(limit: number = 50): ActivityEntry[] {
  return getDb().prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?").all(limit) as ActivityEntry[];
}

export function getProjectActivity(projectId: string, limit: number = 50): ActivityEntry[] {
  return getDb().prepare("SELECT * FROM activity_log WHERE project_id = ? ORDER BY created_at DESC LIMIT ?").all(projectId, limit) as ActivityEntry[];
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
  return getDb().prepare("SELECT * FROM activity_log WHERE id = ?").get(id) as ActivityEntry;
}
