// ─── Landing pages upsert (auth-gated) ───────────────────────────────────────
// Called by the local Five Rails app to push new/updated landing pages into
// the public form service. Authenticated with Bearer SERVICE_API_TOKEN.
//
// Idempotent: same slug = upsert.

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkAuth } from "@/lib/auth";

interface UpsertRow {
  slug: string;
  source_id: string;
  validation_campaign_id?: string | null;
  project_id?: string | null;
  title: string;
  html: string;
  status?: "published" | "archived";
}

export async function POST(request: NextRequest) {
  const auth = checkAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  let body: { pages?: UpsertRow[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const pages = Array.isArray(body.pages) ? body.pages : [];
  if (pages.length === 0) return NextResponse.json({ ok: true, upserted: 0 });
  if (pages.length > 200) return NextResponse.json({ error: "Too many pages" }, { status: 413 });

  let upserted = 0;
  for (const p of pages) {
    if (!p?.slug || !p?.title || typeof p?.html !== "string" || !p?.source_id) {
      continue;
    }
    const status = p.status === "archived" ? "archived" : "published";
    await sql`
      INSERT INTO landing_pages
        (slug, source_id, validation_campaign_id, project_id, title, html, status)
      VALUES
        (${p.slug}, ${p.source_id}, ${p.validation_campaign_id ?? null},
         ${p.project_id ?? null}, ${p.title}, ${p.html}, ${status})
      ON CONFLICT (slug) DO UPDATE SET
        source_id              = EXCLUDED.source_id,
        validation_campaign_id = EXCLUDED.validation_campaign_id,
        project_id             = EXCLUDED.project_id,
        title                  = EXCLUDED.title,
        html                   = EXCLUDED.html,
        status                 = EXCLUDED.status,
        updated_at             = NOW()
    `;
    upserted++;
  }

  return NextResponse.json({ ok: true, upserted });
}

export async function GET(request: NextRequest) {
  const auth = checkAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const rows = await sql<{
    slug: string;
    source_id: string;
    validation_campaign_id: string | null;
    project_id: string | null;
    title: string;
    status: string;
    visits: number;
    conversions: number;
    updated_at: string;
  }[]>`
    SELECT slug, source_id, validation_campaign_id, project_id, title, status, visits, conversions, updated_at
    FROM landing_pages
    ORDER BY updated_at DESC
    LIMIT 500
  `;
  return NextResponse.json({ pages: rows });
}
