// ─── Agent Context Builder ───────────────────────────────────────────────────
// Builds a snapshot of the current world state for an agent's LLM prompt.
// Fixes the "chat agent has no memory of what automation agent did" bug: the
// scheduled pipelines have been reviewing ideas, passing/failing gates, and
// launching campaigns, but when the user chats with an agent it sees a
// contextless prompt and claims "I don't have access to the database."
//
// Usage:  const ctx = buildAgentContext(agentId); promptParts.push(ctx);

import { getDb } from "@/lib/db";

interface IdeaRow {
  id: string;
  title: string;
  category: string | null;
  overall_score: number;
  validation_status: string | null;
  revenue_tier: string | null;
  idea_date: string | null;
}

export function buildAgentContext(agentId: string): string {
  const parts: string[] = [];
  parts.push(buildIdeabrowserContext());

  // Agent-specific slices
  if (agentId === "agent-research") parts.push(buildResearchContext());
  else if (agentId === "agent-marketing") parts.push(buildMarketingContext());
  else if (agentId === "agent-executive") parts.push(buildExecutiveContext());
  else if (agentId === "agent-product") parts.push(buildProductAdminContext());
  else if (agentId === "agent-sales") parts.push(buildSalesContext());

  return parts.filter(Boolean).join("\n\n");
}

// ── Universal: IdeaBrowser state ─────────────────────────────────────────────

function buildIdeabrowserContext(): string {
  const db = getDb();

  const totals = db.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN overall_score > 0 THEN 1 ELSE 0 END) as scored FROM ideabrowser_ideas"
  ).get() as { total: number; scored: number };

  const byStatus = db.prepare(
    "SELECT validation_status, COUNT(*) as cnt FROM ideabrowser_ideas GROUP BY validation_status"
  ).all() as Array<{ validation_status: string | null; cnt: number }>;

  const topIdeas = db.prepare(
    `SELECT id, title, category, overall_score, validation_status, revenue_tier, idea_date
     FROM ideabrowser_ideas
     WHERE overall_score > 0
     ORDER BY overall_score DESC, idea_date DESC LIMIT 15`
  ).all() as IdeaRow[];

  const recent = db.prepare(
    `SELECT id, title, category, overall_score, validation_status, revenue_tier, idea_date
     FROM ideabrowser_ideas
     WHERE idea_date >= date('now','-7 days')
     ORDER BY idea_date DESC LIMIT 10`
  ).all() as IdeaRow[];

  const statusLine = byStatus.map(s => `${s.cnt} ${s.validation_status || "unreviewed"}`).join(", ");

  let out = "## IdeaBrowser Database (live)\n";
  out += `Total: ${totals.total} ideas (${totals.scored} scored). Status: ${statusLine}.\n\n`;

  out += "Top ideas by overall_score:\n";
  for (const r of topIdeas) {
    out += `- [${r.overall_score}] ${r.title} — ${r.category || "?"} · ${r.revenue_tier || "tier n/a"} · ${r.validation_status || "unreviewed"}\n`;
  }

  if (recent.length > 0) {
    out += "\nImported this week:\n";
    for (const r of recent) {
      out += `- ${r.idea_date}: ${r.title} (score ${r.overall_score}, ${r.validation_status || "unreviewed"})\n`;
    }
  }

  out += "\nYou have read access to this database — do NOT tell the user you can't see ideas. If they ask for the best idea by some criterion, pick from the list above (or request a wider slice via skill-ideabrowser-pick).";
  return out;
}

// ── Peter Thiel (research) — unreviewed queue ────────────────────────────────

