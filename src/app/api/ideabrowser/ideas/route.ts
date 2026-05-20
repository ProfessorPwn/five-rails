import { NextRequest, NextResponse } from "next/server";
import {
  getIdeaBrowserIdeas,
  getProjectIdeaBrowserIdeas,
  createIdeaBrowserIdea,
  bulkImportIdeaBrowserIdeas,
  scoreIdeaBrowserIdea,
  getIdeaBrowserIdea,
  getDb,
  logActivity,
} from "@/lib/db";
import { validateIdea, saveValidationResult, fetchAndSaveGoogleTrendsChart } from "@/lib/ai/idea-validation-engine";
import { safeParseJson, validateRequired, sanitizeBody } from "@/lib/validation";
import { v4 as uuidv4 } from "uuid";

// Assign idea to Peter Thiel (Research) for Gate 1 analysis + notify Ray Dalio (Executive)
function assignToAgents(baseUrl: string, idea: { id: string; title: string; description?: string | null; category?: string | null }) {
  // Send to Peter Thiel via chat for Contrarian Question + Monopoly Theory analysis
  fetch(`${baseUrl}/api/agents/agent-research/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `[NEW IDEA] IdeaBrowser idea imported: "${idea.title}" — ${idea.description || "No description"}. Category: ${idea.category || "Unknown"}. Analyze this idea using the Contrarian Question and Monopoly Theory frameworks. Is this 0→1 or 1→N? What's the hidden secret? Should we pursue this?`,
    }),
  }).catch(() => {});

  // Notify Ray Dalio (Executive)
  try {
    getDb().prepare(
      "INSERT INTO agent_messages (id, from_agent_id, to_agent_id, message, message_type) VALUES (?, 'agent-research', 'agent-executive', ?, 'info')"
    ).run(uuidv4(), `New idea imported: "${idea.title}" (${idea.category || "Unknown"}). Research analysis in progress.`);
  } catch { /* non-blocking */ }
}

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

      // Run v2 AI validation + Google Trends chart for all newly imported ideas
      let llmCount = 0;
      for (const idea of result.imported) {
        try {
          const fullIdea = getIdeaBrowserIdea(idea.id);
          if (fullIdea) {
            const vResult = await validateIdea(fullIdea);
            saveValidationResult(idea.id, vResult);
            if (vResult.engine === "llm") llmCount++;
          }
        } catch {
          scoreIdeaBrowserIdea(idea.id);
        }
        // Fetch Google Trends chart data (non-blocking)
        fetchAndSaveGoogleTrendsChart(idea.id).catch(() => {});
      }

      // Assign all imported ideas to agents for Gate 1 analysis
      const baseUrl = request.nextUrl.origin;
      for (const idea of result.imported) {
        const fullIdea = getIdeaBrowserIdea(idea.id);
        assignToAgents(baseUrl, {
          id: idea.id,
          title: idea.title,
          description: fullIdea?.description || null,
          category: fullIdea?.category || null,
        });
      }

      logActivity({
        action: "ideabrowser_bulk_import",
        details: `Bulk imported and validated ${result.imported.length} ideas (${llmCount} AI, ${result.imported.length - llmCount} deterministic, ${result.skipped} skipped) — all assigned to Peter Thiel (Research)`,
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

    // Run v2 AI validation (community signals, real data) + Google Trends chart
    // Falls back to deterministic scoring if no LLM is available
    let validationEngine = "deterministic";
    try {
      const fullIdea = getIdeaBrowserIdea(idea.id);
      if (fullIdea) {
        const result = await validateIdea(fullIdea);
        saveValidationResult(idea.id, result);
        validationEngine = result.engine;
      }
    } catch {
      // Fall back to deterministic scoring
      scoreIdeaBrowserIdea(idea.id);
    }

    // Fetch Google Trends chart data (non-blocking)
    fetchAndSaveGoogleTrendsChart(idea.id).catch(() => {});

    // Assign to agents for Gate 1 analysis
    const baseUrl = request.nextUrl.origin;
    assignToAgents(baseUrl, { id: idea.id, title: String(sanitized.title), description: sanitized.description ? String(sanitized.description) : null, category: sanitized.category ? String(sanitized.category) : null });

    logActivity({
      action: "ideabrowser_idea_created",
      project_id: idea.project_id || undefined,
      details: `Created and validated IdeaBrowser idea: "${idea.title}" (${validationEngine}) — assigned to Peter Thiel (Research)`,
    });

    const scored = getIdeaBrowserIdea(idea.id) || idea;
    return NextResponse.json(scored, { status: 201, headers: CORS_HEADERS });
  } catch (error) {
    console.error("POST /api/ideabrowser/ideas error:", error);
    return NextResponse.json(
      { error: "Failed to create IdeaBrowser idea" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
