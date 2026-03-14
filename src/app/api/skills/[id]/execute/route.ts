import { NextRequest, NextResponse } from "next/server";
import { getSkill, logActivity } from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const { project_id, input } = body;

    if (!input) {
      return NextResponse.json(
        { error: "input is required" },
        { status: 400 }
      );
    }

    const skill = await getSkill(id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // Mock execution: fill in the skill's prompt_template with the provided input
    const filledPrompt = skill.prompt_template
      ? skill.prompt_template
          .replace(/\{\{input\}\}/g, input)
          .replace(/\{\{project_id\}\}/g, project_id || "")
      : `Skill "${skill.name}" executed with input: ${input}`;

    const result = {
      skill_id: id,
      skill_name: skill.name,
      project_id: project_id || null,
      input,
      output: filledPrompt,
      executed_at: new Date().toISOString(),
      mock: true,
    };

    await logActivity({
      action: "skill_executed",
      project_id: project_id || undefined,
      details: `Executed skill: ${skill.name}`,
      skill_used: skill.name,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/skills/[id]/execute error:", error);
    return NextResponse.json(
      { error: "Failed to execute skill" },
      { status: 500 }
    );
  }
}
