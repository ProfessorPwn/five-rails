import { NextRequest, NextResponse } from "next/server";
import {
  getIdeaBrowserIdea,
  updateIdeaBrowserIdea,
  deleteIdeaBrowserIdea,
  logActivity,
} from "@/lib/db";
import { safeParseJson, sanitizeBody, isValidIdeaSyncStatus } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const idea = getIdeaBrowserIdea(id);
    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }
    return NextResponse.json(idea);
  } catch (error) {
    console.error("GET /api/ideabrowser/ideas/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch idea" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid or missing JSON body" },
        { status: 400 }
      );
    }

    // Validate sync_status if provided
    if (body.sync_status && !isValidIdeaSyncStatus(String(body.sync_status))) {
      return NextResponse.json(
        { error: "Invalid sync_status. Must be one of: scraped, manual, modified" },
        { status: 400 }
      );
    }

    const sanitized = sanitizeBody(body, [
      "description",
      "go_to_market",
      "pricing",
      "target_market",
      "competition",
      "raw_data",
    ]);

    const idea = updateIdeaBrowserIdea(id, sanitized);
    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    logActivity({
      action: "ideabrowser_idea_updated",
      project_id: idea.project_id || undefined,
      details: `Updated IdeaBrowser idea: "${idea.title}"`,
    });

    return NextResponse.json(idea);
  } catch (error) {
    console.error("PATCH /api/ideabrowser/ideas/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update idea" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Fetch before delete so we can log the title
    const existing = getIdeaBrowserIdea(id);
    const deleted = deleteIdeaBrowserIdea(id);
    if (!deleted) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    logActivity({
      action: "ideabrowser_idea_deleted",
      project_id: existing?.project_id || undefined,
      details: `Deleted IdeaBrowser idea: "${existing?.title || id}"`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/ideabrowser/ideas/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete idea" },
      { status: 500 }
    );
  }
}
