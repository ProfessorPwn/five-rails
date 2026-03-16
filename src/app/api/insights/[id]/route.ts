import { NextRequest, NextResponse } from "next/server";
import { updateInsight, deleteInsight, logActivity } from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const insight = await updateInsight(id, body);
    if (!insight) {
      return NextResponse.json(
        { error: "Insight not found" },
        { status: 404 }
      );
    }
    await logActivity({
      action: "insight_updated",
      project_id: insight.project_id || undefined,
      details: `Updated insight: ${insight.title || id}`,
    });
    return NextResponse.json(insight);
  } catch (error) {
    console.error("PATCH /api/insights/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update insight" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deleted = await deleteInsight(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Insight not found" },
        { status: 404 }
      );
    }
    await logActivity({
      action: "insight_deleted",
      details: `Deleted insight: ${id}`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/insights/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete insight" },
      { status: 500 }
    );
  }
}
