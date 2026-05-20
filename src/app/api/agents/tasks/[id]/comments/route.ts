import { NextRequest, NextResponse } from "next/server";
import { getTaskComments, addTaskComment } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const comments = getTaskComments(id);
    return NextResponse.json(comments);
  } catch (error) {
    console.error("GET /api/agents/tasks/[id]/comments error:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { message, agent_id, author_type } = body;

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const comment = addTaskComment(id, agent_id || null, message, author_type || "user");
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("POST /api/agents/tasks/[id]/comments error:", error);
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
