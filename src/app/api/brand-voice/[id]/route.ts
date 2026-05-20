import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const voice = getDb().prepare("SELECT * FROM brand_voices WHERE id = ?").get(id);
    if (!voice) {
      return NextResponse.json({ error: "Brand voice not found" }, { status: 404 });
    }
    return NextResponse.json(voice);
  } catch (error) {
    console.error("GET /api/brand-voice/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch brand voice" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const db = getDb();

    const existing = db.prepare("SELECT * FROM brand_voices WHERE id = ?").get(id) as { id: string; name: string } | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Brand voice not found" }, { status: 404 });
    }

    // If setting this as default, unset other defaults first
    if (body.is_default) {
      db.prepare("UPDATE brand_voices SET is_default = 0 WHERE id != ?").run(id);
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) { fields.push("name = ?"); values.push(body.name); }
    if (body.description !== undefined) { fields.push("description = ?"); values.push(body.description); }
    if (body.project_id !== undefined) { fields.push("project_id = ?"); values.push(body.project_id || null); }
    if (body.tone_keywords !== undefined) { fields.push("tone_keywords = ?"); values.push(JSON.stringify(body.tone_keywords)); }
    if (body.sample_content !== undefined) { fields.push("sample_content = ?"); values.push(typeof body.sample_content === "string" ? body.sample_content : JSON.stringify(body.sample_content)); }
    if (body.rules !== undefined) { fields.push("rules = ?"); values.push(typeof body.rules === "string" ? body.rules : JSON.stringify(body.rules)); }
    if (body.is_default !== undefined) { fields.push("is_default = ?"); values.push(body.is_default ? 1 : 0); }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    db.prepare(`UPDATE brand_voices SET ${fields.join(", ")} WHERE id = ?`).run(...values);

    const updated = db.prepare("SELECT * FROM brand_voices WHERE id = ?").get(id);

    logActivity({
      action: "brand_voice_updated",
      details: `Updated brand voice: "${body.name || existing.name}"`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/brand-voice/[id] error:", error);
    return NextResponse.json({ error: "Failed to update brand voice" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const db = getDb();

    const existing = db.prepare("SELECT * FROM brand_voices WHERE id = ?").get(id) as { id: string; name: string } | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Brand voice not found" }, { status: 404 });
    }

    db.prepare("DELETE FROM brand_voices WHERE id = ?").run(id);

    logActivity({
      action: "brand_voice_deleted",
      details: `Deleted brand voice: "${existing.name}"`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/brand-voice/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete brand voice" }, { status: 500 });
  }
}
