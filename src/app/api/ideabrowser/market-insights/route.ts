import { NextResponse } from "next/server";
import { getIdeaBrowserMarketInsights, getIdeaBrowserIdeas, getIdeaBrowserCategories } from "@/lib/db";

export async function GET() {
  try {
    const insights = getIdeaBrowserMarketInsights();
    if (insights.length > 0) {
      return NextResponse.json(insights);
    }

    const ideas = getIdeaBrowserIdeas();
    if (ideas.length === 0) {
      return NextResponse.json([]);
    }

    const categories = getIdeaBrowserCategories();
    const generated: Array<Record<string, unknown>> = [];

    // 1. Category opportunity insights (top categories with real scores)
    const catIdeas: Record<string, typeof ideas> = {};
    for (const idea of ideas) {
      const cat = idea.category || "Other";
      if (!catIdeas[cat]) catIdeas[cat] = [];
      catIdeas[cat].push(idea);
    }

    for (const cat of categories.slice(0, 4)) {
      const catList = catIdeas[cat.category] || [];
      const avgOverall = catList.length > 0
        ? Math.round(catList.reduce((s, i) => s + (i.overall_score || 0), 0) / catList.length)
        : 0;
      const avgPain = catList.length > 0
        ? Math.round(catList.reduce((s, i) => s + (i.pain_level_score || 0), 0) / catList.length)
        : 0;
      const avgRevenue = catList.length > 0
        ? Math.round(catList.reduce((s, i) => s + (i.revenue_potential_score || 0), 0) / catList.length)
        : 0;

      // Build sparkline from actual per-idea scores
      const sparkline = catList
        .sort((a, b) => (a.imported_at || "").localeCompare(b.imported_at || ""))
        .map((i) => i.overall_score || 0);

      generated.push({
        id: `insight-cat-${cat.category}`,
        title: `${cat.category} Opportunity`,
        description: `${cat.count} ideas tracked. Avg pain: ${avgPain}/100, Avg revenue potential: ${avgRevenue}/100.`,
        category: cat.category,
        metric_label: "Avg Score",
        metric_value: `${avgOverall}/100`,
        trend_direction: avgOverall > 60 ? "up" : avgOverall > 40 ? "flat" : "down",
        source: "ideabrowser",
        sparkline_data: JSON.stringify(sparkline.length >= 2 ? sparkline : [avgOverall]),
        created_at: new Date().toISOString(),
      });
    }

    // 2. Highest-pain ideas
    const highPain = [...ideas].filter((i) => i.pain_level_score > 0).sort((a, b) => (b.pain_level_score || 0) - (a.pain_level_score || 0));
    if (highPain.length > 0) {
      const top = highPain[0];
      generated.push({
        id: "insight-pain",
        title: "Highest Pain Point",
        description: `"${top.title}" — Pain score ${top.pain_level_score}/100. Strong signal for urgent problem-solving.`,
        category: top.category,
        metric_label: "Pain Level",
        metric_value: `${top.pain_level_score}/100`,
        trend_direction: "up",
        source: "ideabrowser",
        sparkline_data: JSON.stringify(highPain.slice(0, 10).map((i) => i.pain_level_score || 0)),
        created_at: new Date().toISOString(),
      });
    }

    // 3. Most feasible ideas
    const highFeas = [...ideas].filter((i) => i.feasibility_score > 0).sort((a, b) => (b.feasibility_score || 0) - (a.feasibility_score || 0));
    if (highFeas.length > 0) {
      const top = highFeas[0];
      generated.push({
        id: "insight-feasibility",
        title: "Easiest to Build",
        description: `"${top.title}" — Feasibility ${top.feasibility_score}/100. Low barrier to entry, fast time-to-market.`,
        category: top.category,
        metric_label: "Feasibility",
        metric_value: `${top.feasibility_score}/100`,
        trend_direction: "up",
        source: "ideabrowser",
        sparkline_data: JSON.stringify(highFeas.slice(0, 10).map((i) => i.feasibility_score || 0)),
        created_at: new Date().toISOString(),
      });
    }

    // 4. Revenue leaders
    const highRev = [...ideas].filter((i) => i.revenue_potential_score > 0).sort((a, b) => (b.revenue_potential_score || 0) - (a.revenue_potential_score || 0));
    if (highRev.length > 0) {
      const top = highRev[0];
      generated.push({
        id: "insight-revenue",
        title: "Top Revenue Potential",
        description: `"${top.title}" — Revenue potential ${top.revenue_potential_score}/100. High monetization opportunity.`,
        category: top.category,
        metric_label: "Revenue",
        metric_value: `${top.revenue_potential_score}/100`,
        trend_direction: "up",
        source: "ideabrowser",
        sparkline_data: JSON.stringify(highRev.slice(0, 10).map((i) => i.revenue_potential_score || 0)),
        created_at: new Date().toISOString(),
      });
    }

    // 5. Overall portfolio health
    const scoredIdeas = ideas.filter((i) => i.overall_score > 0);
    if (scoredIdeas.length > 0) {
      const avgAll = Math.round(scoredIdeas.reduce((s, i) => s + i.overall_score, 0) / scoredIdeas.length);
      generated.push({
        id: "insight-portfolio",
        title: "Portfolio Health",
        description: `${scoredIdeas.length} of ${ideas.length} ideas scored. Average: ${avgAll}/100. ${avgAll > 60 ? "Strong portfolio." : avgAll > 40 ? "Moderate potential." : "Needs better ideas."}`,
        category: null,
        metric_label: "Scored Ideas",
        metric_value: `${scoredIdeas.length}/${ideas.length}`,
        trend_direction: avgAll > 50 ? "up" : "flat",
        source: "ideabrowser",
        sparkline_data: JSON.stringify(scoredIdeas.slice(0, 20).map((i) => i.overall_score)),
        created_at: new Date().toISOString(),
      });
    }

    return NextResponse.json(generated);
  } catch (error) {
    console.error("GET /api/ideabrowser/market-insights error:", error);
    return NextResponse.json({ error: "Failed to fetch market insights" }, { status: 500 });
  }
}
