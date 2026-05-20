import { NextRequest, NextResponse } from "next/server";
import {
  getContent,
  getProjectContent,
  createContent,
  logActivity,
  getAutomationSetting,
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
    logActivity({
      action: "content_created",
      project_id: body.project_id || undefined,
      details: `Created content: ${body.title || "Untitled"}`,
    });

    // Auto-schedule content at best time if enabled and platform is set
    if (getAutomationSetting("auto_schedule_content") === "true" && body.platform) {
      try {
        const { getDb: getDatabase } = await import("@/lib/db");
        const { v4: genId } = await import("uuid");
        const bestTimes: Record<string, number> = { Twitter: 9, LinkedIn: 10, Facebook: 13, Instagram: 18, TikTok: 19, YouTube: 14 };
        const hour = bestTimes[body.platform] || 10;
        const schedTime = new Date();
        schedTime.setDate(schedTime.getDate() + 1);
        schedTime.setHours(hour, 0, 0, 0);
        getDatabase().prepare(`
          INSERT INTO scheduled_posts (id, project_id, content_id, platform, post_text, scheduled_at, best_time_used, status)
          VALUES (?, ?, ?, ?, ?, ?, 1, 'scheduled')
        `).run(genId(), content.project_id || null, content.id, body.platform.toLowerCase(),
          (content.content || content.title || "").slice(0, 500), schedTime.toISOString());
      } catch { /* non-blocking */ }
    }

    return NextResponse.json(content, { status: 201 });
  } catch (error) {
    console.error("POST /api/content error:", error);
    return NextResponse.json(
      { error: "Failed to create content" },
      { status: 500 }
    );
  }
}
