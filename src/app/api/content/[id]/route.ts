import { NextRequest, NextResponse } from "next/server";
import { updateContent, logActivity } from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const content = await updateContent(id, body);
    if (!content) {
      return NextResponse.json(
        { error: "Content not found" },
        { status: 404 }
      );
    }
    await logActivity({
      action: "content_updated",
      project_id: content.project_id || undefined,
      details: `Updated content: ${content.title || id}`,
    });
    return NextResponse.json(content);
  } catch (error) {
    console.error("PATCH /api/content/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update content" },
      { status: 500 }
    );
  }
}
