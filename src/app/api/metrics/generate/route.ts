import { NextRequest, NextResponse } from "next/server";
import { getConnections, getDb, createBlueprint } from "@/lib/db";

const SYSTEM_PROMPT = `You are a business metrics architect. Given a niche, return a JSON metrics framework with realistic industry-specific targets.

CRITICAL: Output ONLY valid JSON. No markdown. No backticks. No explanation. Start with { end with }.

JSON structure:
{
  "businessName": "Short name",
  "niche": "Category",
  "model": "SaaS|Marketplace|Agency|E-commerce|Course|Service|App",
  "layers": [
    {"id":"north-star","label":"NORTH STAR","metrics":[{"name":"$X ARR","desc":"Description","rationale":"Why this target"}]},
    {"id":"revenue","label":"REVENUE & PRICING","metrics":[...]},
    {"id":"pricing-tiers","label":"VALUE LADDER / PRICING TIERS","metrics":[...]},
    {"id":"acquisition","label":"ACQUISITION & FUNNEL","metrics":[...]},
    {"id":"traffic","label":"TRAFFIC & AWARENESS","metrics":[...]},
    {"id":"content","label":"CONTENT & ENGAGEMENT","metrics":[...]},
    {"id":"email","label":"EMAIL MARKETING","metrics":[...]},
    {"id":"paid","label":"PAID ADVERTISING","metrics":[...]},
    {"id":"seo","label":"SEO & ORGANIC","metrics":[...]},
    {"id":"product","label":"PRODUCT HEALTH","metrics":[...]},
    {"id":"attribution","label":"ATTRIBUTION MODEL","metrics":[...]},
    {"id":"budget","label":"BUDGET ALLOCATION","metrics":[...]}
  ],
  "timeline": [
    {"phase":"90-Day Targets","items":["target1","target2","target3","target4","target5","target6"]},
    {"phase":"6-Month Targets","items":["target1","target2","target3","target4"]},
    {"phase":"12-Month Targets","items":["target1","target2","target3","target4","target5","target6"]}
  ],
  "summary": [
    {"title":"THE MONEY METRICS","rows":[["Label","Value"],["Label","Value"],["Label","Value"],["Label","Value"],["Label","Value"],["Label","Value"],["Label","Value"],["Label","Value"]]},
    {"title":"THE FUNNEL RATES","rows":[...8 rows...]},
    {"title":"THE CHANNEL NUMBERS","rows":[...8 rows...]},
    {"title":"THE GROWTH TARGETS","rows":[...8 rows...]}
  ],
  "attributionModel": [
    {"label":"First Touch","pct":"40%"},
    {"label":"Last Touch","pct":"40%"},
    {"label":"Middle","pct":"20%"}
  ],
  "funnel": [
    {"stage":"Visitor","count":"X/mo","rate":""},
    {"stage":"Lead (X% CVR)","count":"X","rate":"→ X%"},
    {"stage":"Trial/Demo (X% CVR)","count":"X","rate":"→ X%"},
    {"stage":"Paid (X% CVR)","count":"X","rate":"→ X%"},
    {"stage":"Retained","count":"LTV $X","rate":"→ X% retain"}
  ]
}

Rules:
- Each layer: 5-7 metrics with name, desc, rationale
- All numbers must be realistic for the SPECIFIC niche using real industry benchmarks
- Adjust everything: pricing, CAC, channels, ad costs, conversion rates per niche
- Attribution percentages must total 100%
- Summary rows: exactly 8 per section
- Timeline items: specific measurable targets
- Funnel: exactly 5 stages with niche-appropriate rates`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const niche = body.niche as string;

    if (!niche?.trim()) {
      return NextResponse.json({ error: "Niche is required" }, { status: 400 });
    }

    const connections = getConnections();
    const activeConnection = connections.find((c) => c.is_active === 1);

    if (!activeConnection) {
      return NextResponse.json({
        error: "No active LLM connection. Go to Connections to configure one.",
      }, { status: 503 });
    }

    const userPrompt = `Generate a complete metrics architecture for this business niche:\n\n"${niche.trim()}"\n\nIMPORTANT: Return ONLY a valid JSON object. Do NOT wrap in markdown code blocks. Do NOT include any text before or after the JSON. Start your response with { and end with }.`;

    const { provider, base_url, api_key_encrypted, model } = activeConnection;
    let output: string;

    if (provider === "ollama") {
      output = await callOllama(SYSTEM_PROMPT, userPrompt, model || "llama3", base_url || "http://127.0.0.1:11434");
    } else if (provider === "anthropic") {
      output = await callClaude(SYSTEM_PROMPT, userPrompt, api_key_encrypted || "", model || "claude-sonnet-4-20250514");
    } else {
      output = await callOpenAI(SYSTEM_PROMPT, userPrompt, model || "gpt-4o-mini", base_url || "https://api.openai.com", api_key_encrypted || "");
    }

    const parsed = extractJSON(output);

    if (!parsed || !parsed.layers) {
      return NextResponse.json({
        error: "Could not parse metrics data from LLM response",
        raw: output.slice(0, 500),
      }, { status: 500 });
    }

    // Extract Idea Snapshot scores from the framework
    const scores = extractScoresFromFramework(parsed);
    (parsed as Record<string, unknown>).ideaSnapshot = scores;

    // If an ideaId was provided, update the idea's scores in the DB
    const ideaId = body.ideaId as string | undefined;
    if (ideaId) {
      const db = getDb();
      db.prepare(`
        UPDATE ideabrowser_ideas
        SET search_volume_score = ?, growth_rate_score = ?, pain_level_score = ?,
            feasibility_score = ?, revenue_potential_score = ?, overall_score = ?,
            product_urgency = ?, market_gap = ?, founders_edge = ?, execution_plan = ?,
            raw_data = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        scores.search_volume, scores.growth_rate, scores.pain_level,
        scores.feasibility, scores.revenue_potential, scores.overall,
        scores.product_urgency, scores.market_gap, scores.founders_edge, scores.execution_plan,
        JSON.stringify(parsed), ideaId
      );
    }

    // Auto-save as a blueprint
    const blueprint = createBlueprint({
      niche: niche.trim(),
      data: JSON.stringify(parsed),
      project_id: (body as Record<string, string>).projectId || undefined,
      idea_id: ideaId || undefined,
    });
    (parsed as Record<string, unknown>).blueprintId = blueprint.id;

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("POST /api/metrics/generate error:", error);
    return NextResponse.json({ error: "Failed to generate metrics" }, { status: 500 });
  }
}

function extractJSON(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text); } catch { /* continue */ }
  const clean = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  try { return JSON.parse(clean); } catch { /* continue */ }
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch { /* continue */ }
  }
  return null;
}

async function callOllama(system: string, user: string, model: string, host: string): Promise<string> {
  const { Ollama } = await import("ollama");
  const ollama = new Ollama({ host });
  const response = await ollama.chat({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
  });
  return response.message.content;
}

async function callClaude(system: string, user: string, apiKey: string, model: string): Promise<string> {
  // Delegates to centralized SDK client (autoforge pattern)
  const { querySDK } = await import("@/lib/ai/sdk-client");
  const result = await querySDK(user, {
    agentType: "executive",
    systemPrompt: system,
    connection: { provider: "anthropic", base_url: null, api_key_encrypted: apiKey, model },
  });
  if (result.status === "error") throw new Error(result.errorMessage || "Claude call failed");
  return result.text;
}

async function callOpenAI(system: string, user: string, model: string, baseUrl: string, apiKey: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── Extract Idea Snapshot scores from the Metrics Framework ──────────────────
// Maps real business metrics to 0-100 scores for the Idea Snapshot.
function extractScoresFromFramework(fw: Record<string, unknown>): {
  search_volume: number;
  growth_rate: number;
  pain_level: number;
  feasibility: number;
  revenue_potential: number;
  overall: number;
  product_urgency: string;
  market_gap: string;
  founders_edge: string;
  execution_plan: string;
} {
  const layers = (fw.layers || []) as Array<{ id: string; label: string; metrics: Array<{ name: string; desc: string; rationale?: string }> }>;
  const funnel = (fw.funnel || []) as Array<{ stage: string; count: string; rate: string }>;
  const timeline = (fw.timeline || []) as Array<{ phase: string; items: string[] }>;
  const summary = (fw.summary || []) as Array<{ title: string; rows: [string, string][] }>;

  const allMetricText = layers.map(l => l.metrics.map(m => `${m.name} ${m.desc}`).join(' ')).join(' ').toLowerCase();
  const allNames = layers.flatMap(l => l.metrics.map(m => m.name.toLowerCase()));

  // ── Search Volume: derived from traffic/awareness layer ──
  // Look for monthly visitor/traffic numbers
  let sv = 55;
  const trafficLayer = layers.find(l => l.id === 'traffic');
  if (trafficLayer) {
    const trafficText = trafficLayer.metrics.map(m => `${m.name} ${m.desc}`).join(' ');
    const visitorMatch = trafficText.match(/(\d[\d,]*)\s*(?:visitor|view|session|user)/i);
    if (visitorMatch) {
      const visitors = parseInt(visitorMatch[1].replace(/,/g, ''));
      if (visitors >= 100000) sv = 88;
      else if (visitors >= 50000) sv = 78;
      else if (visitors >= 10000) sv = 68;
      else if (visitors >= 5000) sv = 58;
      else if (visitors >= 1000) sv = 45;
      else sv = 32;
    }
  }
  // Also check funnel top
  if (funnel.length > 0) {
    const topCount = funnel[0].count.replace(/[^0-9]/g, '');
    if (topCount) {
      const n = parseInt(topCount);
      if (n >= 50000) sv = Math.max(sv, 85);
      else if (n >= 10000) sv = Math.max(sv, 72);
      else if (n >= 5000) sv = Math.max(sv, 62);
      else if (n >= 1000) sv = Math.max(sv, 50);
    }
  }

  // ── Growth Rate: derived from timeline targets ──
  let gr = 50;
  if (timeline.length >= 2) {
    const t90 = (timeline[0].items || []).join(' ').toLowerCase();
    const t12 = (timeline[timeline.length - 1].items || []).join(' ').toLowerCase();
    // Look for revenue growth multipliers
    const revenueMatches12 = t12.match(/\$(\d[\d,]*[km]?)/gi) || [];
    const revenueMatches90 = t90.match(/\$(\d[\d,]*[km]?)/gi) || [];
    if (revenueMatches12.length > 0 && revenueMatches90.length > 0) {
      const parse$ = (s: string) => {
        const n = parseFloat(s.replace(/[$,]/g, ''));
        if (s.toLowerCase().includes('m')) return n * 1000000;
        if (s.toLowerCase().includes('k')) return n * 1000;
        return n;
      };
      const rev12 = Math.max(...revenueMatches12.map(parse$));
      const rev90 = Math.max(...revenueMatches90.map(parse$));
      if (rev90 > 0 && rev12 > rev90) {
        const multiplier = rev12 / rev90;
        if (multiplier >= 10) gr = 92;
        else if (multiplier >= 5) gr = 82;
        else if (multiplier >= 3) gr = 72;
        else if (multiplier >= 2) gr = 62;
        else gr = 52;
      }
    }
    // Fallback: look for growth percentage mentions
    const growthMatch = allMetricText.match(/(\d+)%\s*(?:growth|increase|mom|yoy|month.over)/i);
    if (growthMatch) {
      const pct = parseInt(growthMatch[1]);
      if (pct >= 30) gr = Math.max(gr, 85);
      else if (pct >= 15) gr = Math.max(gr, 70);
      else if (pct >= 8) gr = Math.max(gr, 58);
    }
  }

  // ── Pain Level: derived from funnel conversion rates ──
  // High conversion = high pain (people are motivated to buy)
  let pl = 50;
  if (funnel.length >= 4) {
    // Extract the final paid conversion rate
    const paidStage = funnel[3];
    const rateMatch = paidStage.rate?.match(/(\d+(?:\.\d+)?)\s*%/);
    if (rateMatch) {
      const rate = parseFloat(rateMatch[1]);
      if (rate >= 10) pl = 88;
      else if (rate >= 5) pl = 75;
      else if (rate >= 3) pl = 65;
      else if (rate >= 1) pl = 52;
      else pl = 38;
    }
  }
  // Also check churn — low churn = high pain (people need it)
  const churnMatch = allMetricText.match(/(\d+(?:\.\d+)?)\s*%\s*(?:churn|attrition)/i);
  if (churnMatch) {
    const churn = parseFloat(churnMatch[1]);
    if (churn <= 2) pl = Math.max(pl, 85);
    else if (churn <= 5) pl = Math.max(pl, 72);
    else if (churn <= 10) pl = Math.max(pl, 58);
  }
  // Retention also signals pain
  const retainMatch = allMetricText.match(/(\d+)\s*%\s*(?:retain|retention)/i);
  if (retainMatch) {
    const retain = parseInt(retainMatch[1]);
    if (retain >= 90) pl = Math.max(pl, 82);
    else if (retain >= 75) pl = Math.max(pl, 68);
  }

  // ── Feasibility: derived from budget allocation and time-to-revenue ──
  let fe = 55;
  const budgetLayer = layers.find(l => l.id === 'budget');
  if (budgetLayer) {
    const budgetText = budgetLayer.metrics.map(m => `${m.name} ${m.desc}`).join(' ');
    const totalBudget = budgetText.match(/\$(\d[\d,]*[km]?)/i);
    if (totalBudget) {
      const amt = totalBudget[1].replace(/,/g, '');
      const n = parseFloat(amt);
      const multiplied = amt.toLowerCase().includes('m') ? n * 1000000 : amt.toLowerCase().includes('k') ? n * 1000 : n;
      if (multiplied <= 5000) fe = 82;
      else if (multiplied <= 20000) fe = 72;
      else if (multiplied <= 50000) fe = 62;
      else if (multiplied <= 200000) fe = 48;
      else fe = 35;
    }
  }
  // Check model type — some are inherently easier
  const model = ((fw.model || '') as string).toLowerCase();
  if (model.includes('course') || model.includes('service')) fe = Math.max(fe, 72);
  if (model.includes('marketplace')) fe = Math.min(fe, 55);
  if (model.includes('app')) fe = Math.min(fe, 58);

  // ── Revenue Potential: derived from North Star ARR + pricing ──
  let rp = 50;
  const northStar = layers.find(l => l.id === 'north-star');
  if (northStar) {
    const nsText = northStar.metrics.map(m => m.name).join(' ');
    const arrMatch = nsText.match(/\$(\d[\d,.]*)\s*([km])/i);
    if (arrMatch) {
      const n = parseFloat(arrMatch[1].replace(/,/g, ''));
      const unit = arrMatch[2].toLowerCase();
      const arr = unit === 'm' ? n * 1000000 : n * 1000;
      if (arr >= 10000000) rp = 95;
      else if (arr >= 5000000) rp = 85;
      else if (arr >= 1000000) rp = 75;
      else if (arr >= 500000) rp = 65;
      else if (arr >= 100000) rp = 55;
      else rp = 42;
    }
  }
  // Also check pricing tiers
  const pricingLayer = layers.find(l => l.id === 'pricing-tiers');
  if (pricingLayer) {
    const priceText = pricingLayer.metrics.map(m => `${m.name} ${m.desc}`).join(' ');
    const prices = [...priceText.matchAll(/\$(\d[\d,]*)/g)].map(m => parseInt(m[1].replace(/,/g, '')));
    if (prices.length > 0) {
      const maxPrice = Math.max(...prices);
      if (maxPrice >= 1000) rp = Math.max(rp, 80);
      else if (maxPrice >= 200) rp = Math.max(rp, 65);
      else if (maxPrice >= 50) rp = Math.max(rp, 55);
    }
  }

  const clamp = (v: number) => Math.max(10, Math.min(98, v));
  sv = clamp(sv);
  gr = clamp(gr);
  pl = clamp(pl);
  fe = clamp(fe);
  rp = clamp(rp);
  const overall = Math.round((sv + gr + pl + fe + rp) / 5);

  // ── Generate analysis text from framework data ──
  const bizName = (fw.businessName || fw.niche || 'this business') as string;

  const northStarMetric = northStar?.metrics?.[0];
  const revenueLayer = layers.find(l => l.id === 'revenue');

  const product_urgency = `${bizName} shows ${gr >= 70 ? 'strong' : gr >= 50 ? 'moderate' : 'emerging'} growth signals (${gr}/100). ` +
    `${northStarMetric ? `North Star target: ${northStarMetric.name}. ` : ''}` +
    `Funnel conversion data indicates ${pl >= 70 ? 'high buyer intent — users actively need this solution' : pl >= 50 ? 'solid demand with room to optimize conversion' : 'a market that needs education before purchase'}. ` +
    `${gr >= 65 ? 'Move fast — the window for early-mover advantage is open.' : 'Build methodically and validate each stage.'}`;

  const market_gap = `Search volume score (${sv}/100) suggests ${sv >= 65 ? 'strong existing demand that current solutions fail to capture fully' : sv >= 45 ? 'measurable demand with room for a differentiated entrant' : 'a niche market requiring demand generation'}. ` +
    `${revenueLayer ? `Revenue model: ${revenueLayer.metrics.slice(0, 2).map(m => m.name).join(', ')}. ` : ''}` +
    `${pricingLayer ? `Pricing spans ${pricingLayer.metrics.length} tiers, indicating market segmentation opportunity. ` : ''}` +
    `The ${model || 'SaaS'} model is ${fe >= 65 ? 'technically feasible with moderate effort' : 'achievable but requires careful architecture'}.`;

  const founders_edge = `Overall opportunity score: ${overall}/100. ` +
    `Revenue potential (${rp}/100) ${rp >= 70 ? 'supports venture-scale ambitions' : rp >= 50 ? 'suits a bootstrapped or angel-funded approach' : 'points to a lifestyle business or side project'}. ` +
    `Feasibility (${fe}/100) means ${fe >= 65 ? 'a solo founder or small team can ship an MVP within weeks' : fe >= 45 ? 'a dedicated technical co-founder is essential' : 'significant R&D investment is needed before launch'}. ` +
    `Key edge: domain expertise in ${bizName.toLowerCase().includes('ai') ? 'AI/ML and the target vertical' : 'the target market and distribution channels'}.`;

  const t90Items = timeline.length > 0 ? timeline[0].items.slice(0, 5) : [];
  const execution_plan = t90Items.length > 0
    ? t90Items.join('\n')
    : `1. Validate demand with landing page and ads\n2. Build MVP focusing on core value\n3. Acquire first 10 paying customers\n4. Measure retention and NPS\n5. Iterate based on usage data`;

  return {
    search_volume: sv,
    growth_rate: gr,
    pain_level: pl,
    feasibility: fe,
    revenue_potential: rp,
    overall,
    product_urgency,
    market_gap,
    founders_edge,
    execution_plan,
  };
}
