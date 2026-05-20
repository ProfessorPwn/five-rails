import { NextRequest, NextResponse } from "next/server";
import { toggleIdeaBookmark } from "@/lib/db";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const isBookmarked = toggleIdeaBookmark(id);
    return NextResponse.json({ is_bookmarked: isBookmarked });
  } catch (error) {
    console.error("POST /api/ideabrowser/ideas/[id]/bookmark error:", error);
    return NextResponse.json({ error: "Failed to toggle bookmark" }, { status: 500 });
  }
}
