import { NextRequest, NextResponse } from "next/server";
import { updateTask, deleteTask, logActivity } from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const task = await updateTask(id, body);
    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    await logActivity({
      action: "task_updated",
      project_id: task.project_id,
      details: `Updated task: ${task.title || id}`,
    });
    return NextResponse.json(task);
  } catch (error) {
    console.error("PATCH /api/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deleted = await deleteTask(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    await logActivity({
      action: "task_deleted",
      details: `Deleted task: ${id}`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
