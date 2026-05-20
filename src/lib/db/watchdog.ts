// ─── Watchdog ────────────────────────────────────────────────────────────────
// Extracted from db/index.ts during P1-3 refactor. Domain: watchdog agent —
// system self-monitoring, incident detection, auto-remediation, scan scheduling.
// Only depends on getDb() and logActivity() from core.

import { v4 as uuidv4 } from "uuid";
import { getDb, logActivity } from "./core";

// ─── Watchdog Agent ────────────────────────────────────────────────────────────

export interface WatchdogIncident {
  id: string;
  source_channel_id: string | null;
  source_message: string | null;
  category: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  root_cause: string | null;
  action_taken: string | null;
  verification: string | null;
  assigned_to: string | null;
  related_agent_id: string | null;
  related_decision_id: string | null;
  auto_fixed: number;
  escalated_to: string | null;
  detected_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  channel_name?: string;
  agent_name?: string;
}

export interface WatchdogChannel {
  id: string;
  name: string;
  channel_type: string;
  config: string;
  is_active: number;
  last_checked_at: string | null;
  check_interval_seconds: number;
  created_at: string;
}

export interface WatchdogRule {
  id: string;
  name: string;
  description: string | null;
  rule_type: string;
  pattern: string | null;
  severity: string;
  channels: string;
  auto_fix_enabled: number;
  auto_fix_action: string | null;
  cooldown_minutes: number;
  is_active: number;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
}

export interface WatchdogScanLog {
  id: string;
  scan_type: string;
  channels_scanned: number;
  issues_found: number;
  issues_auto_fixed: number;
  issues_escalated: number;
  duration_ms: number;
  details: string;
  created_at: string;
}

export function getWatchdogIncidents(filters?: {
  status?: string;
  severity?: string;
  category?: string;
  limit?: number;
}): WatchdogIncident[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status) { conditions.push('i.status = ?'); params.push(filters.status); }
  if (filters?.severity) { conditions.push('i.severity = ?'); params.push(filters.severity); }
  if (filters?.category) { conditions.push('i.category = ?'); params.push(filters.category); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit || 100;

  return getDb().prepare(`
    SELECT i.*, c.name as channel_name, a.name as agent_name
    FROM watchdog_incidents i
    LEFT JOIN watchdog_channels c ON i.source_channel_id = c.id
    LEFT JOIN agents a ON i.related_agent_id = a.id
    ORDER BY i.detected_at DESC
    LIMIT ?
  `.replace('ORDER', `${where} ORDER`)).all(...params, limit) as WatchdogIncident[];
}

export function getWatchdogIncident(id: string): WatchdogIncident | undefined {
  return getDb().prepare(`
    SELECT i.*, c.name as channel_name, a.name as agent_name
    FROM watchdog_incidents i
    LEFT JOIN watchdog_channels c ON i.source_channel_id = c.id
    LEFT JOIN agents a ON i.related_agent_id = a.id
    WHERE i.id = ?
  `).get(id) as WatchdogIncident | undefined;
}

