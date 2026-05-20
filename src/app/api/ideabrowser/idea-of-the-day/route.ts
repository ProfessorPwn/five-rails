import { NextRequest, NextResponse } from "next/server";
import { getIdeaOfTheDay, getAdjacentIdeaDates } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const date = searchParams.get("date") || undefined;

    const idea = getIdeaOfTheDay(date);
    if (!idea) {
      return NextResponse.json({ error: "No ideas found" }, { status: 404 });
    }

    // Include adjacent dates for navigation
    const adjacent = idea.idea_date ? getAdjacentIdeaDates(idea.idea_date) : { prev: null, next: null };

    return NextResponse.json({ ...idea, _nav: adjacent });
  } catch (error) {
    console.error("GET /api/ideabrowser/idea-of-the-day error:", error);
    return NextResponse.json({ error: "Failed to fetch idea of the day" }, { status: 500 });
  }
}
