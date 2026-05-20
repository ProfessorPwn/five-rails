import { NextRequest, NextResponse } from "next/server";
import {
  getContentPiece,
  getActivePlatformConnection,
  getDb,
  logActivity,
} from "@/lib/db";
import type { PlatformConnection } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const content = getContentPiece(id);
    if (!content) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    if (!content.content?.trim()) {
      return NextResponse.json({ error: "Content body is empty. Write content before publishing." }, { status: 400 });
    }

    const platformKey = mapPlatformToKey(content.platform || "");
    if (!platformKey) {
      return NextResponse.json({
        error: `No publishing integration for "${content.platform}". Supported: Twitter, LinkedIn, Facebook, Instagram, TikTok, YouTube, Email.`,
      }, { status: 400 });
    }

    // TikTok/YouTube don't need a platform connection — they generate posting packages
    // Skip connection check for these platforms
    const needsConnection = !["tiktok", "youtube"].includes(platformKey);

    const connection = needsConnection ? getActivePlatformConnection(platformKey) : null;
    if (needsConnection && !connection) {
      return NextResponse.json({
        error: `No ${platformKey} account connected. Go to Connections and sign in with ${platformKey}.`,
        hint: `Click "Connect ${platformKey}" on the Connections page.`,
      }, { status: 503 });
    }

    // Email connections use api_key (Resend) or SMTP credentials, not access_token
    if (needsConnection && platformKey !== "email" && connection && !connection.access_token) {
      return NextResponse.json({
        error: `${platformKey} connection has no access token. Please reconnect your account.`,
      }, { status: 503 });
    }

    // Check token expiry and refresh if needed
    if (connection && connection.token_expires_at) {
      const expiresAt = new Date(connection.token_expires_at);
      if (expiresAt < new Date()) {
        if (connection.refresh_token) {
          const refreshed = await refreshToken(platformKey, connection);
          if (!refreshed) {
            return NextResponse.json({
              error: `${platformKey} token expired and refresh failed. Please reconnect your account.`,
            }, { status: 503 });
          }
          // Re-read the connection after refresh
          const updated = getActivePlatformConnection(platformKey);
          if (updated) Object.assign(connection, updated);
        } else {
          return NextResponse.json({
            error: `${platformKey} token expired. Please reconnect your account.`,
          }, { status: 503 });
        }
      }
    }

    // Instagram requires a media_url — validate before attempting
    if (platformKey === "instagram" && !content.media_url) {
      return NextResponse.json({
        error: "Instagram requires an image. Add an image URL to your content first.",
        hint: "Use the 'Generate Image' button or paste an image URL in the media field.",
        action: "add_media",
      }, { status: 400 });
    }

    // TikTok/YouTube: generate ready-to-post packages instead of direct publish
    if (platformKey === "tiktok" || platformKey === "youtube") {
      const pkg = generatePostingPackage(platformKey, content.content || "", content.title);
      // Update content with the package metadata
      const { updateContent: uc } = await import("@/lib/db");
      uc(content.id, { metadata: JSON.stringify(pkg) });

      return NextResponse.json({
        action: "ready_to_post",
        platform: platformKey,
        package: pkg,
        message: `Your ${platformKey === "tiktok" ? "TikTok" : "YouTube"} posting package is ready. Copy the script and open the platform to post.`,
        deep_link: platformKey === "tiktok"
          ? "https://www.tiktok.com/creator#/upload"
          : `https://studio.youtube.com/`,
      });
    }

    // Add UTM tracking to any URLs in the content
    const trackedContent = addUtmParams(content.content || "", platformKey, content.title, content.id);

    let publishResult: { url?: string; messageId?: string; error?: string };

    switch (platformKey) {
      case "twitter":
        publishResult = await publishToTwitter(trackedContent, connection!);
        break;
      case "linkedin":
        publishResult = await publishToLinkedIn(trackedContent, content.title, connection!);
        break;
      case "facebook":
        publishResult = await publishToFacebook(trackedContent, connection!);
        break;
      case "instagram":
        publishResult = await publishToInstagram(trackedContent, content.title, connection!, content.media_url!);
        break;
      case "email":
        publishResult = await publishViaEmail(trackedContent, content.title, connection!);
        break;
      default:
        return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
    }

    if (publishResult.error) {
      return NextResponse.json({
        error: `Publishing to ${platformKey} failed: ${publishResult.error}`,
      }, { status: 502 });
    }

    // Update content status to published
    const now = new Date().toISOString();
    const { getDb } = await import("@/lib/db/schema");
    getDb().prepare(
      "UPDATE content_pieces SET status = 'published', published_url = ?, published_at = ? WHERE id = ?"
    ).run(publishResult.url || null, now, id);

    logActivity({
      action: "content_published",
      project_id: content.project_id || undefined,
      details: `Published "${content.title}" to ${content.platform}${publishResult.url ? ` → ${publishResult.url}` : ""}`,
      rail: "audience",
    });

    return NextResponse.json({
      success: true,
      platform: content.platform,
      published_url: publishResult.url || null,
      published_at: now,
      message_id: publishResult.messageId || null,
    });
  } catch (error) {
    console.error("POST /api/content/[id]/publish error:", error);
    return NextResponse.json({ error: "Failed to publish content" }, { status: 500 });
  }
}

