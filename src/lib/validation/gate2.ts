// ─── Gate 2: Validation Campaign Pass/Fail Evaluation ───────────────────────
// After test_duration_hours has elapsed, evaluates campaign metrics against
// targets. A campaign passes if 2 of 3 signals are met.

import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export interface Gate2Result {
  passed: boolean;
  reason: string;
}

/**
 * Evaluate whether a validation campaign passed its market test.
 * Checks signups, CTR, and CPL against targets. Needs 2 of 3 to pass.
 */
export function evaluateGate2(campaignId: string): Gate2Result {
  const db = getDb();

  const campaign = db.prepare("SELECT * FROM validation_campaigns WHERE id = ?").get(campaignId) as {
    id: string; idea_id: string; status: string;
    target_signups: number; target_ctr_pct: number; target_cpl_usd: number;
    landing_page_id: string | null;
  } | undefined;

  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  // Pull actual metrics from funnel_events and content_analytics
  // Count email captures / signups attributed to this campaign's landing page
  let actualSignups = 0;
  if (campaign.landing_page_id) {
    const signups = db.prepare(
      "SELECT conversions FROM landing_pages WHERE id = ?"
    ).get(campaign.landing_page_id) as { conversions: number } | undefined;
    actualSignups = signups?.conversions ?? 0;
  }

  // Also count funnel events that mention this campaign
  const funnelSignups = db.prepare(
    "SELECT COUNT(*) as cnt FROM funnel_events WHERE event_name = 'email_capture' AND event_data LIKE ?"
  ).get(`%${campaignId}%`) as { cnt: number };
  actualSignups = Math.max(actualSignups, funnelSignups?.cnt ?? 0);

  // Pull ad performance from content_analytics linked to campaign's ad content
  const adCampaigns = db.prepare(
    "SELECT id FROM ad_campaigns WHERE validation_campaign_id = ?"
  ).all(campaignId) as Array<{ id: string }>;

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalSpend = 0; // Approximate from budget

  for (const ac of adCampaigns) {
    // Get analytics for content linked to this ad campaign
    const stats = db.prepare(`
      SELECT SUM(impressions) as imp, SUM(clicks) as clk
      FROM content_analytics WHERE content_id = ?
    `).get(ac.id) as { imp: number | null; clk: number | null } | undefined;

    totalImpressions += stats?.imp ?? 0;
    totalClicks += stats?.clk ?? 0;

    const adBudget = db.prepare("SELECT budget_total FROM ad_campaigns WHERE id = ?").get(ac.id) as { budget_total: number | null } | undefined;
    totalSpend += adBudget?.budget_total ?? 100; // default test budget
  }

  const actualCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const actualCpl = actualSignups > 0 ? totalSpend / actualSignups : 999;

  // Persist actual metrics
  db.prepare(`
    UPDATE validation_campaigns
    SET actual_signups = ?, actual_ctr_pct = ?, actual_cpl_usd = ?, test_ended_at = datetime('now')
    WHERE id = ?
  `).run(actualSignups, Math.round(actualCtr * 100) / 100, Math.round(actualCpl * 100) / 100, campaignId);

  const passedSignups = actualSignups >= campaign.target_signups;
  const passedCtr = actualCtr >= campaign.target_ctr_pct;
  const passedCpl = actualCpl <= campaign.target_cpl_usd;

  // Needs 2 of 3 signals to pass
  const passCount = [passedSignups, passedCtr, passedCpl].filter(Boolean).length;
  const passed = passCount >= 2;

  if (passed) {
    db.prepare(
      "UPDATE validation_campaigns SET status = 'passed', gate2_passed_at = datetime('now') WHERE id = ?"
    ).run(campaignId);
    db.prepare(
      "UPDATE ideabrowser_ideas SET validation_status = 'passed' WHERE id = ?"
    ).run(campaign.idea_id);

    logActivity({
      action: "idea_passed_validation",
      details: `Idea passed Gate 2. Signups: ${actualSignups}, CTR: ${actualCtr.toFixed(1)}%, CPL: $${actualCpl.toFixed(2)}. Campaign: ${campaignId}`,
    });

    // Notify Dalio for build trigger (visibility message)
    try {
      db.prepare(
        "INSERT INTO agent_messages (id, from_agent_id, to_agent_id, message, message_type) VALUES (?, 'agent-product', 'agent-executive', ?, 'alert')"
      ).run(
        uuidv4(),
        `[VALIDATION PIPELINE] Idea passed market validation! Campaign ${campaignId} for idea ${campaign.idea_id}. Ready to initiate build sequence. Signups: ${actualSignups}, CTR: ${actualCtr.toFixed(1)}%, CPL: $${actualCpl.toFixed(2)}.`,
      );
    } catch { /* non-blocking */ }

    return { passed: true, reason: `Met ${passCount} of 3 validation signals` };
  } else {
    const failReasons = [
      !passedSignups && `Signups: ${actualSignups} (target: ${campaign.target_signups})`,
      !passedCtr && `CTR: ${actualCtr.toFixed(1)}% (target: ${campaign.target_ctr_pct}%)`,
      !passedCpl && `CPL: $${actualCpl.toFixed(2)} (target: $${campaign.target_cpl_usd})`,
    ].filter(Boolean).join("; ");

    db.prepare(
      "UPDATE validation_campaigns SET status = 'failed', gate2_failed_at = datetime('now'), gate2_failure_reason = ? WHERE id = ?"
    ).run(failReasons, campaignId);
    db.prepare(
      "UPDATE ideabrowser_ideas SET validation_status = 'failed' WHERE id = ?"
    ).run(campaign.idea_id);

    logActivity({
      action: "idea_failed_validation",
      details: `Idea failed Gate 2. ${failReasons}. Campaign: ${campaignId}`,
    });

    return { passed: false, reason: failReasons };
  }
}
