// ─── IdeaBrowser.com Scraper ──────────────────────────────────────────────────
//
// Server-side scraper that fetches IdeaBrowser.com pages and extracts idea data.
// Handles rate-limiting (429) with exponential backoff and browser-like headers.
// Returns structured idea objects ready for bulkImportIdeaBrowserIdeas().
//

export interface ScrapedIdea {
  title: string;
  description?: string;
  source_url?: string;
  category?: string;
  tags?: string;
  search_volume?: string;
  growth_rate?: string;
  pain_level?: string;
  feasibility?: string;
  founder_fit?: string;
  revenue_potential?: string;
  execution_difficulty?: string;
  go_to_market?: string;
  pricing?: string;
  target_market?: string;
  competition?: string;
  raw_data?: string;
  sync_status?: string;
}

const IDEABROWSER_URLS = [
  "https://www.ideabrowser.com/idea-of-the-day",
  "https://www.ideabrowser.com/database",
  "https://www.ideabrowser.com/top-ideas",
];

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function scrapeIdeaBrowser(): Promise<{
  ideas: ScrapedIdea[];
  errors: string[];
}> {
  const allIdeas: ScrapedIdea[] = [];
  const errors: string[] = [];

  for (const url of IDEABROWSER_URLS) {
    try {
      const html = await fetchWithBackoff(url);
      if (!html) {
        errors.push(`Cannot access ${url} — site has bot protection enabled. Use manual import (paste ideas as JSON) instead of auto-sync.`);
        continue;
      }

      const ideas = extractIdeasFromHtml(html, url);
      if (ideas.length === 0) {
        errors.push(`No ideas extracted from ${url}`);
      }
      allIdeas.push(...ideas);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error scraping ${url}: ${msg}`);
    }
  }

  // Deduplicate by normalized title
  const seen = new Map<string, ScrapedIdea>();
  for (const idea of allIdeas) {
    const key = idea.title.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, idea);
    }
  }

  return {
    ideas: Array.from(seen.values()),
    errors,
  };
}

// ─── Fetch with Exponential Backoff ──────────────────────────────────────────

async function fetchWithBackoff(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: BROWSER_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        return await response.text();
      }

      // Detect Vercel bot challenge — no point retrying
      const challengeToken = response.headers.get("x-vercel-challenge-token");
      const mitigated = response.headers.get("x-vercel-mitigated");
      if (challengeToken || mitigated === "challenge") {
        console.error(`IdeaBrowser scraper: ${url} blocked by Vercel bot protection (challenge required). Use manual import instead.`);
        return null;
      }

      if (response.status === 429 || response.status >= 500) {
        // Rate limited or server error — back off and retry
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        await sleep(delay + jitter);
        continue;
      }

      // Client error (4xx other than 429) — don't retry
      console.error(`IdeaBrowser scraper: ${url} returned ${response.status}`);
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`IdeaBrowser scraper attempt ${attempt + 1} for ${url}: ${msg}`);

      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── HTML Parsing / Extraction ───────────────────────────────────────────────

function extractIdeasFromHtml(html: string, sourceUrl: string): ScrapedIdea[] {
  const ideas: ScrapedIdea[] = [];

  // Strategy 1: Look for JSON-LD or embedded JSON data (common in modern sites)
  const jsonLdIdeas = extractFromJsonLd(html, sourceUrl);
  if (jsonLdIdeas.length > 0) {
    ideas.push(...jsonLdIdeas);
  }

  // Strategy 2: Look for Next.js / React hydration data (__NEXT_DATA__ or similar)
  const hydrationIdeas = extractFromHydrationData(html, sourceUrl);
  if (hydrationIdeas.length > 0) {
    ideas.push(...hydrationIdeas);
  }

  // Strategy 3: Parse card-based structures (common patterns on idea listing sites)
  const cardIdeas = extractFromCards(html, sourceUrl);
  if (cardIdeas.length > 0) {
    ideas.push(...cardIdeas);
  }

  // Strategy 4: Parse heading + paragraph structures
  const headingIdeas = extractFromHeadings(html, sourceUrl);
  if (headingIdeas.length > 0) {
    ideas.push(...headingIdeas);
  }

  return ideas;
}

// ─── Strategy 1: JSON-LD / Embedded JSON ─────────────────────────────────────

function extractFromJsonLd(html: string, sourceUrl: string): ScrapedIdea[] {
  const ideas: ScrapedIdea[] = [];

  // Match <script type="application/ld+json">...</script>
  const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.name || item.headline) {
          ideas.push({
            title: String(item.name || item.headline),
            description: item.description ? String(item.description) : undefined,
            source_url: sourceUrl,
            category: item.category ? String(item.category) : undefined,
            raw_data: JSON.stringify(item),
            sync_status: "scraped",
          });
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }

  return ideas;
}

// ─── Strategy 2: Next.js / React Hydration Data ─────────────────────────────

function extractFromHydrationData(html: string, sourceUrl: string): ScrapedIdea[] {
  const ideas: ScrapedIdea[] = [];

  // __NEXT_DATA__ pattern
  const nextDataMatch = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const props = nextData?.props?.pageProps;
      if (props) {
        const ideaArrays = findIdeaArrays(props);
        for (const arr of ideaArrays) {
          for (const item of arr) {
            const idea = mapObjectToIdea(item, sourceUrl);
            if (idea) ideas.push(idea);
          }
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // Generic embedded JSON data patterns
  const embeddedJsonPattern =
    /(?:window\.__(?:DATA|STATE|PROPS|INITIAL)__|data-props|data-page)=["']?(\{[\s\S]*?\})["']?[;\s<]/gi;
  let emMatch: RegExpExecArray | null;

  while ((emMatch = embeddedJsonPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(emMatch[1]);
      const ideaArrays = findIdeaArrays(data);
      for (const arr of ideaArrays) {
        for (const item of arr) {
          const idea = mapObjectToIdea(item, sourceUrl);
          if (idea) ideas.push(idea);
        }
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return ideas;
}

// Recursively find arrays of objects that look like ideas
function findIdeaArrays(obj: unknown, depth: number = 0): Array<Record<string, unknown>[]> {
  if (depth > 6 || !obj || typeof obj !== "object") return [];

  const results: Array<Record<string, unknown>[]> = [];

  if (Array.isArray(obj)) {
    // Check if this array contains idea-like objects
    const ideaLike = obj.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        (hasKey(item, "title") || hasKey(item, "name") || hasKey(item, "headline"))
    );
    if (ideaLike.length > 0) {
      results.push(ideaLike as Record<string, unknown>[]);
    }
  } else {
    for (const value of Object.values(obj as Record<string, unknown>)) {
      results.push(...findIdeaArrays(value, depth + 1));
    }
  }

  return results;
}

function hasKey(obj: unknown, key: string): boolean {
  return typeof obj === "object" && obj !== null && key in obj;
}

function mapObjectToIdea(
  item: Record<string, unknown>,
  sourceUrl: string
): ScrapedIdea | null {
  const title = String(item.title || item.name || item.headline || "").trim();
  if (!title) return null;

  return {
    title,
    description: item.description
      ? String(item.description)
      : item.summary
        ? String(item.summary)
        : item.excerpt
          ? String(item.excerpt)
          : undefined,
    source_url: sourceUrl,
    category: item.category ? String(item.category) : item.vertical ? String(item.vertical) : undefined,
    tags: item.tags
      ? Array.isArray(item.tags)
        ? item.tags.join(", ")
        : String(item.tags)
      : undefined,
    search_volume: extractMetric(item, ["search_volume", "searchVolume", "volume"]),
    growth_rate: extractMetric(item, ["growth_rate", "growthRate", "growth", "trend"]),
    pain_level: extractMetric(item, ["pain_level", "painLevel", "pain", "pain_score"]),
    feasibility: extractMetric(item, ["feasibility", "feasibility_score"]),
    founder_fit: extractMetric(item, ["founder_fit", "founderFit", "fit"]),
    revenue_potential: extractMetric(item, [
      "revenue_potential",
      "revenuePotential",
      "revenue",
      "market_size",
      "marketSize",
    ]),
    execution_difficulty: extractMetric(item, [
      "execution_difficulty",
      "executionDifficulty",
      "difficulty",
    ]),
    go_to_market: item.go_to_market
      ? String(item.go_to_market)
      : item.goToMarket
        ? String(item.goToMarket)
        : item.gtm
          ? String(item.gtm)
          : undefined,
    pricing: item.pricing ? String(item.pricing) : item.price ? String(item.price) : undefined,
    target_market: item.target_market
      ? String(item.target_market)
      : item.targetMarket
        ? String(item.targetMarket)
        : item.audience
          ? String(item.audience)
          : undefined,
    competition: item.competition
      ? String(item.competition)
      : item.competitors
        ? String(item.competitors)
        : undefined,
    raw_data: JSON.stringify(item),
    sync_status: "scraped",
  };
}

function extractMetric(
  item: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null) {
      return String(item[key]);
    }
  }
  return undefined;
}

// ─── Strategy 3: Card-based Structures ───────────────────────────────────────

function extractFromCards(html: string, sourceUrl: string): ScrapedIdea[] {
  const ideas: ScrapedIdea[] = [];

  // Match common card patterns: divs/articles/sections with class containing "card", "idea", "item"
  const cardPattern =
    /<(?:div|article|section|li)[^>]*class=["'][^"']*(?:card|idea|item|listing|entry)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|section|li)>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardPattern.exec(html)) !== null) {
    const cardHtml = match[1];
    const idea = parseCardContent(cardHtml, sourceUrl);
    if (idea) {
      ideas.push(idea);
    }
  }

  return ideas;
}

function parseCardContent(cardHtml: string, sourceUrl: string): ScrapedIdea | null {
  // Extract title from h1-h4 or elements with title/heading class
  const titleMatch =
    cardHtml.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i) ||
    cardHtml.match(/<[^>]*class=["'][^"']*(?:title|heading|name)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);

  if (!titleMatch) return null;

  const title = stripHtml(titleMatch[1] || titleMatch[2] || "").trim();
  if (!title || title.length < 3 || title.length > 200) return null;

  // Extract description from p tags or description class
  const descMatch =
    cardHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i) ||
    cardHtml.match(
      /<[^>]*class=["'][^"']*(?:desc|description|summary|excerpt|body)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
    );
  const description = descMatch ? stripHtml(descMatch[1] || descMatch[2] || "").trim() : undefined;

  // Extract category from badge/tag/category class elements
  const categoryMatch = cardHtml.match(
    /<[^>]*class=["'][^"']*(?:category|badge|tag|label|vertical)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
  );
  const category = categoryMatch ? stripHtml(categoryMatch[1]).trim() : undefined;

  // Extract metrics from common display patterns
  const metrics = extractMetricsFromHtml(cardHtml);

  // Extract link if present
  const linkMatch = cardHtml.match(/<a[^>]*href=["']([^"']+)["']/i);
  const ideaUrl = linkMatch
    ? linkMatch[1].startsWith("http")
      ? linkMatch[1]
      : `https://www.ideabrowser.com${linkMatch[1]}`
    : sourceUrl;

  return {
    title,
    description: description || undefined,
    source_url: ideaUrl,
    category: category || undefined,
    ...metrics,
    sync_status: "scraped",
  };
}

function extractMetricsFromHtml(html: string): Partial<ScrapedIdea> {
  const metrics: Partial<ScrapedIdea> = {};

  // Pattern: "Label: Value" or "Label Value" near metric-related text
  const metricPatterns: Array<{ pattern: RegExp; field: keyof ScrapedIdea }> = [
    { pattern: /search\s*volume[:\s]*([^<,\n]+)/i, field: "search_volume" },
    { pattern: /growth(?:\s*rate)?[:\s]*([^<,\n]+)/i, field: "growth_rate" },
    { pattern: /pain(?:\s*level)?[:\s]*([^<,\n]+)/i, field: "pain_level" },
    { pattern: /feasibility[:\s]*([^<,\n]+)/i, field: "feasibility" },
    { pattern: /founder\s*fit[:\s]*([^<,\n]+)/i, field: "founder_fit" },
    { pattern: /revenue(?:\s*potential)?[:\s]*([^<,\n]+)/i, field: "revenue_potential" },
    { pattern: /(?:execution\s*)?difficulty[:\s]*([^<,\n]+)/i, field: "execution_difficulty" },
    { pattern: /(?:go[\s-]to[\s-]market|gtm)[:\s]*([^<,\n]+)/i, field: "go_to_market" },
    { pattern: /pricing[:\s]*([^<,\n]+)/i, field: "pricing" },
    { pattern: /target\s*(?:market|audience)[:\s]*([^<,\n]+)/i, field: "target_market" },
    { pattern: /competition[:\s]*([^<,\n]+)/i, field: "competition" },
  ];

  for (const { pattern, field } of metricPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const value = stripHtml(match[1]).trim();
      if (value && value.length < 200) {
        (metrics as Record<string, string>)[field] = value;
      }
    }
  }

  // Extract tags from tag-list or tag elements
  const tagMatches: string[] = [];
  const tagPattern =
    /<[^>]*class=["'][^"']*(?:tag(?!-)|chip|pill|keyword)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagPattern.exec(html)) !== null) {
    const tag = stripHtml(tagMatch[1]).trim();
    if (tag && tag.length < 50) tagMatches.push(tag);
  }
  if (tagMatches.length > 0) {
    metrics.tags = tagMatches.join(", ");
  }

  return metrics;
}

// ─── Strategy 4: Heading + Paragraph Structures ──────────────────────────────

function extractFromHeadings(html: string, sourceUrl: string): ScrapedIdea[] {
  const ideas: ScrapedIdea[] = [];

  // Look for h2/h3 followed by paragraph content — common for "idea of the day" pages
  const headingPattern =
    /<h[23][^>]*>([\s\S]*?)<\/h[23]>\s*(?:<[^>]*>)*\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(html)) !== null) {
    const title = stripHtml(match[1]).trim();
    const description = stripHtml(match[2]).trim();

    // Filter out navigation, footer, and generic headings
    if (
      !title ||
      title.length < 5 ||
      title.length > 200 ||
      isNavigationText(title)
    ) {
      continue;
    }

    ideas.push({
      title,
      description: description || undefined,
      source_url: sourceUrl,
      sync_status: "scraped",
    });
  }

  return ideas;
}

function isNavigationText(text: string): boolean {
  const navTerms = [
    "menu",
    "navigation",
    "footer",
    "copyright",
    "privacy",
    "terms",
    "sign in",
    "sign up",
    "log in",
    "register",
    "subscribe",
    "contact us",
    "about us",
    "faq",
    "help",
  ];
  const lower = text.toLowerCase();
  return navTerms.some((term) => lower === term || lower.startsWith(term + " "));
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