function mapPlatformToKey(platform: string): string | null {
  const lower = platform.toLowerCase();
  if (lower === "twitter" || lower === "x" || lower === "twitter/x") return "twitter";
  if (lower === "linkedin") return "linkedin";
  if (lower === "facebook" || lower === "fb") return "facebook";
  if (lower === "instagram" || lower === "ig") return "instagram";
  if (lower === "tiktok" || lower === "tik tok") return "tiktok";
  if (lower === "youtube" || lower === "yt") return "youtube";
  if (lower === "email") return "email";
  return null;
}

// ─── Token Refresh ──────────────────────────────────────────────────────────

async function refreshToken(platform: string, conn: PlatformConnection): Promise<boolean> {
  const refreshConfigs: Record<string, { url: string; clientIdEnv: string; clientSecretEnv: string }> = {
    twitter: { url: "https://api.twitter.com/2/oauth2/token", clientIdEnv: "TWITTER_CLIENT_ID", clientSecretEnv: "TWITTER_CLIENT_SECRET" },
    linkedin: { url: "https://www.linkedin.com/oauth/v2/accessToken", clientIdEnv: "LINKEDIN_CLIENT_ID", clientSecretEnv: "LINKEDIN_CLIENT_SECRET" },
    youtube: { url: "https://oauth2.googleapis.com/token", clientIdEnv: "GOOGLE_CLIENT_ID", clientSecretEnv: "GOOGLE_CLIENT_SECRET" },
    facebook: { url: "https://graph.facebook.com/v21.0/oauth/access_token", clientIdEnv: "FACEBOOK_CLIENT_ID", clientSecretEnv: "FACEBOOK_CLIENT_SECRET" },
  };

  const config = refreshConfigs[platform];
  if (!config || !conn.refresh_token) return false;

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
      client_id: process.env[config.clientIdEnv] || "",
      client_secret: process.env[config.clientSecretEnv] || "",
    });

    const res = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) return false;
    const data = await res.json();

    const { updatePlatformConnection } = await import("@/lib/db");
    updatePlatformConnection(conn.id, {
      access_token: data.access_token,
      refresh_token: data.refresh_token || conn.refresh_token,
      token_expires_at: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    });

    return true;
  } catch {
    return false;
  }
}

// ─── Twitter (OAuth 2.0 Bearer Token) ───────────────────────────────────────

