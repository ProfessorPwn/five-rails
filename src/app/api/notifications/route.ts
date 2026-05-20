import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// GET — return last 50 notifications, newest first
export async function GET() {
  try {
    const notifications = getDb()
      .prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50")
      .all();
    const unreadCount = (
      getDb()
        .prepare("SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0")
        .get() as { cnt: number }
    ).cnt;
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

// POST — create a new notification
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, title, message, link } = body;

    if (!type || !title) {
      return NextResponse.json({ error: "type and title are required" }, { status: 400 });
    }

    const id = uuidv4();
    getDb()
      .prepare(
        "INSERT INTO notifications (id, type, title, message, link) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, type, title, message || null, link || null);

    const notification = getDb()
      .prepare("SELECT * FROM notifications WHERE id = ?")
      .get(id);
    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

// PATCH — mark notifications as read
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.all === true) {
      getDb().prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0").run();
      return NextResponse.json({ success: true, message: "All notifications marked as read" });
    }

    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      const placeholders = body.ids.map(() => "?").join(",");
      getDb()
        .prepare(`UPDATE notifications SET is_read = 1 WHERE id IN (${placeholders})`)
        .run(...body.ids);
      return NextResponse.json({ success: true, marked: body.ids.length });
    }

    return NextResponse.json(
      { error: 'Provide { ids: string[] } or { all: true }' },
      { status: 400 }
    );
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
