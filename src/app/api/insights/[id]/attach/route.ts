import { NextRequest, NextResponse } from "next/server";
import { attachInsightToProject, logActivity } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    if (!body.project_id) {
      return NextResponse.json(
        { error: "project_id is required" },
        { status: 400 }
      );
    }

    const result = await attachInsightToProject(id, body.project_id);
    await logActivity({
      action: "insight_attached",
      project_id: body.project_id,
      details: `Attached insight ${id} to project ${body.project_id}`,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/insights/[id]/attach error:", error);
    return NextResponse.json(
      { error: "Failed to attach insight to project" },
      { status: 500 }
    );
  }
}
