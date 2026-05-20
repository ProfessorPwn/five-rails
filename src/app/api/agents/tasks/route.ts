import { NextRequest, NextResponse } from "next/server";
import { getAgentTasks, createAgentTask, getAgentTaskBoard, logActivity } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agent_id") || undefined;
    const status = searchParams.get("status") || undefined;
    const grouped = searchParams.get("grouped");

    if (grouped === "true") {
      const board = getAgentTaskBoard();
      return NextResponse.json(board);
    }

    const tasks = getAgentTasks(agentId, status);
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("GET /api/agents/tasks error:", error);
    return NextResponse.json({ error: "Failed to fetch agent tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, agent_id, skill_id } = body;

    if (!name || !agent_id) {
      return NextResponse.json({ error: "name and agent_id are required" }, { status: 400 });
    }

    const task = createAgentTask({
      name,
      description: description || null,
      agent_id,
      skill_id: skill_id || null,
      status: "queued",
    });

    logActivity({
      action: "agent_task_created",
      details: `Task "${name}" created and queued for agent ${agent_id}`,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("POST /api/agents/tasks error:", error);
    return NextResponse.json({ error: "Failed to create agent task" }, { status: 500 });
  }
}
