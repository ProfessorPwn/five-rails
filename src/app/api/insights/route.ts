import { NextRequest, NextResponse } from "next/server";
import { getInsights, createInsight, logActivity } from "@/lib/db";
import { validateRequired, sanitizeBody } from "@/lib/validation";

export async function GET() {
  try {
    const insights = await getInsights();
    return NextResponse.json(insights);
  } catch (error) {
    console.error("GET /api/insights error:", error);
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const err = validateRequired(raw, ["title"]);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const body = sanitizeBody(raw, ["description", "pain_point", "solution"]);
    const insight = await createInsight(body);
    await logActivity({
      action: "insight_created",
      project_id: body.project_id,
      details: `Created insight: ${body.title || "Untitled"}`,
    });
    return NextResponse.json(insight, { status: 201 });
  } catch (error) {
    console.error("POST /api/insights error:", error);
    return NextResponse.json(
      { error: "Failed to create insight" },
      { status: 500 }
    );
  }
}
