import { NextRequest, NextResponse } from "next/server";
import { getNewsletters, getProjectNewsletters, createNewsletter, logActivity } from "@/lib/db";
import { safeParseJson, validateRequired } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("project_id");
    const newsletters = projectId
      ? getProjectNewsletters(projectId)
      : getNewsletters();
    return NextResponse.json(newsletters);
  } catch (error) {
    console.error("GET /api/newsletters error:", error);
    return NextResponse.json({ error: "Failed to fetch newsletters" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const err = validateRequired(body, ["title"]);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const newsletter = createNewsletter({
      project_id: body.project_id || undefined,
      title: String(body.title),
      subject: body.subject ? String(body.subject) : undefined,
      content: body.content ? String(body.content) : undefined,
      status: body.status || "draft",
      newsletter_type: body.newsletter_type || "weekly",
      recipients: body.recipients ? String(body.recipients) : undefined,
      subject_b: body.subject_b ? String(body.subject_b) : undefined,
      subject_c: body.subject_c ? String(body.subject_c) : undefined,
      ab_test_sample_pct: body.ab_test_sample_pct ? Number(body.ab_test_sample_pct) : undefined,
    });

    logActivity({
      action: "newsletter_created",
      project_id: body.project_id || undefined,
      details: `Created newsletter: "${newsletter.title}"`,
      rail: "audience",
    });

    return NextResponse.json(newsletter, { status: 201 });
  } catch (error) {
    console.error("POST /api/newsletters error:", error);
    return NextResponse.json({ error: "Failed to create newsletter" }, { status: 500 });
  }
}
