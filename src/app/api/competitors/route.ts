import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const competitors = getDb().prepare("SELECT * FROM competitors ORDER BY created_at DESC").all();
    const alerts = getDb().prepare("SELECT * FROM competitor_alerts WHERE is_read = 0 ORDER BY created_at DESC LIMIT 20").all();
    return NextResponse.json({ competitors, unread_alerts: alerts });
  } catch (error) {
    console.error("GET /api/competitors error:", error);
    return NextResponse.json({ error: "Failed to fetch competitors" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO competitors (id, project_id, name, website_url, monitored_pages, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, body.project_id || null, body.name, body.website_url || null,
      JSON.stringify(body.monitored_pages || []), body.notes || null);
    const comp = getDb().prepare("SELECT * FROM competitors WHERE id = ?").get(id);
    return NextResponse.json(comp, { status: 201 });
  } catch (error) {
    console.error("POST /api/competitors error:", error);
    return NextResponse.json({ error: "Failed to create competitor" }, { status: 500 });
  }
}
