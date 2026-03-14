import { NextRequest, NextResponse } from "next/server";
import { updateContent, logActivity } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const content = await updateContent(id, body);
    if (!content) {
      return NextResponse.json(
        { error: "Content not found" },
        { status: 404 }
      );
    }
    await logActivity({
      action: "content_updated",
      project_id: body.project_id,
      details: `Updated content: ${id}`,
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
