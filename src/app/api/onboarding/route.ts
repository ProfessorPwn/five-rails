import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const checklists = getDb().prepare("SELECT * FROM onboarding_checklists ORDER BY created_at DESC").all();
    return NextResponse.json(checklists);
  } catch (error) {
    console.error("GET /api/onboarding error:", error);
    return NextResponse.json({ error: "Failed to fetch checklists" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = uuidv4();
    const steps = body.steps || [
      { id: "s1", title: "Create your first project", completed: false },
      { id: "s2", title: "Connect your LLM provider", completed: false },
      { id: "s3", title: "Generate your first action plan", completed: false },
      { id: "s4", title: "Execute a skill", completed: false },
      { id: "s5", title: "Publish your first content", completed: false },
    ];
    getDb().prepare(`
      INSERT INTO onboarding_checklists (id, project_id, name, steps, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(id, body.project_id || null, body.name || "Getting Started", JSON.stringify(steps));
    const checklist = getDb().prepare("SELECT * FROM onboarding_checklists WHERE id = ?").get(id);
    return NextResponse.json(checklist, { status: 201 });
  } catch (error) {
    console.error("POST /api/onboarding error:", error);
    return NextResponse.json({ error: "Failed to create checklist" }, { status: 500 });
  }
}
