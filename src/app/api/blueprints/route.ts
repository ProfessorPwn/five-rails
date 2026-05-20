import { NextResponse } from "next/server";
import { getBlueprints } from "@/lib/db";

export async function GET() {
  try {
    const blueprints = getBlueprints();
    return NextResponse.json(blueprints);
  } catch (error) {
    console.error("GET /api/blueprints error:", error);
    return NextResponse.json({ error: "Failed to fetch blueprints" }, { status: 500 });
  }
}
