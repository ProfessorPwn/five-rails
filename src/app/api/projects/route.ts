import { NextRequest, NextResponse } from "next/server";
import { getProjects, createProject, logActivity } from "@/lib/db";
import { validateRequired, sanitizeBody, safeParseJson } from "@/lib/validation";

export async function GET() {
  try {
    const projects = await getProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await safeParseJson(request);
    if (!raw) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const err = validateRequired(raw, ["name"]);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const body = sanitizeBody(raw, ["description"]);
    const project = await createProject(body);
    await logActivity({
      action: "project_created",
      project_id: project.id,
      details: `Created project: ${body.name || "Untitled"}`,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects error:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
