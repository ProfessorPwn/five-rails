import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readdirSync, statSync } from "fs";
import { join } from "path";

// Unified library of everything the agents have produced across all output tables.
// Used by /library page to give the user one place to see all artifacts, filter
// by type, preview, and reuse as templates.

export interface LibraryItem {
  id: string;                     // unique within source
  source: string;                 // "pdf_report" | "landing_page" | "content" | "newsletter" | "ad_campaign" | "scheduled_post" | "market_insight" | "email_sequence"
  type: string;                   // human-readable type (e.g., "PDF Report", "Landing Page", "Social Post")
  title: string;
  preview: string;                // short text preview
  body_text?: string;             // full content for detail view (if available)
  project_id: string | null;
  project_name: string | null;
  status: string | null;
  agent: string | null;           // who produced it (if known)
  created_at: string;
  updated_at?: string | null;
  platform?: string | null;
  url?: string | null;            // external URL (landing page slug, published post URL, PDF download link)
  download_url?: string | null;   // in-app download for PDFs
  size_bytes?: number;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filterType = sp.get("type"); // "report" | "landing" | "email" | "ad" | "social" | "newsletter" | "research" | "all"
  const projectId = sp.get("project_id");
  const q = (sp.get("q") || "").toLowerCase();

  const db = getDb();
  const items: LibraryItem[] = [];

  // Project name lookup
  const projectNames = new Map<string, string>();
  for (const p of db.prepare("SELECT id, name FROM projects").all() as Array<{ id: string; name: string }>) {
    projectNames.set(p.id, p.name);
  }

  // ── 1. PDF reports ──────────────────────────────────────────────────────────
  if (!filterType || filterType === "all" || filterType === "report") {
    try {
      const dir = join(process.cwd(), "data", "reports");
      const files = readdirSync(dir).filter(f => f.endsWith(".pdf"));
      for (const f of files) {
        const path = join(dir, f);
        const s = statSync(path);
        // Title: strip the trailing -{uuid8}.pdf
        const title = f.replace(/-[a-f0-9]{8}\.pdf$/i, "").replace(/_/g, " ");
        items.push({
          id: `pdf:${f}`,
          source: "pdf_report",
          type: "PDF Report",
          title,
          preview: `${Math.round(s.size / 1024)} KB, created ${s.birthtime.toISOString().split("T")[0]}`,
          project_id: null,
          project_name: null,
          status: null,
          agent: null,
          created_at: s.birthtime.toISOString(),
          download_url: `/api/library/report?filename=${encodeURIComponent(f)}`,
          size_bytes: s.size,
        });
      }
    } catch { /* no reports dir yet */ }
  }

  // ── 2. Landing pages ────────────────────────────────────────────────────────
  if (!filterType || filterType === "all" || filterType === "landing") {
    for (const r of db.prepare(
      "SELECT id, project_id, title, slug, html, status, visits, conversions, created_at, updated_at FROM landing_pages ORDER BY created_at DESC"
    ).all() as Array<{ id: string; project_id: string | null; title: string; slug: string; html: string; status: string; visits: number; conversions: number; created_at: string; updated_at: string }>) {
      items.push({
        id: `landing:${r.id}`,
        source: "landing_page",
        type: "Landing Page",
        title: r.title,
        preview: `${r.visits || 0} visits, ${r.conversions || 0} conversions — /${r.slug}`,
        body_text: (r.html || "").replace(/<[^>]+>/g, " ").slice(0, 500),
        project_id: r.project_id,
        project_name: r.project_id ? projectNames.get(r.project_id) || null : null,
        status: r.status,
        agent: "agent-marketing",
        created_at: r.created_at,
        updated_at: r.updated_at,
        url: `/lp/${r.slug}`,
      });
    }
  }

  // ── 3. Content pieces ──────────────────────────────────────────────────────
  if (!filterType || filterType === "all" || filterType === "email" || filterType === "social" || filterType === "ad") {
    for (const r of db.prepare(
      "SELECT id, project_id, type, title, content, platform, status, published_url, created_at FROM content_pieces ORDER BY created_at DESC"
    ).all() as Array<{ id: string; project_id: string | null; type: string; title: string; content: string; platform: string; status: string; published_url: string | null; created_at: string }>) {
      // Map content_pieces.type to library category
      const typeLabel = r.type === "post" ? "Social Post"
        : r.type === "email" ? "Email"
        : r.type === "ad" ? "Ad"
        : r.type === "landing_page" ? "Landing Page"
        : r.type === "lead_magnet" ? "Lead Magnet"
        : r.type === "script" ? "Script"
        : r.type;
      // Apply filter
      if (filterType === "email" && r.type !== "email") continue;
      if (filterType === "social" && r.type !== "post") continue;
      if (filterType === "ad" && r.type !== "ad") continue;

      items.push({
        id: `content:${r.id}`,
        source: "content",
        type: typeLabel,
        title: r.title || `(untitled ${r.type})`,
        preview: (r.content || "").slice(0, 200),
        body_text: r.content,
        project_id: r.project_id,
        project_name: r.project_id ? projectNames.get(r.project_id) || null : null,
        status: r.status,
        agent: r.type === "email" ? "agent-sales" : "agent-marketing",
        platform: r.platform,
        created_at: r.created_at,
        url: r.published_url || null,
      });
    }
  }

