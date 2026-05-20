import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

interface RSSFeed {
  id: string;
  project_id: string | null;
  url: string;
  platform: string;
  post_template: string;
  is_active: number;
  last_checked_at: string | null;
  last_item_guid: string | null;
  created_at: string;
}

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
}

// GET — List all RSS feeds
export async function GET() {
  try {
    const feeds = getDb().prepare("SELECT * FROM rss_feeds ORDER BY created_at DESC").all();
    return NextResponse.json(feeds);
  } catch (error) {
    console.error("GET /api/rss error:", error);
    return NextResponse.json({ error: "Failed to fetch feeds" }, { status: 500 });
  }
}

// POST — Create feed or check feeds
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check all active feeds for new items
    if (body.action === "check") {
      const feeds = getDb().prepare("SELECT * FROM rss_feeds WHERE is_active = 1").all() as RSSFeed[];
      const results: { feed_id: string; new_items: number; error?: string }[] = [];

      for (const feed of feeds) {
        try {
          const items = await fetchRSSFeed(feed.url);
          let newCount = 0;

          for (const item of items) {
            // Skip if we've already seen this item
            if (feed.last_item_guid && item.guid === feed.last_item_guid) break;

            // Create content piece from RSS item
            const contentId = uuidv4();
            const content = feed.post_template
              ? feed.post_template
                  .replace("{{title}}", item.title || "")
                  .replace("{{link}}", item.link || "")
                  .replace("{{description}}", item.description || "")
              : `${item.title}\n\n${item.description || ""}\n\nSource: ${item.link}`;

            getDb().prepare(`
              INSERT INTO content_pieces (id, project_id, type, title, content, platform, status, created_at)
              VALUES (?, ?, 'post', ?, ?, ?, 'draft', datetime('now'))
            `).run(contentId, feed.project_id, item.title || "RSS Import", content, feed.platform || "twitter");

            newCount++;
            if (newCount >= 5) break; // Max 5 items per feed per check
          }

          // Update feed
          if (items.length > 0) {
            getDb().prepare(
              "UPDATE rss_feeds SET last_checked_at = datetime('now'), last_item_guid = ? WHERE id = ?"
            ).run(items[0]?.guid || null, feed.id);
          } else {
            getDb().prepare(
              "UPDATE rss_feeds SET last_checked_at = datetime('now') WHERE id = ?"
            ).run(feed.id);
          }

          results.push({ feed_id: feed.id, new_items: newCount });
        } catch (err) {
          results.push({ feed_id: feed.id, new_items: 0, error: String(err) });
        }
      }

      logActivity({ action: "rss_feeds_checked", details: `Checked ${feeds.length} feeds, found ${results.reduce((s, r) => s + r.new_items, 0)} new items` });

      return NextResponse.json({ checked: feeds.length, results });
    }

    // Create new feed
    if (!body.url) return NextResponse.json({ error: "url is required" }, { status: 400 });

    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO rss_feeds (id, project_id, url, platform, post_template, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(id, body.project_id || null, body.url, body.platform || "twitter", body.post_template || null);

    logActivity({ action: "rss_feed_created", details: `RSS feed added: ${body.url}` });

    const feed = getDb().prepare("SELECT * FROM rss_feeds WHERE id = ?").get(id);
    return NextResponse.json(feed, { status: 201 });
  } catch (error) {
    console.error("POST /api/rss error:", error);
    return NextResponse.json({ error: "Failed to process RSS request" }, { status: 500 });
  }
}

// DELETE — Remove feed
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    getDb().prepare("DELETE FROM rss_feeds WHERE id = ?").run(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE /api/rss error:", error);
    return NextResponse.json({ error: "Failed to delete feed" }, { status: 500 });
  }
}

// Simple RSS XML parser (no external dependency)
async function fetchRSSFeed(url: string): Promise<RSSItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "FiveRails/3.0 RSS Reader" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();

  const items: RSSItem[] = [];
  const itemMatches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];

  for (const itemXml of itemMatches.slice(0, 20)) {
    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const description = extractTag(itemXml, "description");
    const pubDate = extractTag(itemXml, "pubDate");
    const guid = extractTag(itemXml, "guid") || link || title || "";

    items.push({ title, link, description, pubDate, guid });
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"))
    || xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].trim() : "";
}
