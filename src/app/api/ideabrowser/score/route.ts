import { NextResponse } from "next/server";
import { scoreAllIdeaBrowserIdeas } from "@/lib/db";

export async function POST() {
  try {
    const scored = scoreAllIdeaBrowserIdeas();
    return NextResponse.json({ scored });
  } catch (error) {
    console.error("POST /api/ideabrowser/score error:", error);
    return NextResponse.json({ error: "Failed to score ideas" }, { status: 500 });
  }
}