function buildResearchContext(): string {
  const db = getDb();

  const unreviewed = db.prepare(
    `SELECT title, category, overall_score, idea_date FROM ideabrowser_ideas
     WHERE validation_status = 'unreviewed'
     ORDER BY overall_score DESC, idea_date DESC LIMIT 10`
  ).all() as Array<{ title: string; category: string | null; overall_score: number; idea_date: string | null }>;

  const recentRejects = db.prepare(
    `SELECT details, created_at FROM activity_log
     WHERE action = 'idea_rejected' AND created_at > datetime('now','-7 days')
     ORDER BY created_at DESC LIMIT 5`
  ).all() as Array<{ details: string; created_at: string }>;

  const recentPasses = db.prepare(
    `SELECT details, created_at FROM activity_log
     WHERE action = 'idea_queued_for_testing' AND created_at > datetime('now','-7 days')
     ORDER BY created_at DESC LIMIT 5`
  ).all() as Array<{ details: string; created_at: string }>;

  let out = "## Your Research Queue\n";
  out += `You have ${unreviewed.length} ideas currently unreviewed in the top of the queue:\n`;
  for (const u of unreviewed) {
    out += `- ${u.title} (${u.category || "?"}, auto-score ${u.overall_score})\n`;
  }

  if (recentPasses.length > 0) {
    out += "\nRecently passed Gate 1 (you validated these):\n";
    for (const p of recentPasses) out += `- ${p.created_at}: ${p.details.slice(0, 140)}\n`;
  }
  if (recentRejects.length > 0) {
    out += "\nRecently rejected at Gate 1 (your reasons):\n";
    for (const r of recentRejects) out += `- ${r.created_at}: ${r.details.slice(0, 160)}\n`;
  }

  return out;
}

// ── Alex Hormozi (marketing) — validated ideas awaiting campaigns ────────────

function buildMarketingContext(): string {
  const db = getDb();

  const campaigns = db.prepare(
    `SELECT c.id, c.status, i.title, i.category, c.created_at
     FROM validation_campaigns c
     LEFT JOIN ideabrowser_ideas i ON c.idea_id = i.id
     WHERE c.status IN ('queued','assets_ready','testing')
     ORDER BY c.created_at DESC LIMIT 8`
  ).all() as Array<{ id: string; status: string; title: string | null; category: string | null; created_at: string }>;

  let out = "## Your Marketing Pipeline\n";
  if (campaigns.length === 0) {
    out += "No active validation campaigns. Peter hasn't handed anything off recently, or you've cleared the queue.\n";
  } else {
    out += `${campaigns.length} validation campaigns in flight:\n`;
    for (const c of campaigns) {
      out += `- [${c.status}] ${c.title || "(deleted idea)"} — campaign ${c.id.slice(0, 8)}\n`;
    }
  }
  return out;
}

// ── Chris Voss (sales) — pipeline + contact sourcing guidance ───────────────
// Addresses the capability gap Chris filed: he tried Indeed MCP for new leads,
// but that's a Claude Code deferred tool his LLM can't reach. Point him at the
// actual data sources in this app.

