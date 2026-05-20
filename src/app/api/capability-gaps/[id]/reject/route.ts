import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const gap = getDb().prepare("SELECT missing_capability, status FROM capability_gaps WHERE id = ?").get(id) as
      | { missing_capability: string; status: string }
      | undefined;

    if (!gap) return NextResponse.json({ error: "Gap not found" }, { status: 404 });
    if (gap.status !== "pending") return NextResponse.json({ error: `Gap already ${gap.status}` }, { status: 400 });

    getDb().prepare("UPDATE capability_gaps SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?").run(id);
    logActivity({ action: "capability_gap_rejected", details: `Rejected: ${gap.missing_capability}` });

    return NextResponse.json({ rejected: true });
  } catch (error) {
    console.error("POST /api/capability-gaps/[id]/reject error:", error);
    return NextResponse.json({ error: "Reject failed" }, { status: 500 });
  }
}
