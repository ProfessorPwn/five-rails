import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const campaigns = getDb().prepare(`
      SELECT
        vc.*,
        ii.title as idea_title,
        ii.description as idea_description,
        ii.overall_score as opportunity_score,
        ii.category as idea_category,
        (SELECT COUNT(*) FROM ad_campaigns ac WHERE ac.validation_campaign_id = vc.id) as ad_count,
        (SELECT COUNT(*) FROM scheduled_posts sp WHERE sp.validation_campaign_id = vc.id) as post_count,
        lp.title as landing_page_title,
        lp.visits as landing_page_visits,
        lp.conversions as landing_page_conversions
      FROM validation_campaigns vc
      JOIN ideabrowser_ideas ii ON ii.id = vc.idea_id
      LEFT JOIN landing_pages lp ON lp.id = vc.landing_page_id
      ORDER BY vc.created_at DESC
    `).all();

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("GET /api/validation/campaigns error:", error);
    return NextResponse.json({ campaigns: [] });
  }
}
