import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Lead scoring engine (HubSpot pattern)
// Points: opened email +1, clicked link +5, visited pricing +10, submitted form +20
// Properties: title match +15, company size match +10

const SCORING_RULES = {
  email_opened: 1,
  email_clicked: 5,
  email_replied: 15,
  form_submitted: 20,
  page_visited: 3,
  pricing_viewed: 10,
  demo_requested: 25,
  content_downloaded: 8,
  // Property-based
  title_match: 15,
  company_size_match: 10,
  industry_match: 8,
};

export async function GET() {
  try {
    // Return all contacts with their lead scores, sorted by score desc
    const contacts = getDb().prepare(
      "SELECT * FROM outbound_contacts ORDER BY lead_score DESC, last_engaged_at DESC"
    ).all();
    return NextResponse.json({ contacts, scoring_rules: SCORING_RULES });
  } catch (error) {
    console.error("GET /api/lead-scoring error:", error);
    return NextResponse.json({ error: "Failed to fetch lead scores" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contact_id, event_type } = body;

    if (!contact_id || !event_type) {
      return NextResponse.json({ error: "contact_id and event_type are required" }, { status: 400 });
    }

    const points = SCORING_RULES[event_type as keyof typeof SCORING_RULES] || 1;

    // Get current contact
    const contact = getDb().prepare("SELECT * FROM outbound_contacts WHERE id = ?").get(contact_id) as { lead_score: number; engagement_history: string } | undefined;
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const history = JSON.parse(contact.engagement_history || "[]");
    history.push({ event: event_type, points, at: new Date().toISOString() });

    const newScore = (contact.lead_score || 0) + points;

    getDb().prepare(`
      UPDATE outbound_contacts
      SET lead_score = ?, engagement_history = ?, last_engaged_at = datetime('now')
      WHERE id = ?
    `).run(newScore, JSON.stringify(history), contact_id);

    return NextResponse.json({
      contact_id,
      event_type,
      points_added: points,
      new_score: newScore,
      tier: newScore >= 50 ? "hot" : newScore >= 20 ? "warm" : "cold",
    });
  } catch (error) {
    console.error("POST /api/lead-scoring error:", error);
    return NextResponse.json({ error: "Failed to update lead score" }, { status: 500 });
  }
}
