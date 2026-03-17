import { NextRequest, NextResponse } from "next/server";
import { getIdeaBrowserIdeasPaginated, getIdeaBrowserCategories } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const result = getIdeaBrowserIdeasPaginated({
      page: Number(sp.get("page")) || 1,
      perPage: Number(sp.get("per_page")) || 48,
      search: sp.get("search") || undefined,
      category: sp.get("category") || undefined,
      sortBy: sp.get("sort") || undefined,
    });
    const categories = getIdeaBrowserCategories();
    return NextResponse.json({ ...result, categories });
  } catch (error) {
    console.error("GET /api/ideabrowser/ideas/paginated error:", error);
    return NextResponse.json({ error: "Failed to fetch ideas" }, { status: 500 });
  }
}
