import { NextRequest, NextResponse } from "next/server";
import { getAgentRuns } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const runs = getAgentRuns(id);
    return NextResponse.json(runs);
  } catch (error) {
    console.error("GET /api/agents/[id]/runs error:", error);
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 });
  }
}
