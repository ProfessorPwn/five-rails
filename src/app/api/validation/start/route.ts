import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { processGate1 } from "@/lib/validation/gate1";
import { v4 as uuidv4 } from "uuid";

// POST /api/validation/start — kick off the validation pipeline for a specific idea.
// Used by the "Worth Pursuing" view on /validation so the user can one-click send
// a high-scoring idea into Gate 1 → Gate 2 → Build.
//
// Body: { idea_id: string }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ideaId = body.idea_id as string | undefined;
    if (!ideaId) return NextResponse.json({ error: "idea_id is required" }, { status: 400 });

    const db = getDb();
    const idea = db.prepare(
      "SELECT id, title, overall_score, opportunity_score, why_now_score, feasibility_score_10, gtm_score FROM ideabrowser_ideas WHERE id = ?"
    ).get(ideaId) as {
      id: string; title: string; overall_score: number;
      opportunity_score: number; why_now_score: number;
      feasibility_score_10: number; gtm_score: number;
    } | undefined;

    if (!idea) return NextResponse.json({ error: "Idea not found" }, { status: 404 });

    // Already has a non-failed campaign? Return it.
    const existing = db.prepare(
      "SELECT id, status FROM validation_campaigns WHERE idea_id = ? AND status NOT IN ('failed') ORDER BY created_at DESC LIMIT 1"
    ).get(ideaId) as { id: string; status: string } | undefined;
    if (existing) {
      return NextResponse.json({
        already_running: true,
        campaign_id: existing.id,
        status: existing.status,
        message: `Campaign ${existing.id.slice(0, 8)} already ${existing.status} for this idea.`,
      });
    }

    // Derive a Thiel-equivalent score from overall_score (0-100 → 0-10)
    // Average of key decision dimensions gives a more honest Gate 1 signal than
    // the flat overall_score.
    const thielScore = Math.round(
      ((idea.opportunity_score || 0) + (idea.why_now_score || 0) + (idea.feasibility_score_10 || 0) + (idea.gtm_score || 0)) / 4
    );

    const decisionId = uuidv4();
    // Record a synthetic decision so the campaign has provenance
    db.prepare(`
      INSERT INTO agent_decisions (id, agent_id, reasoning, action_taken, skill_used, confidence, metadata)
      VALUES (?, 'agent-research', ?, 'Gate 1 kicked off by user from /validation', NULL, 0.9, ?)
    `).run(
      decisionId,
      `User manually promoted idea "${idea.title}" to validation. Derived Thiel score from scorecard: ${thielScore}/10 (avg of opportunity/why-now/feasibility/gtm).`,
      JSON.stringify({ idea_id: ideaId, triggered_from: "user_ui", score_derivation: "avg(opportunity,why_now,feasibility,gtm)" }),
    );

    const recommendation = thielScore >= 7 ? "test" : "reject";
    const result = processGate1(
      ideaId,
      thielScore,
      recommendation,
      decisionId,
      recommendation === "reject" ? `Derived Thiel score ${thielScore}/10 is below the 7/10 threshold` : undefined,
    );

    logActivity({
      action: "validation_manually_started",
      details: `User promoted "${idea.title}" to validation. Derived score ${thielScore}/10 → ${recommendation}. ${result.passed ? `Campaign ${result.campaignId}` : "Rejected at Gate 1"}.`,
    });

    return NextResponse.json({
      started: result.passed,
      campaign_id: result.campaignId,
      thiel_score: thielScore,
      recommendation,
      message: result.passed
        ? `Validation started — campaign ${result.campaignId?.slice(0, 8)}. Gate 1 passed with ${thielScore}/10.`
        : `Idea did not pass Gate 1 (score ${thielScore}/10 below 7/10 threshold).`,
    });
  } catch (error) {
    console.error("POST /api/validation/start error:", error);
    return NextResponse.json({ error: "Failed to start validation", details: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}
