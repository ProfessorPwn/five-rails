// ─── Submissions pull endpoint (auth-gated) ──────────────────────────────────
// Called by the local Five Rails poller every ~2 min to pull new signups.
//
// Filters: spam=false, delivered_at IS NULL.
// Marks rows as delivered_at=NOW() after the response is built so the next
// poll skips them. Local poller is idempotent on its side too (unique
// custom_fields.public_submission_id), so even a delivery race is safe.

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkAuth } from "@/lib/auth";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  const auth = checkAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") || DEFAULT_LIMIT);
  const limit = Math.max(1, Math.min(MAX_LIMIT, isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT));
  const ack = url.searchParams.get("ack") !== "false"; // default: mark delivered

  const rows = await sql<{
    id: string;
    slug: string;
    validation_campaign_id: string | null;
    project_id: string | null;
    email: string;
    name: string | null;
    spam: boolean;
    user_agent: string | null;
    referrer: string | null;
    raw_payload: Record<string, unknown>;
    created_at: string;
  }[]>`
    SELECT id::text, slug, validation_campaign_id, project_id,
           email, name, spam, user_agent, referrer, raw_payload, created_at
    FROM submissions
    WHERE delivered_at IS NULL AND spam = FALSE
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;

  if (ack && rows.length > 0) {
    const ids: string[] = rows.map((r: { id: string }) => r.id);
    await sql`
      UPDATE submissions SET delivered_at = NOW()
      WHERE id IN ${sql(ids)} AND delivered_at IS NULL
    `;
  }

  return NextResponse.json({ submissions: rows, count: rows.length });
}
