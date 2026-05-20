import { NextRequest, NextResponse } from "next/server";
import { getDb, getIdeaBrowserIdeas } from "@/lib/db";

// Fetch real Google Trends data for IdeaBrowser ideas
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const ideaId = body.ideaId as string | undefined;
    const keyword = body.keyword as string | undefined;

    // If a specific keyword is provided, fetch just that
    if (keyword) {
      const data = await fetchGoogleTrends(keyword);
      return NextResponse.json({ keyword, data });
    }

    // If an ideaId is provided, fetch trends for that idea's keywords
    if (ideaId) {
      const idea = getDb().prepare("SELECT title, category, keyword_terms FROM ideabrowser_ideas WHERE id = ?").get(ideaId) as { title: string; category: string | null; keyword_terms: string | null } | undefined;
      if (!idea) return NextResponse.json({ error: "Idea not found" }, { status: 404 });

      const searchTerm = extractSearchTerm(idea);
      const data = await fetchGoogleTrends(searchTerm);

      if (data.length > 0) {
        getDb().prepare("UPDATE ideabrowser_ideas SET google_trends_data = ?, updated_at = datetime('now') WHERE id = ?")
          .run(JSON.stringify(data), ideaId);
      }

      return NextResponse.json({ keyword: searchTerm, data, ideaId, updated: data.length > 0 });
    }

    // Bulk mode: fetch trends for all ideas that don't have google_trends_data
    const ideas = getDb().prepare(
      "SELECT id, title, category, keyword_terms FROM ideabrowser_ideas WHERE google_trends_data IS NULL OR google_trends_data = '' ORDER BY idea_date DESC LIMIT 20"
    ).all() as { id: string; title: string; category: string | null; keyword_terms: string | null }[];

    let updated = 0;
    const errors: string[] = [];

    for (const idea of ideas) {
      try {
        const searchTerm = extractSearchTerm(idea);
        const data = await fetchGoogleTrends(searchTerm);

        if (data.length > 0) {
          getDb().prepare("UPDATE ideabrowser_ideas SET google_trends_data = ?, updated_at = datetime('now') WHERE id = ?")
            .run(JSON.stringify(data), idea.id);
          updated++;
        }

        // Rate limit: wait 1.5s between requests to avoid Google blocking
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        errors.push(`${idea.title}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      total: ideas.length,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("POST /api/ideabrowser/google-trends error:", error);
    return NextResponse.json({ error: "Failed to fetch trends" }, { status: 500 });
  }
}

function extractSearchTerm(idea: { title: string; category: string | null; keyword_terms: string | null }): string {
  // Try to get the primary keyword from keyword_terms JSON
  if (idea.keyword_terms) {
    try {
      const kw = JSON.parse(idea.keyword_terms);
      if (Array.isArray(kw) && kw[0]?.term) return kw[0].term;
    } catch { /* fall through */ }
  }

  // Extract the core concept from the title (remove common prefixes/suffixes)
  let term = idea.title
    .replace(/^(AI[- ]Powered |AI |An |A |The )/i, '')
    .replace(/\s*\([^)]*\)\s*/g, '') // remove parenthetical
    .replace(/\s*[-–—].*$/, '') // remove everything after dash
    .trim();

  // If still too long, take first 4 meaningful words
  const words = term.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 4) term = words.slice(0, 4).join(' ');

  return term || idea.category || 'startup';
}

async function fetchGoogleTrends(keyword: string): Promise<number[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = await import(/* webpackIgnore: true */ 'google-trends-api' as string) as any;
    const googleTrends = mod.default || mod;

    const result = await googleTrends.interestOverTime({
      keyword,
      startTime: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000), // 3 years ago
      geo: '', // worldwide
      granularTimeResolution: false,
    });

    const parsed = JSON.parse(result);
    if (!parsed?.default?.timelineData) return [];

    const values: number[] = parsed.default.timelineData.map(
      (point: { value: number[] }) => point.value[0]
    );

    return values;
  } catch (err) {
    console.error(`Google Trends fetch failed for "${keyword}":`, err instanceof Error ? err.message : err);
    return [];
  }
}
