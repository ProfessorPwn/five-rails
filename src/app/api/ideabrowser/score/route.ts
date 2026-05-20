import { NextRequest, NextResponse } from "next/server";
import { scoreAllIdeaBrowserIdeas, getIdeaBrowserIdeas, getConnections, getDb } from "@/lib/db";
import type { IdeaBrowserIdea } from "@/lib/db";
import { validateIdea, saveValidationResult } from "@/lib/ai/idea-validation-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode = (body as { mode?: string }).mode || "instant";

    // Mode 1: Instant deterministic scoring (no LLM needed)
    if (mode === "instant") {
      const scored = scoreAllIdeaBrowserIdeas();
      return NextResponse.json({ scored, mode: "instant", message: `Scored ${scored} ideas using deterministic engine.` });
    }

    // Mode 3: Full AI validation (per-idea, richer output than deep)
    if (mode === "validate") {
      const force = (body as { force?: boolean }).force || false;
      const ideas = getIdeaBrowserIdeas();
      const target = force
        ? ideas
        : ideas.filter((i) =>
            !i.overall_score || i.overall_score === 0 ||
            (i.search_volume_score === 0 && i.growth_rate_score === 0 && i.pain_level_score === 0)
          );

      if (target.length === 0) {
        return NextResponse.json({ scored: 0, total: ideas.length, mode: "validate", message: "All ideas already validated." });
      }

      let scored = 0;
      let llmCount = 0;
      let errors = 0;
      for (const idea of target) {
        try {
          const result = await validateIdea(idea);
          saveValidationResult(idea.id, result);
          scored++;
          if (result.engine === "llm") llmCount++;
        } catch (err) {
          console.error(`[validate] Failed idea ${idea.id}: ${err}`);
          errors++;
        }
      }

      return NextResponse.json({
        scored,
        total: ideas.length,
        mode: "validate",
        force,
        llm_validated: llmCount,
        deterministic_fallback: scored - llmCount,
        errors,
        message: `Validated ${scored}/${target.length} ideas (${llmCount} via AI, ${scored - llmCount} deterministic, ${errors} errors).`,
      });
    }

    // Mode 2: Deep LLM analysis (requires active connection)
    const connections = getConnections();
    const activeConnection = connections.find((c) => c.is_active === 1);

    if (!activeConnection) {
      // Fall back to instant scoring if no LLM
      const scored = scoreAllIdeaBrowserIdeas();
      return NextResponse.json({ scored, mode: "instant-fallback", message: `No LLM found. Scored ${scored} ideas with deterministic engine.` });
    }

    const ideas = getIdeaBrowserIdeas();
    // Only score ideas that haven't been scored yet or have all-zero scores
    const unscored = ideas.filter((i) =>
      !i.overall_score || i.overall_score === 0 ||
      (i.search_volume_score === 0 && i.growth_rate_score === 0 && i.pain_level_score === 0)
    );

    if (unscored.length === 0) {
      return NextResponse.json({ scored: 0, total: ideas.length, message: "All ideas already scored." });
    }

    // Process in batches of 5 to avoid overwhelming the LLM
    const batchSize = 5;
    let scored = 0;

    for (let i = 0; i < unscored.length; i += batchSize) {
      const batch = unscored.slice(i, i + batchSize);
      await scoreBatch(batch, activeConnection);
      scored += batch.length;
    }

    return NextResponse.json({ scored, total: ideas.length });
  } catch (error) {
    console.error("POST /api/ideabrowser/score error:", error);
    return NextResponse.json({ error: "Failed to score ideas" }, { status: 500 });
  }
}

