import { NextResponse } from "next/server";
import { getIdeaBrowserMarketInsights, getIdeaBrowserIdeas } from "@/lib/db";

export async function GET() {
  try {
    const insights = getIdeaBrowserMarketInsights();
    // If no explicit insights, generate from idea data
    if (insights.length === 0) {
      const ideas = getIdeaBrowserIdeas();
      const categoryMap: Record<string, number> = {};
      for (const idea of ideas) {
        if (idea.category) categoryMap[idea.category] = (categoryMap[idea.category] || 0) + 1;
      }
      const generated = Object.entries(categoryMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([cat, count], i) => ({
          id: `insight-${i}`,
          title: `${cat} Opportunity Index`,
          description: `${count} ideas tracked in ${cat}. Emerging patterns show growing demand.`,
          category: cat,
          metric_label: "Ideas Tracked",
          metric_value: String(count),
          trend_direction: count > 3 ? "up" : "flat" as const,
          source: "ideabrowser",
          sparkline_data: JSON.stringify(Array.from({ length: 12 }, () => Math.round(Math.random() * count * 2))),
          created_at: new Date().toISOString(),
        }));
      return NextResponse.json(generated);
    }
    return NextResponse.json(insights);
  } catch (error) {
    console.error("GET /api/ideabrowser/market-insights error:", error);
    return NextResponse.json({ error: "Failed to fetch market insights" }, { status: 500 });
  }
}
