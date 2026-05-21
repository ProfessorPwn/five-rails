import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { createAgentTask } from "@/lib/db/agents";

type RouteContext = { params: Promise<{ id: string }> };

interface ConvertBody {
  target_agent_id?: string;
  skill_id?: string;
  note?: string;
}

interface GapRow {
  id: string;
  agent_id: string;
  blocked_agent_id: string | null;
  missing_capability: string;
  task_description: string;
  proposed_fix: string | null;
  install_command: string | null;
  status: string;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as ConvertBody;

    const gap = getDb().prepare(
      `SELECT id, agent_id, blocked_agent_id, missing_capability, task_description,
              proposed_fix, install_command, status
       FROM capability_gaps WHERE id = ?`
    ).get(id) as GapRow | undefined;

    if (!gap) return NextResponse.json({ error: "Gap not found" }, { status: 404 });
    if (gap.status !== "pending") {
      return NextResponse.json({ error: `Gap already ${gap.status}` }, { status: 400 });
    }

    // Resolution target: the blocked agent (who hit the wall), or — if unknown —
    // the reporter (Marty), who can re-delegate from his own queue. The operator
    // can override via target_agent_id in the body.
    const targetAgentId = body.target_agent_id ?? gap.blocked_agent_id ?? gap.agent_id;

    const taskName = `Resolve capability gap: ${gap.missing_capability.slice(0, 120)}`;
    const description = [
      `Operator converted capability gap ${gap.id} into a task.`,
      "",
      `Missing capability: ${gap.missing_capability}`,
      `Original task: ${gap.task_description}`,
      gap.proposed_fix ? `\nProposed fix:\n${gap.proposed_fix}` : "",
      gap.install_command ? `\nInstall command: ${gap.install_command}` : "",
      body.note ? `\nOperator note: ${body.note}` : "",
    ].join("\n").trim();

    const task = createAgentTask({
      name: taskName,
      description,
      agent_id: targetAgentId,
      skill_id: body.skill_id,
      status: "queued",
      delegated_by: "operator",
    });

    getDb().prepare(
      "UPDATE capability_gaps SET status = 'approved', resolved_at = datetime('now') WHERE id = ?"
    ).run(gap.id);

    logActivity({
      action: "capability_gap_converted_to_task",
      details: `Operator converted gap ${gap.id.slice(0, 8)} → task ${task.id.slice(0, 8)} for ${targetAgentId}: ${gap.missing_capability.slice(0, 200)}`,
    });

    return NextResponse.json({
      ok: true,
      gap_id: gap.id,
      task: { id: task.id, name: task.name, agent_id: task.agent_id, status: task.status },
    });
  } catch (error) {
    console.error("POST /api/capability-gaps/[id]/convert-to-task error:", error);
    return NextResponse.json({ error: "Convert failed" }, { status: 500 });
  }
}
