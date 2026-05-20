import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

type RouteContext = { params: Promise<{ slug: string }> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const email = String((body as { email?: unknown }).email || "").trim().toLowerCase();
    const name = String((body as { name?: unknown }).name || "").trim() || null;

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const db = getDb();

    const page = db.prepare(
      `SELECT id, project_id, validation_campaign_id, title
       FROM landing_pages WHERE slug = ?`
    ).get(slug) as
      | { id: string; project_id: string | null; validation_campaign_id: string | null; title: string }
      | undefined;

    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    // Resolve project_id from the campaign if the page itself isn't linked.
    let projectId = page.project_id;
    if (!projectId && page.validation_campaign_id) {
      const c = db.prepare(
        "SELECT project_id FROM validation_campaigns WHERE id = ?"
      ).get(page.validation_campaign_id) as { project_id: string | null } | undefined;
      projectId = c?.project_id || null;
    }

    // Idempotency: if this email already signed up via this page, treat as
    // success but don't double-count the conversion.
    const existing = db.prepare(
      `SELECT oc.id FROM outbound_contacts oc
       WHERE oc.email = ? AND json_extract(oc.custom_fields, '$.landing_page_id') = ?
       LIMIT 1`
    ).get(email, page.id) as { id: string } | undefined;

    if (existing) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    const tx = db.transaction(() => {
      // 1) Outbound contact for this lead, tagged so the agents can pick it up.
      const contactId = uuidv4();
      db.prepare(
        `INSERT INTO outbound_contacts (id, project_id, name, email, status, tags, custom_fields, lead_score)
         VALUES (?, ?, ?, ?, 'lead', ?, ?, 25)`
      ).run(
        contactId,
        projectId,
        name || email,
        email,
        JSON.stringify(["validation_signup", "landing_page"]),
        JSON.stringify({
          landing_page_id: page.id,
          landing_page_slug: slug,
          validation_campaign_id: page.validation_campaign_id,
          source: "public_landing",
        }),
      );

      // 2) Bump landing page conversions
      db.prepare("UPDATE landing_pages SET conversions = conversions + 1 WHERE id = ?").run(page.id);

      // 3) If linked to a validation campaign, increment actual_signups —
      // this is the real Gate 2 demand signal.
      if (page.validation_campaign_id) {
        db.prepare(
          `UPDATE validation_campaigns
           SET actual_signups = COALESCE(actual_signups, 0) + 1,
               updated_at = datetime('now')
           WHERE id = ?`
        ).run(page.validation_campaign_id);
      }

      // 4) Funnel event for analytics + downstream agents.
      db.prepare(
        `INSERT INTO funnel_events (id, project_id, event_name, event_data, source)
         VALUES (?, ?, 'signup', ?, 'public_landing')`
      ).run(
        uuidv4(),
        projectId,
        JSON.stringify({
          email,
          name,
          landing_page_id: page.id,
          slug,
          campaign_id: page.validation_campaign_id,
          contact_id: contactId,
        }),
      );

      return contactId;
    });

    const contactId = tx();

    logActivity({
      project_id: projectId || undefined,
      action: "validation_signup",
      details: `Signup via public landing "${page.title}" (${slug}) — ${email}${page.validation_campaign_id ? ` · campaign ${page.validation_campaign_id.slice(0, 8)}` : ""}`,
    });

    return NextResponse.json({ ok: true, contact_id: contactId });
  } catch (error) {
    console.error("POST /api/p/[slug]/signup error:", error);
    return NextResponse.json({ error: "Failed to record signup" }, { status: 500 });
  }
}
