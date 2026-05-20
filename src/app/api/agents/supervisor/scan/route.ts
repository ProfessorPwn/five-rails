import { NextResponse } from "next/server";
import { scanForStalls } from "@/lib/agents/supervisor";

export async function POST() {
  try {
    const result = await scanForStalls();
    return NextResponse.json({
      stalled_count: result.stalled.length,
      notified_count: result.notified.length,
      stalled_ids: result.notified,
    });
  } catch (error) {
    console.error("POST /api/agents/supervisor/scan error:", error);
    return NextResponse.json(
      { error: "Supervisor scan failed", details: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
