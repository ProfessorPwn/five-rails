import { NextRequest, NextResponse } from "next/server";
import {
  getIdeaBrowserIdea,
  getConnections,
  createInsight,
  createContent,
  logActivity,
} from "@/lib/db";
import { safeParseJson, validateRequired } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_GENERATION_TYPES = new Set(["insights", "content", "action_plan"]);

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const idea = getIdeaBrowserIdea(id);
    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const body = await safeParseJson(request);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid or missing JSON body" },
        { status: 400 }
      );
    }

    const err = validateRequired(body, ["type"]);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const generationType = String(body.type);
    if (!VALID_GENERATION_TYPES.has(generationType)) {
      return NextResponse.json(
        { error: "Invalid type. Must be one of: insights, content, action_plan" },
        { status: 400 }
      );
    }

    // Get active LLM connection
    const connections = getConnections();
    const activeConnection = connections.find((c) => c.is_active === 1);

    if (!activeConnection) {
      return NextResponse.json(
        {
          error: "No active LLM connection configured",
          hint: "Go to Connections and add an Ollama or Anthropic connection.",
        },
        { status: 503 }
      );
    }

    // Build prompt with full idea metadata
    const prompt = buildPrompt(idea, generationType);

    const { provider, base_url, api_key_encrypted, model } = activeConnection;
    let output: string;

    if (provider === "ollama") {
      output = await executeWithOllama(
        prompt,
        model || "llama3",
        base_url || "http://127.0.0.1:11434"
      );
    } else if (provider === "anthropic") {
      output = await executeWithClaude(
        prompt,
        api_key_encrypted || "",
        model || "claude-sonnet-4-20250514"
      );
    } else {
      output = await executeWithOpenAI(
        prompt,
        model || "gpt-4o-mini",
        base_url || "https://api.openai.com",
        api_key_encrypted || ""
      );
    }

    // Save results based on type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let saved: any = null;

    if (generationType === "insights") {
      const insight = createInsight({
        title: `Market Insight: ${idea.title}`,
        description: output,
        source: "IdeaBrowser",
        pain_point: idea.pain_level
          ? `Pain level: ${idea.pain_level}`
          : undefined,
        solution: idea.go_to_market || undefined,
        category: idea.category || undefined,
        project_id: idea.project_id || undefined,
      });
      saved = insight;

      logActivity({
        action: "ideabrowser_insight_generated",
        project_id: idea.project_id || undefined,
        details: `Generated market insight from idea "${idea.title}"`,
        skill_used: `${provider}/${model}`,
      });
    } else if (generationType === "content") {
      const content = createContent({
        project_id: idea.project_id || undefined,
        type: "post",
        title: `Content: ${idea.title}`,
        content: output,
        status: "draft",
      });
      saved = content;

      logActivity({
        action: "ideabrowser_content_generated",
        project_id: idea.project_id || undefined,
        details: `Generated content from idea "${idea.title}"`,
        skill_used: `${provider}/${model}`,
        rail: "audience",
      });
    } else {
      // action_plan — return directly without saving
      logActivity({
        action: "ideabrowser_action_plan_generated",
        project_id: idea.project_id || undefined,
        details: `Generated action plan for idea "${idea.title}"`,
        skill_used: `${provider}/${model}`,
      });
    }

    return NextResponse.json({
      idea_id: id,
      idea_title: idea.title,
      type: generationType,
      output,
      saved,
      provider: `${provider}/${model}`,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/ideabrowser/ideas/[id]/generate error:", error);
    return NextResponse.json(
      { error: "Failed to generate from idea" },
      { status: 500 }
    );
  }
}

// ─── Prompt Builder ──────────────────────────────────────────────────────────