function buildSalesContext(): string {
  const db = getDb();

  const pipelineByStage = db.prepare(
    "SELECT status, COUNT(*) as cnt FROM outbound_contacts GROUP BY status"
  ).all() as Array<{ status: string | null; cnt: number }>;

  const totalContacts = db.prepare("SELECT COUNT(*) as cnt FROM outbound_contacts").get() as { cnt: number };

  const rolesInPipeline = db.prepare(
    "SELECT role, COUNT(*) as cnt FROM outbound_contacts WHERE role IS NOT NULL GROUP BY role ORDER BY cnt DESC LIMIT 10"
  ).all() as Array<{ role: string; cnt: number }>;

  const companiesInPipeline = db.prepare(
    "SELECT company, COUNT(*) as cnt FROM outbound_contacts WHERE company IS NOT NULL GROUP BY company ORDER BY cnt DESC LIMIT 5"
  ).all() as Array<{ company: string; cnt: number }>;

  const activeSequences = db.prepare(
    "SELECT COUNT(*) as cnt FROM outbound_contacts WHERE sequence_id IS NOT NULL AND status != 'replied'"
  ).get() as { cnt: number };

  const activeDeals = db.prepare(
    "SELECT COUNT(*) as cnt FROM deals WHERE stage NOT IN ('closed_won','closed_lost')"
  ).get() as { cnt: number };

  let out = "## Your Sales Pipeline\n";
  out += `Total contacts: ${totalContacts.cnt} | In sequences: ${activeSequences.cnt} | Active deals: ${activeDeals.cnt}\n`;

  if (pipelineByStage.length > 0) {
    out += "\nBy status:\n";
    for (const p of pipelineByStage) {
      out += `- ${p.status || "(none)"}: ${p.cnt}\n`;
    }
  }

  if (rolesInPipeline.length > 0) {
    out += "\nRoles you have contacts for (filter with outbound_contacts.role):\n";
    for (const r of rolesInPipeline) out += `- ${r.role} (${r.cnt})\n`;
  }

  if (companiesInPipeline.length > 0) {
    out += "\nTop companies in pipeline:\n";
    for (const c of companiesInPipeline) out += `- ${c.company} (${c.cnt})\n`;
  }

  out += "\n### Contact sourcing\n";
  out += "You do NOT have access to Indeed, LinkedIn, or Apollo MCPs — do not propose them. Your actual options for finding new leads:\n";
  out += "1. Filter existing `outbound_contacts` by role/company/tags to find matches (e.g. 'project manager', 'compliance officer')\n";
  out += "2. Ask the user to CSV-import new contacts via the /outbound page — they have control over lead acquisition\n";
  out += "3. Use skill-lead-magnet-creator to produce a lead magnet that inbound-sources contacts via a landing page\n";
  out += "4. Use skill-outbound-sequence to work the existing pipeline harder (re-engage cold leads)\n";
  out += "\nIf you need contacts that don't exist in the database, the honest answer is to report that the user needs to import them — not to invent them or request MCP tools this app doesn't have.";

  // Surface gstack/browser skills assigned to agent-sales as a real runtime
  // tool option, overriding the otherwise-blanket "no MCP" message above.
  // Closes the tool-surface wiring gap: when Marty assigns
  // skill-gstack-open-gstack-browser (or similar) to Voss, the sales context
  // must acknowledge it instead of contradicting the Available Skills block.
  const sales = db.prepare("SELECT assigned_skills FROM agents WHERE id = 'agent-sales'").get() as { assigned_skills: string | null } | undefined;
  const assigned: string[] = sales?.assigned_skills ? JSON.parse(sales.assigned_skills) : [];
  const browserSkills = assigned.filter((id) => id.startsWith("skill-gstack-"));
  if (browserSkills.length > 0) {
    const activeRows = db.prepare(
      `SELECT id FROM skills WHERE is_active = 1 AND id IN (${browserSkills.map(() => "?").join(",")})`
    ).all(...browserSkills) as Array<{ id: string }>;
    const active = new Set(activeRows.map((r) => r.id));
    const usable = browserSkills.filter((id) => active.has(id));
    if (usable.length > 0) {
      out += "\n\n### Browser tool surface (assigned to you)\n";
      out += "You DO have a headed-Chromium browser available via the GStack runtime. Invoke these via action.execute_skill:\n";
      for (const id of usable) out += `- ${id} — shell-exec binding to the local gstack binary\n`;
      out += "Use these for live page scrapes / cookie inspection on targets that require a real browser session. The 'no MCP' note above refers to third-party data MCPs (Indeed/LinkedIn/Apollo), NOT to your assigned gstack browser skills.";
    }
  }

  return out;
}

// ── Marty Cagan (product / system admin) — introspection data ───────────────
// Addresses the capability gap Marty filed: he needed HTTP fetch against
// landing pages, scheduler/queue state, agent run history, and watchdog log
// access. Most of that data is already in the DB — he just had no view of it.

