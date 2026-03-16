import { NextRequest, NextResponse } from "next/server";
import { getActivity, getProjectActivity, logActivity } from "@/lib/db";
import { safeParseJson, validateRequired } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const activity = projectId
      ? await getProjectActivity(projectId)
      : await getActivity();
    return NextResponse.json(activity);
  } catch (error) {
    console.error("GET /api/activity error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const err = validateRequired(body, ["action"]);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const entry = logActivity({
      action: body.action,
      project_id: body.project_id || undefined,
      details: body.details || undefined,
      rail: body.rail || undefined,
      skill_used: body.skill_used || undefined,
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST /api/activity error:", error);
    return NextResponse.json(
      { error: "Failed to log activity" },
      { status: 500 }
    );
  }
}
