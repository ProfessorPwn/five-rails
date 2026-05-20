import { NextRequest, NextResponse } from "next/server";
import {
  getContacts,
  getProjectContacts,
  createContact,
  logActivity,
  getAutomationSetting,
  getDb,
} from "@/lib/db";
import { validateRequired, sanitizeBody, isValidEmail, safeParseJson } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const contacts = projectId
      ? await getProjectContacts(projectId)
      : await getContacts();
    return NextResponse.json(contacts);
  } catch (error) {
    console.error("GET /api/outbound error:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await safeParseJson(request);
    if (!raw) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const err = validateRequired(raw, ["name"]);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    if (raw.email && typeof raw.email === "string" && !isValidEmail(raw.email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
    const body = sanitizeBody(raw, ["notes"]);
    if (body.project_id === "") body.project_id = undefined;
    const contact = await createContact(body);
    logActivity({
      action: "contact_created",
      project_id: body.project_id,
      details: `Created contact: ${body.name || body.email || "Unknown"}`,
    });

    // Auto-enqueue in welcome sequence if enabled
    if (getAutomationSetting("auto_welcome_sequence") === "true" && contact.email) {
      const welcomeSeq = getDb().prepare(
        "SELECT id FROM email_sequences WHERE status = 'active' AND LOWER(name) LIKE '%welcome%' LIMIT 1"
      ).get() as { id: string } | undefined;
      if (welcomeSeq) {
        const nextAt = new Date();
        nextAt.setHours(nextAt.getHours() + 1);
        getDb().prepare(
          "UPDATE outbound_contacts SET sequence_id = ?, sequence_step = 0, sequence_enrolled_at = datetime('now'), next_sequence_step_at = ? WHERE id = ?"
        ).run(welcomeSeq.id, nextAt.toISOString(), contact.id);
      }
    }

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("POST /api/outbound error:", error);
    return NextResponse.json(
      { error: "Failed to create contact" },
      { status: 500 }
    );
  }
}
