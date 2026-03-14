import { NextRequest, NextResponse } from "next/server";
import {
  getContent,
  getProjectContent,
  createContent,
  logActivity,
} from "@/lib/db";
import { validateRequired, sanitizeBody } from "@/lib/validation";

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
    const raw = await request.json();
    const err = validateRequired(raw, ["type", "title"]);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const body = sanitizeBody(raw, ["content"]);
    if (body.project_id === "") body.project_id = undefined;
    const content = await createContent(body);
    await logActivity({
      action: "content_created",
      project_id: body.project_id || undefined,
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
