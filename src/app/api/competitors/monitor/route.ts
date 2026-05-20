import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// POST: Monitor all competitors — fetch their pages, detect changes, create alerts
export async function POST(request: NextRequest) {
  try {
    const competitors = getDb().prepare(
      "SELECT * FROM competitors"
    ).all() as Array<{
      id: string; name: string; website_url: string | null; monitored_pages: string; notes: string | null;
    }>;

    if (competitors.length === 0) {
      return NextResponse.json({ message: "No competitors to monitor", checked: 0, alerts_created: 0 });
    }

    let checked = 0;
    let alertsCreated = 0;

    for (const comp of competitors) {
      const urls: string[] = [];

      // Add main website
      if (comp.website_url) urls.push(comp.website_url);

      // Add monitored pages
      try {
        const pages = JSON.parse(comp.monitored_pages || "[]");
        if (Array.isArray(pages)) urls.push(...pages.filter((p: string) => typeof p === "string" && p.startsWith("http")));
      } catch { /* skip */ }

      for (const url of urls.slice(0, 5)) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);

          const res = await fetch(url, {
            headers: {
              "User-Agent": "FiveRails-Monitor/1.0 (competitive intelligence)",
              "Accept": "text/html",
            },
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!res.ok) {
            // Site returned error — create alert
            getDb().prepare(`
              INSERT INTO competitor_alerts (id, competitor_id, alert_type, page_url, summary, diff_details)
              VALUES (?, ?, 'error', ?, ?, ?)
            `).run(uuidv4(), comp.id, url, `${comp.name} returned HTTP ${res.status}`, `Status: ${res.status} ${res.statusText}`);
            alertsCreated++;
            continue;
          }

          const html = await res.text();
          const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : "";
          const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
          const description = descMatch ? descMatch[1].trim() : "";

          // Extract pricing signals
          const pricingMatch = html.match(/\$[\d,]+(?:\.\d{2})?(?:\/(?:mo|month|yr|year))?/gi);
          const pricing = pricingMatch ? [...new Set(pricingMatch)].slice(0, 5) : [];

          // Check for changes against last alert for this URL
          const lastAlert = getDb().prepare(
            "SELECT diff_details FROM competitor_alerts WHERE competitor_id = ? AND page_url = ? AND alert_type = 'snapshot' ORDER BY created_at DESC LIMIT 1"
          ).get(comp.id, url) as { diff_details: string } | undefined;

          const currentSnapshot = JSON.stringify({ title, description, pricing });

          if (lastAlert && lastAlert.diff_details !== currentSnapshot) {
            // Change detected!
            const oldData = JSON.parse(lastAlert.diff_details || "{}");
            const changes: string[] = [];
            const oldSnap = typeof oldData === "object" ? oldData : {};

            if (oldSnap.title && oldSnap.title !== title) changes.push(`Title: "${oldSnap.title}" → "${title}"`);
            if (oldSnap.description && oldSnap.description !== description) changes.push(`Description changed`);
            if (JSON.stringify(oldSnap.pricing) !== JSON.stringify(pricing)) changes.push(`Pricing signals: ${pricing.join(", ") || "none detected"}`);

            if (changes.length > 0) {
              getDb().prepare(`
                INSERT INTO competitor_alerts (id, competitor_id, alert_type, page_url, summary, diff_details)
                VALUES (?, ?, 'change', ?, ?, ?)
              `).run(uuidv4(), comp.id, url, `${comp.name}: ${changes.join("; ")}`, currentSnapshot);
              alertsCreated++;
            }
          }

          // Always save latest snapshot
          if (!lastAlert) {
            getDb().prepare(`
              INSERT INTO competitor_alerts (id, competitor_id, alert_type, page_url, summary, diff_details, is_read)
              VALUES (?, ?, 'snapshot', ?, ?, ?, 1)
            `).run(uuidv4(), comp.id, url, `Initial scan of ${comp.name}`, currentSnapshot);
          } else if (lastAlert.diff_details !== currentSnapshot) {
            // Update snapshot
            getDb().prepare(`
              INSERT INTO competitor_alerts (id, competitor_id, alert_type, page_url, summary, diff_details, is_read)
              VALUES (?, ?, 'snapshot', ?, ?, ?, 1)
            `).run(uuidv4(), comp.id, url, `Snapshot update for ${comp.name}`, currentSnapshot);
          }

          checked++;
        } catch (err) {
          // Network error — site unreachable
          getDb().prepare(`
            INSERT INTO competitor_alerts (id, competitor_id, alert_type, page_url, summary, diff_details)
            VALUES (?, ?, 'error', ?, ?, ?)
          `).run(uuidv4(), comp.id, url, `${comp.name} unreachable`, `Error: ${err instanceof Error ? err.message : "unknown"}`);
          alertsCreated++;
        }
      }
    }

    logActivity({
      action: "competitor_monitor",
      details: `Monitored ${competitors.length} competitors, checked ${checked} pages, created ${alertsCreated} alerts`,
    });

    return NextResponse.json({
      competitors_checked: competitors.length,
      pages_checked: checked,
      alerts_created: alertsCreated,
    });
  } catch (error) {
    console.error("POST /api/competitors/monitor error:", error);
    return NextResponse.json({ error: "Competitor monitoring failed" }, { status: 500 });
  }
}
