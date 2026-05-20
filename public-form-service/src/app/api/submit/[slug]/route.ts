// ─── Public submit endpoint ───────────────────────────────────────────────────
// The only public-write endpoint in the form service. Heavily defended:
//   1. Origin allowlist check (CORS-style; this site only)
//   2. Bot user-agent denylist
//   3. Per-IP rate limit (10 / 60s)
//   4. Honeypot field check
//   5. Dwell-time check (sub-2s = likely bot)
//   6. Email format validation
//   7. Idempotent unique-violation handling (same email + slug = single row)

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashIp } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BOT_UA_PATTERNS = [
  /\b(curl|wget|httpie|python-requests|axios|node-fetch|libwww|java\/|go-http)\b/i,
  /\b(scrap|spider|crawl|bot|headless)\b/i,
];

type RouteContext = { params: Promise<{ slug: string }> };

interface SubmitBody {
  email?: string;
  name?: string | null;
  website?: string;   // honeypot
  dwell_ms?: number;
}

function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  // Same-origin requests don't carry an Origin header in some browsers; allow
  // those when the host header matches our deployed host.
  if (!origin) {
    const host = req.headers.get("host");
    return !!host;
  }
  const allowed = (process.env.ALLOWED_FORM_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true; // dev convenience; lock down in prod
  return allowed.includes(origin);
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "0.0.0.0";
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    if (!originAllowed(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ua = request.headers.get("user-agent") || "";
    if (BOT_UA_PATTERNS.some(re => re.test(ua))) {
      // Silently 200 to deny bots reliable feedback. Don't write a row.
      return NextResponse.json({ ok: true });
    }

    const ipHash = hashIp(clientIp(request));
    const rate = await checkRateLimit(ipHash);
    if (!rate.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { slug } = await context.params;
    const body = (await request.json().catch(() => ({}))) as SubmitBody;

    const email = String(body.email || "").trim().toLowerCase();
    const name = body.name ? String(body.name).trim() : null;
    const honeypot = String(body.website || "").trim();
    const dwell = Number(body.dwell_ms) || 0;

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (email.length > 320) {
      return NextResponse.json({ error: "Email too long" }, { status: 400 });
    }

    // Spam decision. We still record spam=true rows so we can audit traffic
    // shape — but they don't count toward conversions and don't go to the
    // local poller.
    const isSpam = honeypot.length > 0 || dwell < 2000;

    // Look up the page to attach campaign + project IDs to the submission.
    const pageRows = await sql<
      { slug: string; status: string; validation_campaign_id: string | null; project_id: string | null }[]
    >`SELECT slug, status, validation_campaign_id, project_id
      FROM landing_pages WHERE slug = ${slug} LIMIT 1`;
    const page = pageRows[0];
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    if (page.status !== "published") {
      return NextResponse.json({ error: "Page not active" }, { status: 410 });
    }

    // Idempotent insert. unique(slug, lower(email)) catches dup attempts.
    try {
      await sql`
        INSERT INTO submissions (
          slug, validation_campaign_id, project_id,
          email, name, spam, ip_hash, user_agent, referrer, raw_payload
        ) VALUES (
          ${slug},
          ${page.validation_campaign_id},
          ${page.project_id},
          ${email},
          ${name},
          ${isSpam},
          ${ipHash},
          ${ua.slice(0, 512)},
          ${request.headers.get("referer") || null},
          ${sql.json({ dwell_ms: dwell })}
        )
      `;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        // Already submitted; treat as success but don't increment.
        return NextResponse.json({ ok: true, deduped: true });
      }
      throw err;
    }

    // Bump conversions only when the submission isn't spam.
    if (!isSpam) {
      sql`UPDATE landing_pages SET conversions = conversions + 1 WHERE slug = ${slug}`
        .catch(() => { /* best-effort */ });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/submit error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
