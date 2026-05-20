import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { generatePdfReport } from "@/lib/pdf/generate";
import { sendEmail, getUserEmail } from "@/lib/email/send";
import { logActivity } from "@/lib/db";

const REPORTS_DIR = join(process.cwd(), "data", "reports");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const title = (body.title as string | undefined)?.trim();
    const markdown = (body.markdown as string | undefined)?.trim();
    const author = body.author as string | undefined;
    const emailTo = body.email_to as string | undefined;

    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    if (!markdown) return NextResponse.json({ error: "markdown is required" }, { status: 400 });

    const pdf = await generatePdfReport({ title, markdown, author });

    // Save to disk
    mkdirSync(REPORTS_DIR, { recursive: true });
    const reportId = uuidv4();
    const safeName = title.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
    const filename = `${safeName}-${reportId.slice(0, 8)}.pdf`;
    const pdfPath = join(REPORTS_DIR, filename);
    writeFileSync(pdfPath, pdf);

    // Email if requested (or fall back to user email if explicitly sending)
    let emailSent = false;
    let emailError: string | undefined;
    const recipient = emailTo === null ? null : emailTo || (body.send_email ? getUserEmail() : null);

    if (recipient) {
      const result = await sendEmail({
        to: recipient,
        subject: `[Five Rails] ${title}`,
        body: `${author ? author + " " : ""}produced the attached report: **${title}**.\n\nSee the attached PDF for the full analysis.`,
        attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
      });
      emailSent = result.sent;
      if (!result.sent) emailError = result.error;
    }

    logActivity({
      action: "report_generated",
      details: `PDF report: "${title}" (${pdf.length} bytes)${emailSent ? ` — emailed to ${recipient}` : ""}`,
    });

    return NextResponse.json({
      report_id: reportId,
      pdf_path: pdfPath,
      pdf_filename: filename,
      size_bytes: pdf.length,
      email_sent: emailSent,
      email_error: emailError,
      recipient: recipient || null,
    });
  } catch (error) {
    console.error("POST /api/reports/generate error:", error);
    return NextResponse.json(
      { error: "Report generation failed", details: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}
