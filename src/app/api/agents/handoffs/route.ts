import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status"); // pending | completed | stalled | failed
    const where = status ? "WHERE m.status = ?" : "WHERE m.message_type IN ('handoff','request')";
    const params = status ? [status] : [];

    const rows = getDb().prepare(
      `SELECT m.*,
              af.name as from_name,
              at.name as to_name
       FROM agent_messages m
       LEFT JOIN agents af ON m.from_agent_id = af.id
       LEFT JOIN agents at ON m.to_agent_id = at.id
       ${where}
       ORDER BY m.created_at DESC LIMIT 200`
    ).all(...params);

    return NextResponse.json({ handoffs: rows });
  } catch (error) {
    console.error("GET /api/agents/handoffs error:", error);
    return NextResponse.json({ error: "Failed to list handoffs" }, { status: 500 });
  }
}
