import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// Multi-step email sequence with conditional branching (Apollo/Lemlist pattern)
// Steps format: [{ id, type: "email"|"delay"|"condition", delay_days, subject, body, condition }]

export async function GET() {
  try {
    const sequences = getDb().prepare("SELECT * FROM email_sequences ORDER BY created_at DESC").all();
    return NextResponse.json(sequences);
  } catch (error) {
    console.error("GET /api/sequences error:", error);
    return NextResponse.json({ error: "Failed to fetch sequences" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = uuidv4();

    // If no steps provided, generate a default sequence structure
    const steps = body.steps || [
      { id: "step-1", type: "email", delay_days: 0, subject: "Introduction", body: "", condition: null },
      { id: "step-2", type: "delay", delay_days: 2, subject: null, body: null, condition: null },
      { id: "step-3", type: "condition", delay_days: 0, subject: null, body: null, condition: { type: "opened", step_id: "step-1", then_step: "step-4", else_step: "step-5" } },
      { id: "step-4", type: "email", delay_days: 0, subject: "Follow-up (opened)", body: "", condition: null },
      { id: "step-5", type: "email", delay_days: 0, subject: "Re-engagement (didn't open)", body: "", condition: null },
    ];

    getDb().prepare(`
      INSERT INTO email_sequences (id, project_id, name, status, steps, settings)
      VALUES (?, ?, ?, 'draft', ?, ?)
    `).run(id, body.project_id || null, body.name || "New Sequence", JSON.stringify(steps), JSON.stringify(body.settings || {}));

    const sequence = getDb().prepare("SELECT * FROM email_sequences WHERE id = ?").get(id);
    return NextResponse.json(sequence, { status: 201 });
  } catch (error) {
    console.error("POST /api/sequences error:", error);
    return NextResponse.json({ error: "Failed to create sequence" }, { status: 500 });
  }
}
