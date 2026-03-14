import { NextRequest, NextResponse } from "next/server";
import {
  getContent,
  getProjectContent,
  createContent,
  logActivity,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const content = projectId
      ? await getProjectContent(projectId)
      : await getContent();
    return NextResponse.json(content);
  } catch (error) {
    console.error("GET /api/content error:", error);
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const content = await createContent(body);
    await logActivity({
      action: "content_created",
      project_id: body.project_id,
      details: `Created content: ${body.title || "Untitled"}`,
    });
    return NextResponse.json(content, { status: 201 });
  } catch (error) {
    console.error("POST /api/content error:", error);
    return NextResponse.json(
      { error: "Failed to create content" },
      { status: 500 }
    );
  }
}