  // ── 4. Newsletters ─────────────────────────────────────────────────────────
  if (!filterType || filterType === "all" || filterType === "newsletter" || filterType === "email") {
    for (const r of db.prepare(
      "SELECT id, project_id, title, subject, content, status, newsletter_type, recipients, sent_at, sent_count, open_rate, created_at FROM newsletters ORDER BY created_at DESC"
    ).all() as Array<{ id: string; project_id: string | null; title: string; subject: string; content: string; status: string; newsletter_type: string; recipients: number; sent_at: string | null; sent_count: number; open_rate: number; created_at: string }>) {
      items.push({
        id: `newsletter:${r.id}`,
        source: "newsletter",
        type: "Newsletter",
        title: r.title || r.subject,
        preview: `Subject: ${r.subject} · ${r.sent_count || 0} sent${r.open_rate ? `, ${(r.open_rate * 100).toFixed(1)}% open rate` : ""}`,
        body_text: r.content,
        project_id: r.project_id,
        project_name: r.project_id ? projectNames.get(r.project_id) || null : null,
        status: r.status,
        agent: "agent-marketing",
        created_at: r.created_at,
      });
    }
  }

  // ── 5. Ad campaigns ────────────────────────────────────────────────────────
  if (!filterType || filterType === "all" || filterType === "ad") {
    for (const r of db.prepare(
      "SELECT id, project_id, platform, name, objective, budget_daily, budget_total, ad_copy, status, created_at FROM ad_campaigns ORDER BY created_at DESC"
    ).all() as Array<{ id: string; project_id: string | null; platform: string; name: string; objective: string; budget_daily: number; budget_total: number; ad_copy: string; status: string; created_at: string }>) {
      items.push({
        id: `ad:${r.id}`,
        source: "ad_campaign",
        type: "Ad Campaign",
        title: r.name,
        preview: `${r.platform} · ${r.objective || "—"} · budget $${r.budget_daily || 0}/day`,
        body_text: r.ad_copy,
        project_id: r.project_id,
        project_name: r.project_id ? projectNames.get(r.project_id) || null : null,
        status: r.status,
        agent: "agent-marketing",
        platform: r.platform,
        created_at: r.created_at,
      });
    }
  }

  // ── 6. Scheduled social posts ──────────────────────────────────────────────
  if (!filterType || filterType === "all" || filterType === "social") {
    for (const r of db.prepare(
      "SELECT id, project_id, platform, post_text, scheduled_at, status, created_at FROM scheduled_posts ORDER BY created_at DESC LIMIT 200"
    ).all() as Array<{ id: string; project_id: string | null; platform: string; post_text: string; scheduled_at: string; status: string; created_at: string }>) {
      items.push({
        id: `post:${r.id}`,
        source: "scheduled_post",
        type: "Social Post",
        title: (r.post_text || "").slice(0, 80) || "(empty)",
        preview: `${r.platform} · ${r.status}${r.scheduled_at ? ` · scheduled ${r.scheduled_at.split("T")[0]}` : ""}`,
        body_text: r.post_text,
        project_id: r.project_id,
        project_name: r.project_id ? projectNames.get(r.project_id) || null : null,
        status: r.status,
        agent: "agent-marketing",
        platform: r.platform,
        created_at: r.created_at,
      });
    }
  }

  // ── 7. Market insights / research ─────────────────────────────────────────
  if (!filterType || filterType === "all" || filterType === "research") {
    for (const r of db.prepare(
      "SELECT id, project_id, title, description, source, created_at FROM market_insights ORDER BY created_at DESC"
    ).all() as Array<{ id: string; project_id: string | null; title: string; description: string; source: string; created_at: string }>) {
      items.push({
        id: `research:${r.id}`,
        source: "market_insight",
        type: "Research",
        title: r.title,
        preview: (r.description || "").slice(0, 200),
        body_text: r.description,
        project_id: r.project_id,
        project_name: r.project_id ? projectNames.get(r.project_id) || null : null,
        status: null,
        agent: "agent-research",
        created_at: r.created_at,
      });
    }
  }

  // Filter by project
  let filtered = projectId ? items.filter(i => i.project_id === projectId) : items;
  // Search filter
  if (q) {
    filtered = filtered.filter(i =>
      i.title.toLowerCase().includes(q)
      || i.preview.toLowerCase().includes(q)
      || (i.body_text || "").toLowerCase().includes(q)
      || (i.type || "").toLowerCase().includes(q)
    );
  }

  // Sort newest first
  filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  // Counts for each category (unfiltered by type, so tabs always show counts)
  const allItems = items;
  const counts: Record<string, number> = {
    all: allItems.length,
    report: allItems.filter(i => i.source === "pdf_report").length,
    landing: allItems.filter(i => i.source === "landing_page").length,
    email: allItems.filter(i => i.source === "newsletter" || (i.source === "content" && i.type === "Email")).length,
    ad: allItems.filter(i => i.source === "ad_campaign" || (i.source === "content" && i.type === "Ad")).length,
    social: allItems.filter(i => i.source === "scheduled_post" || (i.source === "content" && i.type === "Social Post")).length,
    newsletter: allItems.filter(i => i.source === "newsletter").length,
    research: allItems.filter(i => i.source === "market_insight").length,
  };

  return NextResponse.json({ items: filtered, total: filtered.length, counts });
}
