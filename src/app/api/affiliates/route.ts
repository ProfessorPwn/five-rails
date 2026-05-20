import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const affiliates = getDb().prepare("SELECT * FROM affiliates ORDER BY total_earned DESC").all();
    const commissions = getDb().prepare("SELECT * FROM commissions ORDER BY created_at DESC LIMIT 50").all();
    return NextResponse.json({ affiliates, recent_commissions: commissions });
  } catch (error) {
    console.error("GET /api/affiliates error:", error);
    return NextResponse.json({ error: "Failed to fetch affiliates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = uuidv4();
    const code = uuidv4().slice(0, 8).toUpperCase();
    getDb().prepare(`
      INSERT INTO affiliates (id, project_id, name, email, referral_code, commission_rate, commission_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.project_id || null, body.name, body.email, code,
      body.commission_rate || 0.2, body.commission_type || "recurring");
    const affiliate = getDb().prepare("SELECT * FROM affiliates WHERE id = ?").get(id);
    return NextResponse.json(affiliate, { status: 201 });
  } catch (error) {
    console.error("POST /api/affiliates error:", error);
    return NextResponse.json({ error: "Failed to create affiliate" }, { status: 500 });
  }
}
