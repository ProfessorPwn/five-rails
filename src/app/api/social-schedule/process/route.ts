import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity, getActivePlatformConnection } from "@/lib/db";
import { reportCapabilityGap } from "@/lib/agents/supervisor";
import { v4 as uuidv4 } from "uuid";

// Process scheduled posts — call this periodically (cron or manual trigger).
// Publishes via real platform APIs when credentials exist. When they don't,
// leaves posts as 'scheduled' (not the old fake 'posted') and files a
// capability gap so the watchdog surfaces the missing connection.
export async function POST(request: NextRequest) {
  try {
    const now = new Date().toISOString();
    const duePosts = getDb().prepare(
      "SELECT * FROM scheduled_posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 20"
    ).all(now) as Array<{
      id: string; project_id: string | null; content_id: string | null;
      platform: string; post_text: string;
      is_evergreen: number; recycle_interval_days: number | null;
      validation_campaign_id: string | null;
    }>;

    if (duePosts.length === 0) {
      return NextResponse.json({ processed: 0, message: "No posts due for publishing" });
    }

    const baseUrl = request.nextUrl.origin;
    const results: Array<{ id: string; platform: string; status: string; error?: string }> = [];
    const missingConnections = new Set<string>();

    for (const post of duePosts) {
      const platformKey = normalizePlatform(post.platform);
      try {
        // Resolve to a content_piece we can publish. If there isn't one already,
        // materialize a standalone content row from the post_text so the existing
        // /api/content/{id}/publish path (with real API calls) can handle it.
        let contentId = post.content_id;
        if (!contentId) {
          // Short-circuit if no platform connection — don't spin up a content
          // piece we know we can't publish. Mark post as 'needs_connection',
          // file a capability gap so Alex/watchdog surface it.
          const conn = platformKey ? getActivePlatformConnection(platformKey) : null;
          if (!conn || !conn.access_token) {
            getDb().prepare("UPDATE scheduled_posts SET status = 'failed', engagement_data = json_set(COALESCE(engagement_data, '{}'), '$.reason', 'needs_connection', '$.platform', ?) WHERE id = ?").run(platformKey || post.platform, post.id);
            missingConnections.add(platformKey || post.platform);
            results.push({ id: post.id, platform: post.platform, status: "needs_connection", error: `No ${platformKey} connection` });
            continue;
          }
          contentId = uuidv4();
          getDb().prepare(
            "INSERT INTO content_pieces (id, project_id, type, title, content, platform, status, validation_campaign_id) VALUES (?, ?, 'post', ?, ?, ?, 'draft', ?)"
          ).run(
            contentId, post.project_id,
            (post.post_text || "").slice(0, 120),
            post.post_text || "",
            platformKey || post.platform,
            post.validation_campaign_id,
          );
          // Keep the link so future operations reuse it
          getDb().prepare("UPDATE scheduled_posts SET content_id = ? WHERE id = ?").run(contentId, post.id);
        }

        // Now call the real publisher
        const res = await fetch(`${baseUrl}/api/content/${contentId}/publish`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (res.ok && !data.error) {
          getDb().prepare(
            "UPDATE scheduled_posts SET status = 'posted', posted_at = datetime('now') WHERE id = ?"
          ).run(post.id);
          results.push({ id: post.id, platform: post.platform, status: "posted" });
        } else {
          const msg = data.error || `HTTP ${res.status}`;
          const needsConn = /no .* connection|not connected|Sign in|reconnect/i.test(msg);
          getDb().prepare(
            "UPDATE scheduled_posts SET status = 'failed', engagement_data = json_set(COALESCE(engagement_data, '{}'), '$.reason', ?, '$.platform', ?) WHERE id = ?"
          ).run(needsConn ? "needs_connection" : "publish_error", platformKey || post.platform, post.id);
          if (needsConn) missingConnections.add(platformKey || post.platform);
          results.push({ id: post.id, platform: post.platform, status: needsConn ? "needs_connection" : "failed", error: String(msg).slice(0, 200) });
        }

        // Evergreen recycle (only after a successful post)
        if (results[results.length - 1].status === "posted" && post.is_evergreen && post.recycle_interval_days) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + post.recycle_interval_days);
          const recycleId = uuidv4();
          getDb().prepare(`
            INSERT INTO scheduled_posts (id, project_id, content_id, platform, post_text, scheduled_at, best_time_used, is_evergreen, recycle_interval_days, status)
            SELECT ?, project_id, content_id, platform, post_text, ?, best_time_used, 1, recycle_interval_days, 'scheduled' FROM scheduled_posts WHERE id = ?
          `).run(recycleId, nextDate.toISOString(), post.id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        getDb().prepare("UPDATE scheduled_posts SET status = 'failed' WHERE id = ?").run(post.id);
        results.push({ id: post.id, platform: post.platform, status: "failed", error: msg.slice(0, 200) });
      }
    }

    // If any posts need a connection, file ONE capability gap per platform so
    // the watchdog resolver picks it up and notifies the user.
    for (const platform of missingConnections) {
      try {
        await reportCapabilityGap({
          agent_id: "agent-marketing",
          task_description: `Publishing scheduled social posts to ${platform}`,
          missing_capability: `${platform} platform connection (access token not configured)`,
          proposed_fix: `User must go to /connections and connect ${platform} via OAuth so real posts can be published during validation tests.`,
        });
      } catch { /* best-effort */ }
    }

    const posted = results.filter((r) => r.status === "posted").length;
    const needsConn = results.filter((r) => r.status === "needs_connection").length;
    const failed = results.filter((r) => r.status === "failed").length;

    logActivity({
      action: "social_batch_publish",
      details: `Processed ${results.length} scheduled posts — ${posted} posted, ${needsConn} need connection, ${failed} failed`,
    });

    return NextResponse.json({ processed: results.length, posted, needs_connection: needsConn, failed, results });
  } catch (error) {
    console.error("POST /api/social-schedule/process error:", error);
    return NextResponse.json({ error: "Failed to process scheduled posts" }, { status: 500 });
  }
}

function normalizePlatform(p: string): string | null {
  const lower = (p || "").toLowerCase();
  if (lower === "twitter" || lower === "x" || lower === "twitter/x") return "twitter";
  if (lower === "linkedin") return "linkedin";
  if (lower === "facebook" || lower === "fb") return "facebook";
  if (lower === "instagram" || lower === "ig") return "instagram";
  if (lower === "tiktok") return "tiktok";
  if (lower === "youtube") return "youtube";
  return null;
}
