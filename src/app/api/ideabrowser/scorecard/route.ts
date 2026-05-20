import { NextRequest, NextResponse } from "next/server";
import { evaluateMarketReadiness, saveScorecardResult } from "@/lib/ai/idea-validation-engine";
import { logActivity } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ideaId = (body as { idea_id?: string }).idea_id;

    if (!ideaId) {
      return NextResponse.json({ error: "idea_id is required" }, { status: 400 });
    }

    const scorecard = await evaluateMarketReadiness(ideaId);
    saveScorecardResult(ideaId, scorecard);

    logActivity({
      action: "scorecard_evaluated",
      details: `Market readiness scorecard for idea ${ideaId}: ${scorecard.total}/50 (${scorecard.verdict})${scorecard.dealbreakers.length > 0 ? ` — Dealbreakers: ${scorecard.dealbreakers.join(", ")}` : ""}`,
    });

    return NextResponse.json(scorecard);
  } catch (error) {
    console.error("POST /api/ideabrowser/scorecard error:", error);
    return NextResponse.json({ error: "Failed to evaluate scorecard" }, { status: 500 });
  }
}
