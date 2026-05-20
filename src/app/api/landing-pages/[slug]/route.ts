import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

type RouteContext = { params: Promise<{ slug: string }> };

// Serve landing page HTML publicly
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const page = getDb().prepare("SELECT * FROM landing_pages WHERE slug = ?").get(slug) as {
      id: string; title: string; slug: string; html: string; status: string; visits: number; project_id: string | null;
    } | undefined;

    if (!page) {
      return new NextResponse("<html><body><h1>Page not found</h1></body></html>", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    }

    // Track visit
    getDb().prepare("UPDATE landing_pages SET visits = visits + 1 WHERE id = ?").run(page.id);

    // Log funnel event
    try {
      getDb().prepare(
        "INSERT INTO funnel_events (id, project_id, event_name, event_data, source) VALUES (?, ?, 'landing_page_visit', ?, 'landing_page')"
      ).run(uuidv4(), page.project_id, JSON.stringify({ page_id: page.id, slug: page.slug }));
    } catch { /* non-blocking */ }

    return new NextResponse(page.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("GET /api/landing-pages/[slug] error:", error);
    return new NextResponse("<html><body><h1>Server error</h1></body></html>", {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }
}
