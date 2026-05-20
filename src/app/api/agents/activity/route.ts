import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Unified agent activity feed — everything all agents are doing/have done
export async function GET() {
  try {
    // All agents with current state
    const agents = getDb().prepare(`
      SELECT a.id, a.name, a.department, a.state, a.last_run_at, a.next_run_at, a.schedule,
        (SELECT COUNT(*) FROM agent_decisions WHERE agent_id = a.id) as total_decisions,
        (SELECT COUNT(*) FROM agent_decisions WHERE agent_id = a.id AND created_at >= datetime('now', '-24 hours')) as decisions_today,
        (SELECT COUNT(*) FROM agent_conversations WHERE agent_id = a.id AND created_at >= datetime('now', '-24 hours')) as chats_today,
        (SELECT COUNT(*) FROM agent_messages WHERE to_agent_id = a.id AND is_read = 0) as unread_messages
      FROM agents a ORDER BY a.department
    `).all();

    // Recent decisions across ALL agents (last 24h)
    const recentDecisions = getDb().prepare(`
      SELECT ad.*, a.name as agent_name, a.department
      FROM agent_decisions ad
      JOIN agents a ON ad.agent_id = a.id
      ORDER BY ad.created_at DESC
      LIMIT 50
    `).all();

    // Recent inter-agent messages
    const recentMessages = getDb().prepare(`
      SELECT m.*,
        sender.name as from_name, sender.department as from_dept,
        receiver.name as to_name, receiver.department as to_dept
      FROM agent_messages m
      JOIN agents sender ON m.from_agent_id = sender.id
      LEFT JOIN agents receiver ON m.to_agent_id = receiver.id
      ORDER BY m.created_at DESC
      LIMIT 30
    `).all();

    // Content created by agents (via skills) in last 24h
    const recentContent = getDb().prepare(`
      SELECT cp.id, cp.title, cp.type, cp.platform, cp.status, cp.created_at
      FROM content_pieces cp
      WHERE cp.created_at >= datetime('now', '-24 hours')
      ORDER BY cp.created_at DESC
      LIMIT 20
    `).all();

    // Automation run history
    const recentRuns = getDb().prepare(`
      SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT 10
    `).all();

    // Summary stats
    const totalDecisionsToday = (agents as Array<{ decisions_today: number }>).reduce((s, a) => s + a.decisions_today, 0);
    const totalChatsToday = (agents as Array<{ chats_today: number }>).reduce((s, a) => s + a.chats_today, 0);
    const activeAgents = (agents as Array<{ state: string }>).filter(a => a.state !== "idle").length;
    const totalUnread = (agents as Array<{ unread_messages: number }>).reduce((s, a) => s + a.unread_messages, 0);

    return NextResponse.json({
      summary: {
        active_agents: activeAgents,
        decisions_today: totalDecisionsToday,
        chats_today: totalChatsToday,
        unread_messages: totalUnread,
        total_agents: agents.length,
      },
      agents,
      recent_decisions: recentDecisions,
      recent_messages: recentMessages,
      recent_content: recentContent,
      recent_runs: recentRuns,
    });
  } catch (error) {
    console.error("GET /api/agents/activity error:", error);
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 });
  }
}
