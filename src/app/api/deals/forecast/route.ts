import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const STAGE_PROBABILITY: Record<string, number> = {
  lead: 0.05,
  contacted: 0.10,
  qualified: 0.25,
  proposal: 0.50,
  negotiation: 0.75,
  won: 1.0,
  lost: 0,
};

export async function GET() {
  try {
    const deals = getDb().prepare(
      "SELECT stage, value, expected_close FROM deals WHERE stage NOT IN ('won', 'lost')"
    ).all() as { stage: string; value: number; expected_close: string | null }[];

    const wonDeals = getDb().prepare(
      "SELECT SUM(value) as total, COUNT(*) as count FROM deals WHERE stage = 'won'"
    ).get() as { total: number | null; count: number };

    const lostDeals = getDb().prepare(
      "SELECT COUNT(*) as count FROM deals WHERE stage = 'lost'"
    ).get() as { count: number };

    // Weighted forecast
    const weightedTotal = deals.reduce(
      (sum, d) => sum + (d.value || 0) * (STAGE_PROBABILITY[d.stage] || 0),
      0
    );

    // Best case (everything converts)
    const bestCase = deals.reduce((sum, d) => sum + (d.value || 0), 0);

    // By stage breakdown
    const byStage = Object.entries(STAGE_PROBABILITY)
      .filter(([s]) => s !== "won" && s !== "lost")
      .map(([stage, prob]) => {
        const stageDeals = deals.filter(d => d.stage === stage);
        const raw = stageDeals.reduce((s, d) => s + (d.value || 0), 0);
        return {
          stage,
          probability: prob,
          deal_count: stageDeals.length,
          raw_value: raw,
          weighted_value: Math.round(raw * prob),
        };
      });

    // Deals closing this month
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    const closingThisMonth = deals.filter(d =>
      d.expected_close && d.expected_close <= monthEnd
    );
    const thisMonthWeighted = closingThisMonth.reduce(
      (sum, d) => sum + (d.value || 0) * (STAGE_PROBABILITY[d.stage] || 0),
      0
    );

    return NextResponse.json({
      weighted_forecast: Math.round(weightedTotal),
      best_case: Math.round(bestCase),
      open_deals: deals.length,
      won_total: wonDeals.total || 0,
      won_count: wonDeals.count,
      lost_count: lostDeals.count,
      this_month_forecast: Math.round(thisMonthWeighted),
      this_month_deals: closingThisMonth.length,
      by_stage: byStage,
    });
  } catch (error) {
    console.error("GET /api/deals/forecast error:", error);
    return NextResponse.json({ error: "Failed to generate forecast" }, { status: 500 });
  }
}
