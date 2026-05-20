import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface KPIRow { val: number | null }
interface CountRow { cnt: number }

export async function GET() {
  try {
    const db = getDb();

    // ─── KPI 1: MRR / ARR ───────────────────────────────────────────────────
    const mrrRow = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as val FROM subscriptions WHERE status = 'active' AND interval = 'monthly'"
    ).get() as KPIRow;
    const mrr = mrrRow.val ?? 0;

    const yearlyRow = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as val FROM subscriptions WHERE status = 'active' AND interval = 'yearly'"
    ).get() as KPIRow;
    const arr = mrr * 12 + (yearlyRow.val ?? 0);

    // MRR 30 days ago (compare active subs started before 30 days ago, not canceled before 30 days ago)
    const mrr30Row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as val FROM subscriptions
      WHERE interval = 'monthly'
        AND started_at <= datetime('now', '-30 days')
        AND (status = 'active' OR (canceled_at IS NOT NULL AND canceled_at > datetime('now', '-30 days')))
    `).get() as KPIRow;
    const mrr30Ago = mrr30Row.val ?? 0;

    const activeSubsCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM subscriptions WHERE status = 'active'"
    ).get() as CountRow).cnt;

    // ─── KPI 2: Pipeline Value ──────────────────────────────────────────────
    const pipelineRow = db.prepare(
      "SELECT COALESCE(SUM(value), 0) as val FROM deals WHERE stage NOT IN ('won', 'lost')"
    ).get() as KPIRow;
    const pipelineValue = pipelineRow.val ?? 0;

    const pipelineDealCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM deals WHERE stage NOT IN ('won', 'lost')"
    ).get() as CountRow).cnt;

    const wonThisMonth = db.prepare(
      "SELECT COALESCE(SUM(value), 0) as val FROM deals WHERE stage = 'won' AND updated_at >= datetime('now', 'start of month')"
    ).get() as KPIRow;

    // ─── KPI 3: Contacts ────────────────────────────────────────────────────
    const contactsCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM outbound_contacts"
    ).get() as CountRow).cnt;

    const hotLeadsCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM outbound_contacts WHERE lead_score >= 50"
    ).get() as CountRow).cnt;

    const newContactsThisWeek = (db.prepare(
      "SELECT COUNT(*) as cnt FROM outbound_contacts WHERE created_at >= datetime('now', '-7 days')"
    ).get() as CountRow).cnt;

    // ─── KPI 4: Content Published ───────────────────────────────────────────
    const contentPublished = (db.prepare(
      "SELECT COUNT(*) as cnt FROM content_pieces WHERE status = 'published'"
    ).get() as CountRow).cnt;

    const contentThisWeek = (db.prepare(
      "SELECT COUNT(*) as cnt FROM content_pieces WHERE status = 'published' AND created_at >= datetime('now', '-7 days')"
    ).get() as CountRow).cnt;

    const contentDrafts = (db.prepare(
      "SELECT COUNT(*) as cnt FROM content_pieces WHERE status = 'draft'"
    ).get() as CountRow).cnt;

    // ─── KPI 5: Agent Actions ───────────────────────────────────────────────
    const agentActionsWeek = (db.prepare(
      "SELECT COUNT(*) as cnt FROM agent_decisions WHERE created_at >= datetime('now', '-7 days')"
    ).get() as CountRow).cnt;

    const activeAgentCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM agents WHERE state != 'idle'"
    ).get() as CountRow).cnt;

    const totalAgents = (db.prepare(
      "SELECT COUNT(*) as cnt FROM agents"
    ).get() as CountRow).cnt;

    // ─── Agents with state + last decision ──────────────────────────────────
    const agents = db.prepare(`
      SELECT a.id, a.name, a.department, a.state, a.last_run_at, a.next_run_at, a.schedule,
        (SELECT reasoning FROM agent_decisions WHERE agent_id = a.id ORDER BY created_at DESC LIMIT 1) as last_reasoning,
        (SELECT action_taken FROM agent_decisions WHERE agent_id = a.id ORDER BY created_at DESC LIMIT 1) as last_action,
        (SELECT created_at FROM agent_decisions WHERE agent_id = a.id ORDER BY created_at DESC LIMIT 1) as last_decision_at
      FROM agents a ORDER BY a.department
    `).all();

    // ─── Automation Health ──────────────────────────────────────────────────
    const lastRun = db.prepare(
      "SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT 1"
    ).get() as {
      id: string; run_type: string; status: string; results: string;
      started_at: string; completed_at: string | null; duration_ms: number;
    } | undefined;

    const recentRuns = db.prepare(
      "SELECT id, status, results, started_at, duration_ms FROM automation_runs ORDER BY started_at DESC LIMIT 5"
    ).all();

    // Parse automation interval for next scheduled run
    const intervalSetting = db.prepare(
      "SELECT value FROM automation_settings WHERE key = 'automation_interval_minutes'"
    ).get() as { value: string } | undefined;
    const intervalMinutes = parseInt(intervalSetting?.value || "15");

    // ─── Activity Feed (enriched) ───────────────────────────────────────────
    const activity = db.prepare(
      "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20"
    ).all();

    // ─── Quick Stats for What's Next ────────────────────────────────────────
    const projectCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM projects"
    ).get() as CountRow).cnt;

    const activeProjects = (db.prepare(
      "SELECT COUNT(*) as cnt FROM projects WHERE status = 'active'"
    ).get() as CountRow).cnt;

    const pendingTasks = (db.prepare(
      "SELECT COUNT(*) as cnt FROM tasks WHERE status = 'pending'"
    ).get() as CountRow).cnt;

    const connectionsCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM connections WHERE is_active = 1"
    ).get() as CountRow).cnt;

    const ideaCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM ideabrowser_ideas"
    ).get() as CountRow).cnt;

    const unlinkedIdeas = (db.prepare(
      "SELECT COUNT(*) as cnt FROM ideabrowser_ideas WHERE project_id IS NULL"
    ).get() as CountRow).cnt;

    const newslettersDraft = (db.prepare(
      "SELECT COUNT(*) as cnt FROM newsletters WHERE status = 'draft'"
    ).get() as CountRow).cnt;

    const scheduledPosts = (db.prepare(
      "SELECT COUNT(*) as cnt FROM scheduled_posts WHERE status = 'scheduled'"
    ).get() as CountRow).cnt;

    return NextResponse.json({
      kpis: {
        mrr,
        arr,
        mrr_30_ago: mrr30Ago,
        mrr_trend: mrr > mrr30Ago ? "up" : mrr < mrr30Ago ? "down" : "flat",
        active_subscriptions: activeSubsCount,
        pipeline_value: pipelineValue,
        pipeline_deal_count: pipelineDealCount,
        won_this_month: wonThisMonth?.val ?? 0,
        contacts_total: contactsCount,
        hot_leads: hotLeadsCount,
        new_contacts_this_week: newContactsThisWeek,
        content_published: contentPublished,
        content_this_week: contentThisWeek,
        content_drafts: contentDrafts,
        agent_actions_week: agentActionsWeek,
        active_agents: activeAgentCount,
        total_agents: totalAgents,
      },
      agents,
      automation: {
        last_run: lastRun ? {
          id: lastRun.id,
          status: lastRun.status,
          results: lastRun.results,
          started_at: lastRun.started_at,
          completed_at: lastRun.completed_at,
          duration_ms: lastRun.duration_ms,
        } : null,
        recent_runs: recentRuns,
        interval_minutes: intervalMinutes,
      },
      activity,
      context: {
        project_count: projectCount,
        active_projects: activeProjects,
        pending_tasks: pendingTasks,
        connections: connectionsCount,
        idea_count: ideaCount,
        unlinked_ideas: unlinkedIdeas,
        newsletters_draft: newslettersDraft,
        scheduled_posts: scheduledPosts,
      },
    });
  } catch (error) {
    console.error("GET /api/dashboard/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard stats" }, { status: 500 });
  }
}
