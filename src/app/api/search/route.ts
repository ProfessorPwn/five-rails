import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  url: string;
}

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [], total: 0 });
    }

    const pattern = `%${q}%`;
    const results: SearchResult[] = [];

    // Projects
    const projects = getDb().prepare(
      "SELECT id, name, niche, status FROM projects WHERE name LIKE ? OR description LIKE ? OR niche LIKE ? LIMIT 5"
    ).all(pattern, pattern, pattern) as { id: string; name: string; niche: string; status: string }[];
    for (const p of projects) {
      results.push({ type: "project", id: p.id, title: p.name, subtitle: p.niche || p.status, url: `/projects/${p.id}` });
    }

    // Contacts
    const contacts = getDb().prepare(
      "SELECT id, name, email, company FROM outbound_contacts WHERE name LIKE ? OR email LIKE ? OR company LIKE ? LIMIT 5"
    ).all(pattern, pattern, pattern) as { id: string; name: string; email: string; company: string }[];
    for (const c of contacts) {
      results.push({ type: "contact", id: c.id, title: c.name, subtitle: c.email || c.company || "", url: "/outbound" });
    }

    // Content
    const content = getDb().prepare(
      "SELECT id, title, platform, status FROM content_pieces WHERE title LIKE ? OR content LIKE ? LIMIT 5"
    ).all(pattern, pattern) as { id: string; title: string; platform: string; status: string }[];
    for (const c of content) {
      results.push({ type: "content", id: c.id, title: c.title, subtitle: `${c.platform} · ${c.status}`, url: "/audience" });
    }

    // Deals
    const deals = getDb().prepare(
      "SELECT id, title, stage, value FROM deals WHERE title LIKE ? OR notes LIKE ? LIMIT 5"
    ).all(pattern, pattern) as { id: string; title: string; stage: string; value: number }[];
    for (const d of deals) {
      results.push({ type: "deal", id: d.id, title: d.title, subtitle: `${d.stage} · $${d.value}`, url: "/pipeline" });
    }

    // Ideas
    const ideas = getDb().prepare(
      "SELECT id, title, category FROM ideabrowser_ideas WHERE title LIKE ? OR description LIKE ? LIMIT 5"
    ).all(pattern, pattern) as { id: string; title: string; category: string }[];
    for (const i of ideas) {
      results.push({ type: "idea", id: i.id, title: i.title, subtitle: i.category || "", url: "/ideabrowser" });
    }

    // Skills
    const skills = getDb().prepare(
      "SELECT id, name, description FROM skills WHERE name LIKE ? OR description LIKE ? LIMIT 3"
    ).all(pattern, pattern) as { id: string; name: string; description: string }[];
    for (const s of skills) {
      results.push({ type: "skill", id: s.id, title: s.name, subtitle: (s.description || "").slice(0, 80), url: "/skills" });
    }

    // Agents
    const agents = getDb().prepare(
      "SELECT id, name, role, department FROM agents WHERE name LIKE ? OR role LIKE ? LIMIT 3"
    ).all(pattern, pattern) as { id: string; name: string; role: string; department: string }[];
    for (const a of agents) {
      results.push({ type: "agent", id: a.id, title: a.name, subtitle: `${a.role} · ${a.department}`, url: `/agents/${a.id}` });
    }

    // Newsletters
    const newsletters = getDb().prepare(
      "SELECT id, title, subject, status FROM newsletters WHERE title LIKE ? OR subject LIKE ? LIMIT 3"
    ).all(pattern, pattern) as { id: string; title: string; subject: string; status: string }[];
    for (const n of newsletters) {
      results.push({ type: "newsletter", id: n.id, title: n.title, subtitle: n.subject || n.status, url: "/newsletters" });
    }

    // Blueprints
    const blueprints = getDb().prepare(
      "SELECT id, niche, status FROM blueprints WHERE niche LIKE ? LIMIT 3"
    ).all(pattern) as { id: string; niche: string; status: string }[];
    for (const b of blueprints) {
      results.push({ type: "blueprint", id: b.id, title: b.niche, subtitle: b.status, url: `/blueprint/${b.id}` });
    }

    return NextResponse.json({ results: results.slice(0, limit), total: results.length });
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ results: [], total: 0, error: "Search failed" });
  }
}
