import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

const STAGE_SCORES: Record<string, number> = {
  lead: 0, contacted: 5, qualified: 15, proposal: 25, negotiation: 35, won: 50, lost: 0,
};

export async function GET(request: NextRequest) {
  try {
    const dealId = request.nextUrl.searchParams.get("deal_id");
    const wantActivities = request.nextUrl.searchParams.get("activities");

    if (dealId && wantActivities) {
      const activities = getDb().prepare("SELECT * FROM deal_activities WHERE deal_id = ? ORDER BY created_at DESC").all(dealId);
      return NextResponse.json(activities);
    }

    const deals = getDb().prepare("SELECT * FROM deals ORDER BY updated_at DESC").all();
    return NextResponse.json(deals);
  } catch (error) {
    console.error("GET /api/deals error:", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = uuidv4();
    const stage = body.stage || "lead";

    getDb().prepare(`
      INSERT INTO deals (id, project_id, contact_id, title, value, stage, expected_close, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.project_id || null, body.contact_id || null, body.title || "New Deal",
      body.value || 0, stage, body.expected_close || null, body.notes || null);

    // Log deal activity
    const actId = uuidv4();
    getDb().prepare("INSERT INTO deal_activities (id, deal_id, type, description) VALUES (?, ?, 'created', ?)").run(actId, id, `Deal created at stage: ${stage}`);

    // Update lead score if contact is linked
    if (body.contact_id) {
      const points = STAGE_SCORES[stage] || 0;
      if (points > 0) {
        getDb().prepare("UPDATE outbound_contacts SET lead_score = lead_score + ? WHERE id = ?").run(points, body.contact_id);
      }
    }

    logActivity({ action: "deal_created", project_id: body.project_id, details: `Deal "${body.title}" created ($${body.value || 0}) at stage: ${stage}` });

    const deal = getDb().prepare("SELECT * FROM deals WHERE id = ?").get(id);
    return NextResponse.json(deal, { status: 201 });
  } catch (error) {
    console.error("POST /api/deals error:", error);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}

// PATCH — update deal stage (triggers lead scoring + activity log)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, stage, value, notes } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const deal = getDb().prepare("SELECT * FROM deals WHERE id = ?").get(id) as { id: string; stage: string; contact_id: string | null; title: string; project_id: string | null } | undefined;
    if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    const oldStage = deal.stage;
    const newStage = stage || oldStage;

    const updates: string[] = [];
    const vals: unknown[] = [];
    if (stage) { updates.push("stage = ?"); vals.push(stage); }
    if (value !== undefined) { updates.push("value = ?"); vals.push(value); }
    if (notes) { updates.push("notes = ?"); vals.push(notes); }
    updates.push("updated_at = datetime('now')");
    vals.push(id);

    if (updates.length > 1) {
      getDb().prepare(`UPDATE deals SET ${updates.join(", ")} WHERE id = ?`).run(...vals);
    }

    // Log stage change activity
    if (stage && stage !== oldStage) {
      const actId = uuidv4();
      getDb().prepare("INSERT INTO deal_activities (id, deal_id, type, description) VALUES (?, ?, 'stage_change', ?)").run(actId, id, `Stage: ${oldStage} → ${stage}`);

      // Update lead score based on stage progression
      if (deal.contact_id) {
        const oldPoints = STAGE_SCORES[oldStage] || 0;
        const newPoints = STAGE_SCORES[newStage] || 0;
        const diff = newPoints - oldPoints;
        if (diff !== 0) {
          getDb().prepare("UPDATE outbound_contacts SET lead_score = CASE WHEN lead_score + ? < 0 THEN 0 ELSE lead_score + ? END WHERE id = ?").run(diff, diff, deal.contact_id);
        }
      }

      logActivity({ action: "deal_stage_changed", project_id: deal.project_id || undefined, details: `Deal "${deal.title}" moved: ${oldStage} → ${stage}` });

      // Create in-app notification when deal reaches "won" stage
      if (stage === "won") {
        try {
          const dealData = getDb().prepare("SELECT * FROM deals WHERE id = ?").get(id) as { title: string; value: number } | undefined;
          getDb().prepare(
            "INSERT INTO notifications (id, type, title, message, link) VALUES (?, ?, ?, ?, ?)"
          ).run(
            uuidv4(),
            "deal_stage_changed",
            `Deal won: ${dealData?.title || "Unknown"}`,
            `Deal worth $${dealData?.value?.toLocaleString() || "0"} has been marked as won`,
            "/pipeline"
          );
        } catch {
          // non-critical
        }
      }
    }

    const updated = getDb().prepare("SELECT * FROM deals WHERE id = ?").get(id);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/deals error:", error);
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}
