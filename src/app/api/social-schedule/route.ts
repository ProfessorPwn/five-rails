import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const posts = getDb().prepare("SELECT * FROM scheduled_posts ORDER BY scheduled_at ASC").all();
    return NextResponse.json(posts);
  } catch (error) {
    console.error("GET /api/social-schedule error:", error);
    return NextResponse.json({ error: "Failed to fetch schedule" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = uuidv4();

    // Calculate best time if not specified
    let scheduledAt = body.scheduled_at;
    if (!scheduledAt && body.use_best_time) {
      const bestTimes: Record<string, number> = { twitter: 9, linkedin: 10, facebook: 13, instagram: 18, tiktok: 19, youtube: 14 };
      const hour = bestTimes[body.platform?.toLowerCase() || ""] || 10;
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(hour, 0, 0, 0);
      scheduledAt = d.toISOString();
    }

    getDb().prepare(`
      INSERT INTO scheduled_posts (id, project_id, content_id, platform, post_text, media_url, scheduled_at, best_time_used, is_evergreen, recycle_interval_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.project_id || null, body.content_id || null, body.platform || "twitter",
      body.post_text || "", body.media_url || null, scheduledAt || new Date().toISOString(),
      body.use_best_time ? 1 : 0, body.is_evergreen ? 1 : 0, body.recycle_interval_days || null);

    const post = getDb().prepare("SELECT * FROM scheduled_posts WHERE id = ?").get(id);
    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error("POST /api/social-schedule error:", error);
    return NextResponse.json({ error: "Failed to schedule post" }, { status: 500 });
  }
}
