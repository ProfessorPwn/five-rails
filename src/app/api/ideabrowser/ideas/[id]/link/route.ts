import { NextRequest, NextResponse } from "next/server";
import {
  getIdeaBrowserIdea,
  linkIdeaToProject,
  createProject,
  getProject,
  logActivity,
} from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const idea = getIdeaBrowserIdea(id);
    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const body = await safeParseJson(request);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid or missing JSON body" },
        { status: 400 }
      );
    }

    let projectId: string;

    if (body.create_project) {
      // Create a new project from the idea, then link
      const projectName = body.project_name
        ? String(body.project_name).trim()
        : idea.title;

      if (!projectName) {
        return NextResponse.json(
          { error: "project_name is required when creating a new project" },
          { status: 400 }
        );
      }

      const project = createProject({
        name: projectName,
        description: idea.description || `Project created from IdeaBrowser idea: ${idea.title}`,
        status: "idea",
        niche: idea.category || undefined,
        target_audience: idea.target_market || undefined,
      });

      projectId = project.id;

      logActivity({
        action: "project_created_from_idea",
        project_id: projectId,
        details: `Created project "${project.name}" from IdeaBrowser idea "${idea.title}"`,
      });
    } else if (body.project_id) {
      // Link to an existing project
      projectId = String(body.project_id);

      const project = getProject(projectId);
      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }
    } else {
      return NextResponse.json(
        {
          error:
            "Provide either project_id to link to an existing project, or create_project: true to create a new one",
        },
        { status: 400 }
      );
    }

    const linked = linkIdeaToProject(id, projectId);
    if (!linked) {
      return NextResponse.json(
        { error: "Failed to link idea to project" },
        { status: 500 }
      );
    }

    logActivity({
      action: "ideabrowser_idea_linked",
      project_id: projectId,
      details: `Linked IdeaBrowser idea "${idea.title}" to project ${projectId}`,
    });

    // Return the updated idea with project info
    const updatedIdea = getIdeaBrowserIdea(id);
    const project = getProject(projectId);

    return NextResponse.json({
      idea: updatedIdea,
      project: project
        ? { id: project.id, name: project.name, status: project.status }
        : null,
    });
  } catch (error) {
    console.error("POST /api/ideabrowser/ideas/[id]/link error:", error);
    return NextResponse.json(
      { error: "Failed to link idea to project" },
      { status: 500 }
    );
  }
}
