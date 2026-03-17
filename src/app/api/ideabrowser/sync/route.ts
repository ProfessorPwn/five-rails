import { NextResponse } from "next/server";
import {
  bulkImportIdeaBrowserIdeas,
  setIdeaBrowserConfig,
  logActivity,
} from "@/lib/db";
import { scrapeIdeaBrowser } from "@/lib/ideabrowser-scraper";

export async function POST() {
  try {
    // Run the scraper
    const { ideas: scrapedIdeas, errors: scrapeErrors } =
      await scrapeIdeaBrowser();

    if (scrapedIdeas.length === 0 && scrapeErrors.length > 0) {
      // Scraping completely failed — still update timestamp and log
      const now = new Date().toISOString();
      setIdeaBrowserConfig("last_sync_at", now);

      const isBotBlocked = scrapeErrors.some((e) => e.includes("bot protection"));

      logActivity({
        action: "ideabrowser_sync_failed",
        details: isBotBlocked
          ? "Sync blocked by IdeaBrowser.com bot protection. Use manual import instead."
          : `Sync failed: ${scrapeErrors.join("; ")}`,
      });

      return NextResponse.json(
        {
          imported: 0,
          skipped: 0,
          errors: scrapeErrors,
          hint: isBotBlocked
            ? "IdeaBrowser.com has bot protection that blocks automated scraping. Use the manual import feature: copy ideas from the site and paste them as JSON using the 'Import Ideas' button."
            : undefined,
          synced_at: now,
        },
        { status: 200 }
      );
    }

    // Bulk import the scraped ideas
    const result = bulkImportIdeaBrowserIdeas(scrapedIdeas);

    // Update last sync timestamp
    const now = new Date().toISOString();
    setIdeaBrowserConfig("last_sync_at", now);

    logActivity({
      action: "ideabrowser_sync_completed",
      details: `Synced IdeaBrowser: ${result.imported.length} imported, ${result.skipped} skipped${scrapeErrors.length > 0 ? `, ${scrapeErrors.length} errors` : ""}`,
    });

    return NextResponse.json({
      imported: result.imported.length,
      skipped: result.skipped,
      errors: scrapeErrors,
      synced_at: now,
    });
  } catch (error) {
    console.error("POST /api/ideabrowser/sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync IdeaBrowser ideas" },
      { status: 500 }
    );
  }
}