async function publishToTwitter(
  text: string,
  conn: PlatformConnection
): Promise<{ url?: string; error?: string }> {
  const tweetText = text.length > 280 ? text.slice(0, 277) + "..." : text;

  try {
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: tweetText }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { error: `Twitter API ${res.status}: ${err}` };
    }

    const data = await res.json();
    const tweetId = data.data?.id;
    return { url: tweetId ? `https://twitter.com/i/web/status/${tweetId}` : undefined };
  } catch (err) {
    return { error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── LinkedIn ───────────────────────────────────────────────────────────────

async function publishToLinkedIn(
  text: string,
  title: string,
  conn: PlatformConnection
): Promise<{ url?: string; error?: string }> {
  const personUrn = conn.account_id?.startsWith("urn:li:")
    ? conn.account_id
    : `urn:li:person:${conn.account_id}`;

  try {
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202401",
      },
      body: JSON.stringify({
        author: personUrn,
        commentary: text,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { error: `LinkedIn API ${res.status}: ${err}` };
    }

    const postId = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id");
    return { url: postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined };
  } catch (err) {
    return { error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Facebook ───────────────────────────────────────────────────────────────

async function publishToFacebook(
  text: string,
  conn: PlatformConnection
): Promise<{ url?: string; error?: string }> {
  // First get the user's pages
  try {
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${conn.access_token}`
    );
    const pagesData = await pagesRes.json();

    if (!pagesData.data?.length) {
      // Post to personal feed instead
      const res = await fetch(`https://graph.facebook.com/v21.0/me/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          access_token: conn.access_token,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return { error: `Facebook API ${res.status}: ${err}` };
      }

      const data = await res.json();
      return { url: data.id ? `https://www.facebook.com/${data.id}` : undefined };
    }

    // Post to first page
    const page = pagesData.data[0];
    const pageToken = page.access_token;

    const res = await fetch(`https://graph.facebook.com/v21.0/${page.id}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        access_token: pageToken,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { error: `Facebook API ${res.status}: ${err}` };
    }

    const data = await res.json();
    return { url: data.id ? `https://www.facebook.com/${data.id}` : undefined };
  } catch (err) {
    return { error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Instagram ──────────────────────────────────────────────────────────────

async function publishToInstagram(
  text: string,
  _title: string,
  conn: PlatformConnection,
  mediaUrl: string
): Promise<{ url?: string; error?: string }> {
  try {
    // Step 1: Get the Instagram Business Account ID via Facebook Page
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${conn.access_token}`
    );
    if (!pagesRes.ok) return { error: "Failed to fetch Facebook pages for Instagram" };
    const pages = await pagesRes.json();
    const page = pages.data?.[0];
    if (!page) return { error: "No Facebook Page found. Link a Page to your Instagram Business account." };

    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token || conn.access_token}`
    );
    if (!igRes.ok) return { error: "Failed to fetch Instagram Business Account" };
    const igData = await igRes.json();
    const igAccountId = igData.instagram_business_account?.id;
    if (!igAccountId) return { error: "No Instagram Business Account linked to your Facebook Page." };

    // Step 2: Create a media container
    const containerRes = await fetch(
      `https://graph.facebook.com/v21.0/${igAccountId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: mediaUrl,
          caption: text,
          access_token: page.access_token || conn.access_token,
        }),
      }
    );
    if (!containerRes.ok) {
      const err = await containerRes.text();
      return { error: `Instagram container creation failed: ${err.slice(0, 200)}` };
    }
    const container = await containerRes.json();

    // Step 3: Publish the container
    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${igAccountId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: page.access_token || conn.access_token,
        }),
      }
    );
    if (!publishRes.ok) {
      const err = await publishRes.text();
      return { error: `Instagram publish failed: ${err.slice(0, 200)}` };
    }
    const result = await publishRes.json();
    return { url: `https://www.instagram.com/p/${result.id}/` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Instagram publish failed" };
  }
}

// ─── UTM Tracking ──────────────────────────────────────────────────────────

function addUtmParams(text: string, platform: string, title: string, contentId: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  return text.replace(urlRegex, (url) => {
    try {
      const u = new URL(url);
      if (!u.searchParams.has("utm_source")) {
        u.searchParams.set("utm_source", platform);
        u.searchParams.set("utm_medium", "social");
        u.searchParams.set("utm_campaign", slug);
        u.searchParams.set("utm_content", contentId.slice(0, 8));
      }
      return u.toString();
    } catch {
      return url;
    }
  });
}

// ─── TikTok/YouTube Posting Packages ───────────────────────────────────────

function generatePostingPackage(platform: string, content: string, title: string): Record<string, unknown> {
  if (platform === "tiktok") {
    return {
      platform: "TikTok",
      script: content,
      format: {
        hook: "First 3 seconds — grab attention with a bold statement or question",
        body: "15-60 seconds — deliver the main value",
        cta: "Last 5 seconds — tell viewers what to do next",
      },
      caption: content.slice(0, 150),
      hashtags: extractHashtags(content, title),
      music_suggestion: "Use a trending sound — check TikTok's Sound Library",
      posting_tips: [
        "Film vertically (9:16 aspect ratio)",
        "Add captions/subtitles — 80% of TikTok is watched on mute",
        "Post between 6-10pm in your target timezone",
        "Reply to comments within the first hour",
      ],
      deep_link: "https://www.tiktok.com/creator#/upload",
    };
  }

  return {
    platform: "YouTube",
    title: title.slice(0, 100),
    description: content,
    tags: extractHashtags(content, title).join(", "),
    thumbnail_text: title.split(" ").slice(0, 5).join(" ").toUpperCase(),
    category: "Education",
    posting_tips: [
      "Upload in 1080p or 4K for best quality",
      "Add timestamps in the description for long-form content",
      "Create a custom thumbnail with bold text and your face",
      "Add cards and end screens linking to related videos",
      "Post on Tuesday-Thursday between 2-4pm",
    ],
    seo_tips: [
      "Put your main keyword in the first 5 words of the title",
      "Write 200+ word descriptions with natural keyword usage",
      "Use 5-15 relevant tags",
    ],
    deep_link: "https://studio.youtube.com/",
  };
}

function extractHashtags(content: string, title: string): string[] {
  const words = `${title} ${content}`.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => `#${w}`);
}

// ─── Email ──────────────────────────────────────────────────────────────────

async function publishViaEmail(
  content: string,
  subject: string,
  conn: PlatformConnection,
  recipients?: string[]
): Promise<{ messageId?: string; error?: string }> {
  // Gather recipients: use provided list, or fetch project contacts, or fall back to from_email
  let toList = recipients && recipients.length > 0 ? recipients : [];
  if (toList.length === 0) {
    try {
      const contacts = getDb().prepare(
        "SELECT email FROM outbound_contacts WHERE email IS NOT NULL AND email != '' LIMIT 100"
      ).all() as Array<{ email: string }>;
      toList = contacts.map(c => c.email).filter(Boolean);
    } catch { /* ignore */ }
  }
  if (toList.length === 0) {
    toList = [conn.from_email || "noreply@example.com"];
  }
  if (conn.api_key) {
    // Resend API
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${conn.api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: conn.from_email || "noreply@example.com",
          to: toList,
          subject,
          html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">${content.replace(/\n/g, "<br>")}</div>`,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return { error: `Resend API ${res.status}: ${err}` };
      }

      const data = await res.json();
      return { messageId: data.id };
    } catch (err) {
      return { error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  if (conn.smtp_host && conn.smtp_user) {
    // SMTP fallback
    const net = await import("net");
    const tls = await import("tls");

    const host = conn.smtp_host;
    const port = conn.smtp_port || 587;
    const user = conn.smtp_user;
    const pass = conn.smtp_pass || "";
    const from = conn.from_email || user;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ error: "SMTP connection timed out" }), 15000);

      try {
        const socket = port === 465
          ? tls.connect({ host, port, rejectUnauthorized: false })
          : net.createConnection({ host, port });

        let buffer = "";
        let step = 0;
        const messageId = `<${Date.now()}@fiverails>`;
        const htmlContent = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">${content.replace(/\n/g, "<br>")}</div>`;

        const commands = [
          `EHLO fiverails\r\n`,
          ...(port !== 465 ? [`STARTTLS\r\n`] : []),
          `AUTH LOGIN\r\n`,
          `${Buffer.from(user).toString("base64")}\r\n`,
          `${Buffer.from(pass).toString("base64")}\r\n`,
          `MAIL FROM:<${from}>\r\n`,
          `RCPT TO:<${toList[0]}>\r\n`,
          `DATA\r\n`,
          `From: ${from}\r\nTo: ${toList.join(", ")}\r\nSubject: ${subject}\r\nMessage-ID: ${messageId}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${htmlContent}\r\n.\r\n`,
          `QUIT\r\n`,
        ];

        const send = () => {
          if (step < commands.length) {
            socket.write(commands[step++]);
          }
        };

        socket.on("data", (data: Buffer) => {
          buffer += data.toString();
          if (buffer.includes("250") || buffer.includes("220") || buffer.includes("235") || buffer.includes("334") || buffer.includes("354")) {
            buffer = "";
            send();
          }
          if (buffer.includes("550") || buffer.includes("553") || buffer.includes("554")) {
            clearTimeout(timeout);
            socket.destroy();
            resolve({ error: `SMTP error: ${buffer.trim()}` });
          }
        });

        socket.on("error", (err: Error) => {
          clearTimeout(timeout);
          resolve({ error: `SMTP error: ${err.message}` });
        });

        socket.on("close", () => {
          clearTimeout(timeout);
          if (step >= commands.length - 1) {
            resolve({ messageId });
          }
        });
      } catch (err) {
        clearTimeout(timeout);
        resolve({ error: `SMTP connection failed: ${err instanceof Error ? err.message : String(err)}` });
      }
    });
  }

  return { error: "Email connection requires an API key (Resend) or SMTP credentials." };
}