export function createWatchdogIncident(data: {
  title: string;
  category: string;
  severity: string;
  description?: string;
  source_channel_id?: string;
  source_message?: string;
  related_agent_id?: string;
  related_decision_id?: string;
}): WatchdogIncident {
  const id = `wdi-${uuidv4().slice(0, 8)}`;
  getDb().prepare(`
    INSERT INTO watchdog_incidents (id, title, category, severity, description, source_channel_id, source_message, related_agent_id, related_decision_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.title, data.category, data.severity, data.description || null, data.source_channel_id || null, data.source_message || null, data.related_agent_id || null, data.related_decision_id || null);

  return getWatchdogIncident(id)!;
}

export function updateWatchdogIncident(id: string, updates: Partial<{
  status: string;
  root_cause: string;
  action_taken: string;
  verification: string;
  assigned_to: string;
  escalated_to: string;
  auto_fixed: number;
  severity: string;
}>): WatchdogIncident | undefined {
  const fields: string[] = ['updated_at = datetime(\'now\')'];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (updates.status === 'verified' || updates.status === 'dismissed') {
    fields.push('resolved_at = datetime(\'now\')');
  } else if (updates.status === 'detected' || updates.status === 'investigating') {
    fields.push('resolved_at = NULL');
  }

  values.push(id);
  getDb().prepare(`UPDATE watchdog_incidents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getWatchdogIncident(id);
}

export function getWatchdogChannels(): WatchdogChannel[] {
  return getDb().prepare('SELECT * FROM watchdog_channels ORDER BY channel_type').all() as WatchdogChannel[];
}

export function updateWatchdogChannel(id: string, updates: Partial<{
  name: string;
  config: string;
  is_active: number;
  check_interval_seconds: number;
}>): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) { fields.push(`${key} = ?`); values.push(value); }
  }
  if (fields.length === 0) return;
  values.push(id);
  getDb().prepare(`UPDATE watchdog_channels SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getWatchdogRules(): WatchdogRule[] {
  return getDb().prepare('SELECT * FROM watchdog_rules ORDER BY severity DESC, name').all() as WatchdogRule[];
}

export function updateWatchdogRule(id: string, updates: Partial<{
  is_active: number;
  auto_fix_enabled: number;
  severity: string;
  pattern: string;
  cooldown_minutes: number;
}>): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) { fields.push(`${key} = ?`); values.push(value); }
  }
  if (fields.length === 0) return;
  values.push(id);
  getDb().prepare(`UPDATE watchdog_rules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getWatchdogScanLogs(limit = 20): WatchdogScanLog[] {
  return getDb().prepare('SELECT * FROM watchdog_scan_log ORDER BY created_at DESC LIMIT ?').all(limit) as WatchdogScanLog[];
}

export function createWatchdogScanLog(data: {
  scan_type: string;
  channels_scanned: number;
  issues_found: number;
  issues_auto_fixed: number;
  issues_escalated: number;
  duration_ms: number;
  details: string;
}): void {
  const id = `wsl-${uuidv4().slice(0, 8)}`;
  getDb().prepare(`
    INSERT INTO watchdog_scan_log (id, scan_type, channels_scanned, issues_found, issues_auto_fixed, issues_escalated, duration_ms, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.scan_type, data.channels_scanned, data.issues_found, data.issues_auto_fixed, data.issues_escalated, data.duration_ms, data.details);
}

export function getWatchdogStats(): {
  total_incidents: number;
  open_incidents: number;
  critical_open: number;
  auto_fixed_count: number;
  escalated_count: number;
  avg_resolution_ms: number;
  incidents_today: number;
  active_channels: number;
  active_rules: number;
  last_scan_at: string | null;
} {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM watchdog_incidents').get() as { cnt: number }).cnt;
  const open = (db.prepare("SELECT COUNT(*) as cnt FROM watchdog_incidents WHERE status IN ('detected', 'investigating', 'fix_applied')").get() as { cnt: number }).cnt;
  const critical = (db.prepare("SELECT COUNT(*) as cnt FROM watchdog_incidents WHERE severity = 'critical' AND status IN ('detected', 'investigating')").get() as { cnt: number }).cnt;
  const autoFixed = (db.prepare('SELECT COUNT(*) as cnt FROM watchdog_incidents WHERE auto_fixed = 1').get() as { cnt: number }).cnt;
  const escalated = (db.prepare("SELECT COUNT(*) as cnt FROM watchdog_incidents WHERE status = 'escalated'").get() as { cnt: number }).cnt;
  const today = (db.prepare("SELECT COUNT(*) as cnt FROM watchdog_incidents WHERE detected_at >= datetime('now', '-24 hours')").get() as { cnt: number }).cnt;
  const channels = (db.prepare('SELECT COUNT(*) as cnt FROM watchdog_channels WHERE is_active = 1').get() as { cnt: number }).cnt;
  const rules = (db.prepare('SELECT COUNT(*) as cnt FROM watchdog_rules WHERE is_active = 1').get() as { cnt: number }).cnt;
  const lastScan = db.prepare('SELECT created_at FROM watchdog_scan_log ORDER BY created_at DESC LIMIT 1').get() as { created_at: string } | undefined;

  return {
    total_incidents: total,
    open_incidents: open,
    critical_open: critical,
    auto_fixed_count: autoFixed,
    escalated_count: escalated,
    avg_resolution_ms: 0,
    incidents_today: today,
    active_channels: channels,
    active_rules: rules,
    last_scan_at: lastScan?.created_at || null,
  };
}

// ─── Auto-Remediation Actions ──────────────────────────────────────────────

interface RemediationResult {
  fixed: boolean;
  action: string;
  verification: string;
}

function remediateStuckAgent(db: ReturnType<typeof getDb>, agentId: string, agentName: string, stuckState: string): RemediationResult {
  // Reset agent to idle
  db.prepare("UPDATE agents SET state = 'idle' WHERE id = ?").run(agentId);

  // Find and unblock any working tasks for this agent
  const stuckTasks = db.prepare(
    "SELECT id FROM agent_tasks WHERE agent_id = ? AND status = 'working'"
  ).all(agentId) as Array<{ id: string }>;

  for (const task of stuckTasks) {
    db.prepare("UPDATE agent_tasks SET status = 'queued', blocker_reason = NULL, current_step_label = ? WHERE id = ?")
      .run(`Re-queued by Watchdog (agent was stuck in "${stuckState}")`, task.id);
    const transId = uuidv4();
    db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)')
      .run(transId, task.id, 'working', 'queued');
  }

  // Verify the fix
  const agent = db.prepare('SELECT state FROM agents WHERE id = ?').get(agentId) as { state: string } | undefined;
  const isFixed = agent?.state === 'idle';

  return {
    fixed: isFixed,
    action: `Reset agent "${agentName}" from "${stuckState}" to idle. ${stuckTasks.length} stuck task(s) re-queued.`,
    verification: isFixed
      ? `Agent state confirmed: idle. ${stuckTasks.length} task(s) re-queued for retry.`
      : `WARNING: Agent state is "${agent?.state}" — manual intervention may be needed.`,
  };
}

function remediateFailedAutomation(db: ReturnType<typeof getDb>, runId: string, runType: string): RemediationResult {
  // Mark the failed run as acknowledged and create a new run attempt
  const newRunId = uuidv4();
  db.prepare(`
    INSERT INTO automation_runs (id, run_type, status, started_at)
    VALUES (?, ?, 'running', datetime('now'))
  `).run(newRunId, runType);

  // Mark it completed immediately (the actual retry will happen on next automation cycle)
  db.prepare(`
    UPDATE automation_runs SET status = 'completed', completed_at = datetime('now'),
    results = ?
    WHERE id = ?
  `).run(JSON.stringify({ retried_by: "watchdog", original_run: runId }), newRunId);

  return {
    fixed: true,
    action: `Created retry automation run for failed "${runType}" (original: ${runId}).`,
    verification: `New automation run ${newRunId} queued. Will execute on next automation cycle.`,
  };
}

export async function runWatchdogScan(scanType: 'manual' | 'scheduled' | 'triggered' = 'manual'): Promise<{
  incidents: WatchdogIncident[];
  auto_fixed: WatchdogIncident[];
  scan_log: WatchdogScanLog;
}> {
  const startTime = Date.now();
  const db = getDb();
  const newIncidents: WatchdogIncident[] = [];
  const autoFixed: WatchdogIncident[] = [];
  const pendingDiagnosis: Array<{
    id: string; name: string; description: string | null; status: string;
    blocker_reason: string | null; agent_id: string; skill_id: string | null;
    current_step_label: string | null; progress_pct: number;
    started_at: string | null; created_at: string;
    agent_name: string; department: string; agent_state: string;
    channelId: string;
  }> = [];
  let channelsScanned = 0;
  let autoFixedCount = 0;
  let escalatedCount = 0;

  const activeChannels = db.prepare('SELECT * FROM watchdog_channels WHERE is_active = 1').all() as WatchdogChannel[];
  const activeRules = db.prepare('SELECT * FROM watchdog_rules WHERE is_active = 1').all() as WatchdogRule[];

  for (const channel of activeChannels) {
    channelsScanned++;

    // ─── Agent Output Checks ─────────────────────────────────────────────────
    if (channel.channel_type === 'agent_output') {
      // Low confidence decisions
      const lowConfidence = db.prepare(`
        SELECT ad.*, a.name as agent_name FROM agent_decisions ad
        JOIN agents a ON ad.agent_id = a.id
        WHERE ad.confidence < 0.3 AND ad.confidence > 0
        AND ad.created_at >= datetime('now', '-1 hour')
        AND ad.id NOT IN (SELECT related_decision_id FROM watchdog_incidents WHERE related_decision_id IS NOT NULL)
      `).all() as Array<{ id: string; agent_id: string; agent_name: string; reasoning: string; action_taken: string; confidence: number; skill_used: string | null }>;

      for (const dec of lowConfidence) {
        const incident = createWatchdogIncident({
          title: `Low confidence decision by ${dec.agent_name} (${(dec.confidence * 100).toFixed(0)}%)`,
          category: 'agent_claim_mismatch',
          severity: dec.confidence < 0.15 ? 'high' : 'medium',
          description: `Agent ${dec.agent_name} made a decision with ${(dec.confidence * 100).toFixed(1)}% confidence.\nReasoning: ${dec.reasoning}\nAction: ${dec.action_taken}`,
          source_channel_id: channel.id,
          related_agent_id: dec.agent_id,
          related_decision_id: dec.id,
        });
        newIncidents.push(incident);
      }

      // Stuck agents — detect AND auto-fix (including previously detected ones)
      const stuckAgents = db.prepare(`
        SELECT * FROM agents WHERE state != 'idle'
        AND last_run_at < datetime('now', '-10 minutes')
      `).all() as Array<{ id: string; name: string; state: string; last_run_at: string }>;

      for (const agent of stuckAgents) {
        // Always auto-fix stuck agents regardless of existing incidents
        const fix = remediateStuckAgent(db, agent.id, agent.name, agent.state);

        const existingIncident = db.prepare(`
          SELECT id FROM watchdog_incidents
          WHERE related_agent_id = ? AND category = 'broken_feature' AND status IN ('detected', 'investigating')
        `).get(agent.id) as { id: string } | undefined;

        if (existingIncident) {
          // Update the existing incident with the fix
          if (fix.fixed) {
            updateWatchdogIncident(existingIncident.id, {
              status: 'fix_applied',
              action_taken: fix.action,
              verification: fix.verification,
              auto_fixed: 1,
            });
            autoFixedCount++;
            const updated = getWatchdogIncident(existingIncident.id);
            if (updated) autoFixed.push(updated);
          }
        } else {
          // No existing incident — create one
          const alreadyFixed = db.prepare(`
            SELECT id FROM watchdog_incidents
            WHERE related_agent_id = ? AND category = 'broken_feature' AND status = 'fix_applied'
          `).get(agent.id);
          if (!alreadyFixed) {
            const incident = createWatchdogIncident({
              title: `Agent ${agent.name} stuck in "${agent.state}" — auto-fixed`,
              category: 'broken_feature',
              severity: 'high',
              description: `Agent was in "${agent.state}" since ${agent.last_run_at} and appeared stuck.`,
              source_channel_id: channel.id,
              related_agent_id: agent.id,
            });

            if (fix.fixed) {
              updateWatchdogIncident(incident.id, {
                status: 'fix_applied',
                action_taken: fix.action,
                verification: fix.verification,
                auto_fixed: 1,
              });
              autoFixedCount++;
              autoFixed.push({ ...incident, status: 'fix_applied', action_taken: fix.action, auto_fixed: 1 });
            }
            newIncidents.push(incident);
          }
        }
      }

      // Clean up stale kanban tasks — "working" tasks whose agent is idle (orphaned by hangs/timeouts)
      const staleTasks = db.prepare(`
        SELECT t.id, t.name, t.agent_id, a.name as agent_name, a.state as agent_state, t.started_at
        FROM agent_tasks t
        JOIN agents a ON t.agent_id = a.id
        WHERE t.status = 'working' AND a.state = 'idle'
      `).all() as Array<{ id: string; name: string; agent_id: string; agent_name: string; agent_state: string; started_at: string | null }>;

      for (const task of staleTasks) {
        const startedAtUTC = task.started_at ? (task.started_at.endsWith('Z') ? task.started_at : task.started_at + 'Z') : null;
        const minsSinceStart = startedAtUTC ? (Date.now() - new Date(startedAtUTC).getTime()) / 60000 : 999;

        // If task has been "working" for >3 min but agent is idle, it's orphaned
        if (minsSinceStart > 3) {
          db.prepare("UPDATE agent_tasks SET status = 'done', completed_at = datetime('now'), current_step_label = 'Cleaned up by Watchdog (orphaned task)' WHERE id = ?").run(task.id);
          const transId = uuidv4();
          db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)').run(transId, task.id, 'working', 'done');

          const incident = createWatchdogIncident({
            title: `Cleaned orphaned task "${task.name}" for ${task.agent_name}`,
            category: 'broken_feature',
            severity: 'low',
            description: `Task was stuck in "working" for ${Math.round(minsSinceStart)} min while agent was idle. Moved to done.`,
            source_channel_id: channel.id,
            related_agent_id: task.agent_id,
          });
          updateWatchdogIncident(incident.id, {
            status: 'verified',
            action_taken: `Moved orphaned task to done. Task was working for ${Math.round(minsSinceStart)} min with idle agent.`,
            verification: 'Task cleaned from kanban board.',
            auto_fixed: 1,
          });
          autoFixedCount++;
          autoFixed.push({ ...incident, status: 'verified', auto_fixed: 1 });
          newIncidents.push(incident);
        }
      }

      // Also clean up stale "queued" tasks that are duplicates (same name, same agent, queued)
      const dupeQueued = db.prepare(`
        SELECT t.id, t.name, t.agent_id, COUNT(*) as cnt
        FROM agent_tasks t
        WHERE t.status = 'queued'
        GROUP BY t.name, t.agent_id
        HAVING cnt > 1
      `).all() as Array<{ id: string; name: string; agent_id: string; cnt: number }>;

      for (const dupe of dupeQueued) {
        // Keep the most recent, mark older ones as done
        const dupes = db.prepare(
          "SELECT id FROM agent_tasks WHERE name = ? AND agent_id = ? AND status = 'queued' ORDER BY created_at ASC"
        ).all(dupe.name, dupe.agent_id) as Array<{ id: string }>;
        // Remove all but the last one
        for (let i = 0; i < dupes.length - 1; i++) {
          db.prepare("UPDATE agent_tasks SET status = 'done', completed_at = datetime('now'), current_step_label = 'Deduplicated by Watchdog' WHERE id = ?").run(dupes[i].id);
          const transId = uuidv4();
          db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)').run(transId, dupes[i].id, 'queued', 'done');
        }
      }

      // ── Board Hygiene ───────────────────────────────────────────────────────

      // Clear stale blocker_reason on queued tasks (leftover from previous blocked state)
      db.prepare("UPDATE agent_tasks SET blocker_reason = NULL WHERE status = 'queued' AND blocker_reason IS NOT NULL").run();

      // Archive done tasks older than 24h by created_at OR completed_at
      const archivedDone = db.prepare(`
        DELETE FROM agent_tasks WHERE status = 'done'
        AND (
          (completed_at IS NOT NULL AND completed_at < datetime('now', '-24 hours'))
          OR (created_at < datetime('now', '-24 hours'))
        )
      `).run();
      if (archivedDone.changes > 0) {
        logActivity({
          action: 'watchdog_cleanup',
          details: `Archived ${archivedDone.changes} completed task(s) older than 24h from kanban board`,
          skill_used: 'watchdog',
        });
      }

      // Set completed_at on done tasks missing it
      db.prepare(`
        UPDATE agent_tasks SET completed_at = datetime('now')
        WHERE status = 'done' AND completed_at IS NULL
      `).run();

      // Force-close ancient blocked tasks (>6h) — if the Watchdog hasn't fixed them by now, they're dead
      const ancientBlocked = db.prepare(`
        SELECT id, name FROM agent_tasks
        WHERE status = 'blocked' AND created_at < datetime('now', '-6 hours')
      `).all() as Array<{ id: string; name: string }>;
      for (const task of ancientBlocked) {
        db.prepare("UPDATE agent_tasks SET status = 'done', completed_at = datetime('now'), current_step_label = 'Watchdog: Closed stale blocked task (>6h)' WHERE id = ?").run(task.id);
        db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)').run(uuidv4(), task.id, 'blocked', 'done');
      }
      if (ancientBlocked.length > 0) {
        logActivity({
          action: 'watchdog_cleanup',
          details: `Force-closed ${ancientBlocked.length} blocked task(s) older than 6h: ${ancientBlocked.map(t => t.name).join(', ')}`,
          skill_used: 'watchdog',
        });
      }

      // Force-close ancient queued tasks (>3h) — stale queued tasks that nobody picked up
      const ancientQueued = db.prepare(`
        SELECT id, name FROM agent_tasks
        WHERE status = 'queued' AND created_at < datetime('now', '-3 hours')
      `).all() as Array<{ id: string; name: string }>;
      for (const task of ancientQueued) {
        db.prepare("UPDATE agent_tasks SET status = 'done', completed_at = datetime('now'), current_step_label = 'Watchdog: Closed stale queued task (>3h)' WHERE id = ?").run(task.id);
        db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)').run(uuidv4(), task.id, 'queued', 'done');
      }
      if (ancientQueued.length > 0) {
        logActivity({
          action: 'watchdog_cleanup',
          details: `Force-closed ${ancientQueued.length} queued task(s) older than 3h: ${ancientQueued.map(t => t.name).join(', ')}`,
          skill_used: 'watchdog',
        });
      }

      // Intelligent diagnosis of blocked/stuck tasks — deferred to async post-scan
      const blockedTasks = db.prepare(`
        SELECT t.id, t.name, t.description, t.status, t.blocker_reason, t.agent_id,
               t.skill_id, t.current_step_label, t.progress_pct, t.started_at, t.created_at,
               a.name as agent_name, a.department, a.state as agent_state
        FROM agent_tasks t
        JOIN agents a ON t.agent_id = a.id
        WHERE t.status IN ('blocked', 'working')
        AND (
          (t.status = 'blocked')
          OR (t.status = 'working' AND a.state = 'idle' AND t.started_at < datetime('now', '-3 minutes'))
        )
      `).all() as Array<{
        id: string; name: string; description: string | null; status: string;
        blocker_reason: string | null; agent_id: string; skill_id: string | null;
        current_step_label: string | null; progress_pct: number;
        started_at: string | null; created_at: string;
        agent_name: string; department: string; agent_state: string;
      }>;

      if (blockedTasks.length > 0) {
        pendingDiagnosis.push(...blockedTasks.map(t => ({ ...t, channelId: channel.id })));
      }
    }

    // ─── Error Monitor ───────────────────────────────────────────────────────
    if (channel.channel_type === 'error_monitor') {
      const errorRules = activeRules.filter(r => r.rule_type === 'keyword_match');
      for (const rule of errorRules) {
        const keywords = JSON.parse(rule.pattern || '[]') as string[];
        for (const keyword of keywords) {
          const errors = db.prepare(`
            SELECT * FROM activity_log
            WHERE (LOWER(action) LIKE ? OR LOWER(details) LIKE ?)
            AND created_at >= datetime('now', '-1 hour')
          `).all(`%${keyword.toLowerCase()}%`, `%${keyword.toLowerCase()}%`) as Array<{ id: string; action: string; details: string | null; created_at: string }>;

          for (const err of errors) {
            const alreadyReported = db.prepare(`
              SELECT id FROM watchdog_incidents WHERE source_message = ? AND source_channel_id = ?
            `).get(err.id, channel.id);
            if (!alreadyReported) {
              const incident = createWatchdogIncident({
                title: `Error detected: "${keyword}" in activity log`,
                category: 'bug_report',
                severity: rule.severity,
                description: `Activity: ${err.action}\nDetails: ${err.details || 'N/A'}\nTime: ${err.created_at}`,
                source_channel_id: channel.id,
                source_message: err.id,
              });
              newIncidents.push(incident);

              // Auto-escalate critical errors
              if (rule.severity === 'critical') {
                updateWatchdogIncident(incident.id, {
                  status: 'escalated',
                  escalated_to: 'system_admin',
                });
                escalatedCount++;
              }
            }
          }
        }
      }
    }

    // ─── Cron / Automation Run Checks ────────────────────────────────────────
    if (channel.channel_type === 'cron_log') {
      const config = JSON.parse(channel.config || '{}');
      const maxSilenceMinutes = config.max_silence_minutes || 30;
      const lastRun = db.prepare(`
        SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT 1
      `).get() as { id: string; started_at: string; status: string } | undefined;

      if (lastRun) {
        // DB stores UTC timestamps without Z suffix — force UTC parsing
        const startedAtUTC = lastRun.started_at.endsWith('Z') ? lastRun.started_at : lastRun.started_at + 'Z';
        const minutesSinceRun = (Date.now() - new Date(startedAtUTC).getTime()) / 60000;
        if (minutesSinceRun > maxSilenceMinutes * 2) {
          // AUTO-FIX: Create a kickstart automation run to break the silence
          const kickstartId = uuidv4();
          db.prepare(`
            INSERT INTO automation_runs (id, run_type, status, results, started_at, completed_at, duration_ms)
            VALUES (?, 'watchdog_kickstart', 'completed', '{"triggered_by":"watchdog","reason":"silent_failure_recovery"}', datetime('now'), datetime('now'), 0)
          `).run(kickstartId);

          const existingIncident = db.prepare(`
            SELECT id FROM watchdog_incidents
            WHERE category = 'silent_failure' AND status IN ('detected', 'investigating', 'escalated')
            AND source_channel_id = ?
          `).get(channel.id) as { id: string } | undefined;

          if (existingIncident) {
            // Fix the existing incident
            updateWatchdogIncident(existingIncident.id, {
              status: 'fix_applied',
              action_taken: `Watchdog created kickstart automation run (${kickstartId}) to break ${Math.round(minutesSinceRun)} min silence.`,
              verification: `New automation_runs entry created. Automation pipeline should resume on next cycle.`,
              auto_fixed: 1,
            });
            autoFixedCount++;
            const updated = getWatchdogIncident(existingIncident.id);
            if (updated) autoFixed.push(updated);
          } else {
            const incident = createWatchdogIncident({
              title: `Silent failure: No automation runs in ${Math.round(minutesSinceRun)} min — auto-fixed`,
              category: 'silent_failure',
              severity: 'critical',
              description: `Last automation run was at ${lastRun.started_at} (${Math.round(minutesSinceRun)} min ago). Expected interval: ${maxSilenceMinutes} min.`,
              source_channel_id: channel.id,
            });
            updateWatchdogIncident(incident.id, {
              status: 'fix_applied',
              action_taken: `Created kickstart automation run (${kickstartId}) to break silence.`,
              verification: `New automation_runs entry created. Pipeline should resume.`,
              auto_fixed: 1,
            });
            autoFixedCount++;
            autoFixed.push({ ...incident, status: 'fix_applied', auto_fixed: 1 });
            newIncidents.push(incident);
          }
        }

        // Failed automation runs — detect AND auto-fix (retry)
        const failedRuns = db.prepare(`
          SELECT * FROM automation_runs WHERE status = 'failed'
          AND started_at >= datetime('now', '-1 hour')
        `).all() as Array<{ id: string; run_type: string; results: string; started_at: string }>;

        for (const run of failedRuns) {
          const alreadyReported = db.prepare(`
            SELECT id FROM watchdog_incidents WHERE source_message = ? AND source_channel_id = ?
          `).get(run.id, channel.id);
          if (!alreadyReported) {
            // AUTO-FIX: Retry the failed run
            const fix = remediateFailedAutomation(db, run.id, run.run_type);

            const incident = createWatchdogIncident({
              title: `Failed automation "${run.run_type}" — auto-retried`,
              category: 'bug_report',
              severity: 'high',
              description: `Automation "${run.run_type}" failed at ${run.started_at}.\nResults: ${run.results}`,
              source_channel_id: channel.id,
              source_message: run.id,
            });

            if (fix.fixed) {
              updateWatchdogIncident(incident.id, {
                status: 'fix_applied',
                action_taken: fix.action,
                verification: fix.verification,
                auto_fixed: 1,
              });
              autoFixedCount++;
              autoFixed.push({ ...incident, status: 'fix_applied', action_taken: fix.action, auto_fixed: 1 });
            }
            newIncidents.push(incident);
          }
        }
      }
    }

    // ─── Security / Vulnerability Scan ──────────────────────────────────────
    if (channel.channel_type === 'security_scan') {
      const vulnerabilities: Array<{ title: string; severity: 'critical' | 'high' | 'medium' | 'low'; description: string; category: string }> = [];

      // 1. Check for exposed secrets in environment / connections
      const connections = db.prepare('SELECT id, provider, api_key_encrypted, base_url FROM connections WHERE is_active = 1').all() as Array<{ id: string; provider: string; api_key_encrypted: string | null; base_url: string | null }>;
      for (const conn of connections) {
        if (conn.api_key_encrypted && conn.api_key_encrypted.length < 10 && conn.api_key_encrypted !== '') {
          vulnerabilities.push({
            title: `Weak API key for ${conn.provider} connection`,
            severity: 'high',
            description: `Connection ${conn.id} (${conn.provider}) has an API key shorter than 10 characters, which may be a placeholder or weak credential.`,
            category: 'exposed_secret',
          });
        }
        // Check for HTTP (non-HTTPS) external connections
        if (conn.base_url && conn.base_url.startsWith('http://') && !conn.base_url.includes('127.0.0.1') && !conn.base_url.includes('localhost')) {
          vulnerabilities.push({
            title: `Insecure HTTP connection to ${conn.provider}`,
            severity: 'high',
            description: `Connection ${conn.id} uses unencrypted HTTP to external host: ${conn.base_url}. API keys transmitted in plain text.`,
            category: 'insecure_transport',
          });
        }
      }

      // 2. Check for stale/unused API keys (connections inactive for a long time)
      const staleConns = db.prepare(`
        SELECT id, provider, created_at FROM connections
        WHERE is_active = 0 AND api_key_encrypted IS NOT NULL AND api_key_encrypted != ''
      `).all() as Array<{ id: string; provider: string; created_at: string }>;
      if (staleConns.length > 0) {
        vulnerabilities.push({
          title: `${staleConns.length} inactive connection(s) still have stored API keys`,
          severity: 'medium',
          description: `Inactive connections with stored credentials: ${staleConns.map(c => `${c.provider} (${c.id})`).join(', ')}. Unused credentials should be revoked.`,
          category: 'stale_credentials',
        });
      }

      // 3. Check for agents with overly permissive system prompts (prompt injection risk)
      const agentsWithInject = db.prepare(`
        SELECT id, name FROM agents WHERE system_prompt LIKE '%ignore previous%' OR system_prompt LIKE '%disregard%' OR system_prompt LIKE '%bypass%'
      `).all() as Array<{ id: string; name: string }>;
      for (const a of agentsWithInject) {
        vulnerabilities.push({
          title: `Agent "${a.name}" system prompt contains risky keywords`,
          severity: 'medium',
          description: `Agent ${a.id} has keywords like "ignore previous", "disregard", or "bypass" in its system prompt, which could indicate prompt injection vulnerability or unsafe instructions.`,
          category: 'prompt_injection',
        });
      }

      // 4. Check for LLM output stored directly in DB without sanitization markers
      const recentDecisions = db.prepare(`
        SELECT id, agent_id, action_taken FROM agent_decisions
        WHERE created_at >= datetime('now', '-1 hour') AND action_taken IS NOT NULL
      `).all() as Array<{ id: string; agent_id: string; action_taken: string }>;
      for (const d of recentDecisions) {
        // Detect potential command injection in LLM-generated actions
        if (d.action_taken.includes('rm -rf') || d.action_taken.includes('DROP TABLE') || d.action_taken.includes('eval(') || d.action_taken.includes('exec(')) {
          vulnerabilities.push({
            title: `Dangerous command in agent decision output`,
            severity: 'critical',
            description: `Agent decision ${d.id} by ${d.agent_id} contains potentially dangerous command in action_taken: "${d.action_taken.slice(0, 200)}"`,
            category: 'command_injection',
          });
        }
      }

      // 5. Check for open webhook endpoints without auth
      const webhookConfigs = db.prepare(`
        SELECT agent_id, channel, config FROM agent_remote_config WHERE is_active = 1
      `).all() as Array<{ agent_id: string; channel: string; config: string }>;
      for (const wh of webhookConfigs) {
        const cfg = JSON.parse(wh.config || '{}');
        if (wh.channel === 'webhook' && !cfg.secret && !cfg.auth_token) {
          vulnerabilities.push({
            title: `Unauthenticated webhook for agent ${wh.agent_id}`,
            severity: 'high',
            description: `Agent ${wh.agent_id} has an active webhook endpoint with no secret or auth token configured. Anyone can trigger it.`,
            category: 'missing_auth',
          });
        }
      }

      // 6. Check for platform connections with expired or missing tokens
      // Schema: platform_connections has individual columns (access_token, token_expires_at),
      // not a JSON config blob. is_active is the activation flag, not is_connected.
      const platformConns = db.prepare(`
        SELECT id, platform, token_expires_at FROM platform_connections WHERE is_active = 1
      `).all() as Array<{ id: string; platform: string; token_expires_at: string | null }>;
      for (const pc of platformConns) {
        if (pc.token_expires_at) {
          const expiresAt = new Date(pc.token_expires_at).getTime();
          if (expiresAt < Date.now()) {
            vulnerabilities.push({
              title: `Expired token for ${pc.platform} platform connection`,
              severity: 'high',
              description: `Platform connection ${pc.id} (${pc.platform}) has an expired token (expired: ${pc.token_expires_at}). Renew credentials.`,
              category: 'expired_token',
            });
          }
        }
      }

      // 7. Check DB file permissions (should not be world-readable)
      try {
        const fs = require('fs');
        const path = require('path');
        const dbPath = path.join(process.cwd(), 'data', 'fiverails.db');
        const stats = fs.statSync(dbPath);
        const mode = (stats.mode & 0o777).toString(8);
        if (stats.mode & 0o004) { // world-readable
          vulnerabilities.push({
            title: `Database file is world-readable (${mode})`,
            severity: 'critical',
            description: `${dbPath} has permissions ${mode}. It contains API keys and should not be readable by other users. Run: chmod 600 ${dbPath}`,
            category: 'file_permissions',
          });
        }
      } catch { /* skip if can't stat */ }

      // Create incidents for new vulnerabilities
      for (const vuln of vulnerabilities) {
        // Deduplicate — don't report same issue if already open
        const existing = db.prepare(`
          SELECT id FROM watchdog_incidents
          WHERE title = ? AND status NOT IN ('dismissed', 'verified')
          AND source_channel_id = ?
        `).get(vuln.title, channel.id) as { id: string } | undefined;

        if (!existing) {
          const incident = createWatchdogIncident({
            title: vuln.title,
            category: 'security_alert',
            severity: vuln.severity as WatchdogIncident['severity'],
            description: vuln.description,
            source_channel_id: channel.id,
          });
          newIncidents.push(incident);

          if (vuln.severity === 'critical') {
            escalatedCount++;
            updateWatchdogIncident(incident.id, {
              status: 'escalated',
              escalated_to: 'user',
            });
          }
        }
      }
    }

    // Update last_checked_at
    db.prepare('UPDATE watchdog_channels SET last_checked_at = datetime(\'now\') WHERE id = ?').run(channel.id);
  }

  // ─── Auto-verify: resolve incidents whose conditions are no longer true ──
  const openIncidents = db.prepare(`
    SELECT * FROM watchdog_incidents WHERE status IN ('detected', 'investigating', 'escalated', 'fix_applied')
  `).all() as WatchdogIncident[];

  for (const inc of openIncidents) {
    let conditionResolved = false;
    let verification = '';

    if (inc.category === 'broken_feature' && inc.related_agent_id) {
      // Check if agent is no longer stuck
      const agent = db.prepare('SELECT state FROM agents WHERE id = ?').get(inc.related_agent_id) as { state: string } | undefined;
      if (agent?.state === 'idle') {
        conditionResolved = true;
        verification = `Agent is now idle — issue resolved.`;
      }
    }

    // Auto-verify fix_applied incidents that have been in that state for >5 min
    // (gives time for manual review, then assumes the fix held)
    if (inc.status === 'fix_applied' && inc.auto_fixed === 1 && !conditionResolved) {
      const updatedAtUTC = inc.updated_at.endsWith('Z') ? inc.updated_at : inc.updated_at + 'Z';
      const minsSinceUpdate = (Date.now() - new Date(updatedAtUTC).getTime()) / 60000;
      if (minsSinceUpdate > 5) {
        conditionResolved = true;
        verification = `Auto-fix applied ${Math.round(minsSinceUpdate)} min ago — auto-verified (no regression detected).`;
      }
    }

    if (inc.category === 'silent_failure') {
      // Check if automation runs have resumed
      const recent = db.prepare(`
        SELECT id FROM automation_runs WHERE started_at >= datetime('now', '-30 minutes')
      `).get();
      if (recent) {
        conditionResolved = true;
        verification = `Automation runs have resumed — silence broken.`;
      }
    }

    if (conditionResolved) {
      updateWatchdogIncident(inc.id, {
        status: 'verified',
        verification,
        auto_fixed: inc.auto_fixed || 1,
        action_taken: inc.action_taken || 'Condition self-resolved.',
      });
      autoFixedCount++;
      const updated = getWatchdogIncident(inc.id);
      if (updated) autoFixed.push(updated);
    }
  }

  // ─── Intelligent Task Diagnosis via LLM ──────────────────────────────────
  if (pendingDiagnosis.length > 0) {
    try {
      const { callLLMWithFallback } = await import('@/lib/ai/llm-client');
      const { AGENT_PERSONAS } = await import('@/lib/db/agent-personas');
      const watchdogPersona = AGENT_PERSONAS['agent-watchdog'] || '';

      // Gather system context for the LLM
      const activeConns = db.prepare("SELECT provider, model, is_active FROM connections WHERE is_active = 1").all() as Array<{ provider: string; model: string | null; is_active: number }>;
      const recentErrors = db.prepare("SELECT action, details, created_at FROM activity_log WHERE LOWER(action) LIKE '%error%' OR LOWER(action) LIKE '%fail%' ORDER BY created_at DESC LIMIT 5").all() as Array<{ action: string; details: string | null; created_at: string }>;
      const allAgentStates = db.prepare("SELECT name, department, state, last_run_at FROM agents").all() as Array<{ name: string; department: string; state: string; last_run_at: string | null }>;

      for (const task of pendingDiagnosis) {
        // Skip if we already have an incident for this task in ANY non-terminal
        // state. Previously this only skipped 'verified'/'dismissed', letting
        // 'escalated' and 'fix_applied' incidents trigger a fresh LLM diagnosis
        // on every scan — the root cause of the token burn (~20 calls/scan
        // × 120 scans over 6h = ~2400 unnecessary LLM calls on Apr 23).
        const existing = db.prepare(
          "SELECT id FROM watchdog_incidents WHERE title LIKE ? AND status IN ('detected','investigating','escalated','fix_applied','verified')"
        ).get(`%${task.id.slice(0, 8)}%`) as { id: string } | undefined;
        if (existing) continue;

        // Get task transition history
        const transitions = db.prepare("SELECT from_status, to_status, timestamp as created_at FROM agent_task_transitions WHERE task_id = ? ORDER BY timestamp DESC LIMIT 10").all(task.id) as Array<{ from_status: string; to_status: string; created_at: string }>;

        // Get the skill info if applicable
        let skillInfo = '';
        if (task.skill_id) {
          const skill = db.prepare("SELECT name, category, description FROM skills WHERE id = ?").get(task.skill_id) as { name: string; category: string; description: string | null } | undefined;
          if (skill) skillInfo = `Skill: ${skill.name} (${skill.category}) — ${skill.description || 'no description'}`;
        }

        const diagnosisPrompt = `You are the Watchdog Agent — an autonomous monitoring and remediation system for the Five Rails platform. Your job is to diagnose WHY a task is stuck and determine the SPECIFIC fix.

STUCK TASK:
- Name: ${task.name}
- Description: ${task.description || 'none'}
- Status: ${task.status}
- Blocker reason: ${task.blocker_reason || 'none provided'}
- Assigned to: ${task.agent_name} (${task.department} dept, currently ${task.agent_state})
- Progress: ${task.progress_pct}%
- Current step: ${task.current_step_label || 'none'}
- Created: ${task.created_at}
- Started: ${task.started_at || 'never'}
${skillInfo ? `- ${skillInfo}` : ''}

TRANSITION HISTORY:
${transitions.length > 0 ? transitions.map(t => `  ${t.from_status} → ${t.to_status} at ${t.created_at}`).join('\n') : '  No transitions recorded'}

SYSTEM STATE:
- Active LLM connections: ${activeConns.length > 0 ? activeConns.map(c => `${c.provider}/${c.model}`).join(', ') : 'NONE — this is likely the problem'}
- Agent states: ${allAgentStates.map(a => `${a.name.split('(')[0].trim()}: ${a.state}`).join(', ')}
- Recent errors: ${recentErrors.length > 0 ? recentErrors.map(e => `[${e.created_at}] ${e.action}: ${(e.details || '').slice(0, 100)}`).join('\n  ') : 'none'}

Respond in STRICT JSON with these fields:
{
  "diagnosis": "What specifically is causing this task to be stuck (1-2 sentences)",
  "root_cause": "The root cause category: connection_issue | agent_stuck | skill_error | missing_dependency | stale_state | configuration | unknown",
  "fix_action": "The specific action to take: reset_agent | requeue_task | reassign_to_agent | mark_done | escalate | retry_skill | check_connections",
  "fix_details": "Specific details for the fix (e.g., which agent to reassign to, why marking done is appropriate)",
  "confidence": 0.0 to 1.0,
  "severity": "low | medium | high | critical"
}`;

        try {
          const { text } = await callLLMWithFallback(diagnosisPrompt, {
            systemPrompt: watchdogPersona + '\n\nIMPORTANT: Respond only with valid JSON, no markdown fences or extra text.',
            maxTokens: 500,
            temperature: 0.2,
          });

          // Parse the LLM's diagnosis
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) continue;
          const diagnosis = JSON.parse(jsonMatch[0]) as {
            diagnosis: string;
            root_cause: string;
            fix_action: string;
            fix_details: string;
            confidence: number;
            severity: string;
          };

          // ─── Execute the fix based on LLM recommendation ───
          let actionTaken = '';
          let fixed = false;

          if (diagnosis.fix_action === 'requeue_task' && diagnosis.confidence >= 0.5) {
            db.prepare("UPDATE agent_tasks SET status = 'queued', blocker_reason = NULL, current_step_label = ? WHERE id = ?")
              .run(`Watchdog: ${diagnosis.diagnosis.slice(0, 80)}`, task.id);
            db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)')
              .run(uuidv4(), task.id, task.status, 'queued');
            actionTaken = `Re-queued task after diagnosis: ${diagnosis.diagnosis}`;
            fixed = true;

          } else if (diagnosis.fix_action === 'reset_agent' && diagnosis.confidence >= 0.5) {
            db.prepare("UPDATE agents SET state = 'idle' WHERE id = ?").run(task.agent_id);
            db.prepare("UPDATE agent_tasks SET status = 'queued', blocker_reason = NULL, current_step_label = ? WHERE id = ?")
              .run(`Watchdog: Agent reset — ${diagnosis.diagnosis.slice(0, 60)}`, task.id);
            db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)')
              .run(uuidv4(), task.id, task.status, 'queued');
            actionTaken = `Reset agent ${task.agent_name} to idle and re-queued task: ${diagnosis.diagnosis}`;
            fixed = true;

          } else if (diagnosis.fix_action === 'mark_done' && diagnosis.confidence >= 0.7) {
            db.prepare("UPDATE agent_tasks SET status = 'done', completed_at = datetime('now'), current_step_label = ? WHERE id = ?")
              .run(`Watchdog: ${diagnosis.fix_details.slice(0, 80)}`, task.id);
            db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)')
              .run(uuidv4(), task.id, task.status, 'done');
            actionTaken = `Marked task done: ${diagnosis.fix_details}`;
            fixed = true;

          } else if (diagnosis.fix_action === 'reassign_to_agent' && diagnosis.confidence >= 0.5) {
            // Find the best idle agent for this task
            const idleAgent = db.prepare(`
              SELECT id, name FROM agents WHERE state = 'idle' AND id != ?
              ORDER BY last_run_at ASC LIMIT 1
            `).get(task.agent_id) as { id: string; name: string } | undefined;
            if (idleAgent) {
              db.prepare("UPDATE agent_tasks SET agent_id = ?, status = 'queued', blocker_reason = NULL, current_step_label = ? WHERE id = ?")
                .run(idleAgent.id, `Watchdog: Reassigned from ${task.agent_name.split('(')[0].trim()} — ${diagnosis.diagnosis.slice(0, 50)}`, task.id);
              db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)')
                .run(uuidv4(), task.id, task.status, 'queued');
              actionTaken = `Reassigned from ${task.agent_name} to ${idleAgent.name}: ${diagnosis.diagnosis}`;
              fixed = true;
            } else {
              actionTaken = `Wanted to reassign but no idle agents available. Diagnosis: ${diagnosis.diagnosis}`;
            }

          } else if (diagnosis.fix_action === 'retry_skill' && task.skill_id && diagnosis.confidence >= 0.5) {
            db.prepare("UPDATE agent_tasks SET status = 'queued', blocker_reason = NULL, progress_pct = 0, current_step_label = ? WHERE id = ?")
              .run(`Watchdog: Retrying skill — ${diagnosis.diagnosis.slice(0, 60)}`, task.id);
            db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)')
              .run(uuidv4(), task.id, task.status, 'queued');
            actionTaken = `Reset and re-queued for skill retry: ${diagnosis.diagnosis}`;
            fixed = true;

          } else if (diagnosis.fix_action === 'escalate' || diagnosis.confidence < 0.5) {
            actionTaken = `Escalated — low confidence or complex issue: ${diagnosis.diagnosis}`;
          } else if (diagnosis.fix_action === 'check_connections') {
            // Test if connections are actually working
            const hasActive = activeConns.length > 0;
            if (!hasActive) {
              actionTaken = `No active LLM connections — task cannot proceed. ${diagnosis.diagnosis}`;
            } else {
              // Connections exist, re-queue to retry
              db.prepare("UPDATE agent_tasks SET status = 'queued', blocker_reason = NULL, current_step_label = ? WHERE id = ?")
                .run(`Watchdog: Connections verified, retrying — ${diagnosis.diagnosis.slice(0, 50)}`, task.id);
              db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)')
                .run(uuidv4(), task.id, task.status, 'queued');
              actionTaken = `Verified connections active, re-queued: ${diagnosis.diagnosis}`;
              fixed = true;
            }
          }

          // Log Watchdog decision (so it shows in Agent Command Center feed)
          try {
            db.prepare(`
              INSERT INTO agent_decisions (id, agent_id, reasoning, action_taken, skill_used, confidence, metadata)
              VALUES (?, 'agent-watchdog', ?, ?, NULL, ?, ?)
            `).run(
              uuidv4(),
              `Diagnosed "${task.name}" (${task.agent_name}): ${diagnosis.diagnosis}`,
              fixed ? actionTaken : (diagnosis.fix_action === 'escalate' ? `Escalated: ${diagnosis.diagnosis}` : 'No action'),
              diagnosis.confidence,
              JSON.stringify({ root_cause: diagnosis.root_cause, fix_action: diagnosis.fix_action, task_id: task.id })
            );
          } catch { /* decision logging is best-effort */ }

          // Create incident with the diagnosis
          const incident = createWatchdogIncident({
            title: `[${task.id.slice(0, 8)}] ${diagnosis.root_cause}: ${task.name.slice(0, 60)}`,
            category: 'broken_feature',
            severity: diagnosis.severity || 'medium',
            description: `Task: ${task.name}\nAgent: ${task.agent_name} (${task.department})\nDiagnosis: ${diagnosis.diagnosis}\nRoot cause: ${diagnosis.root_cause}\nRecommended: ${diagnosis.fix_action}\nConfidence: ${(diagnosis.confidence * 100).toFixed(0)}%`,
            source_channel_id: task.channelId,
            related_agent_id: task.agent_id,
          });

          if (fixed) {
            updateWatchdogIncident(incident.id, {
              status: 'fix_applied',
              root_cause: `${diagnosis.root_cause}: ${diagnosis.diagnosis}`,
              action_taken: actionTaken,
              verification: diagnosis.fix_details,
              auto_fixed: 1,
            });
            autoFixedCount++;
            autoFixed.push({ ...incident, status: 'fix_applied', action_taken: actionTaken, auto_fixed: 1 });
          } else if (diagnosis.fix_action === 'escalate' || diagnosis.confidence < 0.5) {
            updateWatchdogIncident(incident.id, {
              status: 'escalated',
              root_cause: `${diagnosis.root_cause}: ${diagnosis.diagnosis}`,
              action_taken: actionTaken,
              escalated_to: 'system_admin',
            });
            escalatedCount++;
          }
          newIncidents.push(incident);

        } catch (llmErr) {
          // LLM call failed — fall back to basic remediation
          if (task.status === 'blocked') {
            const agent = db.prepare('SELECT state FROM agents WHERE id = ?').get(task.agent_id) as { state: string } | undefined;
            if (agent?.state === 'idle') {
              db.prepare("UPDATE agent_tasks SET status = 'queued', blocker_reason = NULL, current_step_label = 'Watchdog: LLM diagnosis unavailable, re-queued for retry' WHERE id = ?").run(task.id);
              db.prepare('INSERT INTO agent_task_transitions (id, task_id, from_status, to_status) VALUES (?, ?, ?, ?)').run(uuidv4(), task.id, 'blocked', 'queued');

              const incident = createWatchdogIncident({
                title: `Re-queued blocked task "${task.name}" (LLM unavailable for diagnosis)`,
                category: 'broken_feature',
                severity: 'medium',
                description: `Blocker: ${task.blocker_reason || 'unknown'}. LLM diagnosis failed: ${llmErr instanceof Error ? llmErr.message : 'unknown error'}. Fell back to basic re-queue.`,
                source_channel_id: task.channelId,
                related_agent_id: task.agent_id,
              });
              updateWatchdogIncident(incident.id, { status: 'fix_applied', action_taken: 'Basic re-queue (LLM unavailable)', auto_fixed: 1 });
              autoFixedCount++;
              autoFixed.push({ ...incident, status: 'fix_applied', auto_fixed: 1 });
              newIncidents.push(incident);
            }
          }
        }
      }
    } catch (importErr) {
      // LLM client not available — skip intelligent diagnosis entirely
      console.error('Watchdog: LLM client import failed, skipping intelligent diagnosis:', importErr);
    }
  }

  // ─── Agent-Reported Issues: capability gaps + stalled handoffs ───────────
  // Bridge the gap between the supervisor (which captures these) and watchdog
  // (which remediates). Previously these sat in the DB ignored — watchdog had
  // no visibility. Now each scan creates an incident for pending gaps/stalls
  // and tries to auto-remediate where safe.

  // Capability gaps — pending ones need attention UNLESS they've already been
  // surfaced to the user. Exclude gaps where notified_user_at is stamped — on a
  // prior scan we already classified this as user-action-required, notified the
  // user, and there's nothing autonomous left to do. Re-running Strategy 0-3
  // on the same gap every minute was burning ~20 LLM calls per scan cycle.
  const pendingGaps = db.prepare(
    `SELECT g.*, a.name as agent_name
     FROM capability_gaps g LEFT JOIN agents a ON g.agent_id = a.id
     WHERE g.status = 'pending' AND g.notified_user_at IS NULL
     ORDER BY g.created_at DESC LIMIT 20`
  ).all() as Array<{
    id: string; agent_id: string; agent_name: string | null;
    task_description: string; missing_capability: string;
    proposed_fix: string | null; install_command: string | null;
    created_at: string;
  }>;

  for (const gap of pendingGaps) {
    // Dedupe — don't re-create an incident for the same gap every cycle
    const existing = db.prepare(
      "SELECT id FROM watchdog_incidents WHERE title LIKE ? AND status IN ('detected','investigating','escalated','fix_applied','verified')"
    ).get(`[${gap.id.slice(0, 8)}]%`) as { id: string } | undefined;
    if (existing) continue;

    // ── Resolver pipeline: try strategies in order until one works ────────
    let resolution: { fixed: boolean; how: string; via: string } = { fixed: false, how: "", via: "none" };

    // STRATEGY 0: user-action-required gaps (OAuth, API keys, credentials)
    // skip the whole resolver — watchdog cannot auto-fix them. Silent escalate
    // and move on. This kills the Marty-consult loop on OAuth gaps.
    const { isUserActionRequired } = await import("@/lib/agents/supervisor");
    if (isUserActionRequired(gap.missing_capability, gap.proposed_fix || undefined)) {
      resolution = {
        fixed: false,
        how: "User action required — OAuth/credential/permission gap cannot be auto-resolved. User must connect platform at /connections.",
        via: "user_action_required",
      };
      // Skip to persist-outcome block below. No Marty delegation.
    }

    // STRATEGY 1: auto-assign existing skill if the gap names one
    // Look for skill IDs ("skill-...") OR skill names mentioned in the gap text
    const gapText = `${gap.missing_capability} ${gap.proposed_fix || ""} ${gap.task_description}`.toLowerCase();
    const allSkills = db.prepare("SELECT id, name FROM skills WHERE is_active = 1").all() as Array<{ id: string; name: string }>;
    const matchedSkill = allSkills.find(s =>
      gapText.includes(s.id.toLowerCase()) ||
      (s.name && gapText.includes(s.name.toLowerCase()))
    );
    if (matchedSkill) {
      const agentRow = db.prepare("SELECT assigned_skills FROM agents WHERE id = ?").get(gap.agent_id) as { assigned_skills: string } | undefined;
      const assigned: string[] = JSON.parse(agentRow?.assigned_skills || "[]");
      if (!assigned.includes(matchedSkill.id)) {
        assigned.push(matchedSkill.id);
        db.prepare("UPDATE agents SET assigned_skills = ? WHERE id = ?").run(JSON.stringify(assigned), gap.agent_id);
        resolution = {
          fixed: true,
          how: `Auto-assigned existing skill ${matchedSkill.id} (${matchedSkill.name}) to ${gap.agent_name}`,
          via: "skill_assignment",
        };
      }
    }

    // STRATEGY 2: safe npm install
    if (!resolution.fixed && gap.install_command) {
      const safeInstall = /^npm install (--save-dev )?[@a-zA-Z0-9][-a-zA-Z0-9_./@]*(\s+[@a-zA-Z0-9][-a-zA-Z0-9_./@]*)*$/.test(gap.install_command.trim());
      if (safeInstall) {
        try {
          const { exec } = await import("child_process");
          const { promisify } = await import("util");
          const execAsync = promisify(exec);
          await execAsync(gap.install_command, {
            cwd: process.cwd(),
            timeout: 180_000,
            env: { ...process.env, PATH: `${process.env.HOME}/.nvm/versions/node/v22.22.0/bin:${process.env.PATH || ""}` },
          });
          resolution = { fixed: true, how: `Auto-installed: ${gap.install_command}`, via: "npm_install" };
        } catch (e) {
          // Don't bail — fall through to strategy 3
          console.error("[watchdog] auto-install failed, will delegate to Marty:", e instanceof Error ? e.message : e);
        }
      }
    }

    // Pre-Strategy-3 guard: don't re-consult Marty on gaps we've already routed
    // to him for the same capability in the last 6h. He already said "can't
    // auto-fix, needs user" 16 times in 2 hours before this guard — same answer
    // every time. Skip straight to user escalation.
    const recentMartyConsult = db.prepare(
      `SELECT id FROM watchdog_incidents
       WHERE related_agent_id = ?
         AND action_taken LIKE '%marty_consulted%'
         AND created_at > datetime('now','-6 hours')
         AND substr(title, instr(title,']')+1, 40) = substr(?, 1, 40)
       LIMIT 1`
    ).get(gap.agent_id, ` ${gap.agent_name || gap.agent_id} needs: ${gap.missing_capability.slice(0, 80)}`) as { id: string } | undefined;
    if (recentMartyConsult) {
      resolution = {
        fixed: false,
        how: "Skipped Marty consult — identical gap consulted within last 6h, same answer expected. Escalating to user.",
        via: "marty_cooldown",
      };
    }

    // STRATEGY 3: delegate to Marty (system admin) — he has create_skill, assign_skill,
    // update_agent, update_setting via system_action. Run him in-process via the
    // orchestrator and let him decide what action to take.
    if (!resolution.fixed && resolution.via === "none") {
      try {
        const { runAgentChat } = await import("@/lib/agents/orchestrator");
        const martyMessage = `[Watchdog autonomous resolution request]
Agent ${gap.agent_name || gap.agent_id} reported a capability gap and is BLOCKED.

Their task: ${gap.task_description.slice(0, 400)}
What's missing: ${gap.missing_capability}
Their proposed fix: ${gap.proposed_fix || "(none)"}
Their install command: ${gap.install_command || "(none)"}

You are the system admin. You can create new skills, assign existing skills, update agent configs, and change settings via the system_action endpoint. Look at the gap, decide what to do, and EXECUTE the fix yourself — don't ask the user. If the agent needs a new skill, create it. If they need an existing skill, assign it. If they need a config change, make it. If you genuinely can't fix it without user input (e.g., requires an API key the user must provide), say so explicitly with the EXACT command/setting the user needs to provide.`;

        const baseUrl = (() => {
          try {
            const fs = require("fs");
            const path = require("path");
            const portFile = path.join(process.cwd(), ".port");
            if (fs.existsSync(portFile)) {
              const port = parseInt(fs.readFileSync(portFile, "utf8").trim());
              if (port > 0 && port < 65536) return `http://127.0.0.1:${port}`;
            }
          } catch { /* fall through */ }
          return "http://127.0.0.1:3000";
        })();

        const result = await runAgentChat({
          agentId: "agent-product",
          userMessage: martyMessage,
          baseUrl,
        });

        const martyResponse = (result.response || "").slice(0, 500);
        const actionResultText = String(result.action?.result || "");
        // Did Marty take a system_action? Check the orchestrator's actionResult,
        // which captures system_action(...) call results like '{"created":true,...}'.
        const tookSystemAction = /system_action\([a-z_]+\):.*"(created|assigned|updated|fixed)":\s*true/i.test(actionResultText);

        if (tookSystemAction) {
          resolution = {
            fixed: true,
            how: `Marty resolved via system_action: ${actionResultText.slice(0, 300)}`,
            via: "marty_system_action",
          };
        } else {
          resolution = {
            fixed: false,
            how: `Marty consulted but didn't take a system_action: ${martyResponse.slice(0, 250)}`,
            via: "marty_consulted",
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 200) : "unknown";
        resolution = { fixed: false, how: `Marty delegation failed: ${msg}`, via: "marty_error" };
      }
    }

    // ── Persist outcome ─────────────────────────────────────────────────
    if (resolution.fixed) {
      db.prepare("UPDATE capability_gaps SET status = 'resolved', resolved_at = datetime('now'), proposed_fix = ? WHERE id = ?")
        .run(resolution.how.slice(0, 1000), gap.id);
    }

    const incident = createWatchdogIncident({
      title: `[${gap.id.slice(0, 8)}] ${gap.agent_name || gap.agent_id} needs: ${gap.missing_capability.slice(0, 80)}`,
      category: 'broken_feature',
      severity: resolution.fixed ? 'medium' : 'high',
      description: `Agent: ${gap.agent_name || gap.agent_id}\nTask: ${gap.task_description.slice(0, 300)}\nMissing: ${gap.missing_capability}\nResolution path tried: ${resolution.via}\nOutcome: ${resolution.how}\nReported: ${gap.created_at}`,
      related_agent_id: gap.agent_id,
    });

    if (resolution.fixed) {
      updateWatchdogIncident(incident.id, { status: 'fix_applied', action_taken: resolution.how, auto_fixed: 1 });
      autoFixedCount++;
      autoFixed.push({ ...incident, status: 'fix_applied', action_taken: resolution.how, auto_fixed: 1 });
    } else {
      // STRATEGY 4 (last resort): escalate to user with what we tried.
      // Fire ONE notification per gap — the helper stamps notified_user_at so
      // subsequent scans stay silent.
      updateWatchdogIncident(incident.id, {
        status: 'escalated',
        escalated_to: 'user',
        action_taken: `Tried ${resolution.via}; not resolvable without user input. ${resolution.how}`,
      });
      escalatedCount++;
      try {
        const { notifyUserIfGapUnresolvable } = await import("@/lib/agents/supervisor");
        await notifyUserIfGapUnresolvable(gap.id, resolution.via);
      } catch (err) {
        console.error("[watchdog] notifyUserIfGapUnresolvable failed:", err instanceof Error ? err.message : err);
      }
    }
    newIncidents.push(incident);
  }

  // Stalled handoffs — attempt to re-trigger the target agent once, else escalate
  const stalledHandoffs = db.prepare(
    `SELECT m.*, af.name as from_name, at.name as to_name
     FROM agent_messages m
     LEFT JOIN agents af ON m.from_agent_id = af.id
     LEFT JOIN agents at ON m.to_agent_id = at.id
     WHERE m.status = 'stalled'
     ORDER BY m.created_at DESC LIMIT 10`
  ).all() as Array<{
    id: string; from_agent_id: string; to_agent_id: string | null;
    from_name: string | null; to_name: string | null;
    message: string; created_at: string; deadline_at: string;
    action_taken?: string;
  }>;

  for (const stall of stalledHandoffs) {
    // Dedupe — one incident per stall EVER. Include 'dismissed' too: a
    // stalled handoff is a fact about the underlying agent_message, not a
    // transient event. Once we've created an incident for it, we don't need
    // a new one even after auto-dismiss-at-10-min — the underlying handoff
    // hasn't changed. Without this, we'd loop ~1 incident per stall per 10min.
    const existing = db.prepare(
      "SELECT id FROM watchdog_incidents WHERE title LIKE ?"
    ).get(`[${stall.id.slice(0, 8)}]%`) as { id: string } | undefined;
    if (existing) continue;

    const incident = createWatchdogIncident({
      title: `[${stall.id.slice(0, 8)}] Handoff stalled: ${stall.from_name || stall.from_agent_id} → ${stall.to_name || stall.to_agent_id}`,
      category: 'silent_failure',
      severity: 'high',
      description: `From: ${stall.from_name || stall.from_agent_id}\nTo: ${stall.to_name || stall.to_agent_id}\nCreated: ${stall.created_at}\nDeadline: ${stall.deadline_at}\nMessage: ${stall.message.slice(0, 400)}`,
      related_agent_id: stall.to_agent_id || stall.from_agent_id,
    });

    updateWatchdogIncident(incident.id, {
      status: 'escalated',
      escalated_to: 'user',
      action_taken: 'Stalled handoff surfaced — manual retry needed (see /activity)',
    });
    escalatedCount++;
    newIncidents.push(incident);
  }

  // ─── Auto-dismiss: clear verified incidents after 10 min ─────────────────
  const verifiedIncidents = db.prepare(`
    SELECT * FROM watchdog_incidents WHERE status = 'verified' AND resolved_at IS NOT NULL
  `).all() as WatchdogIncident[];

  for (const inc of verifiedIncidents) {
    const resolvedAtUTC = inc.resolved_at!.endsWith('Z') ? inc.resolved_at! : inc.resolved_at! + 'Z';
    const minsSinceResolved = (Date.now() - new Date(resolvedAtUTC).getTime()) / 60000;
    if (minsSinceResolved > 10) {
      updateWatchdogIncident(inc.id, { status: 'dismissed' });
    }
  }

  // ─── Create notifications for critical new incidents ─────────────────────
  const criticalIncidents = newIncidents.filter(i => i.severity === 'critical');
  for (const crit of criticalIncidents) {
    db.prepare(
      "INSERT INTO notifications (id, type, title, message, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, datetime('now'))"
    ).run(uuidv4(), 'watchdog_alert', `Watchdog: ${crit.title}`, crit.description?.slice(0, 200) || '', '/agents/watchdog');
  }

  // Also notify on auto-fixes
  for (const fixed of autoFixed) {
    db.prepare(
      "INSERT INTO notifications (id, type, title, message, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, datetime('now'))"
    ).run(uuidv4(), 'watchdog_autofix', `Watchdog auto-fixed: ${fixed.title}`, fixed.action_taken?.slice(0, 200) || '', '/agents/watchdog');
  }

  // ─── Update rule trigger counts ─────────────────────────────────────────
  if (newIncidents.length > 0) {
    for (const rule of activeRules) {
      db.prepare("UPDATE watchdog_rules SET trigger_count = trigger_count + ?, last_triggered_at = datetime('now') WHERE id = ?")
        .run(newIncidents.length, rule.id);
    }
  }

  const durationMs = Date.now() - startTime;
  const scanId = `wsl-${uuidv4().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO watchdog_scan_log (id, scan_type, channels_scanned, issues_found, issues_auto_fixed, issues_escalated, duration_ms, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(scanId, scanType, channelsScanned, newIncidents.length, autoFixedCount, escalatedCount, durationMs, JSON.stringify({ incident_ids: newIncidents.map(i => i.id), auto_fixed_ids: autoFixed.map(i => i.id) }));

  const scanLog = db.prepare('SELECT * FROM watchdog_scan_log WHERE id = ?').get(scanId) as WatchdogScanLog;

  return { incidents: newIncidents, auto_fixed: autoFixed, scan_log: scanLog };
}

// ─── Watchdog Auto-Scan Config ──────────────────────────────────────────────

export function getWatchdogAutoScanEnabled(): boolean {
  const db = getDb();
  const row = db.prepare("SELECT value FROM automation_settings WHERE key = 'watchdog_auto_scan'").get() as { value: string } | undefined;
  return row?.value === 'true';
}

export function setWatchdogAutoScanEnabled(enabled: boolean): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO automation_settings (key, value, updated_at) VALUES ('watchdog_auto_scan', ?, datetime('now'))").run(enabled ? 'true' : 'false');
}

export function getWatchdogScanInterval(): number {
  const db = getDb();
  const row = db.prepare("SELECT value FROM automation_settings WHERE key = 'watchdog_scan_interval_seconds'").get() as { value: string } | undefined;
  return parseInt(row?.value || '60');
}

export function setWatchdogScanInterval(seconds: number): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO automation_settings (key, value, updated_at) VALUES ('watchdog_scan_interval_seconds', ?, datetime('now'))").run(String(seconds));
}
