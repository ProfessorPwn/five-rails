import { NextResponse } from "next/server";
import { getIdeaBrowserTrends, getIdeaBrowserCategories, getIdeaBrowserIdeas } from "@/lib/db";

export async function GET() {
  try {
    const trends = getIdeaBrowserTrends();
    if (trends.length > 0) {
      return NextResponse.json(trends);
    }

    // Generate real trends from actual idea data
    const ideas = getIdeaBrowserIdeas();
    const categories = getIdeaBrowserCategories();

    if (ideas.length === 0) {
      return NextResponse.json([]);
    }

    // Group ideas by category and compute real stats
    const catIdeas: Record<string, typeof ideas> = {};
    for (const idea of ideas) {
      const cat = idea.category || "Other";
      if (!catIdeas[cat]) catIdeas[cat] = [];
      catIdeas[cat].push(idea);
    }

    // Build trends from real data
    const generated = categories.slice(0, 12).map((cat, i) => {
      const catList = catIdeas[cat.category] || [];

      // Calculate average scores for this category
      const avgOverall = catList.length > 0
        ? Math.round(catList.reduce((sum, idea) => sum + (idea.overall_score || 0), 0) / catList.length)
        : 0;
      const avgPain = catList.length > 0
        ? Math.round(catList.reduce((sum, idea) => sum + (idea.pain_level_score || 0), 0) / catList.length)
        : 0;
      const avgRevenue = catList.length > 0
        ? Math.round(catList.reduce((sum, idea) => sum + (idea.revenue_potential_score || 0), 0) / catList.length)
        : 0;

      // Growth is based on how many ideas appeared in this category (more = trending)
      const growthPct = Math.round((cat.count / ideas.length) * 100 * 3);

      // Build sparkline from per-idea overall scores (sorted by date)
      const sparkline = catList
        .sort((a, b) => (a.imported_at || "").localeCompare(b.imported_at || ""))
        .map((idea) => idea.overall_score || avgOverall || 50);

      return {
        id: `trend-${i}`,
        title: cat.category,
        category: cat.category,
        growth_pct: growthPct,
        sparkline_data: JSON.stringify(sparkline.length >= 2 ? sparkline : [avgOverall, avgOverall]),
        search_volume: avgPain + avgRevenue,
        timeframe: "all-time",
        source: "ideabrowser",
        avg_overall: avgOverall,
        avg_pain: avgPain,
        avg_revenue: avgRevenue,
        idea_count: cat.count,
        created_at: new Date().toISOString(),
      };
    });

    return NextResponse.json(generated);
  } catch (error) {
    console.error("GET /api/ideabrowser/trends error:", error);
    return NextResponse.json({ error: "Failed to fetch trends" }, { status: 500 });
  }
}
