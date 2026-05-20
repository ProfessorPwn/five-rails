import { NextRequest, NextResponse } from "next/server";
import {
  getNewsletter,
  updateNewsletter,
  getActivePlatformConnection,
  logActivity,
} from "@/lib/db";
import { sendEmail } from "@/lib/email/send";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Shuffle an array in place (Fisher-Yates) and return it.
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const newsletter = getNewsletter(id);
    if (!newsletter) {
      return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });
    }

    if (!newsletter.content?.trim()) {
      return NextResponse.json({
        error: "Newsletter has no content. Generate content first.",
      }, { status: 400 });
    }

    if (!newsletter.recipients?.trim()) {
      return NextResponse.json({
        error: "No recipients specified. Add recipients before sending.",
      }, { status: 400 });
    }

    // Get email connection
    const emailConn = getActivePlatformConnection("email");
    if (!emailConn) {
      return NextResponse.json({
        error: "No email connection configured. Go to Connections and set up email (Resend or SMTP).",
        hint: 'Click "Configure" next to Email on the Connections page.',
      }, { status: 503 });
    }

    // Parse recipients
    let recipientList: string[];
    try {
      recipientList = JSON.parse(newsletter.recipients);
      if (!Array.isArray(recipientList)) recipientList = [newsletter.recipients];
    } catch {
      // Comma-separated or single email
      recipientList = newsletter.recipients.split(",").map((e) => e.trim()).filter(Boolean);
    }

    if (recipientList.length === 0) {
      return NextResponse.json({ error: "No valid recipients found." }, { status: 400 });
    }

    const primarySubject = newsletter.subject || newsletter.title;
    const htmlContent = newsletter.content;
    const errors: string[] = [];
    let successCount = 0;

    // ─── A/B Test Splitting ─────────────────────────────────────────────
    const hasAbTest = !!newsletter.subject_b;
    const variants: { label: string; subject: string; recipients: string[] }[] = [];

    if (hasAbTest) {
      const samplePct = Math.max(5, Math.min(50, newsletter.ab_test_sample_pct || 20));
      const shuffled = shuffle([...recipientList]);
      const sampleSize = Math.max(1, Math.floor(shuffled.length * (samplePct / 100)));

      // Build variant list: A, B, and optionally C
      const variantSubjects: { label: string; subject: string }[] = [
        { label: "A", subject: primarySubject },
        { label: "B", subject: newsletter.subject_b! },
      ];
      if (newsletter.subject_c) {
        variantSubjects.push({ label: "C", subject: newsletter.subject_c });
      }

      let cursor = 0;
      for (const v of variantSubjects) {
        const end = Math.min(cursor + sampleSize, shuffled.length);
        variants.push({
          label: v.label,
          subject: v.subject,
          recipients: shuffled.slice(cursor, end),
        });
        cursor = end;
      }

      // Remaining recipients get variant A (original subject)
      if (cursor < shuffled.length) {
        variants.push({
          label: "A-remainder",
          subject: primarySubject,
          recipients: shuffled.slice(cursor),
        });
      }
    } else {
      // No A/B test — single send
      variants.push({
        label: "A",
        subject: primarySubject,
        recipients: recipientList,
      });
    }

    // ─── Send each variant group ────────────────────────────────────────
    const variantResults: { label: string; subject: string; sent: number; total: number }[] = [];

    for (const variant of variants) {
      if (variant.recipients.length === 0) continue;

      let variantSuccess = 0;

      // Send each recipient via the centralized sendEmail utility
      // (handles Resend + nodemailer SMTP transparently)
      for (const recipient of variant.recipients) {
        const result = await sendEmail({
          to: recipient,
          subject: variant.subject,
          body: htmlContent,
          isHtml: true,
        });
        if (result.sent) {
          variantSuccess++;
        } else {
          errors.push(`Failed to send to ${recipient} (variant ${variant.label}): ${result.error}`);
        }
      }

      successCount += variantSuccess;
      variantResults.push({
        label: variant.label,
        subject: variant.subject,
        sent: variantSuccess,
        total: variant.recipients.length,
      });
    }

    if (successCount === 0) {
      return NextResponse.json({
        error: `All sends failed: ${errors.join("; ")}`,
      }, { status: 502 });
    }

    // Update newsletter status
    const now = new Date().toISOString();
    updateNewsletter(id, {
      status: "sent",
      sent_at: now,
      sent_count: (newsletter.sent_count || 0) + successCount,
      ...(hasAbTest ? { ab_winner: null } : {}),
    });

    logActivity({
      action: "newsletter_sent",
      project_id: newsletter.project_id || undefined,
      details: `Sent newsletter "${newsletter.title}" to ${successCount} recipient(s)${hasAbTest ? ` (A/B test: ${variantResults.filter(v => v.label !== "A-remainder").map(v => `${v.label}=${v.sent}`).join(", ")})` : ""}${errors.length > 0 ? ` (${errors.length} failed)` : ""}`,
      rail: "audience",
    });

    return NextResponse.json({
      success: true,
      sent_count: successCount,
      failed_count: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      sent_at: now,
      ab_test: hasAbTest ? {
        variants: variantResults.filter(v => v.label !== "A-remainder"),
        remainder: variantResults.find(v => v.label === "A-remainder") || null,
        sample_pct: newsletter.ab_test_sample_pct || 20,
      } : undefined,
    });
  } catch (error) {
    console.error("POST /api/newsletters/[id]/send error:", error);
    return NextResponse.json({ error: "Failed to send newsletter" }, { status: 500 });
  }
}

