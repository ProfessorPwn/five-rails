import { NextRequest, NextResponse } from "next/server";
import {
  getContent,
  getProjectContent,
  createContent,
  logActivity,
} from "@/lib/db";
import { validateRequired, sanitizeBody, safeParseJson, isValidContentType } from "@/lib/validation";

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
    const raw = await safeParseJson(request);
    if (!raw) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const err = validateRequired(raw, ["type", "title"]);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    if (!isValidContentType(String(raw.type))) {
      return NextResponse.json(
        { error: "Invalid content type. Must be one of: post, email, script, lead_magnet, landing_page" },
        { status: 400 }
      );
    }
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
