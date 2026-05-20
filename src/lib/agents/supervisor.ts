// ─── Agent Supervisor ────────────────────────────────────────────────────────
// Tracks agent-to-agent handoffs, detects stalled delegations, and surfaces
// capability gaps (tools/skills the agent needs but doesn't have).
//
// Called by: watchdog-daemon.ts every cycle via /api/agents/supervisor/scan

import { getDb, logActivity } from "@/lib/db";
import { sendEmail, getUserEmail } from "@/lib/email/send";
import { v4 as uuidv4 } from "uuid";

const DEFAULT_DEADLINE_MINUTES = 30;

export interface HandoffRow {
  id: string;
  from_agent_id: string;
  to_agent_id: string | null;
  message: string;
  message_type: string;
  status: string | null;
  deadline_at: string | null;
  completed_at: string | null;
  completion_ref: string | null;
  stall_notified_at: string | null;
  created_at: string;
}

// ── Handoff lifecycle ────────────────────────────────────────────────────────

export function createHandoff(opts: {
  from_agent_id: string;
  to_agent_id: string;
  message: string;
  message_type?: "handoff" | "request";
  deadline_minutes?: number;
}): string {
  const id = uuidv4();
  const deadlineMinutes = opts.deadline_minutes || DEFAULT_DEADLINE_MINUTES;
  const deadlineAt = new Date(Date.now() + deadlineMinutes * 60_000).toISOString();

  getDb().prepare(
    `INSERT INTO agent_messages (id, from_agent_id, to_agent_id, message, message_type, status, deadline_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`
  ).run(id, opts.from_agent_id, opts.to_agent_id, opts.message, opts.message_type || "handoff", deadlineAt);

  return id;
}

export function completeHandoff(messageId: string, completionRef: string): boolean {
  const res = getDb().prepare(
    `UPDATE agent_messages
     SET status = 'completed', completed_at = datetime('now'), completion_ref = ?
     WHERE id = ? AND status IN ('pending', 'stalled')`
  ).run(completionRef, messageId);
  return res.changes > 0;
}

export function markHandoffFailed(messageId: string, reason: string): boolean {
  const res = getDb().prepare(
    `UPDATE agent_messages
     SET status = 'failed', completed_at = datetime('now'), completion_ref = ?
     WHERE id = ? AND status IN ('pending', 'stalled')`
  ).run(`failed: ${reason}`, messageId);
  return res.changes > 0;
}

// Best-effort match: find the most recent pending handoff to this agent
// that matches the completion context. Used when the agent doesn't reference
// a specific message_id but clearly finished delegated work.
export function findPendingHandoffFor(toAgentId: string): HandoffRow | undefined {
  return getDb().prepare(
    `SELECT * FROM agent_messages
     WHERE to_agent_id = ? AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`
  ).get(toAgentId) as HandoffRow | undefined;
}

// ── Stall scanning ───────────────────────────────────────────────────────────

export async function scanForStalls(): Promise<{
  stalled: HandoffRow[];
  notified: string[];
}> {
  const now = new Date().toISOString();

  // Handoffs whose deadline has passed, still pending, never notified
  const stalled = getDb().prepare(
    `SELECT * FROM agent_messages
     WHERE status = 'pending'
       AND deadline_at IS NOT NULL
       AND deadline_at < ?
       AND stall_notified_at IS NULL
     ORDER BY deadline_at ASC LIMIT 20`
  ).all(now) as HandoffRow[];

  const notified: string[] = [];

  for (const msg of stalled) {
    // Mark stalled and stamp notification time
    getDb().prepare(
      `UPDATE agent_messages SET status = 'stalled', stall_notified_at = datetime('now') WHERE id = ?`
    ).run(msg.id);

    const fromName = agentName(msg.from_agent_id);
    const toName = agentName(msg.to_agent_id);
    const ageMinutes = Math.round((Date.now() - new Date(msg.created_at).getTime()) / 60_000);

    const subject = `[Five Rails] Stalled task: ${toName} hasn't delivered to ${fromName}`;
    const body =
      `An agent delegation stalled.\n\n` +
      `From: ${fromName} (${msg.from_agent_id})\n` +
      `To: ${toName} (${msg.to_agent_id})\n` +
      `Created: ${msg.created_at} (${ageMinutes} min ago)\n` +
      `Deadline: ${msg.deadline_at}\n\n` +
      `Task: ${msg.message}\n\n` +
      `View in app: http://localhost:3002/activity`;

    await notifyUser({ subject, body, type: "alert", agent_id: msg.to_agent_id || msg.from_agent_id });

    logActivity({
      action: "agent_handoff_stalled",
      details: `${fromName} -> ${toName}: ${msg.message.slice(0, 120)}`,
    });

    notified.push(msg.id);
  }

  return { stalled, notified };
}

