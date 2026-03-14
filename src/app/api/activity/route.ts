import { NextRequest, NextResponse } from "next/server";
import { getActivity, getProjectActivity } from "@/lib/db";

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
