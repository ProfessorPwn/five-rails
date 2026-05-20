// ─── Centralized Email Sender ────────────────────────────────────────────────
// Single source of truth for sending email from anywhere in the app.
// Reads platform_connections for active email config (Resend or SMTP).

import { getDb } from "@/lib/db";

interface EmailConn {
  id: string;
  api_key: string | null;
  from_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
}

export interface SendEmailResult {
  sent: boolean;
  messageId?: string;
  error?: string;
  provider?: "resend" | "smtp";
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  /** Plain text or HTML body */
  body: string;
  /** Set to true if body is already HTML; default treats body as text */
  isHtml?: boolean;
  /** Optional file attachments */
  attachments?: EmailAttachment[];
}

function getEmailConnection(): EmailConn | null {
  const row = getDb()
    .prepare("SELECT id, api_key, from_email, smtp_host, smtp_port, smtp_user, smtp_pass FROM platform_connections WHERE platform = 'email' AND is_active = 1 LIMIT 1")
    .get() as EmailConn | undefined;
  return row || null;
}

function textToHtml(text: string): string {
  // Basic markdown-like conversion: bold, code, line breaks, lists
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code style=\"background:#f4f4f4;padding:2px 4px;border-radius:3px;\">$1</code>")
    .replace(/^### (.+)$/gm, "<h3 style=\"margin-top:1.5em;color:#1a1a1a;\">$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 style=\"margin-top:1.5em;color:#1a1a1a;\">$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 style=\"margin-top:1.5em;color:#1a1a1a;\">$1</h1>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul style=\"padding-left:1.5em;\">$&</ul>")
    .replace(/\n\n/g, "</p><p style=\"margin:1em 0;\">")
    .replace(/\n/g, "<br>");
}

/**
 * Send an email via the active platform connection (Resend preferred, SMTP fallback).
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const conn = getEmailConnection();
  if (!conn) {
    return { sent: false, error: "No active email connection. Configure one in /connections." };
  }

  const fromEmail = conn.from_email || conn.smtp_user;
  if (!fromEmail) {
    return { sent: false, error: "Email connection has no from_email or smtp_user configured." };
  }

  // Convert text body to HTML if needed
  const htmlBody = opts.isHtml
    ? opts.body
    : `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 700px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;"><p style="margin:1em 0;">${textToHtml(opts.body)}</p></div>`;

  // Prefer Resend if configured
  if (conn.api_key) {
    return await sendViaResend({ to: opts.to, subject: opts.subject, html: htmlBody, apiKey: conn.api_key, fromEmail, attachments: opts.attachments });
  }

  // Fall back to SMTP
  if (conn.smtp_host && conn.smtp_user) {
    return await sendViaSmtp({
      to: opts.to,
      subject: opts.subject,
      html: htmlBody,
      conn: { smtp_host: conn.smtp_host, smtp_port: conn.smtp_port, smtp_user: conn.smtp_user, smtp_pass: conn.smtp_pass, from_email: fromEmail },
      attachments: opts.attachments,
    });
  }

  return { sent: false, error: "Email connection has neither api_key (Resend) nor SMTP credentials." };
}

// ── Resend ──────────────────────────────────────────────────────────────────

async function sendViaResend(opts: { to: string; subject: string; html: string; apiKey: string; fromEmail: string; attachments?: EmailAttachment[] }): Promise<SendEmailResult> {
  try {
    const payload: Record<string, unknown> = {
      from: opts.fromEmail,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.attachments?.length) {
      payload.attachments = opts.attachments.map(a => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      }));
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { sent: false, provider: "resend", error: `Resend ${res.status}: ${errBody.slice(0, 300)}` };
    }

    const data = await res.json();
    return { sent: true, provider: "resend", messageId: data.id };
  } catch (err) {
    return { sent: false, provider: "resend", error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── SMTP via nodemailer (handles STARTTLS correctly on port 587) ────────────

async function sendViaSmtp(opts: {
  to: string;
  subject: string;
  html: string;
  conn: { smtp_host: string; smtp_port: number | null; smtp_user: string; smtp_pass: string | null; from_email: string };
  attachments?: EmailAttachment[];
}): Promise<SendEmailResult> {
  try {
    const nodemailer = (await import("nodemailer")).default;
    const port = opts.conn.smtp_port || 587;

    const transporter = nodemailer.createTransport({
      host: opts.conn.smtp_host,
      port,
      secure: port === 465, // true for 465, false for 587 (STARTTLS auto-upgrade)
      auth: {
        user: opts.conn.smtp_user,
        pass: opts.conn.smtp_pass || "",
      },
      // 15s connection timeout
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });

    const info = await transporter.sendMail({
      from: opts.conn.from_email,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments?.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });

    return { sent: true, provider: "smtp", messageId: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { sent: false, provider: "smtp", error: `SMTP error: ${msg}` };
  }
}

// ── User Email Helper ───────────────────────────────────────────────────────

/**
 * Get the user's notification email address. Set via automation_settings.user_email,
 * defaults to the from_email of the active connection.
 */
export function getUserEmail(): string | null {
  const row = getDb()
    .prepare("SELECT value FROM automation_settings WHERE key = 'user_email'")
    .get() as { value: string } | undefined;
  if (row?.value) return row.value;

  const conn = getEmailConnection();
  return conn?.from_email || null;
}