// ── Capability gap reporting ─────────────────────────────────────────────────

// Gaps matching these patterns require human action (OAuth consent, API keys,
// credentials). Watchdog cannot auto-resolve them — no point cycling them
// through Marty repeatedly. These get escalated ONCE to the user and ignored
// thereafter.
const USER_ACTION_PATTERNS = [
  /oauth/i,
  /access[_\s-]?token/i,
  /api[_\s-]?key/i,
  /credential/i,
  /permission/i,
  /consent/i,
  /sign[_\s-]?in/i,
  /connect.*(twitter|linkedin|facebook|meta|instagram|tiktok|youtube|google|stripe)/i,
];

export function isUserActionRequired(capability: string, proposedFix?: string): boolean {
  const text = `${capability} ${proposedFix || ""}`;
  return USER_ACTION_PATTERNS.some(rx => rx.test(text));
}

// Code-level gap detection: if the gap or its proposed_fix references a
// concrete file path inside our codebase, a TypeScript file, or specific
// function/symbol references, it's likely something the watchdog-coder
// can attempt. Conservative on purpose — we'd rather miss-classify a
// code gap as non-code (and have it sit there) than misroute a credentials
// gap to the coder (where it would just spin and fail).
const CODE_LEVEL_PATTERNS: RegExp[] = [
  // Specific file paths in our tree
  /\bsrc\/[a-zA-Z0-9_./-]+\.(ts|tsx|js|jsx|sh)\b/,
  /\bscripts\/[a-zA-Z0-9_./-]+\.(ts|tsx|js|jsx|sh)\b/,
  /\bpublic-form-service\/src\/[a-zA-Z0-9_./-]+\.(ts|tsx|js|jsx)\b/,
  // Patch/edit verbs referencing code
  /\b(patch|edit|modify|update)\s+(?:the\s+)?(?:file|function|method|module|route|handler)\b/i,
  // Specific symbol patterns (camelCase or snake_case identifiers in code-fix context)
  /\b(?:function|method|const|export)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*[({]/,
  // Direct line references
  /:\d+(?::\d+)?\b/,
];

export function isCodeLevelGap(capability: string, proposedFix?: string): boolean {
  const text = `${capability} ${proposedFix || ""}`;
  // Code gaps are mutually exclusive with credential/OAuth gaps. Always check
  // the user-action classifier first.
  if (isUserActionRequired(capability, proposedFix)) return false;
  return CODE_LEVEL_PATTERNS.some(rx => rx.test(text));
}


// Decide who's responsible for resolving this gap — drives whether the user
// gets a notification. The rule of thumb: only page the user when the fix
// requires something only they can do (OAuth click-through, API key, billing).
// Everything else is a silent in-system task.
export type GapRoutedTo = "user" | "agent-product" | "auto";

export function routeCapabilityGap(opts: {
  missing_capability: string;
  proposed_fix?: string;
  install_command?: string;
}): GapRoutedTo {
  if (isUserActionRequired(opts.missing_capability, opts.proposed_fix)) return "user";
  // Safe install allow-list → watchdog can auto-fix without anyone
  const cmd = (opts.install_command || "").trim();
  if (cmd && /^npm install (--save-dev )?[@a-zA-Z0-9][-a-zA-Z0-9_./@]*(\s+[@a-zA-Z0-9][-a-zA-Z0-9_./@]*)*$/.test(cmd)) {
    return "auto";
  }
  // Skill missing / system config / anything else → Marty has the admin powers
  return "agent-product";
}

export async function reportCapabilityGap(opts: {
  agent_id: string;
  blocking_message_id?: string;
  task_description: string;
  missing_capability: string;
  proposed_fix?: string;
  install_command?: string;
}): Promise<string> {
  const userAction = isUserActionRequired(opts.missing_capability, opts.proposed_fix);

  // Dedupe ALL gaps cross-agent. A capability gap is a property of the SYSTEM,
  // not the agent that happened to hit it first — if Alex and Marty both need
  // Facebook OAuth, that's one gap, one notification, one fix. The dedup
  // window is wider for user-action gaps (7d, since OAuth state doesn't change
  // without user input) and shorter for system-fixable gaps (24h, since
  // Marty/Watchdog can resolve those on the next heartbeat).
  const fingerprintWords = fingerprintCapability(opts.missing_capability);
  if (fingerprintWords.length > 0) {
    const likeClauses = fingerprintWords.map(() => "LOWER(missing_capability) LIKE ?").join(" AND ");
    const likeParams = fingerprintWords.map(w => `%${w}%`);
    const resolvedWindow = userAction ? "-7 days" : "-24 hours";

    const existing = getDb().prepare(
      `SELECT id FROM capability_gaps
       WHERE ${likeClauses}
         AND (
           status IN ('pending','approved','escalated')
           OR (status IN ('resolved','rejected') AND resolved_at > datetime('now', ?))
         )
       ORDER BY created_at DESC LIMIT 1`
    ).get(...likeParams, resolvedWindow) as { id: string } | undefined;

    if (existing) {
      // Silent suppression — regardless of which agent reports it, one gap
      // entry is enough. The fixer (user, Marty, or watchdog) only needs to
      // see and act on it once.
      return existing.id;
    }
  }

  // Sole-reporter pattern: regardless of which agent found the gap, the row
  // is attributed to Marty (agent-product) as the reporter. The original
  // blocked agent is preserved in blocked_agent_id. This gives the user a
  // single voice to listen to — "Marty reports: Alex is blocked on X" —
  // instead of a chorus of different agents reporting the same issue.
  const REPORTER = "agent-product";
  const blockedAgentId = opts.agent_id;

  const id = uuidv4();
  getDb().prepare(
    `INSERT INTO capability_gaps
      (id, agent_id, blocked_agent_id, blocking_message_id, task_description, missing_capability, proposed_fix, install_command)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    REPORTER,
    blockedAgentId,
    opts.blocking_message_id || null,
    opts.task_description,
    opts.missing_capability,
    opts.proposed_fix || null,
    opts.install_command || null
  );

  // No user notification here — only the Watchdog resolver notifies, and only
  // when all autonomous strategies have been exhausted. See notifyUserIfGapUnresolvable().
  const blockedName = agentName(blockedAgentId);
  logActivity({
    action: "capability_gap_reported",
    details: `Marty reports: ${blockedName} is blocked on ${opts.missing_capability} (task: ${opts.task_description.slice(0, 100)})`,
  });

  // Coder strategy: if this is a code-level gap and the coder is armed,
  // fire-and-forget an attempt. Don't block gap creation on it (the SDK
  // session can take minutes). The result lands in watchdog_code_fixes
  // and the gap is updated to 'resolved' on success.
  if (isCodeLevelGap(opts.missing_capability, opts.proposed_fix)) {
    (async () => {
      try {
        const { attemptCodeFix } = await import("./watchdog-coder");
        await attemptCodeFix(id);
      } catch (err) {
        logActivity({
          action: "coder_error",
          details: `Coder failed for gap ${id.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    })();
  }

  return id;
}

/**
 * Called by Watchdog after it has exhausted autonomous strategies. Fires ONE
 * user notification per gap — subsequent scans find notified_user_at already
 * stamped and stay silent.
 */
export async function notifyUserIfGapUnresolvable(gapId: string, resolverNote: string): Promise<boolean> {
  const db = getDb();
  const gap = db.prepare(
    "SELECT id, agent_id, blocked_agent_id, task_description, missing_capability, proposed_fix, install_command, notified_user_at FROM capability_gaps WHERE id = ?"
  ).get(gapId) as {
    id: string; agent_id: string; blocked_agent_id: string | null;
    task_description: string; missing_capability: string;
    proposed_fix: string | null; install_command: string | null;
    notified_user_at: string | null;
  } | undefined;

  if (!gap) return false;
  if (gap.notified_user_at) return false; // already pinged the user once

  // Marty is always the reporter; blocked_agent_id is who actually hit the wall.
  const blockedName = agentName(gap.blocked_agent_id || gap.agent_id);
  const subject = `[Five Rails] Marty reports: ${gap.missing_capability.slice(0, 80)}`;
  const body =
    `Watchdog couldn't auto-resolve this — only you can.\n\n` +
    `Blocked agent: ${blockedName}\n` +
    `Task: ${gap.task_description.slice(0, 300)}\n` +
    `Missing: ${gap.missing_capability}\n` +
    (gap.proposed_fix ? `What's needed: ${gap.proposed_fix}\n` : "") +
    `\nWatchdog tried: ${resolverNote}\n\n` +
    `Review & act: /activity`;

  // Route the Telegram/email ping through Marty (the reporter), keeping a
  // single consistent voice in your notifications.
  await notifyUser({ subject, body, type: "alert", agent_id: "agent-product" });
  db.prepare("UPDATE capability_gaps SET notified_user_at = datetime('now') WHERE id = ?").run(gapId);
  return true;
}

// Extract the 2 most distinctive words from a capability description so we
// can match semantically identical gaps across agents — e.g. Alex's "facebook
// platform connection" and Marty's "Facebook Business OAuth token with
// ads_management scope" should fingerprint to the same platform signal.
// Strategy: strip generic infrastructure words so platform names + product
// nouns rise to the top.
function fingerprintCapability(capability: string): string[] {
  const STOPWORDS = new Set([
    // grammar
    "the","and","for","with","not","that","this","from","then",
    // generic infrastructure nouns (ANY length — the length filter below
    // doesn't catch these)
    "platform","platforms","connection","connections","service","services",
    "user","users","access","granted","configured","token","tokens",
    "required","requires","needed","needs","cannot","consent",
    "scope","scopes","permission","permissions","credential","credentials",
    "restart","verification","dispatching","classifier","classifiers",
    "need","need.","reply","response","setting","settings","config",
    "requests","request","resolve","resolved","pending","escalated",
    // ambiguous verbs
    "create","created","creating","update","updated","assign","assigned",
  ]);
  const words = capability
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));

  // Prioritize distinctive words (longer first) — favors platform names
  // ("linkedin", "facebook") and product nouns over generic scope words.
  const unique = [...new Set(words)].sort((a, b) => b.length - a.length);
  return unique.slice(0, 2);
}

