import { NextResponse } from "next/server";
import {
  getContent, getActivePlatformConnection,
  upsertContentAnalytics, getAllContentAnalytics,
} from "@/lib/db";
import type { PlatformConnection } from "@/lib/db";

export async function GET() {
  try {
    const analytics = getAllContentAnalytics();
    const content = getContent().filter((c) => c.status === "published");

    // Summary stats
    const totals = {
      published: content.length,
      impressions: analytics.reduce((s, a) => s + a.impressions, 0),
      clicks: analytics.reduce((s, a) => s + a.clicks, 0),
      likes: analytics.reduce((s, a) => s + a.likes, 0),
      shares: analytics.reduce((s, a) => s + a.shares, 0),
      comments: analytics.reduce((s, a) => s + a.comments, 0),
      reach: analytics.reduce((s, a) => s + a.reach, 0),
    };

    // Per-platform breakdown
    const byPlatform: Record<string, { impressions: number; likes: number; shares: number; comments: number; count: number }> = {};
    for (const a of analytics) {
      if (!byPlatform[a.platform]) byPlatform[a.platform] = { impressions: 0, likes: 0, shares: 0, comments: 0, count: 0 };
      byPlatform[a.platform].impressions += a.impressions;
      byPlatform[a.platform].likes += a.likes;
      byPlatform[a.platform].shares += a.shares;
      byPlatform[a.platform].comments += a.comments;
      byPlatform[a.platform].count++;
    }

    return NextResponse.json({ totals, byPlatform, analytics, published: content.length });
  } catch (error) {
    console.error("GET /api/analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}

// POST: Refresh analytics from platform APIs for all published content
export async function POST() {
  try {
    const content = getContent().filter((c) => c.status === "published" && c.published_url);
    let updated = 0;

    for (const piece of content) {
      const platformKey = piece.platform?.toLowerCase() || "";
      const conn = getActivePlatformConnection(platformKey);
      if (!conn || !conn.access_token) continue;

      try {
        const metrics = await fetchPlatformMetrics(platformKey, piece.published_url!, conn);
        if (metrics) {
          upsertContentAnalytics({
            content_id: piece.id,
            platform: platformKey,
            ...metrics,
          });
          updated++;
        }
      } catch {
        // Skip individual failures
      }
    }

    return NextResponse.json({ updated, total: content.length });
  } catch (error) {
    console.error("POST /api/analytics error:", error);
    return NextResponse.json({ error: "Failed to refresh analytics" }, { status: 500 });
  }
}

async function fetchPlatformMetrics(
  platform: string,
  publishedUrl: string,
  conn: PlatformConnection
): Promise<{ impressions: number; likes: number; shares: number; comments: number; reach: number; clicks: number } | null> {
  // Extract post ID from published URL
  const postId = extractPostId(platform, publishedUrl);
  if (!postId) return null;

  switch (platform) {
    case "twitter": {
      const res = await fetch(
        `https://api.twitter.com/2/tweets/${postId}?tweet.fields=public_metrics`,
        { headers: { Authorization: `Bearer ${conn.access_token}` } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const m = data.data?.public_metrics;
      return m ? {
        impressions: m.impression_count || 0,
        likes: m.like_count || 0,
        shares: m.retweet_count || 0,
        comments: m.reply_count || 0,
        reach: m.impression_count || 0,
        clicks: 0,
      } : null;
    }
    case "facebook": {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${postId}?fields=shares,likes.summary(true),comments.summary(true)&access_token=${conn.access_token}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return {
        impressions: 0,
        likes: data.likes?.summary?.total_count || 0,
        shares: data.shares?.count || 0,
        comments: data.comments?.summary?.total_count || 0,
        reach: 0,
        clicks: 0,
      };
    }
    case "linkedin": {
      const res = await fetch(
        `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(postId)}`,
        {
          headers: {
            Authorization: `Bearer ${conn.access_token}`,
            "LinkedIn-Version": "202401",
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return {
        impressions: 0,
        likes: data.likesSummary?.totalLikes || 0,
        shares: data.sharesSummary?.totalShares || 0,
        comments: data.commentsSummary?.totalFirstLevelComments || 0,
        reach: 0,
        clicks: 0,
      };
    }
    default:
      return null;
  }
}

function extractPostId(platform: string, url: string): string | null {
  try {
    const u = new URL(url);
    switch (platform) {
      case "twitter":
        return u.pathname.split("/").pop() || null;
      case "facebook":
        return u.pathname.split("/").pop() || null;
      case "linkedin":
        return u.pathname.split("/").pop() || null;
      case "instagram":
        return u.pathname.replace(/\/$/, "").split("/").pop() || null;
      default:
        return null;
    }
  } catch {
    return url;
  }
}
