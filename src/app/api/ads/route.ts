import { NextRequest, NextResponse } from "next/server";
import { getAdCampaigns, createAdCampaign, logActivity } from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json(getAdCampaigns());
  } catch (error) {
    console.error("GET /api/ads error:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name || !body.platform) {
      return NextResponse.json({ error: "name and platform are required" }, { status: 400 });
    }

    const campaign = createAdCampaign({
      project_id: body.project_id,
      platform: body.platform,
      name: body.name,
      objective: body.objective,
      budget_daily: body.budget_daily,
      budget_total: body.budget_total,
      targeting: typeof body.targeting === "object" ? JSON.stringify(body.targeting) : body.targeting,
      ad_copy: typeof body.ad_copy === "object" ? JSON.stringify(body.ad_copy) : body.ad_copy,
      ad_creative: body.ad_creative,
    });

    logActivity({
      action: "ad_campaign_created",
      project_id: body.project_id,
      details: `Created ${body.platform} ad campaign: "${body.name}"`,
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    console.error("POST /api/ads error:", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
