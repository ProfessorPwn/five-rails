import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { updateAgentTaskStatus, logActivity } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { status, current_step_label, progress_pct, blocker_reason, output_ref, action } = body;

    // Handle resolve action: blocked/working -> queued
    if (action === "resolve") {
      const result = updateAgentTaskStatus(id, "queued");
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      logActivity({
        action: "agent_task_resolved",
        details: `Task ${id} resolved, moved back to queued`,
      });
      return NextResponse.json(result.task);
    }

    // Handle force-complete action: any stuck state -> done
    if (action === "force_complete") {
      const result = updateAgentTaskStatus(id, "done", {
        current_step_label: "Force-completed by user",
      });
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      logActivity({
        action: "agent_task_force_completed",
        details: `Task ${id} force-completed by user`,
      });
      return NextResponse.json(result.task);
    }

    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    const result = updateAgentTaskStatus(id, status, {
      current_step_label,
      progress_pct,
      blocker_reason,
      output_ref,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    logActivity({
      action: "agent_task_updated",
      details: `Task ${id} moved to ${status}`,
    });

    return NextResponse.json(result.task);
  } catch (error) {
    console.error("PATCH /api/agents/tasks/[id] error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const task = getDb().prepare("SELECT id, name FROM agent_tasks WHERE id = ?").get(id) as { id: string; name: string } | undefined;
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    getDb().prepare("DELETE FROM agent_task_transitions WHERE task_id = ?").run(id);
    getDb().prepare("DELETE FROM agent_tasks WHERE id = ?").run(id);

    logActivity({
      action: "agent_task_deleted",
      details: `Task "${task.name}" (${id}) deleted from board`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/agents/tasks/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    if (body.action === "resolve") {
      const result = updateAgentTaskStatus(id, "queued");
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      logActivity({
        action: "agent_task_resolved",
        details: `Task ${id} blocker resolved, moved back to queued`,
      });
      return NextResponse.json(result.task);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/agents/tasks/[id] error:", error);
    return NextResponse.json({ error: "Failed to process task action" }, { status: 500 });
  }
}
