import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET single sequence with enrolled contacts
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sequence = getDb()
      .prepare("SELECT * FROM email_sequences WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    if (!sequence) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    // Get enrolled contacts
    const contacts = getDb()
      .prepare(
        "SELECT id, name, email, company, status, sequence_step, next_sequence_step_at FROM outbound_contacts WHERE sequence_id = ? ORDER BY sequence_enrolled_at DESC"
      )
      .all(id);

    return NextResponse.json({ ...sequence, enrolled_contacts: contacts });
  } catch (error) {
    console.error("GET /api/sequences/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sequence" },
      { status: 500 }
    );
  }
}

// PATCH: Update sequence (name, steps, status, settings)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = getDb()
      .prepare("SELECT * FROM email_sequences WHERE id = ?")
      .get(id);

    if (!existing) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) {
      fields.push("name = ?");
      values.push(body.name);
    }
    if (body.steps !== undefined) {
      fields.push("steps = ?");
      values.push(JSON.stringify(body.steps));
    }
    if (body.status !== undefined) {
      fields.push("status = ?");
      values.push(body.status);
    }
    if (body.settings !== undefined) {
      fields.push("settings = ?");
      values.push(JSON.stringify(body.settings));
    }
    if (body.stats !== undefined) {
      fields.push("stats = ?");
      values.push(JSON.stringify(body.stats));
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      getDb()
        .prepare(
          `UPDATE email_sequences SET ${fields.join(", ")} WHERE id = ?`
        )
        .run(...values);
    }

    const updated = getDb()
      .prepare("SELECT * FROM email_sequences WHERE id = ?")
      .get(id);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/sequences/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update sequence" },
      { status: 500 }
    );
  }
}

// DELETE: Remove sequence and unenroll contacts
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Unenroll any contacts
    getDb()
      .prepare(
        "UPDATE outbound_contacts SET sequence_id = NULL, next_sequence_step_at = NULL WHERE sequence_id = ?"
      )
      .run(id);

    getDb().prepare("DELETE FROM email_sequences WHERE id = ?").run(id);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE /api/sequences/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete sequence" },
      { status: 500 }
    );
  }
}
