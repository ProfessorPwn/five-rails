// ─── AI-Powered Idea Validation Engine v2 ─────────────────────────────────────
// Reverse-engineered from IdeaBrowser.com (Greg Isenberg).
// v2: Requires REAL community signal data — specific subreddits, Facebook groups,
// YouTube channels, and Google Trends URLs. No search-page-only links.
// Falls back to deterministic scoring when no LLM is available.

import { callLLMWithFallback, getActiveLLMConnection, getAllActiveLLMConnections, type LLMConnection } from "./llm-client";
import {
  getIdeaBrowserIdea,
  getDb,
  scoreIdeaBrowserIdeaInternal,
  generateIdeaAnalysis,
  generateExtendedMetadata,
  type IdeaBrowserIdea,
} from "@/lib/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IdeaValidationResult {
  // Core scores (1-10)
  opportunity_score: number;
  problem_score: number;
  feasibility_score_10: number;
  why_now_score: number;
  // Derived scores
  execution_difficulty_score: number;
  gtm_score: number;
  // 0-100 scores
  search_volume_score: number;
  growth_rate_score: number;
  pain_level_score: number;
  feasibility_score: number;
  revenue_potential_score: number;
  overall_score: number;
  // Text analysis
  product_urgency: string;
  market_gap: string;
  founders_edge: string;
  execution_plan: string;
  why_now: string;
  proof_signals: string;
  trend_analysis: string;
  // Structured JSON (stored as strings)
  community_signals: string;
  offer_ladder: string;
  keyword_terms: string;
  // Categorization
  idea_type: string;
  market_type: string;
  target_persona: string;
  main_competitor: string;
  revenue_tier: string;
  // Engine indicator
  engine: "llm" | "deterministic";
}

// ─── v2 Prompt Builder ────────────────────────────────────────────────────────

