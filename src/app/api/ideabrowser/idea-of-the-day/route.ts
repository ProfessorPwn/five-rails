import { NextResponse } from "next/server";
import { getIdeaOfTheDay } from "@/lib/db";

export async function GET() {
  try {
    const idea = getIdeaOfTheDay();
    if (!idea) {
      return NextResponse.json({ error: "No ideas found" }, { status: 404 });
    }
    return NextResponse.json(idea);
  } catch (error) {
    console.error("GET /api/ideabrowser/idea-of-the-day error:", error);
    return NextResponse.json({ error: "Failed to fetch idea of the day" }, { status: 500 });
  }
}
