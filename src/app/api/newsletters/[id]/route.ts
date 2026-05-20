import { NextRequest, NextResponse } from "next/server";
import { getNewsletter, updateNewsletter, deleteNewsletter, logActivity } from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const newsletter = getNewsletter(id);
    if (!newsletter) return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });
    return NextResponse.json(newsletter);
  } catch (error) {
    console.error("GET /api/newsletters/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch newsletter" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });

    const updated = updateNewsletter(id, body as any);
    if (!updated) return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/newsletters/[id] error:", error);
    return NextResponse.json({ error: "Failed to update newsletter" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const newsletter = getNewsletter(id);
    const deleted = deleteNewsletter(id);
    if (!deleted) return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });

    logActivity({
      action: "newsletter_deleted",
      project_id: newsletter?.project_id || undefined,
      details: `Deleted newsletter: "${newsletter?.title}"`,
      rail: "audience",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/newsletters/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete newsletter" }, { status: 500 });
  }
}
