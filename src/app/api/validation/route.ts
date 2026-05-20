import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Returns ideas grouped by where they are in the validation pipeline.
// Stages:
//   unreviewed       — imported but not yet scored by Peter (Gate 1 not run)
//   rejected_gate1   — scored but failed Thiel's threshold (Gate 1 reject)
//   in_testing       — passed Gate 1, currently running a market test
//   failed_gate2     — passed Gate 1 but market test failed (low CTR/signups)
//   passed_all_gates — passed Gate 1 + Gate 2, build triggered → project active
//
// The page (/validation) uses this to show the full funnel in one view.

interface StageIdea {
  id: string;
  title: string;
  category: string | null;
  overall_score: number;
  revenue_tier: string | null;
  validation_status: string | null;
  idea_date: string | null;
  description: string;
  // Stage-specific metadata
  stage_detail: string | null;     // why rejected / test metrics / etc.
  campaign_id?: string | null;
  gate1_passed_at?: string | null;
  gate2_passed_at?: string | null;
  gate2_failure_reason?: string | null;
  actual_signups?: number | null;
  target_signups?: number | null;
  actual_ctr_pct?: number | null;
  actual_cpl_usd?: number | null;
  project_id?: string | null;
  landing_page_slug?: string | null;
}

export async function GET(_request: NextRequest) {
  const db = getDb();

  const shortDesc = (s: string | null) => (s || "").slice(0, 400);

  // ── Unreviewed: overall_score = 0 AND no validation status set ────────────
  const unreviewed = db.prepare(
    `SELECT id, title, category, overall_score, revenue_tier, validation_status,
            idea_date, description
     FROM ideabrowser_ideas
     WHERE (validation_status IS NULL OR validation_status = 'unreviewed')
       AND id NOT IN (SELECT idea_id FROM validation_campaigns)
     ORDER BY idea_date DESC, imported_at DESC LIMIT 500`
  ).all() as Array<Omit<StageIdea, "stage_detail">>;

  // ── Rejected at Gate 1: activity_log "idea_rejected" with scores + reasons ─
  // The rejection reasons are in activity_log.details, and the idea_id is
  // embedded in the details or we can match on validation_status='failed'
  // with no campaign (campaign only gets created for passes).
  const rejectionLog = db.prepare(
    `SELECT details, created_at FROM activity_log
     WHERE action = 'idea_rejected' ORDER BY created_at DESC LIMIT 200`
  ).all() as Array<{ details: string; created_at: string }>;

  // Get failed ideas that have a 'failed' status but no campaign
  const rejectedAtGate1 = db.prepare(
    `SELECT i.id, i.title, i.category, i.overall_score, i.revenue_tier, i.validation_status,
            i.idea_date, i.description
     FROM ideabrowser_ideas i
     LEFT JOIN validation_campaigns c ON i.id = c.idea_id
     WHERE i.validation_status = 'failed' AND c.id IS NULL
     ORDER BY i.idea_date DESC LIMIT 500`
  ).all() as Array<Omit<StageIdea, "stage_detail">>;

  // Best-effort: match rejection log reasons by extracting score
  const rejectedAtGate1Out: StageIdea[] = rejectedAtGate1.map(i => {
    const logMatch = rejectionLog.find(r =>
      r.details.includes(`Score: ${Math.round((i.overall_score || 0) / 10)}/10`)
      || r.details.toLowerCase().includes((i.title || "").toLowerCase().slice(0, 40))
    );
    return {
      ...i,
      description: shortDesc(i.description),
      stage_detail: logMatch?.details.replace(/^Idea rejected at Gate 1\. /, "").slice(0, 400) || "Did not pass Thiel's ≥7/10 threshold",
    };
  });

  // ── In testing: campaigns with status='running' ────────────────────────────
  const inTestingRows = db.prepare(
    `SELECT c.id as campaign_id, c.idea_id, c.status, c.gate1_passed_at, c.thiel_score,
            c.target_signups, c.actual_signups, c.target_ctr_pct, c.actual_ctr_pct,
            c.target_cpl_usd, c.actual_cpl_usd, c.test_started_at, c.test_ended_at,
            i.title, i.category, i.overall_score, i.revenue_tier, i.validation_status,
            i.idea_date, i.description,
            lp.slug as landing_page_slug
     FROM validation_campaigns c
     INNER JOIN ideabrowser_ideas i ON c.idea_id = i.id
     LEFT JOIN landing_pages lp ON lp.validation_campaign_id = c.id AND lp.status = 'published'
     WHERE c.status IN ('running', 'queued', 'assets_ready')
     ORDER BY c.gate1_passed_at DESC`
  ).all() as Array<Record<string, unknown>>;

  const inTesting: StageIdea[] = inTestingRows.map(r => ({
    id: String(r.idea_id),
    title: String(r.title),
    category: r.category as string | null,
    overall_score: Number(r.overall_score) || 0,
    revenue_tier: r.revenue_tier as string | null,
    validation_status: String(r.validation_status || "testing"),
    idea_date: r.idea_date as string | null,
    description: shortDesc(r.description as string),
    campaign_id: String(r.campaign_id),
    gate1_passed_at: r.gate1_passed_at as string | null,
    target_signups: Number(r.target_signups) || 0,
    actual_signups: Number(r.actual_signups) || 0,
    actual_ctr_pct: Number(r.actual_ctr_pct) || 0,
    actual_cpl_usd: Number(r.actual_cpl_usd) || 0,
    landing_page_slug: (r.landing_page_slug as string | null) || null,
    stage_detail: `Thiel score ${r.thiel_score}/10 · Test: ${r.actual_signups || 0}/${r.target_signups || "?"} signups, ${r.actual_ctr_pct || 0}% CTR (target ${r.target_ctr_pct}%)`,
  }));

  // ── Failed Gate 2: campaigns with gate2_failed_at set ──────────────────────
  const failedG2Rows = db.prepare(
    `SELECT c.id as campaign_id, c.idea_id, c.status, c.thiel_score,
            c.target_signups, c.actual_signups, c.target_ctr_pct, c.actual_ctr_pct,
            c.target_cpl_usd, c.actual_cpl_usd, c.gate2_failed_at, c.gate2_failure_reason,
            i.title, i.category, i.overall_score, i.revenue_tier, i.validation_status,
            i.idea_date, i.description,
            lp.slug as landing_page_slug
     FROM validation_campaigns c
     INNER JOIN ideabrowser_ideas i ON c.idea_id = i.id
     LEFT JOIN landing_pages lp ON lp.validation_campaign_id = c.id AND lp.status = 'published'
     WHERE c.gate2_failed_at IS NOT NULL
     ORDER BY c.gate2_failed_at DESC`
  ).all() as Array<Record<string, unknown>>;

  const failedGate2: StageIdea[] = failedG2Rows.map(r => ({
    id: String(r.idea_id),
    title: String(r.title),
    category: r.category as string | null,
    overall_score: Number(r.overall_score) || 0,
    revenue_tier: r.revenue_tier as string | null,
    validation_status: String(r.validation_status || "failed"),
    idea_date: r.idea_date as string | null,
    description: shortDesc(r.description as string),
    campaign_id: String(r.campaign_id),
    gate2_failure_reason: r.gate2_failure_reason as string | null,
    target_signups: Number(r.target_signups) || 0,
    actual_signups: Number(r.actual_signups) || 0,
    actual_ctr_pct: Number(r.actual_ctr_pct) || 0,
    actual_cpl_usd: Number(r.actual_cpl_usd) || 0,
    landing_page_slug: (r.landing_page_slug as string | null) || null,
    stage_detail: (r.gate2_failure_reason as string) || `Market test failed · ${r.actual_signups}/${r.target_signups} signups, ${r.actual_ctr_pct}% CTR`,
  }));

  // ── Passed all gates: gate2_passed_at + build_triggered_at set ─────────────
  const passedAllRows = db.prepare(
    `SELECT c.id as campaign_id, c.idea_id, c.status, c.thiel_score,
            c.actual_signups, c.actual_ctr_pct, c.actual_cpl_usd,
            c.gate1_passed_at, c.gate2_passed_at, c.build_triggered_at, c.project_id,
            i.title, i.category, i.overall_score, i.revenue_tier, i.validation_status,
            i.idea_date, i.description
     FROM validation_campaigns c
     INNER JOIN ideabrowser_ideas i ON c.idea_id = i.id
     WHERE c.gate2_passed_at IS NOT NULL
     ORDER BY c.gate2_passed_at DESC`
  ).all() as Array<Record<string, unknown>>;

  const passedAll: StageIdea[] = passedAllRows.map(r => ({
    id: String(r.idea_id),
    title: String(r.title),
    category: r.category as string | null,
    overall_score: Number(r.overall_score) || 0,
    revenue_tier: r.revenue_tier as string | null,
    validation_status: String(r.validation_status || "passed"),
    idea_date: r.idea_date as string | null,
    description: shortDesc(r.description as string),
    campaign_id: String(r.campaign_id),
    gate1_passed_at: r.gate1_passed_at as string | null,
    gate2_passed_at: r.gate2_passed_at as string | null,
    actual_signups: Number(r.actual_signups) || 0,
    actual_ctr_pct: Number(r.actual_ctr_pct) || 0,
    project_id: r.project_id as string | null,
    stage_detail: `Thiel ${r.thiel_score}/10 · Market test passed (${r.actual_signups} signups, ${r.actual_ctr_pct}% CTR) · ${r.build_triggered_at ? "Build triggered" : "Build pending"}${r.project_id ? ` → project ${String(r.project_id).slice(0,8)}` : ""}`,
  }));

  // ── Curation: worth-pursuing vs skip based on deterministic scoring ───────
  // These cut across the pipeline — they're about WHICH ideas deserve attention,
  // not where they are in it. Thresholds are calibrated to the actual distribution
  // we saw: top 14 are 70+, next 96 are 60-69, 104 are 50-59, bottom 24 are <50.
  const worthPursuingRows = db.prepare(
    `SELECT id, title, category, overall_score, opportunity_score, problem_score,
            why_now_score, feasibility_score_10, gtm_score, revenue_tier,
            validation_status, idea_date, description
     FROM ideabrowser_ideas
     WHERE overall_score >= 60
     ORDER BY overall_score DESC, why_now_score DESC LIMIT 500`
  ).all() as Array<Record<string, unknown>>;

  // For each worth-pursuing idea, figure out its pipeline state so the UI can
  // show "Start Validation" or "Already running/Passed/Failed" per idea.
  const campaignByIdea = new Map<string, { id: string; status: string; gate1_passed_at: string | null; gate2_passed_at: string | null; gate2_failed_at: string | null }>();
  for (const c of db.prepare(
    "SELECT id, idea_id, status, gate1_passed_at, gate2_passed_at, gate2_failed_at FROM validation_campaigns"
  ).all() as Array<{ id: string; idea_id: string; status: string; gate1_passed_at: string | null; gate2_passed_at: string | null; gate2_failed_at: string | null }>) {
    const existing = campaignByIdea.get(c.idea_id);
    // Prefer non-failed campaign when multiple exist
    if (!existing || (existing.status === "failed" && c.status !== "failed")) {
      campaignByIdea.set(c.idea_id, c);
    }
  }

  const worthPursuing: StageIdea[] = worthPursuingRows.map(r => {
    const score = Number(r.overall_score);
    const tier = score >= 70 ? "Tier S (elite)" : "Tier A (strong)";
    const opp = Number(r.opportunity_score);
    const why = Number(r.why_now_score);
    const feas = Number(r.feasibility_score_10);
    const campaign = campaignByIdea.get(String(r.id));

    let pipelineState: string;
    if (!campaign) pipelineState = "not_started";
    else if (campaign.gate2_passed_at) pipelineState = "passed_all_gates";
    else if (campaign.gate2_failed_at) pipelineState = "failed_gate2";
    else if (campaign.gate1_passed_at) pipelineState = "in_testing";
    else pipelineState = "queued";

    return {
      id: String(r.id),
      title: String(r.title),
      category: r.category as string | null,
      overall_score: score,
      revenue_tier: r.revenue_tier as string | null,
      validation_status: r.validation_status as string | null,
      idea_date: r.idea_date as string | null,
      description: shortDesc(r.description as string),
      campaign_id: campaign?.id || null,
      stage_detail: `${tier} · score ${score} · opportunity ${opp}/10, why-now ${why}/10, feasibility ${feas}/10`,
      // Extra field so the UI knows which button to show
      ...(({ pipeline_state: pipelineState } as unknown) as Record<string, unknown>),
    } as StageIdea & { pipeline_state: string };
  });

  const skipRows = db.prepare(
    `SELECT id, title, category, overall_score, opportunity_score, problem_score,
            why_now_score, feasibility_score_10, gtm_score, revenue_tier,
            validation_status, idea_date, description
     FROM ideabrowser_ideas
     WHERE overall_score > 0 AND overall_score < 50
     ORDER BY overall_score ASC LIMIT 500`
  ).all() as Array<Record<string, unknown>>;

  const skip: StageIdea[] = skipRows.map(r => {
    const score = Number(r.overall_score);
    const opp = Number(r.opportunity_score);
    const why = Number(r.why_now_score);
    const feas = Number(r.feasibility_score_10);
    // Figure out the weakest dimension
    const dims = [
      { k: "opportunity", v: opp },
      { k: "why-now", v: why },
      { k: "feasibility", v: feas },
    ];
    const weakest = dims.reduce((a, b) => (a.v < b.v ? a : b));
    return {
      id: String(r.id),
      title: String(r.title),
      category: r.category as string | null,
      overall_score: score,
      revenue_tier: r.revenue_tier as string | null,
      validation_status: r.validation_status as string | null,
      idea_date: r.idea_date as string | null,
      description: shortDesc(r.description as string),
      stage_detail: `Score ${score} — weakest on ${weakest.k} (${weakest.v}/10). Skip unless you see something the scoring missed.`,
    };
  });

  return NextResponse.json({
    counts: {
      total: db.prepare("SELECT COUNT(*) as c FROM ideabrowser_ideas").get() as { c: number },
      worth_pursuing: worthPursuing.length,
      skip: skip.length,
      unreviewed: unreviewed.length,
      rejected_gate1: rejectedAtGate1Out.length,
      in_testing: inTesting.length,
      failed_gate2: failedGate2.length,
      passed_all_gates: passedAll.length,
    },
    worth_pursuing: worthPursuing,
    skip,
    unreviewed: unreviewed.map(i => ({ ...i, description: shortDesc(i.description), stage_detail: "Awaiting Peter Thiel's Gate 1 review" })),
    rejected_gate1: rejectedAtGate1Out,
    in_testing: inTesting,
    failed_gate2: failedGate2,
    passed_all_gates: passedAll,
  });
}
