import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const voices = getDb().prepare("SELECT * FROM brand_voices ORDER BY is_default DESC, created_at DESC").all();
    return NextResponse.json(voices);
  } catch (error) {
    console.error("GET /api/brand-voice error:", error);
    return NextResponse.json({ error: "Failed to fetch brand voices" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO brand_voices (id, project_id, name, description, tone_keywords, sample_content, rules, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.project_id || null, body.name || "Default Voice", body.description || "",
      JSON.stringify(body.tone_keywords || []), JSON.stringify(body.sample_content || []),
      JSON.stringify(body.rules || []), body.is_default ? 1 : 0);
    const voice = getDb().prepare("SELECT * FROM brand_voices WHERE id = ?").get(id);
    return NextResponse.json(voice, { status: 201 });
  } catch (error) {
    console.error("POST /api/brand-voice error:", error);
    return NextResponse.json({ error: "Failed to create brand voice" }, { status: 500 });
  }
}
