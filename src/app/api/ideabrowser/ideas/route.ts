import { NextRequest, NextResponse } from "next/server";
import {
  getIdeaBrowserIdeas,
  getProjectIdeaBrowserIdeas,
  createIdeaBrowserIdea,
  bulkImportIdeaBrowserIdeas,
  logActivity,
} from "@/lib/db";
import { safeParseJson, validateRequired, sanitizeBody } from "@/lib/validation";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle CORS preflight for bookmarklet
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("project_id");
    const ideas = projectId
      ? getProjectIdeaBrowserIdeas(projectId)
      : getIdeaBrowserIdeas();
    return NextResponse.json(ideas);
  } catch (error) {
    console.error("GET /api/ideabrowser/ideas error:", error);
    return NextResponse.json(
      { error: "Failed to fetch IdeaBrowser ideas" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await safeParseJson(request);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid or missing JSON body" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Bulk import: { ideas: [...] }
    if (Array.isArray(body.ideas)) {
      const ideas = body.ideas as Array<Record<string, unknown>>;

      // Validate each idea has at least a title
      const validIdeas = ideas.filter(
        (idea) => idea.title && typeof idea.title === "string" && idea.title.trim()
      );

      if (validIdeas.length === 0) {
        return NextResponse.json(
          { error: "No valid ideas to import. Each idea requires a title." },
          { status: 400 }
        );
      }

      const sanitized = validIdeas.map((idea) =>
        sanitizeBody(idea as Record<string, string>, [
          "description",
          "go_to_market",
          "pricing",
          "target_market",
          "competition",
          "raw_data",
        ])
      );

      const result = bulkImportIdeaBrowserIdeas(sanitized);

      logActivity({
        action: "ideabrowser_bulk_import",
        details: `Bulk imported ${result.imported.length} ideas (${result.skipped} skipped)`,
      });

      return NextResponse.json(
        {
          imported: result.imported.length,
          skipped: result.skipped,
          ideas: result.imported,
        },
        { status: 201, headers: CORS_HEADERS }
      );
    }

    // Single idea creation: { title, ... }
    const err = validateRequired(body, ["title"]);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const sanitized = sanitizeBody(body, [
      "description",
      "go_to_market",
      "pricing",
      "target_market",
      "competition",
      "raw_data",
    ]);

    const idea = createIdeaBrowserIdea({
      title: String(sanitized.title),
      description: sanitized.description ? String(sanitized.description) : undefined,
      source_url: sanitized.source_url ? String(sanitized.source_url) : undefined,
      category: sanitized.category ? String(sanitized.category) : undefined,
      tags: sanitized.tags ? String(sanitized.tags) : undefined,
      search_volume: sanitized.search_volume ? String(sanitized.search_volume) : undefined,
      growth_rate: sanitized.growth_rate ? String(sanitized.growth_rate) : undefined,
      pain_level: sanitized.pain_level ? String(sanitized.pain_level) : undefined,
      feasibility: sanitized.feasibility ? String(sanitized.feasibility) : undefined,
      founder_fit: sanitized.founder_fit ? String(sanitized.founder_fit) : undefined,
      revenue_potential: sanitized.revenue_potential ? String(sanitized.revenue_potential) : undefined,
      execution_difficulty: sanitized.execution_difficulty ? String(sanitized.execution_difficulty) : undefined,
      go_to_market: sanitized.go_to_market ? String(sanitized.go_to_market) : undefined,
      pricing: sanitized.pricing ? String(sanitized.pricing) : undefined,
      target_market: sanitized.target_market ? String(sanitized.target_market) : undefined,
      competition: sanitized.competition ? String(sanitized.competition) : undefined,
      raw_data: sanitized.raw_data ? String(sanitized.raw_data) : undefined,
      sync_status: sanitized.sync_status ? String(sanitized.sync_status) : "manual",
      project_id: sanitized.project_id ? String(sanitized.project_id) : undefined,
    });

    logActivity({
      action: "ideabrowser_idea_created",
      project_id: idea.project_id || undefined,
      details: `Created IdeaBrowser idea: "${idea.title}"`,
    });

    return NextResponse.json(idea, { status: 201, headers: CORS_HEADERS });
  } catch (error) {
    console.error("POST /api/ideabrowser/ideas error:", error);
    return NextResponse.json(
      { error: "Failed to create IdeaBrowser idea" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
