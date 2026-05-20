import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const agent = getDb().prepare("SELECT * FROM agents WHERE id = ?").get(id);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const decisions = getDb().prepare(
      "SELECT * FROM agent_decisions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 20"
    ).all(id);

    const conversations = getDb().prepare(
      "SELECT * FROM agent_conversations WHERE agent_id = ? ORDER BY created_at DESC LIMIT 50"
    ).all(id);

    const messages = getDb().prepare(
      "SELECT * FROM agent_messages WHERE to_agent_id = ? ORDER BY created_at DESC LIMIT 20"
    ).all(id);

    return NextResponse.json({ agent, decisions, conversations, messages });
  } catch (error) {
    console.error("GET /api/agents/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const key of ['name', 'role', 'system_prompt', 'assigned_skills', 'schedule', 'is_active', 'project_id', 'memory']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(typeof body[key] === 'object' ? JSON.stringify(body[key]) : body[key]);
      }
    }
    if (fields.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    values.push(id);
    getDb().prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const agent = getDb().prepare("SELECT * FROM agents WHERE id = ?").get(id);
    return NextResponse.json(agent);
  } catch (error) {
    console.error("PATCH /api/agents/[id] error:", error);
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
  }
}