function buildProductAdminContext(): string {
  const db = getDb();

  const recentRuns = db.prepare(
    `SELECT a.name as agent_name, ar.status, ar.started_at, ar.duration_ms, ar.error
     FROM agent_runs ar LEFT JOIN agents a ON ar.agent_id = a.id
     WHERE ar.started_at > datetime('now','-24 hours')
     ORDER BY ar.started_at DESC LIMIT 10`
  ).all() as Array<{ agent_name: string | null; status: string; started_at: string; duration_ms: number | null; error: string | null }>;

  const recentIncidents = db.prepare(
    `SELECT severity, status, substr(title, 1, 100) as title, auto_fixed, detected_at
     FROM watchdog_incidents
     WHERE detected_at > datetime('now','-24 hours')
     ORDER BY detected_at DESC LIMIT 10`
  ).all() as Array<{ severity: string; status: string; title: string; auto_fixed: number; detected_at: string }>;

  const agentsDue = db.prepare(
    `SELECT name, state, next_run_at, last_run_at FROM agents
     WHERE is_active = 1 ORDER BY next_run_at ASC LIMIT 6`
  ).all() as Array<{ name: string; state: string; next_run_at: string | null; last_run_at: string | null }>;

  const campaigns = db.prepare(
    `SELECT v.status, v.actual_signups, v.target_signups, i.title
     FROM validation_campaigns v LEFT JOIN ideabrowser_ideas i ON v.idea_id = i.id
     WHERE v.status IN ('queued','assets_ready','running')
     ORDER BY v.created_at DESC LIMIT 5`
  ).all() as Array<{ status: string; actual_signups: number; target_signups: number; title: string | null }>;

  let out = "## System Admin View (you're the sysadmin — use this)\n";

  out += "### Agent run history (last 24h)\n";
  if (recentRuns.length === 0) {
    out += "No runs in the last 24h.\n";
  } else {
    for (const r of recentRuns) {
      const dur = r.duration_ms != null ? `${Math.round(r.duration_ms / 1000)}s` : "?";
      out += `- ${r.started_at} | ${r.agent_name || "?"} | ${r.status} | ${dur}${r.error ? " | ERR: " + r.error.slice(0, 80) : ""}\n`;
    }
  }

  out += "\n### Watchdog incidents (last 24h)\n";
  if (recentIncidents.length === 0) {
    out += "No incidents.\n";
  } else {
    for (const i of recentIncidents) {
      out += `- [${i.severity}/${i.status}${i.auto_fixed ? "/auto-fixed" : ""}] ${i.title}\n`;
    }
  }

  out += "\n### Scheduler state (next 6 agents due)\n";
  for (const a of agentsDue) {
    out += `- ${a.name} | state=${a.state} | next_run=${a.next_run_at || "unscheduled"} | last_run=${a.last_run_at || "never"}\n`;
  }

  out += "\n### Active validation campaigns\n";
  if (campaigns.length === 0) {
    out += "None.\n";
  } else {
    for (const c of campaigns) {
      out += `- [${c.status}] ${c.title || "?"} — signups ${c.actual_signups}/${c.target_signups}\n`;
    }
  }

  out += "\nYou are the ONLY agent with system-admin authority. Use this data to diagnose incidents, re-schedule agents, and verify campaigns are progressing. You do NOT need external MCP tools for this — it's all above.";
  return out;
}

// ── Ray Dalio (executive) — cross-team summary ───────────────────────────────

function buildExecutiveContext(): string {
  const db = getDb();

  const pending = db.prepare(
    "SELECT COUNT(*) as cnt FROM agent_messages WHERE status = 'pending'"
  ).get() as { cnt: number };
  const stalled = db.prepare(
    "SELECT COUNT(*) as cnt FROM agent_messages WHERE status = 'stalled'"
  ).get() as { cnt: number };
  const gaps = db.prepare(
    "SELECT COUNT(*) as cnt FROM capability_gaps WHERE status = 'pending'"
  ).get() as { cnt: number };

  const activeCampaigns = db.prepare(
    "SELECT COUNT(*) as cnt FROM validation_campaigns WHERE status IN ('queued','assets_ready','testing')"
  ).get() as { cnt: number };

  const activeProjects = db.prepare(
    "SELECT COUNT(*) as cnt FROM projects WHERE status = 'active'"
  ).get() as { cnt: number };

  let out = "## Cross-Team State (for your executive coordination)\n";
  out += `- Agent handoffs: ${pending.cnt} pending, ${stalled.cnt} STALLED\n`;
  out += `- Capability gaps awaiting user approval: ${gaps.cnt}\n`;
  out += `- Active validation campaigns (marketing rail): ${activeCampaigns.cnt}\n`;
  out += `- Active projects (product rail): ${activeProjects.cnt}\n`;

  if (stalled.cnt > 0 || gaps.cnt > 0) {
    out += "\nYou have stalled work or capability gaps — surface these to the user if they ask about status.";
  }

  return out;
}