async function scoreBatch(
  ideas: IdeaBrowserIdea[],
  connection: { provider: string; base_url: string | null; api_key_encrypted: string | null; model: string | null }
) {
  const ideaSummaries = ideas.map((idea, idx) => (
    `[${idx}] "${idea.title}"\nCategory: ${idea.category || "Unknown"}\nDescription: ${(idea.description || "").slice(0, 300)}`
  )).join("\n\n");

  const prompt = `You are a startup idea analyst. Score each idea on 5 metrics (0-100 scale).
Also write a 2-3 sentence analysis for Product Urgency, Market Gap, and Founder's Edge.
Write a 3-5 step Execution Plan.

Scoring guidelines (be varied and honest, NOT everything is 50):
- Search Volume (0-100): How many people are actively searching for this solution? 0-20=very niche, 21-40=small market, 41-60=moderate, 61-80=large market, 81-100=massive demand
- Growth Rate (0-100): Is demand growing? 0-20=declining, 21-40=flat, 41-60=steady growth, 61-80=fast growth, 81-100=explosive
- Pain Level (0-100): How painful is the problem? 0-20=nice-to-have, 21-40=minor inconvenience, 41-60=real problem, 61-80=significant pain, 81-100=hair-on-fire
- Feasibility (0-100): How easy to build? 0-20=requires breakthrough tech, 21-40=very complex, 41-60=moderate effort, 61-80=straightforward, 81-100=weekend project
- Revenue Potential (0-100): How much money can this make? 0-20=hobby income, 21-40=lifestyle business, 41-60=small business, 61-80=venture-scale, 81-100=unicorn potential

IMPORTANT: Be realistic and varied. A niche B2B tool might have Search Volume 25 but Pain Level 85. A trendy AI tool might have Growth Rate 90 but Feasibility 35. DO NOT default to 50 for anything.

Ideas to score:
${ideaSummaries}

Return ONLY a JSON array with one object per idea, in order:
[{
  "search_volume_score": <number>,
  "growth_rate_score": <number>,
  "pain_level_score": <number>,
  "feasibility_score": <number>,
  "revenue_potential_score": <number>,
  "product_urgency": "<2-3 sentences>",
  "market_gap": "<2-3 sentences>",
  "founders_edge": "<2-3 sentences>",
  "execution_plan": "<Step 1\\nStep 2\\nStep 3>"
}]

No markdown, no code fences, just the JSON array.`;

  let output: string;
  const { provider, base_url, api_key_encrypted, model } = connection;

  if (provider === "ollama") {
    output = await callOllama(prompt, model || "llama3", base_url || "http://127.0.0.1:11434");
  } else if (provider === "anthropic") {
    output = await callClaude(prompt, api_key_encrypted || "", model || "claude-sonnet-4-20250514");
  } else {
    output = await callOpenAI(prompt, model || "gpt-4o-mini", base_url || "https://api.openai.com", api_key_encrypted || "");
  }

  // Parse the JSON response
  let scores: Array<{
    search_volume_score: number;
    growth_rate_score: number;
    pain_level_score: number;
    feasibility_score: number;
    revenue_potential_score: number;
    product_urgency?: string;
    market_gap?: string;
    founders_edge?: string;
    execution_plan?: string;
  }>;

  try {
    const cleaned = output.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    scores = JSON.parse(cleaned);
    if (!Array.isArray(scores)) throw new Error("Not an array");
  } catch {
    // Try to extract JSON array
    const match = output.match(/\[[\s\S]*\]/);
    if (match) {
      scores = JSON.parse(match[0]);
    } else {
      console.error("Failed to parse scoring response:", output.slice(0, 500));
      return;
    }
  }

  const db = getDb();
  const stmt = db.prepare(`
    UPDATE ideabrowser_ideas
    SET search_volume_score = ?, growth_rate_score = ?, pain_level_score = ?,
        feasibility_score = ?, revenue_potential_score = ?, overall_score = ?,
        product_urgency = COALESCE(?, product_urgency),
        market_gap = COALESCE(?, market_gap),
        execution_plan = COALESCE(?, execution_plan),
        updated_at = datetime('now')
    WHERE id = ?
  `);

  for (let i = 0; i < ideas.length && i < scores.length; i++) {
    const s = scores[i];
    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v || 0)));
    const sv = clamp(s.search_volume_score);
    const gr = clamp(s.growth_rate_score);
    const pl = clamp(s.pain_level_score);
    const fe = clamp(s.feasibility_score);
    const rp = clamp(s.revenue_potential_score);
    const overall = Math.round((sv + gr + pl + fe + rp) / 5);

    stmt.run(
      sv, gr, pl, fe, rp, overall,
      s.product_urgency || null,
      s.market_gap || null,
      s.execution_plan || null,
      ideas[i].id
    );
  }
}

async function callOllama(prompt: string, model: string, host: string): Promise<string> {
  const { Ollama } = await import("ollama");
  const ollama = new Ollama({ host });
  const response = await ollama.chat({
    model,
    messages: [{ role: "user", content: prompt }],
    stream: false,
  });
  return response.message.content;
}

async function callClaude(prompt: string, apiKey: string, model: string): Promise<string> {
  // Delegates to centralized SDK client (autoforge pattern)
  const { querySDK } = await import("@/lib/ai/sdk-client");
  const result = await querySDK(prompt, {
    agentType: "research",
    connection: { provider: "anthropic", base_url: null, api_key_encrypted: apiKey, model },
  });
  if (result.status === "error") throw new Error(result.errorMessage || "Claude call failed");
  return result.text;
}

async function callOpenAI(prompt: string, model: string, baseUrl: string, apiKey: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