function buildPrompt(
  idea: {
    title: string;
    description: string | null;
    category: string | null;
    tags: string | null;
    search_volume: string | null;
    growth_rate: string | null;
    pain_level: string | null;
    feasibility: string | null;
    founder_fit: string | null;
    revenue_potential: string | null;
    execution_difficulty: string | null;
    go_to_market: string | null;
    pricing: string | null;
    target_market: string | null;
    competition: string | null;
  },
  type: string
): string {
  let context = `Idea: ${idea.title}\n`;
  if (idea.description) context += `Description: ${idea.description}\n`;
  if (idea.category) context += `Category: ${idea.category}\n`;
  if (idea.tags) context += `Tags: ${idea.tags}\n`;
  if (idea.search_volume) context += `Search Volume: ${idea.search_volume}\n`;
  if (idea.growth_rate) context += `Growth Rate: ${idea.growth_rate}\n`;
  if (idea.pain_level) context += `Pain Level: ${idea.pain_level}\n`;
  if (idea.feasibility) context += `Feasibility: ${idea.feasibility}\n`;
  if (idea.founder_fit) context += `Founder Fit: ${idea.founder_fit}\n`;
  if (idea.revenue_potential) context += `Revenue Potential: ${idea.revenue_potential}\n`;
  if (idea.execution_difficulty) context += `Execution Difficulty: ${idea.execution_difficulty}\n`;
  if (idea.go_to_market) context += `Go-to-Market: ${idea.go_to_market}\n`;
  if (idea.pricing) context += `Pricing: ${idea.pricing}\n`;
  if (idea.target_market) context += `Target Market: ${idea.target_market}\n`;
  if (idea.competition) context += `Competition: ${idea.competition}\n`;

  if (type === "insights") {
    return `You are a market research analyst. Analyze the following business idea and provide a detailed market insight report.

${context}

Provide:
1. Market Opportunity Assessment — Is this a real, growing market? What's the TAM/SAM/SOM?
2. Pain Point Validation — How acute is the problem? Who has it?
3. Competitive Landscape — Who are the existing players? What's the moat potential?
4. Revenue Model Analysis — How should this be monetized? What's realistic ARR?
5. Key Risks — What could go wrong?
6. Recommendation — Is this worth pursuing? What's the confidence level?

Be specific and data-driven where possible.`;
  }

  if (type === "content") {
    return `You are a content strategist for solopreneurs. Create engaging marketing content based on this business idea.

${context}

Create the following:
1. A compelling LinkedIn post (200-300 words) that validates this idea and attracts early adopters
2. An email subject line + preview text for a launch announcement
3. Three tweet/X post variations (each under 280 characters)
4. A one-paragraph elevator pitch

Make the content authentic, founder-voice, and actionable. Focus on the pain point and the transformation.`;
  }

  // action_plan
  return `You are a startup advisor helping a solopreneur build a business. Create a detailed 30-day action plan for launching this idea.

${context}

Create a step-by-step action plan with:
1. Week 1: Validation (customer interviews, landing page, waitlist)
2. Week 2: MVP Definition (core features, tech stack, build vs. buy)
3. Week 3: Build & Launch Prep (MVP build, content creation, outreach)
4. Week 4: Launch & Iterate (go-to-market execution, metrics, feedback loops)

For each week, provide:
- 3-5 specific daily/multi-day tasks
- Success criteria for the week
- Tools and resources needed
- Budget estimate

Be specific and actionable. Assume the founder is technical and working solo.`;
}

// ─── LLM Backends ────────────────────────────────────────────────────────────

async function executeWithOllama(
  prompt: string,
  model: string,
  host: string
): Promise<string> {
  const { Ollama } = await import("ollama");
  const ollama = new Ollama({ host });
  const response = await ollama.chat({
    model,
    messages: [{ role: "user", content: prompt }],
    stream: false,
  });
  return response.message.content;
}

async function executeWithClaude(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  // Delegates to centralized SDK client (autoforge pattern)
  const { querySDK } = await import("@/lib/ai/sdk-client");
  const result = await querySDK(prompt, {
    agentType: "research",
    connection: { provider: "anthropic", base_url: null, api_key_encrypted: apiKey, model },
  });
  if (result.status === "error") throw new Error(result.errorMessage || "Claude call failed");
  return result.text;
}

async function executeWithOpenAI(
  prompt: string,
  model: string,
  baseUrl: string,
  apiKey: string
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
