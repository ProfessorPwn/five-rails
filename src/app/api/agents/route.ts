import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const agents = getDb().prepare(`
      SELECT a.*,
        (SELECT COUNT(*) FROM agent_decisions WHERE agent_id = a.id) as decision_count,
        (SELECT COUNT(*) FROM agent_messages WHERE to_agent_id = a.id AND is_read = 0) as unread_messages,
        (SELECT reasoning FROM agent_decisions WHERE agent_id = a.id ORDER BY created_at DESC LIMIT 1) as last_reasoning
      FROM agents a ORDER BY a.department ASC
    `).all();
    return NextResponse.json(agents);
  } catch (error) {
    console.error("GET /api/agents error:", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
