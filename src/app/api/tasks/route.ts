import { NextRequest, NextResponse } from "next/server";
import {
  getTasks,
  getTasksByProject,
  createTask,
  logActivity,
} from "@/lib/db";
import { safeParseJson, validateRequired, sanitizeBody } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const tasks = projectId
      ? await getTasksByProject(projectId)
      : await getTasks();
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await safeParseJson(request);
    if (!raw) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const err = validateRequired(raw, ["project_id", "title"]);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const body = sanitizeBody(raw, ["description"]);
    const task = await createTask(body);
    await logActivity({
      action: "task_created",
      project_id: body.project_id,
      details: `Created task: ${body.title}`,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
