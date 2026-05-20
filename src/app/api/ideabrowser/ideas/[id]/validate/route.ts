import { NextRequest, NextResponse } from "next/server";
import { getIdeaBrowserIdea, logActivity } from "@/lib/db";
import { validateIdea, saveValidationResult, fetchAndSaveGoogleTrendsChart } from "@/lib/ai/idea-validation-engine";
import { safeParseJson } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request).catch(() => ({}));
    const force = (body as { force?: boolean })?.force || false;

    const idea = getIdeaBrowserIdea(id);
    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    // If already validated and not forced, return cached
    if (!force && idea.opportunity_score > 0 && idea.community_signals) {
      try {
        const signals = JSON.parse(idea.community_signals);
        // Check if signals have real URLs (LLM-generated) vs deterministic
        const hasRealUrls = signals.reddit?.url && signals.facebook?.url;
        if (hasRealUrls) {
          return NextResponse.json({
            ...idea,
            _engine: "cached",
            _message: "Already validated. Use force: true to re-validate.",
          });
        }
      } catch { /* proceed with validation */ }
    }

    // Run validation
    const result = await validateIdea(idea);

    // Persist to database
    saveValidationResult(id, result);

    // Fetch Google Trends chart data (non-blocking — best effort)
    fetchAndSaveGoogleTrendsChart(id).catch((e) =>
      console.log("[validate] Google Trends chart fetch failed:", e instanceof Error ? e.message : e)
    );

    // Log activity
    logActivity({
      action: "ideabrowser_idea_validated",
      details: `Validated "${idea.title}" using ${result.engine} engine. Opportunity: ${result.opportunity_score}/10, Problem: ${result.problem_score}/10, Feasibility: ${result.feasibility_score_10}/10, Timing: ${result.why_now_score}/10`,
    });

    // Re-fetch the updated idea
    const updated = getIdeaBrowserIdea(id);

    return NextResponse.json({
      ...updated,
      _engine: result.engine,
      _message: result.engine === "llm"
        ? "Validated with AI analysis"
        : "Validated with deterministic engine (no LLM available)",
    });
  } catch (error) {
    console.error("POST /api/ideabrowser/ideas/[id]/validate error:", error);
    return NextResponse.json(
      { error: "Failed to validate idea" },
      { status: 500 }
    );
  }
}
