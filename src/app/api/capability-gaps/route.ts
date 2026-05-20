import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status");
    const where = status ? "WHERE g.status = ?" : "";
    const params = status ? [status] : [];

    // Sole-reporter pattern: agent_id is always Marty (the reporter).
    // blocked_agent_id is the agent that actually hit the wall. Expose both
    // names so the UI can show "Marty reports: Alex is blocked on X".
    const rows = getDb().prepare(
      `SELECT g.*,
              reporter.name as agent_name,
              blocked.name as blocked_agent_name
       FROM capability_gaps g
       LEFT JOIN agents reporter ON g.agent_id = reporter.id
       LEFT JOIN agents blocked  ON g.blocked_agent_id = blocked.id
       ${where}
       ORDER BY g.created_at DESC LIMIT 100`
    ).all(...params);

    return NextResponse.json({ gaps: rows });
  } catch (error) {
    console.error("GET /api/capability-gaps error:", error);
    return NextResponse.json({ error: "Failed to list capability gaps" }, { status: 500 });
  }
}
