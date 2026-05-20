// ─── Form-service submissions poller ──────────────────────────────────────────
// Pulls new submissions from the public form service and folds them into the
// local schema:
//   1. Insert an outbound_contact tagged 'validation_signup' (idempotent on
//      custom_fields.public_submission_id)
//   2. Bump validation_campaigns.actual_signups
//   3. Bump landing_pages.conversions
//   4. Emit a funnel_event ('signup', source='public_form_service')
//   5. Log activity
//
// Idempotency: the unique constraint is the public submission id, mirrored
// into outbound_contacts.custom_fields. The Vercel side ACKs delivery via
// delivered_at, so a row should arrive at most once — but we double-check.

import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { pullSubmissions, isFormServiceConfigured, type FormServiceSubmission } from "./form-service";

export interface PollResult {
  pulled: number;
  applied: number;
  deduped: number;
  errors: number;
  skipped: number; // skipped because not-spam was filtered in-flight
}

export async function pollFormServiceOnce(): Promise<PollResult> {
  if (!isFormServiceConfigured()) {
    return { pulled: 0, applied: 0, deduped: 0, errors: 0, skipped: 0 };
  }

  const submissions = await pullSubmissions(100);
  const result: PollResult = {
    pulled: submissions.length,
    applied: 0,
    deduped: 0,
    errors: 0,
    skipped: 0,
  };

  for (const sub of submissions) {
    if (sub.spam) {
      result.skipped++;
      continue;
    }
    try {
      const applied = applySubmission(sub);
      if (applied === "applied") result.applied++;
      else if (applied === "deduped") result.deduped++;
    } catch (err) {
      result.errors++;
      console.error("[form-service-poller] failed to apply submission", sub.id, err);
    }
  }

  return result;
}

function applySubmission(sub: FormServiceSubmission): "applied" | "deduped" {
  const db = getDb();

  // 1. Resolve the local landing page (so we can attach project_id even
  // if the submission's project_id is missing for any reason).
  const page = db.prepare(
    `SELECT id, project_id, validation_campaign_id
     FROM landing_pages WHERE slug = ?`,
  ).get(sub.slug) as
    | { id: string; project_id: string | null; validation_campaign_id: string | null }
    | undefined;

  // 2. Idempotency check — has this exact public submission id already
  // been folded in?
  const existing = db.prepare(
    `SELECT id FROM outbound_contacts
     WHERE json_extract(custom_fields, '$.public_submission_id') = ?
     LIMIT 1`,
  ).get(sub.id) as { id: string } | undefined;

  if (existing) return "deduped";

  const projectId = sub.project_id ?? page?.project_id ?? null;
  const campaignId = sub.validation_campaign_id ?? page?.validation_campaign_id ?? null;

  const tx = db.transaction(() => {
    // 3. Outbound contact
    const contactId = uuidv4();
    db.prepare(
      `INSERT INTO outbound_contacts (id, project_id, name, email, status, tags, custom_fields, lead_score)
       VALUES (?, ?, ?, ?, 'lead', ?, ?, 25)`,
    ).run(
      contactId,
      projectId,
      sub.name || sub.email,
      sub.email,
      JSON.stringify(["validation_signup", "landing_page", "public_form_service"]),
      JSON.stringify({
        public_submission_id: sub.id,
        landing_page_id: page?.id || null,
        landing_page_slug: sub.slug,
        validation_campaign_id: campaignId,
        source: "public_form_service",
        submitted_at: sub.created_at,
        user_agent: sub.user_agent,
        referrer: sub.referrer,
      }),
    );

    // 4. Conversion + signup count
    if (page) {
      db.prepare(
        "UPDATE landing_pages SET conversions = conversions + 1 WHERE id = ?",
      ).run(page.id);
    }
    if (campaignId) {
      db.prepare(
        `UPDATE validation_campaigns
         SET actual_signups = COALESCE(actual_signups, 0) + 1, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(campaignId);
    }

    // 5. Funnel event
    db.prepare(
      `INSERT INTO funnel_events (id, project_id, event_name, event_data, source)
       VALUES (?, ?, 'signup', ?, 'public_form_service')`,
    ).run(
      uuidv4(),
      projectId,
      JSON.stringify({
        email: sub.email,
        name: sub.name,
        landing_page_id: page?.id || null,
        slug: sub.slug,
        campaign_id: campaignId,
        contact_id: contactId,
        public_submission_id: sub.id,
      }),
    );

    return contactId;
  });

  tx();

  logActivity({
    project_id: projectId || undefined,
    action: "validation_signup",
    details: `Signup via public form service "${sub.slug}" — ${sub.email}${campaignId ? ` · campaign ${campaignId.slice(0, 8)}` : ""}`,
  });

  return "applied";
}
