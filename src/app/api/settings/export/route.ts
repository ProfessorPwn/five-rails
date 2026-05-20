import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const db = getDb();

    const tables = [
      "projects",
      "skills",
      "content_pieces",
      "outbound_contacts",
      "newsletters",
      "market_insights",
      "tasks",
      "connections",
      "platform_connections",
      "activity_log",
      "ideabrowser_ideas",
      "ideabrowser_trends",
      "ideabrowser_market_insights",
      "ideabrowser_config",
      "blueprints",
      "email_sequences",
      "referrals",
      "ad_rules",
      "funnel_events",
      "ad_campaigns",
      "content_analytics",
      "deals",
      "deal_activities",
      "landing_pages",
      "scheduled_posts",
      "rss_feeds",
      "brand_voices",
      "competitors",
      "competitor_alerts",
      "affiliates",
      "commissions",
      "webinars",
      "webinar_registrations",
      "subscriptions",
      "payment_attempts",
      "onboarding_checklists",
      "automation_settings",
      "agents",
      "agent_decisions",
      "notifications",
    ];

    const exportData: Record<string, unknown[]> = {};

    for (const table of tables) {
      try {
        const rows = db.prepare(`SELECT * FROM ${table}`).all();
        exportData[table] = rows;
      } catch {
        exportData[table] = [];
      }
    }

    // Get database file info
    const dbPath = path.join(process.cwd(), "data", "fiverails.db");
    let dbSize = 0;
    try {
      const stats = fs.statSync(dbPath);
      dbSize = stats.size;
    } catch {
      // DB file might not exist at expected path
    }

    const tableCounts: Record<string, number> = {};
    for (const [table, rows] of Object.entries(exportData)) {
      tableCounts[table] = rows.length;
    }

    return NextResponse.json({
      exported_at: new Date().toISOString(),
      db_size_bytes: dbSize,
      db_size_mb: (dbSize / (1024 * 1024)).toFixed(2),
      table_counts: tableCounts,
      data: exportData,
    });
  } catch (error) {
    console.error("GET /api/settings/export error:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
