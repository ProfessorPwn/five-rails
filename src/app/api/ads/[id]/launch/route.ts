import { NextRequest, NextResponse } from "next/server";
import { getAdCampaign, updateAdCampaign, getActivePlatformConnection, logActivity } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const campaign = getAdCampaign(id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const conn = getActivePlatformConnection(campaign.platform);
    if (!conn || !conn.access_token) {
      return NextResponse.json({
        error: `No ${campaign.platform} account connected. Go to Connections and sign in.`,
      }, { status: 503 });
    }

    if (campaign.platform === "facebook") {
      return await launchFacebookCampaign(campaign, conn, id);
    }

    // For Google and TikTok, generate a ready-to-launch spec with deep links
    const adCopy = campaign.ad_copy ? JSON.parse(campaign.ad_copy) : {};
    const targeting = campaign.targeting ? JSON.parse(campaign.targeting) : {};

    const spec = {
      platform: campaign.platform,
      campaign_name: campaign.name,
      objective: campaign.objective,
      budget: {
        daily: campaign.budget_daily,
        total: campaign.budget_total,
      },
      targeting,
      ad_copy: adCopy,
      deep_link: campaign.platform === "google"
        ? "https://ads.google.com/aw/campaigns/new"
        : "https://ads.tiktok.com/i18n/creation",
    };

    updateAdCampaign(id, { status: "ready", platform_response: JSON.stringify(spec) });

    logActivity({
      action: "ad_campaign_ready",
      project_id: campaign.project_id || undefined,
      details: `${campaign.platform} campaign "${campaign.name}" ready to launch`,
    });

    return NextResponse.json({
      action: "ready_to_launch",
      message: `Your ${campaign.platform} campaign spec is ready. Click the link to create it in Ads Manager.`,
      spec,
    });
  } catch (error) {
    console.error("POST /api/ads/[id]/launch error:", error);
    return NextResponse.json({ error: "Failed to launch campaign" }, { status: 500 });
  }
}

async function launchFacebookCampaign(
  campaign: { id: string; name: string; objective: string; budget_daily: number | null; budget_total: number | null; targeting: string | null; ad_copy: string | null; project_id: string | null },
  conn: { access_token: string | null; account_id: string | null },
  campaignDbId: string
) {
  try {
    // Step 1: Get ad account ID
    const accountsRes = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?access_token=${conn.access_token}`
    );
    if (!accountsRes.ok) {
      return NextResponse.json({ error: "Failed to fetch Facebook ad accounts. Ensure ads_management permission is granted." }, { status: 502 });
    }
    const accounts = await accountsRes.json();
    const adAccount = accounts.data?.[0];
    if (!adAccount) {
      return NextResponse.json({
        error: "No Facebook Ad Account found. Create one at business.facebook.com.",
        deep_link: "https://business.facebook.com/",
      }, { status: 400 });
    }
    const adAccountId = adAccount.id; // format: act_XXXXX

    // Step 2: Create campaign with a hard daily budget cap (cents).
    // Always starts PAUSED so user must manually activate spend — safety rail.
    const fbObjective = mapObjective(campaign.objective);
    const dailyCents = Math.max(100, Math.round((campaign.budget_daily || 5) * 100));
    const campaignRes = await fetch(
      `https://graph.facebook.com/v21.0/${adAccountId}/campaigns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaign.name,
          objective: fbObjective,
          status: "PAUSED",
          daily_budget: dailyCents,
          special_ad_categories: [],
          access_token: conn.access_token,
        }),
      }
    );

    if (!campaignRes.ok) {
      const err = await campaignRes.text();
      return NextResponse.json({
        error: `Facebook campaign creation failed: ${err.slice(0, 300)}`,
        hint: "Ensure your Facebook account has ads_management permission and an active Ad Account.",
      }, { status: 502 });
    }

    const fbCampaign = await campaignRes.json();

    updateAdCampaign(campaignDbId, {
      status: "submitted",
      platform_campaign_id: fbCampaign.id,
      platform_response: JSON.stringify(fbCampaign),
    });

    logActivity({
      action: "ad_campaign_launched",
      project_id: campaign.project_id || undefined,
      details: `Facebook campaign "${campaign.name}" created (ID: ${fbCampaign.id}) — status: PAUSED`,
    });

    return NextResponse.json({
      action: "launched",
      platform_campaign_id: fbCampaign.id,
      status: "PAUSED",
      message: `Campaign created on Facebook (paused). Go to Ads Manager to review and activate.`,
      deep_link: `https://www.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace("act_", "")}&campaign_ids=${fbCampaign.id}`,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Facebook campaign launch failed",
    }, { status: 500 });
  }
}

function mapObjective(obj: string): string {
  const map: Record<string, string> = {
    awareness: "OUTCOME_AWARENESS",
    traffic: "OUTCOME_TRAFFIC",
    engagement: "OUTCOME_ENGAGEMENT",
    leads: "OUTCOME_LEADS",
    conversions: "OUTCOME_SALES",
    sales: "OUTCOME_SALES",
  };
  return map[obj?.toLowerCase()] || "OUTCOME_TRAFFIC";
}
