import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// Automated ad rules (Revealbot/Birch pattern)
// Conditions: [{ metric: "cpa", operator: ">", value: 50, window_hours: 3 }]
// Actions: [{ type: "pause_ad", params: {} }, { type: "decrease_budget", params: { pct: 20 } }]

export async function GET() {
  try {
    const rules = getDb().prepare("SELECT * FROM ad_rules ORDER BY created_at DESC").all();
    return NextResponse.json(rules);
  } catch (error) {
    console.error("GET /api/ad-rules error:", error);
    return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = uuidv4();

    const conditions = body.conditions || [
      { metric: "cpa", operator: ">", value: 50, window_hours: 3 },
      { metric: "roas", operator: "<", value: 2.0, window_hours: 3 },
    ];

    const actions = body.actions || [
      { type: "pause_ad_set", params: {} },
      { type: "decrease_budget", params: { pct: 20 } },
      { type: "notify", params: { message: "Ad paused due to high CPA" } },
    ];

    getDb().prepare(`
      INSERT INTO ad_rules (id, campaign_id, name, conditions, actions, check_interval_min, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.campaign_id || null,
      body.name || "Auto-pause high CPA",
      JSON.stringify(conditions),
      JSON.stringify(actions),
      body.check_interval_min || 60,
      body.is_active !== false ? 1 : 0,
    );

    const rule = getDb().prepare("SELECT * FROM ad_rules WHERE id = ?").get(id);
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error("POST /api/ad-rules error:", error);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }
}