// ── Notification fanout ──────────────────────────────────────────────────────

async function notifyUser(opts: {
  subject: string;
  body: string;
  type: "alert" | "info" | "completed";
  agent_id: string;
}) {
  // Fire Telegram via the existing /api/agents/notify endpoint (async, fire-and-forget)
  try {
    const port = getPort();
    await fetch(`http://127.0.0.1:${port}/api/agents/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_name: agentName(opts.agent_id),
        agent_id: opts.agent_id,
        message: opts.body,
        type: opts.type,
      }),
    }).catch(() => {});
  } catch { /* best-effort */ }

  // Email always
  const to = getUserEmail();
  if (to) {
    try {
      await sendEmail({ to, subject: opts.subject, body: opts.body });
    } catch (err) {
      console.error("[supervisor] email send failed:", err);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function agentName(agentId: string | null): string {
  if (!agentId) return "Unknown";
  const row = getDb().prepare("SELECT name FROM agents WHERE id = ?").get(agentId) as { name: string } | undefined;
  return row?.name || agentId;
}

function getPort(): number {
  try {
    const fs = require("fs");
    const path = require("path");
    const portFile = path.join(process.cwd(), ".port");
    if (fs.existsSync(portFile)) {
      const port = parseInt(fs.readFileSync(portFile, "utf8").trim());
      if (port > 0 && port < 65536) return port;
    }
  } catch { /* fall through */ }
  return 3000;
}