function buildValidationPrompt(idea: IdeaBrowserIdea): string {
  const searchKeyword = idea.title.split(/[:(–—\-]/)[0].trim();
  const encodedKeyword = encodeURIComponent(searchKeyword).replace(/%20/g, "+");
  const catKeyword = encodeURIComponent((idea.category || "technology").toLowerCase());

  return `You are an expert startup validation analyst running a 40-step idea validation system.
You pull REAL data from Reddit, Facebook, YouTube, and Google Trends.
You do NOT generate placeholder data. You do NOT link to search results pages as a substitute for actual community links.

IDEA TO VALIDATE:
- Title: ${idea.title}
- Description: ${idea.description || "No description provided"}
- Category: ${idea.category || "Unknown"}
- Tags: ${idea.tags || "None"}
- Target Market: ${idea.target_market || "Not specified"}

─── SCORING AXES (1-10 scale each) ───

1. OPPORTUNITY SCORE: How big is the market gap?
   - Consider: keyword search volume, YoY growth, solution gap, commercial intent, white space
   - High (8-10): 100%+ YoY growth + 3+ active Reddit threads + product dissatisfaction + no dominant paid tool
   - Medium (5-7): Moderate search interest + some competitor gaps
   - Low (1-4): Saturated market or very niche
   - MUST CITE: Specific Google Trends data + specific Reddit threads showing demand

2. PROBLEM SEVERITY SCORE: How badly do people need this solved?
   - Consider: Reddit/Facebook pain language, sentiment analysis, workaround complexity, willingness to pay
   - High (8-10): People hacking together 3+ tools, explicit "I'd pay for this" signals
   - Medium (5-7): Real but manageable pain
   - Low (1-4): Nice-to-have convenience
   - MUST CITE: Specific pain quotes from real Reddit discussions

3. FEASIBILITY SCORE: Can a solo founder / small team build this?
   - Consider: API availability, MVP timeline (<=3 months?), no-code tools, regulatory complexity
   - High (8-10): Simple SaaS, existing APIs, ship in weeks
   - Medium (5-7): Moderate technical lift, some integrations
   - Low (1-4): Hardware, heavy regulation, breakthrough tech required
   - MUST CITE: Specific tools/APIs that make this buildable (or barriers)

4. TIMING SCORE (Why Now): Is the market ready NOW?
   - Consider: Google Trends trajectory, regulatory/cultural shifts, new tech enablers, competitor timing
   - High (8-10): Rising trends + recent tech enabler + incumbents asleep
   - Medium (5-7): Stable demand, no urgent window
   - Low (1-4): Declining interest or market already consolidated
   - MUST CITE: Google Trends URL showing the trajectory

─── COMMUNITY SIGNALS — REAL DATA REQUIRED ───

CRITICAL: Every link must go to a SPECIFIC real entity, not a search results page.

REDDIT — Link to SPECIFIC subreddits and posts:
- 2-5 specific real subreddits where this topic is discussed
- Each: direct URL (reddit.com/r/{name}/), approximate member count
- 1 recent relevant post per subreddit with approximate upvotes and comment count
- Pain quotes paraphrased from real discussions
- If you cannot find real subreddits, set to empty array with a note explaining why

FACEBOOK — Link to SPECIFIC groups:
- 2-5 specific real Facebook groups where the audience gathers
- Each: name, direct URL (facebook.com/groups/{slug}/), approximate member count, public/private
- If no relevant groups exist, say so — do NOT invent group names

YOUTUBE — Link to SPECIFIC channels and videos:
- 3-5 specific real YouTube videos or channels covering the topic
- Each video: title, direct URL (youtube.com/watch?v={id}), channel name, approximate views
- Videos should be relatively recent to signal current relevance
- If no videos exist, that's a valid signal (low competition)

GOOGLE TRENDS — Link to the ACTUAL trend with parameters:
- URL format: https://trends.google.com/trends/explore?q={keyword}&date=today%205-y&geo=US
- Current interest level (0-100), YoY growth %, trajectory (rising/stable/declining/breakout)
- Related rising queries if relevant

COMPETITOR — Link to their ACTUAL website:
- Name the real company/product
- Link to their actual website (NOT a Google search)
- Identify their key weakness that creates the opportunity

─── OUTPUT SCHEMA ───

Return ONLY a single JSON object. No markdown, no code fences, no explanation outside the JSON.
If data is unavailable for any field, use null with a note — never fabricate.

{
  "scores": {
    "opportunity": <1-10>,
    "opportunity_rationale": "<2-3 sentences citing specific evidence>",
    "problem_severity": <1-10>,
    "problem_rationale": "<2-3 sentences citing pain quotes and threads>",
    "feasibility": <1-10>,
    "feasibility_rationale": "<2-3 sentences citing specific APIs/tools>",
    "timing": <1-10>,
    "timing_rationale": "<2-3 sentences citing Google Trends data>"
  },
  "business_fit": {
    "revenue_potential": "<e.g. $2M-$5M ARR>",
    "execution_difficulty": <1-10>,
    "go_to_market_score": <1-10>,
    "founder_idea_fit": <1-10>
  },
  "keywords": [
    {
      "term": "<keyword>",
      "volume": <monthly_searches>,
      "growth": <yoy_percent>,
      "trends_url": "https://trends.google.com/trends/explore?q=<encoded_keyword>&date=today%205-y&geo=US"
    }
  ],
  "community_signals": {
    "reddit": {
      "subreddits": [
        {
          "name": "r/<name>",
          "url": "https://www.reddit.com/r/<name>/",
          "members": <number>,
          "relevance": "high|medium|low",
          "recent_post": {
            "title": "<post title>",
            "url": "https://www.reddit.com/r/<name>/comments/<id>/",
            "upvotes": <number>,
            "comments": <number>
          }
        }
      ],
      "discovery_search_url": "https://www.reddit.com/search/?q=${encodedKeyword}&sort=relevance&t=month",
      "total_relevant_threads_90d": <number>,
      "pain_quotes": ["<quote 1>", "<quote 2>"]
    },
    "facebook_groups": {
      "groups": [
        {
          "name": "<group name>",
          "url": "https://www.facebook.com/groups/<slug>/",
          "members": <number>,
          "visibility": "public|private",
          "activity": "<e.g. daily posts>"
        }
      ],
      "discovery_search_url": "https://www.facebook.com/search/groups/?q=${encodedKeyword}",
      "note": "<null if groups found, otherwise explain why none exist>"
    },
    "youtube": {
      "videos": [
        {
          "title": "<video title>",
          "url": "https://www.youtube.com/watch?v=<id>",
          "channel": "<channel name>",
          "channel_url": "https://www.youtube.com/@<handle>",
          "views": <number>
        }
      ],
      "discovery_search_url": "https://www.youtube.com/results?search_query=${encodedKeyword}",
      "channels_covering_topic": <number>,
      "content_velocity": "<e.g. increasing — 6 new videos in last 60 days>"
    },
    "google_trends": {
      "primary_keyword": {
        "term": "<keyword>",
        "url": "https://trends.google.com/trends/explore?q=<encoded>&date=today%205-y&geo=US",
        "current_interest": <0-100>,
        "yoy_growth_percent": <number>,
        "trajectory": "rising|stable|declining|breakout|seasonal"
      },
      "related_rising_queries": [
        {
          "term": "<query>",
          "growth": "<e.g. +450% or Breakout>"
        }
      ],
      "comparison_url": "<Google Trends URL comparing related keywords>"
    }
  },
  "offer_tiers": {
    "lead_magnet": { "name": "<name>", "price": "Free", "description": "<1 sentence>" },
    "frontend": { "name": "<name>", "price": "<$9-$99>", "description": "<1 sentence>" },
    "core": { "name": "<name>", "price": "<$29-$500/mo>", "description": "<1 sentence>" }
  },
  "analysis": {
    "why_now": "<2-3 sentences with specific data>",
    "proof_signals": "<2-3 sentences mapping community activity to measurable demand>",
    "market_gap": "<2-3 sentences: what exists vs what's missing, name real competitors>",
    "execution_plan": "<5 steps separated by newlines>",
    "product_urgency": "<2-3 sentences>",
    "founders_edge": "<2-3 sentences>",
    "trend_analysis": "<1 sentence market trajectory>"
  },
  "categorization": {
    "idea_type": "<SaaS|Marketplace|Community|Tool|Service|Content|Mobile App|Hardware|Agency|Info Product|E-Commerce|Media>",
    "market_type": "<B2B|B2C|B2B2C>",
    "target_persona": "<specific persona with demographics>",
    "main_competitor": {
      "name": "<real company name>",
      "website": "<https://their-actual-site.com/>",
      "weakness": "<key weakness creating the opportunity>"
    }
  },
  "revenue_tier": "<$|$$|$$$|$$$$>",
  "branded_title": "<Specific, pitchable product name — e.g. 'PrepPal: AI Meal Planner for Macro-Tracking Gym-Goers'>"
}

─── CRITICAL RULES ───

1. BRANDED TITLE REQUIRED. If the idea title is generic (e.g., "SaaS Tool", "Meal Prep App"), rewrite it into a specific, pitchable, Google-able name (e.g., "PrepPal: AI Meal Planner for Macro-Tracking Gym-Goers"). Return this as "branded_title" in your response. The title should be specific enough to Google and memorable enough to pitch in one breath.

2. NO FAKE LINKS — ZERO TOLERANCE. Every subreddit URL must point to a real subreddit (reddit.com/r/{name}/). Every YouTube URL must be a real video (youtube.com/watch?v={id}). Every Facebook URL must be a real group (facebook.com/groups/{slug}/). If you are not confident a specific entity exists, return an EMPTY ARRAY — never fabricate a URL or name.

3. NO SEARCH PAGES AS SIGNALS. URLs like reddit.com/search, youtube.com/results, or facebook.com/search are NOT community signals. They are discovery helpers only. The "subreddits" array must contain direct subreddit URLs. The "videos" array must contain direct video URLs. If you cannot find a real entity, return an empty array with a note.

4. COUNTS MUST EQUAL NAMED ITEMS. If you say "3 subreddits found", you must list exactly 3 subreddits with URLs. If you can only verify 2, say 2. Never claim a count higher than the number of named, linked items you provide. The count is always derived from the array length — never state it separately.

5. NO HALLUCINATED SCORES. If uncertain, be conservative. A null score with explanation > a fabricated 7.
6. SHOW YOUR WORK. Every score rationale must trace to specific community signal evidence.
7. BE VARIED. NOT everything is a 7. A niche B2B tool might score Opportunity 3 but Problem Severity 9.
8. NAME REAL COMPETITORS with their real website URL, not a Google search link.
9. If data for a platform is unavailable, return empty arrays with a note explaining why — this is valuable signal too (e.g., no YouTube coverage = low competition but also low awareness).
10. DO NOT WRITE DISCLAIMERS IN DATA FIELDS. Never put phrases like "Cannot verify without live access", "I don't have web access", "Cannot access live data" into ANY field. If you don't know, return empty string "" or empty array [] or null. Disclaimers belong nowhere — use your training knowledge to name real competitors, platforms, and tools, or return nothing. A blank field is infinitely better than an apology in a data field.
11. COMPETITORS: name real companies from your training knowledge (e.g., "BizEquity", "Guidant Financial", "Exitwise"). If you genuinely can't think of a specific competitor, return name as "" and let the UI handle the empty state. Never write "Cannot verify specific competitors" as a competitor name.`;
}

// ─── Response Parser ──────────────────────────────────────────────────────────

function parseValidationResponse(raw: string, idea: IdeaBrowserIdea): IdeaValidationResult | null {
  // Strip markdown code fences
  const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();

  // Try to extract JSON object
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  const scores = parsed.scores as Record<string, unknown> | undefined;
  const businessFit = parsed.business_fit as Record<string, unknown> | undefined;
  const keywords = parsed.keywords as Array<Record<string, unknown>> | undefined;
  const communitySignals = parsed.community_signals as Record<string, unknown> | undefined;
  const offerTiers = parsed.offer_tiers as Record<string, unknown> | undefined;
  const analysis = parsed.analysis as Record<string, unknown> | undefined;
  const categorization = parsed.categorization as Record<string, unknown> | undefined;

  // Extract branded title — update the idea if provided
  const brandedTitle = parsed.branded_title ? String(parsed.branded_title).trim() : null;
  if (brandedTitle && brandedTitle.length > 5 && brandedTitle !== idea.title) {
    try {
      getDb().prepare("UPDATE ideabrowser_ideas SET title = ?, updated_at = datetime('now') WHERE id = ?").run(brandedTitle, idea.id);
    } catch { /* non-blocking */ }
  }

  // Helper: reject search-page URLs — only allow direct entity links
  const isSearchPageUrl = (url: string): boolean =>
    /reddit\.com\/search/i.test(url) ||
    /youtube\.com\/results/i.test(url) ||
    /facebook\.com\/search/i.test(url) ||
    /google\.com\/search/i.test(url);

  if (!scores) return null;

  const clamp10 = (v: unknown): number => Math.max(1, Math.min(10, Math.round(Number(v) || 5)));
  const clamp100 = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

  // Core 1-10 scores
  const opportunity = clamp10(scores.opportunity);
  const problem = clamp10(scores.problem_severity);
  const feasibility = clamp10(scores.feasibility);
  const timing = clamp10(scores.timing);

  // Derive 0-100 scores from 1-10 scores
  const sv100 = clamp100(opportunity * 10 + (timing > 5 ? 5 : -5));
  const gr100 = clamp100(timing * 10 + (opportunity > 5 ? 3 : -3));
  const pl100 = clamp100(problem * 10);
  const fe100 = clamp100(feasibility * 10);
  const rp100 = clamp100(((opportunity + problem) / 2) * 10);
  const overall = clamp100(Math.round((sv100 + gr100 + pl100 + fe100 + rp100) / 5));

  // Business fit derived scores
  const executionDifficulty = clamp10(businessFit?.execution_difficulty);
  const gtmScore = clamp10(businessFit?.go_to_market_score);

  // Revenue tier
  let revTier = String(parsed.revenue_tier || "$$");
  const revPotential = String(businessFit?.revenue_potential || "$1M-$5M ARR");
  if (!revTier.startsWith("$")) revTier = "$$";
  const revLabels: Record<string, string> = { "$$$$": "$10M+ ARR potential", "$$$": "$1M-$10M ARR potential", "$$": "$100K-$1M ARR potential", "$": "Under $100K ARR potential" };
  const revLabel = revLabels[revTier] || revPotential;
  const revTierFull = `${revTier} (${revLabel})`;

  // ── Community signals: build the rich v2 structure ──
  // Also build the legacy flat format for backward-compatible rendering
  const searchKeyword = encodeURIComponent(idea.title.split(/[:(–—\-]/)[0].trim());

  // Extract v2 nested data from LLM response
  const redditData = communitySignals?.reddit as Record<string, unknown> | undefined;
  const fbData = communitySignals?.facebook_groups as Record<string, unknown> | undefined;
  const ytData = communitySignals?.youtube as Record<string, unknown> | undefined;
  const trendsData = communitySignals?.google_trends as Record<string, unknown> | undefined;

  // Build the rich v2 community_signals structure
  // Filter out any entries with search-page URLs — only keep real entity links
  const subreddits = ((redditData?.subreddits as Array<Record<string, unknown>>) || [])
    .filter(s => s.url && !isSearchPageUrl(String(s.url)));
  const fbGroups = ((fbData?.groups as Array<Record<string, unknown>>) || [])
    .filter(g => g.url && !isSearchPageUrl(String(g.url)));
  const ytVideos = ((ytData?.videos as Array<Record<string, unknown>>) || [])
    .filter(v => v.url && !isSearchPageUrl(String(v.url)));

  // Strip LLM disclaimer noise — these are honest-but-noisy admissions that the
  // LLM doesn't have live API access. The UI should show nothing rather than
  // "Cannot verify without live YouTube API access" in a data field.
  // If the disclaimer is embedded in a longer string, strip just that sentence.
  const scrubDisclaimer = (s: string | null | undefined): string => {
    if (!s) return "";
    const rx = /cannot verify|cannot access|without live|no live access|do(es)? not have (live )?access|no web access|without web access/i;
    if (!rx.test(s)) return s;
    // Full string is just a disclaimer
    if (s.trim().length < 120) return "";
    // Strip offending sentences from a longer paragraph
    const cleaned = s
      .split(/(?<=[.!?])\s+/)
      .filter(sentence => !rx.test(sentence))
      .join(" ")
      .trim();
    return cleaned;
  };

  // Counts derived ONLY from validated arrays — never from separate claimed numbers
  const redditCount = subreddits.length;
  const fbCount = fbGroups.length;
  const ytVideoCount = ytVideos.length;
  const trendsInterest = Number((trendsData?.primary_keyword as Record<string, unknown>)?.current_interest) || 0;

  // Build the combined structure: legacy flat keys (reddit, facebook, youtube, other)
  // PLUS the v2 rich data under _v2 keys
  const finalSignals = {
    // Legacy flat format — counts match verified entity arrays, URLs point to first real entity
    reddit: {
      count: redditCount,
      label: redditCount > 0 ? `${redditCount} subreddit${redditCount !== 1 ? "s" : ""} linked` : "No subreddits verified",
      url: subreddits[0] ? String(subreddits[0].url) : null,
    },
    facebook: {
      count: fbCount,
      label: fbCount > 0 ? `${fbCount} group${fbCount !== 1 ? "s" : ""} linked` : "No groups verified",
      url: fbGroups[0] ? String(fbGroups[0].url) : null,
    },
    youtube: {
      count: ytVideoCount,
      label: ytVideoCount > 0 ? `${ytVideoCount} video${ytVideoCount !== 1 ? "s" : ""} linked` : "No videos verified",
      url: ytVideos[0] ? String(ytVideos[0].url) : null,
    },
    other: {
      count: trendsInterest,
      label: `Interest: ${trendsInterest}/100`,
      url: (trendsData?.primary_keyword as Record<string, unknown>)?.url
        ? String((trendsData?.primary_keyword as Record<string, unknown>).url)
        : `https://trends.google.com/trends/explore?q=${searchKeyword}&date=today%205-y&geo=US`,
    },
    // v2 rich data
    _v2: {
      reddit: {
        subreddits: subreddits.map((s) => ({
          name: String(s.name || ""),
          url: String(s.url || ""),
          members: Number(s.members) || 0,
          relevance: String(s.relevance || "medium"),
          recent_post: s.recent_post ? {
            title: String((s.recent_post as Record<string, unknown>).title || ""),
            url: String((s.recent_post as Record<string, unknown>).url || ""),
            upvotes: Number((s.recent_post as Record<string, unknown>).upvotes) || 0,
            comments: Number((s.recent_post as Record<string, unknown>).comments) || 0,
          } : null,
        })),
        pain_quotes: ((redditData?.pain_quotes as string[]) || []).map(String).map(scrubDisclaimer).filter(Boolean),
        total_threads_90d: Number(redditData?.total_relevant_threads_90d) || 0,
      },
      facebook_groups: {
        groups: fbGroups.map((g) => ({
          name: String(g.name || ""),
          url: String(g.url || ""),
          members: Number(g.members) || 0,
          visibility: String(g.visibility || "public"),
          activity: scrubDisclaimer(String(g.activity || "")),
        })),
        note: scrubDisclaimer(fbData?.note ? String(fbData.note) : "") || null,
      },
      youtube: {
        videos: ytVideos.map((v) => ({
          title: String(v.title || ""),
          url: String(v.url || ""),
          channel: String(v.channel || ""),
          channel_url: String(v.channel_url || ""),
          views: Number(v.views) || 0,
        })),
        channels_covering_topic: ytVideoCount,
        content_velocity: scrubDisclaimer(String(ytData?.content_velocity || "")),
      },
      google_trends: {
        primary_keyword: trendsData?.primary_keyword ? {
          term: String((trendsData.primary_keyword as Record<string, unknown>).term || ""),
          url: String((trendsData.primary_keyword as Record<string, unknown>).url || ""),
          current_interest: Number((trendsData.primary_keyword as Record<string, unknown>).current_interest) || 0,
          yoy_growth_percent: Number((trendsData.primary_keyword as Record<string, unknown>).yoy_growth_percent) || 0,
          trajectory: String((trendsData.primary_keyword as Record<string, unknown>).trajectory || "stable"),
        } : null,
        related_rising_queries: ((trendsData?.related_rising_queries as Array<Record<string, unknown>>) || []).map((q) => ({
          term: String(q.term || ""),
          growth: String(q.growth || ""),
        })),
        comparison_url: trendsData?.comparison_url ? String(trendsData.comparison_url) : null,
      },
    },
  };

  // ── Offer ladder ──
  const offerArray = [];
  if (offerTiers) {
    const lm = offerTiers.lead_magnet as Record<string, unknown> | undefined;
    const fe2 = offerTiers.frontend as Record<string, unknown> | undefined;
    const core = offerTiers.core as Record<string, unknown> | undefined;
    if (lm) offerArray.push({ tier: "Lead Magnet", name: String(lm.name || ""), price: String(lm.price || "Free"), description: String(lm.description || "") });
    if (fe2) offerArray.push({ tier: "Frontend", name: String(fe2.name || ""), price: String(fe2.price || ""), description: String(fe2.description || "") });
    if (core) offerArray.push({ tier: "Core", name: String(core.name || ""), price: String(core.price || ""), description: String(core.description || "") });
  }

  // ── Keywords with trends URLs ──
  const keywordArray = (keywords || []).map((kw) => ({
    term: String(kw.term || ""),
    volume: Number(kw.volume) || 0,
    growth: Number(kw.growth) || 0,
    trends_url: kw.trends_url ? String(kw.trends_url) : undefined,
  }));

  // ── Text analysis fields ──
  const oppRationale = String(scores.opportunity_rationale || "");
  const probRationale = String(scores.problem_rationale || "");
  const feasRationale = String(scores.feasibility_rationale || "");
  const timingRationale = String(scores.timing_rationale || "");

  const productUrgency = scrubDisclaimer(String(analysis?.product_urgency || `Opportunity: ${opportunity}/10 — ${oppRationale} Problem severity: ${problem}/10 — ${probRationale}`));
  const marketGap = scrubDisclaimer(String(analysis?.market_gap || feasRationale));
  const foundersEdge = scrubDisclaimer(String(analysis?.founders_edge || ""));
  const executionPlan = scrubDisclaimer(String(analysis?.execution_plan || ""));
  const whyNow = scrubDisclaimer(String(analysis?.why_now || timingRationale));
  const proofSignals = scrubDisclaimer(String(analysis?.proof_signals || ""));
  const trendAnalysis = scrubDisclaimer(String(analysis?.trend_analysis || ""));

  // ── Main competitor: store as JSON if object, string if string ──
  // Scrub disclaimer text from competitor name — if the LLM only produced
  // "Cannot verify specific competitors...", blank the name rather than show it.
  let mainCompetitor: string;
  const compData = categorization?.main_competitor;
  if (compData && typeof compData === "object") {
    const c = compData as Record<string, unknown>;
    const scrubbed = {
      name: scrubDisclaimer(String(c.name || "")),
      website: c.website || null,
      weakness: scrubDisclaimer(String(c.weakness || "")),
    };
    mainCompetitor = scrubbed.name ? JSON.stringify(scrubbed) : "";
  } else {
    mainCompetitor = scrubDisclaimer(String(compData || ""));
  }

  return {
    opportunity_score: opportunity,
    problem_score: problem,
    feasibility_score_10: feasibility,
    why_now_score: timing,
    execution_difficulty_score: executionDifficulty,
    gtm_score: gtmScore,
    search_volume_score: sv100,
    growth_rate_score: gr100,
    pain_level_score: pl100,
    feasibility_score: fe100,
    revenue_potential_score: rp100,
    overall_score: overall,
    product_urgency: productUrgency,
    market_gap: marketGap,
    founders_edge: foundersEdge,
    execution_plan: executionPlan,
    why_now: whyNow,
    proof_signals: proofSignals,
    trend_analysis: trendAnalysis,
    community_signals: JSON.stringify(finalSignals),
    offer_ladder: JSON.stringify(offerArray),
    keyword_terms: JSON.stringify(keywordArray),
    idea_type: String(categorization?.idea_type || "SaaS"),
    market_type: String(categorization?.market_type || "B2C"),
    target_persona: String(categorization?.target_persona || ""),
    main_competitor: mainCompetitor,
    revenue_tier: revTierFull,
    engine: "llm",
  };
}

// ─── Deterministic Fallback ───────────────────────────────────────────────────

function runDeterministicScoring(idea: IdeaBrowserIdea): IdeaValidationResult {
  const { sv, gr, pl, fe, rp } = scoreIdeaBrowserIdeaInternal(idea);
  const overall = Math.round((sv + gr + pl + fe + rp) / 5);

  const analysis = generateIdeaAnalysis(idea, { sv, gr, pl, fe, rp, overall });
  const extended = generateExtendedMetadata(idea, { sv, gr, pl, fe, rp, overall });

  return {
    opportunity_score: Math.max(1, Math.min(10, Math.ceil(((sv + gr + rp) / 3) / 10))),
    problem_score: Math.max(1, Math.min(10, Math.ceil(pl / 10))),
    feasibility_score_10: Math.max(1, Math.min(10, Math.ceil(fe / 10))),
    why_now_score: Math.max(1, Math.min(10, Math.ceil(((gr + pl) / 2) / 10))),
    execution_difficulty_score: Math.max(1, Math.min(10, Math.ceil((100 - fe) / 10))),
    gtm_score: Math.max(1, Math.min(10, Math.ceil(((sv + gr) / 2) / 10))),
    search_volume_score: sv,
    growth_rate_score: gr,
    pain_level_score: pl,
    feasibility_score: fe,
    revenue_potential_score: rp,
    overall_score: overall,
    product_urgency: analysis.product_urgency,
    market_gap: analysis.market_gap,
    founders_edge: analysis.founders_edge,
    execution_plan: analysis.execution_plan,
    why_now: extended.why_now,
    proof_signals: extended.proof_signals,
    trend_analysis: extended.trend_analysis,
    community_signals: extended.community_signals,
    offer_ladder: extended.offer_ladder,
    keyword_terms: extended.keyword_terms,
    idea_type: extended.idea_type,
    market_type: extended.market_type,
    target_persona: extended.target_persona,
    main_competitor: extended.main_competitor,
    revenue_tier: extended.revenue_tier,
    engine: "deterministic",
  };
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export async function validateIdea(
  ideaOrId: IdeaBrowserIdea | string,
  connection?: LLMConnection | null
): Promise<IdeaValidationResult> {
  const idea = typeof ideaOrId === "string" ? getIdeaBrowserIdea(ideaOrId) : ideaOrId;
  if (!idea) {
    throw new Error(`Idea not found: ${ideaOrId}`);
  }

  // Check if any LLM connection is available
  const hasConnections = connection || getAllActiveLLMConnections().length > 0;
  if (!hasConnections) {
    console.warn("[ValidationEngine] No LLM connection — using deterministic fallback");
    return runDeterministicScoring(idea);
  }

  const prompt = buildValidationPrompt(idea);

  try {
    // Use callLLMWithFallback to try all active connections in priority order
    const { text: raw } = await callLLMWithFallback(prompt, {
      temperature: 0.4,
      maxTokens: 6000,
    });

    const result = parseValidationResponse(raw, idea);
    if (!result) {
      console.warn("[ValidationEngine] Failed to parse LLM response — using deterministic fallback");
      return runDeterministicScoring(idea);
    }

    return result;
  } catch (error) {
    console.error("[ValidationEngine] All LLM calls failed:", error);
    return runDeterministicScoring(idea);
  }
}

// ─── DB Persistence ───────────────────────────────────────────────────────────

export function saveValidationResult(ideaId: string, result: IdeaValidationResult): void {
  getDb().prepare(`
    UPDATE ideabrowser_ideas
    SET search_volume_score = ?, growth_rate_score = ?, pain_level_score = ?,
        feasibility_score = ?, revenue_potential_score = ?, overall_score = ?,
        product_urgency = ?, market_gap = ?, founders_edge = ?, execution_plan = ?,
        opportunity_score = ?, problem_score = ?, feasibility_score_10 = ?,
        why_now_score = ?, execution_difficulty_score = ?, gtm_score = ?,
        keyword_terms = ?, revenue_tier = ?, offer_ladder = ?,
        why_now = ?, proof_signals = ?,
        idea_type = ?, market_type = ?, target_persona = ?,
        main_competitor = ?, trend_analysis = ?, community_signals = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    result.search_volume_score, result.growth_rate_score, result.pain_level_score,
    result.feasibility_score, result.revenue_potential_score, result.overall_score,
    result.product_urgency, result.market_gap, result.founders_edge, result.execution_plan,
    result.opportunity_score, result.problem_score, result.feasibility_score_10,
    result.why_now_score, result.execution_difficulty_score, result.gtm_score,
    result.keyword_terms, result.revenue_tier, result.offer_ladder,
    result.why_now, result.proof_signals,
    result.idea_type, result.market_type, result.target_persona,
    result.main_competitor, result.trend_analysis, result.community_signals,
    ideaId
  );
}

// ─── 10-Factor Market-Readiness Scorecard ─────────────────────────────────────

export interface MarketReadinessScorecard {
  scores: {
    demand_signals: number;
    pain_severity: number;
    willingness_to_pay: number;
    competition_landscape: number;
    speed_to_mvp: number;
    channel_clarity: number;
    unit_economics: number;
    timing_signal: number;
    market_size: number;
    founder_advantage: number;
  };
  evidence: Record<string, string>;
  total: number;
  verdict: "recommend" | "conditional" | "pass";
  dealbreakers: string[];
  test_method: string;
  budget_timeline: string;
}

function buildScorecardPrompt(idea: IdeaBrowserIdea): string {
  // Include existing validation data if available for context
  const existingContext = idea.community_signals
    ? `\nEXISTING VALIDATION DATA (use as input, do NOT copy scores):\n- Community Signals: ${idea.community_signals.slice(0, 1500)}\n- Why Now: ${idea.why_now || "N/A"}\n- Market Gap: ${idea.market_gap || "N/A"}\n- Proof Signals: ${idea.proof_signals || "N/A"}\n- Founders Edge: ${idea.founders_edge || "N/A"}\n`
    : "";

  return `You are a ruthless startup evaluator. Score this idea on 10 factors to determine if it's ready for market testing.

IDEA:
- Title: ${idea.title}
- Description: ${idea.description || "No description"}
- Category: ${idea.category || "Unknown"}
- Target Market: ${idea.target_market || "Not specified"}
- Tags: ${idea.tags || "None"}
${existingContext}
─── SCORE EACH FACTOR 1-5 ───

ANY factor scoring 1 is a DEALBREAKER. Be honest. Most ideas score 2-3 on most factors.

1. DEMAND SIGNALS (1-5)
   What's the monthly search volume? Are people asking about it on Reddit, forums, Quora? Waitlists or "someone build this" posts?
   1=No evidence of demand | 2=Scattered mentions | 3=Moderate search volume, some forum activity | 4=Strong search volume, active discussions | 5=Massive demand, waitlists exist

2. PAIN SEVERITY (1-5)
   Painkiller or vitamin? How frequently does the target experience this? What workarounds exist (manual, spreadsheets, hiring)?
   1=Pure vitamin, nice-to-have | 2=Minor inconvenience | 3=Real recurring pain, hacky workarounds | 4=Significant pain, people cobbling 3+ tools | 5=Hair-on-fire, budget already allocated

3. WILLINGNESS TO PAY (1-5)
   Are people already paying for alternatives? What are they paying? Frustration about price/quality of current solutions?
   1=No payment signals | 2=Free alternatives dominate | 3=Some paid tools exist, price sensitivity | 4=Active spending, complaints about existing options | 5=High spend, clear upgrade path

4. COMPETITION LANDSCAPE (1-5)
   How many direct competitors? Well-funded or bootstrapped? What's their weakest point?
   1=Dominated by well-funded incumbents | 2=Strong competitors, small gaps | 3=Several competitors with clear weaknesses | 4=Few competitors, obvious gaps | 5=Blue ocean, no direct solution

5. SPEED TO TESTABLE MVP (1-5)
   Can a landing page + waitlist be live in 48h? What's the minimum version that proves demand?
   1=Needs breakthrough tech or hardware | 2=6+ months to anything testable | 3=2-3 months to MVP, landing page doable now | 4=2-4 weeks to MVP, APIs available | 5=Weekend project, no-code possible

6. CHANNEL CLARITY (1-5)
   Do we know exactly where the buyer hangs out? Can we reach 1,000 of them within a week for under $200?
   1=No idea where buyers are | 2=Vague sense of audience | 3=Know the platforms, untested reach | 4=Specific communities identified, affordable access | 5=Exact subreddits/groups/newsletters, tested channel

7. UNIT ECONOMICS ESTIMATE (1-5)
   Realistic price point? Estimated CAC? Does LTV/CAC look like it could hit 3:1+?
   1=Economics don't work (<1:1 LTV/CAC) | 2=Marginal (1-2:1) | 3=Plausible 3:1 with assumptions | 4=Strong 3:1+ with real comparables | 5=Exceptional economics, low CAC + high LTV

8. TIMING SIGNAL (1-5)
   Why now and not two years ago? Regulatory change, tech shift, cultural trend, platform update?
   1=No timing advantage | 2=Weak timing story | 3=Moderate tailwind (gradual trend) | 4=Clear catalyst (new tech, regulation, platform) | 5=Perfect storm — multiple converging forces

9. MARKET SIZE (1-5)
   Estimated number of people with this problem who would pay? $1M niche, $10M market, or $100M+ opportunity?
   1=Tiny niche (<$500K) | 2=Small market ($500K-$2M) | 3=Decent market ($2M-$10M) | 4=Large market ($10M-$100M) | 5=Massive ($100M+)

10. FOUNDER-MARKET ADVANTAGE (1-5)
    Any unfair edge — existing audience, domain expertise, proprietary data, distribution channel?
    1=No advantage, anyone could build this | 2=Minor familiarity | 3=Some domain knowledge | 4=Strong expertise or audience | 5=Unfair advantage (proprietary data, captive audience, insider knowledge)

─── OUTPUT ───

Return ONLY a JSON object. No markdown, no code fences.

{
  "scores": {
    "demand_signals": <1-5>,
    "pain_severity": <1-5>,
    "willingness_to_pay": <1-5>,
    "competition_landscape": <1-5>,
    "speed_to_mvp": <1-5>,
    "channel_clarity": <1-5>,
    "unit_economics": <1-5>,
    "timing_signal": <1-5>,
    "market_size": <1-5>,
    "founder_advantage": <1-5>
  },
  "evidence": {
    "demand_signals": "<2-3 sentences with specific data points>",
    "pain_severity": "<2-3 sentences with specific examples>",
    "willingness_to_pay": "<2-3 sentences citing pricing of alternatives>",
    "competition_landscape": "<2-3 sentences naming specific competitors>",
    "speed_to_mvp": "<2-3 sentences on build approach>",
    "channel_clarity": "<2-3 sentences naming specific channels>",
    "unit_economics": "<2-3 sentences with price point and CAC estimate>",
    "timing_signal": "<2-3 sentences on why now>",
    "market_size": "<2-3 sentences with TAM estimate>",
    "founder_advantage": "<2-3 sentences on edge or lack thereof>"
  },
  "test_method": "<Recommended: landing page, ad campaign, cold outreach, or community post. Be specific — which platform, what offer, what CTA>",
  "budget_timeline": "<Estimated budget ($50-$500 range) and timeline (48h to 2 weeks) to validate>"
}

RULES:
- Be brutally honest. Most factors should score 2-3.
- A score of 5 is rare and requires extraordinary evidence.
- A score of 1 is a clear dealbreaker — call it out.
- Don't inflate scores to be nice. The user needs truth to avoid wasting money.
- The test_method should be the cheapest, fastest way to validate demand.`;
}

function parseScorecardResponse(raw: string): MarketReadinessScorecard | null {
  const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  const scores = parsed.scores as Record<string, number> | undefined;
  const evidence = parsed.evidence as Record<string, string> | undefined;
  if (!scores) return null;

  const clamp5 = (v: unknown): number => Math.max(1, Math.min(5, Math.round(Number(v) || 2)));

  const finalScores = {
    demand_signals: clamp5(scores.demand_signals),
    pain_severity: clamp5(scores.pain_severity),
    willingness_to_pay: clamp5(scores.willingness_to_pay),
    competition_landscape: clamp5(scores.competition_landscape),
    speed_to_mvp: clamp5(scores.speed_to_mvp),
    channel_clarity: clamp5(scores.channel_clarity),
    unit_economics: clamp5(scores.unit_economics),
    timing_signal: clamp5(scores.timing_signal),
    market_size: clamp5(scores.market_size),
    founder_advantage: clamp5(scores.founder_advantage),
  };

  const total = Object.values(finalScores).reduce((sum, v) => sum + v, 0);

  // Identify dealbreakers (any factor = 1)
  const dealbreakers: string[] = [];
  const labels: Record<string, string> = {
    demand_signals: "Demand Signals", pain_severity: "Pain Severity",
    willingness_to_pay: "Willingness to Pay", competition_landscape: "Competition Landscape",
    speed_to_mvp: "Speed to MVP", channel_clarity: "Channel Clarity",
    unit_economics: "Unit Economics", timing_signal: "Timing Signal",
    market_size: "Market Size", founder_advantage: "Founder Advantage",
  };
  for (const [key, val] of Object.entries(finalScores)) {
    if (val === 1) dealbreakers.push(labels[key] || key);
  }

  let verdict: "recommend" | "conditional" | "pass";
  if (dealbreakers.length > 0) {
    verdict = "pass";
  } else if (total >= 35) {
    verdict = "recommend";
  } else if (total >= 25) {
    verdict = "conditional";
  } else {
    verdict = "pass";
  }

  return {
    scores: finalScores,
    evidence: evidence || {},
    total,
    verdict,
    dealbreakers,
    test_method: String(parsed.test_method || "Landing page + waitlist"),
    budget_timeline: String(parsed.budget_timeline || "$100-200, 1-2 weeks"),
  };
}

export async function evaluateMarketReadiness(
  ideaOrId: IdeaBrowserIdea | string
): Promise<MarketReadinessScorecard> {
  const idea = typeof ideaOrId === "string" ? getIdeaBrowserIdea(ideaOrId) : ideaOrId;
  if (!idea) throw new Error(`Idea not found: ${ideaOrId}`);

  const hasConnections = getAllActiveLLMConnections().length > 0;
  if (!hasConnections) {
    // Deterministic fallback — derive from existing scores
    return buildDeterministicScorecard(idea);
  }

  const prompt = buildScorecardPrompt(idea);

  try {
    const { text: raw } = await callLLMWithFallback(prompt, {
      temperature: 0.3,
      maxTokens: 3000,
    });

    const result = parseScorecardResponse(raw);
    if (!result) {
      console.warn("[Scorecard] Failed to parse LLM response — using deterministic fallback");
      return buildDeterministicScorecard(idea);
    }
    return result;
  } catch (error) {
    console.error("[Scorecard] LLM failed:", error);
    return buildDeterministicScorecard(idea);
  }
}

function buildDeterministicScorecard(idea: IdeaBrowserIdea): MarketReadinessScorecard {
  // Derive 1-5 scores from existing 0-100 or 1-10 scores
  const to5 = (v100: number) => Math.max(1, Math.min(5, Math.round(v100 / 20)));
  const to5from10 = (v10: number) => Math.max(1, Math.min(5, Math.round(v10 / 2)));

  const scores = {
    demand_signals: to5(idea.search_volume_score || 0),
    pain_severity: to5(idea.pain_level_score || 0),
    willingness_to_pay: to5(idea.revenue_potential_score || 0),
    competition_landscape: to5from10(idea.opportunity_score || 5),
    speed_to_mvp: to5(idea.feasibility_score || 0),
    channel_clarity: to5from10(idea.gtm_score || 5),
    unit_economics: to5(idea.revenue_potential_score || 0),
    timing_signal: to5from10(idea.why_now_score || 5),
    market_size: to5(idea.revenue_potential_score || 0),
    founder_advantage: to5from10(idea.opportunity_score || 5),
  };

  const total = Object.values(scores).reduce((sum, v) => sum + v, 0);
  const dealbreakers = Object.entries(scores)
    .filter(([, v]) => v === 1)
    .map(([k]) => k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));

  let verdict: "recommend" | "conditional" | "pass";
  if (dealbreakers.length > 0) verdict = "pass";
  else if (total >= 35) verdict = "recommend";
  else if (total >= 25) verdict = "conditional";
  else verdict = "pass";

  return {
    scores,
    evidence: { _note: "Deterministic estimate — run AI evaluation for detailed evidence" },
    total,
    verdict,
    dealbreakers,
    test_method: "Landing page + waitlist on targeted subreddit",
    budget_timeline: "$100-200, 1-2 weeks (estimated)",
  };
}

export function saveScorecardResult(ideaId: string, sc: MarketReadinessScorecard): void {
  getDb().prepare(`
    UPDATE ideabrowser_ideas
    SET sc_demand_signals = ?, sc_pain_severity = ?, sc_willingness_to_pay = ?,
        sc_competition_landscape = ?, sc_speed_to_mvp = ?, sc_channel_clarity = ?,
        sc_unit_economics = ?, sc_timing_signal = ?, sc_market_size = ?,
        sc_founder_advantage = ?, sc_total = ?, sc_verdict = ?,
        sc_evidence = ?, sc_test_method = ?, sc_budget_timeline = ?,
        sc_dealbreakers = ?, sc_evaluated_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    sc.scores.demand_signals, sc.scores.pain_severity, sc.scores.willingness_to_pay,
    sc.scores.competition_landscape, sc.scores.speed_to_mvp, sc.scores.channel_clarity,
    sc.scores.unit_economics, sc.scores.timing_signal, sc.scores.market_size,
    sc.scores.founder_advantage, sc.total, sc.verdict,
    JSON.stringify(sc.evidence), sc.test_method, sc.budget_timeline,
    JSON.stringify(sc.dealbreakers), ideaId
  );
}

// ─── Google Trends Chart Data ─────────────────────────────────────────────────
// Fetches real Google Trends time-series data and saves it to google_trends_data
// for the SVG chart on the frontend. Uses the primary keyword from keyword_terms.

export async function fetchAndSaveGoogleTrendsChart(ideaId: string): Promise<boolean> {
  const idea = getIdeaBrowserIdea(ideaId);
  if (!idea) return false;

  const searchTerm = extractPrimaryKeyword(idea);
  const data = await fetchGoogleTrendsTimeSeries(searchTerm);

  if (data.length > 0) {
    getDb().prepare(
      "UPDATE ideabrowser_ideas SET google_trends_data = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(data), ideaId);
    // Compute real trends stats from the time-series and overwrite LLM-fabricated
    // "Cannot access live Google Trends data" values in community_signals.
    applyRealTrendsStats(ideaId, searchTerm, data);
    return true;
  }
  return false;
}

// Compute current_interest, yoy_growth_percent, and trajectory from real series data,
// then patch them into community_signals.google_trends.primary_keyword and the
// legacy `other.count / label` so the UI shows real numbers instead of the LLM's
// "Cannot access" disclaimer.
function applyRealTrendsStats(ideaId: string, searchTerm: string, series: number[]): void {
  if (!series.length) return;
  const current = series[series.length - 1] || 0;

  // YoY growth: compare last 4 points to same 4 points 52 weeks ago if available,
  // else first 4 vs last 4.
  const n = series.length;
  const latest4 = series.slice(-4);
  const prior4 = n >= 56 ? series.slice(n - 56, n - 52) : series.slice(0, 4);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  const now = avg(latest4);
  const then = avg(prior4);
  const yoy = then > 0 ? Math.round(((now - then) / then) * 100) : 0;

  // Trajectory: compare last 13 weeks to prior 13 weeks
  const last13 = series.slice(-13);
  const prior13 = n >= 26 ? series.slice(n - 26, n - 13) : [];
  const last13Avg = avg(last13);
  const prior13Avg = prior13.length ? avg(prior13) : last13Avg;
  let trajectory: string;
  const peak = Math.max(...series);
  if (last13Avg >= peak * 0.9 && last13Avg > prior13Avg * 1.2) trajectory = "breakout";
  else if (last13Avg > prior13Avg * 1.1) trajectory = "rising";
  else if (last13Avg < prior13Avg * 0.9) trajectory = "declining";
  else trajectory = "stable";

  const row = getDb().prepare("SELECT community_signals FROM ideabrowser_ideas WHERE id = ?").get(ideaId) as { community_signals: string | null } | undefined;
  if (!row?.community_signals) return;
  let signals: Record<string, unknown>;
  try { signals = JSON.parse(row.community_signals); } catch { return; }

  const url = `https://trends.google.com/trends/explore?q=${encodeURIComponent(searchTerm)}&date=today%205-y&geo=US`;

  // Patch legacy flat keys
  if (signals.other && typeof signals.other === "object") {
    (signals.other as Record<string, unknown>).count = current;
    (signals.other as Record<string, unknown>).label = `Interest: ${current}/100`;
    (signals.other as Record<string, unknown>).url = url;
  }
  // Patch v2 rich keys
  const v2 = signals._v2 as Record<string, unknown> | undefined;
  if (v2 && typeof v2 === "object") {
    v2.google_trends = {
      primary_keyword: {
        term: searchTerm,
        url,
        current_interest: current,
        yoy_growth_percent: yoy,
        trajectory,
      },
      related_rising_queries: (v2.google_trends as Record<string, unknown>)?.related_rising_queries || [],
      comparison_url: (v2.google_trends as Record<string, unknown>)?.comparison_url || null,
    };
  }

  getDb().prepare(
    "UPDATE ideabrowser_ideas SET community_signals = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(signals), ideaId);
}

function extractPrimaryKeyword(idea: IdeaBrowserIdea): string {
  // Try to get the primary keyword from keyword_terms JSON
  if (idea.keyword_terms) {
    try {
      const kw = JSON.parse(idea.keyword_terms);
      if (Array.isArray(kw) && kw[0]?.term) return kw[0].term;
    } catch { /* fall through */ }
  }

  // Extract the core concept from the title
  let term = idea.title
    .replace(/^(AI[- ]Powered |AI |An |A |The )/i, "")
    .replace(/\s*\([^)]*\)\s*/g, "")
    .replace(/\s*[-–—].*$/, "")
    .trim();

  const words = term.split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 4) term = words.slice(0, 4).join(" ");

  return term || idea.category || "startup";
}

async function fetchGoogleTrendsTimeSeries(keyword: string): Promise<number[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = await import(/* webpackIgnore: true */ "google-trends-api" as string) as any;
    const googleTrends = mod.default || mod;

    const result = await googleTrends.interestOverTime({
      keyword,
      startTime: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000),
      geo: "",
      granularTimeResolution: false,
    });

    const parsed = JSON.parse(result);
    if (!parsed?.default?.timelineData) return [];

    return parsed.default.timelineData.map(
      (point: { value: number[] }) => point.value[0]
    );
  } catch (err) {
    console.error(`Google Trends fetch failed for "${keyword}":`, err instanceof Error ? err.message : err);
    return [];
  }
}
