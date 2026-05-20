import { NextRequest, NextResponse } from "next/server";
import {
  getOutboundContact,
  updateContact,
  getProject,
  logActivity,
} from "@/lib/db";
import { safeParseJson } from "@/lib/validation";
import { sendEmail } from "@/lib/email/send";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request);
    const subject = body?.subject || "Hello";
    const emailBody = body?.body || "";

    const contact = getOutboundContact(id);
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (!contact.email) {
      return NextResponse.json({ error: "Contact has no email address" }, { status: 400 });
    }

    if (!emailBody.trim()) {
      return NextResponse.json({ error: "Email body is required" }, { status: 400 });
    }

    // Send via the centralized email utility (handles Resend + SMTP via nodemailer)
    const result = await sendEmail({
      to: `${contact.name} <${contact.email}>`,
      subject,
      body: emailBody,
    });

    if (!result.sent) {
      return NextResponse.json({
        error: `Email send failed: ${result.error}`,
        hint: result.error?.includes("No active") ? "Add an email platform connection with your SMTP or Resend API credentials." : undefined,
      }, { status: result.error?.includes("No active") ? 503 : 502 });
    }

    // Update contact status to 'contacted' and increment sequence_step
    const newStep = (contact.sequence_step || 0) + 1;
    const updates: any = { sequence_step: newStep };
    if (contact.status === "lead") {
      updates.status = "contacted";
    }
    updateContact(id, updates);

    // Get project name for activity log
    let projectName = "";
    if (contact.project_id) {
      const project = getProject(contact.project_id);
      if (project) projectName = project.name;
    }

    logActivity({
      action: "email_sent",
      project_id: contact.project_id || undefined,
      details: `Sent email to ${contact.name} (${contact.email})${projectName ? ` for project "${projectName}"` : ""}: "${subject}"`,
      rail: "outbound",
    });

    // Auto-track engagement for dynamic lead scoring
    try {
      const { getDb: getDatabase } = await import("@/lib/db");
      const db = getDatabase();
      const history = JSON.parse((db.prepare("SELECT engagement_history FROM outbound_contacts WHERE id = ?").get(id) as { engagement_history: string } | undefined)?.engagement_history || "[]");
      history.push({ event: "email_sent", points: 0, subject, at: new Date().toISOString() });
      db.prepare("UPDATE outbound_contacts SET engagement_history = ?, last_engaged_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(history), id);
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      contact_id: id,
      email: contact.email,
      subject,
      message_id: result.messageId || null,
      new_status: updates.status || contact.status,
      sequence_step: newStep,
    });
  } catch (error) {
    console.error("POST /api/outbound/[id]/send error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}

