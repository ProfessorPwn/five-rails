import { NextRequest, NextResponse } from "next/server";
import { getWatchdogRules, updateWatchdogRule } from "@/lib/db";

// GET /api/agents/watchdog/rules — List all detection rules
export async function GET() {
  try {
    const rules = getWatchdogRules();
    return NextResponse.json(rules);
  } catch (error) {
    console.error("GET /api/agents/watchdog/rules error:", error);
    return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 });
  }
}

// PATCH /api/agents/watchdog/rules — Update a rule
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Rule id is required" }, { status: 400 });
    }

    updateWatchdogRule(id, updates);
    const rules = getWatchdogRules();
    return NextResponse.json(rules);
  } catch (error) {
    console.error("PATCH /api/agents/watchdog/rules error:", error);
    return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
  }
}
