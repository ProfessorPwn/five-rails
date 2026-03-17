import { NextRequest, NextResponse } from "next/server";
import { getProject, getActiveSkills, getConnections, saveProjectPlan, logActivity, getProjectIdeaBrowserIdeas } from "@/lib/db";
import type { ActionPlanStep } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const project = getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const summary = [project.description, project.niche, project.target_audience]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (!summary) {
      return NextResponse.json({
        error: "Project has no summary, niche, or target audience. Add project details first.",
      }, { status: 400 });
    }

    const connections = getConnections();
    const activeConnection = connections.find((c) => c.is_active === 1);

    if (!activeConnection) {
      return NextResponse.json({
        error: "No active LLM connection configured",
        hint: "Go to Connections and add an Ollama or Anthropic connection.",
      }, { status: 503 });
    }

    const skills = getActiveSkills();

    const skillList = skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
    }));

    // Determine which built-in actions to contextualize based on existing data
    const hasNiche = !!project.niche?.trim();
    const hasAudience = !!project.target_audience?.trim();
    const hasDescription = !!project.description?.trim();

    // Fetch IdeaBrowser ideas linked to this project
    const ideaBrowserIdeas = getProjectIdeaBrowserIdeas(id);
    const ideaBrowserSection = ideaBrowserIdeas.length > 0
      ? `\nIDEABROWSER RESEARCH (validated ideas linked to this project — use these to inform your action plan):\n${ideaBrowserIdeas.slice(0, 10).map((idea) => {
          const details = [
            idea.category ? `Category: ${idea.category}` : null,
            idea.search_volume ? `Search Volume: ${idea.search_volume}` : null,
            idea.pain_level ? `Pain Level: ${idea.pain_level}` : null,
            idea.revenue_potential ? `Revenue: ${idea.revenue_potential}` : null,
            idea.target_market ? `Market: ${idea.target_market}` : null,
            idea.go_to_market ? `GTM: ${idea.go_to_market}` : null,
            idea.competition ? `Competition: ${idea.competition}` : null,
          ].filter(Boolean).join(", ");
          return `- "${idea.title}"${idea.description ? `: ${idea.description.slice(0, 150)}` : ""}${details ? ` (${details})` : ""}`;
        }).join("\n")}\n\nUse the above research data to make your action plan MORE SPECIFIC. Reference specific ideas, metrics, market data, and GTM strategies from the IdeaBrowser data in your step descriptions and promptContext fields.\n`
      : "";

    const prompt = `You are a project advisor. Given a project's details and a list of available AI skills, generate a tailored, ordered action plan.

CRITICAL: The project summary below is your SINGLE SOURCE OF TRUTH. Every step you generate must be directly justified by what the project is actually about. Do NOT add generic steps. Do NOT assume the project needs market research, outbound sales, lead magnets, or any other capability unless the project summary explicitly calls for it.

PROJECT SUMMARY (read this carefully — this determines everything):
- Name: ${project.name}
- Description: ${project.description || "(none)"}
- Niche: ${project.niche || "(none)"}
- Target Audience: ${project.target_audience || "(none)"}
- Status: ${project.status}
${ideaBrowserSection}
AVAILABLE SKILLS (each can be executed by the system):
${skillList.map((s) => `- ${s.id}: ${s.name} — ${s.description}`).join("\n")}

BUILT-IN ACTIONS (use only when the project data justifies it):
${!hasNiche || !hasAudience ? "- define-niche: Opens editor to set project niche and target audience" : "- define-niche: ALREADY FILLED (niche: " + project.niche + ", audience: " + project.target_audience + ") — do NOT include this step"}
${!hasDescription ? "- define-offer: Opens editor to refine the project description / value proposition" : "- define-offer: ALREADY FILLED — do NOT include this step unless description is vague"}
- add-contacts: Opens form to add outbound contacts for sales outreach (only if the project involves outbound/sales)

RULES:
1. ALIGNMENT CHECK: Before generating any step, ask yourself: "Does the project summary mention or imply this?" If the answer is no, DO NOT include that step.
2. Only include skills that are relevant to THIS specific project's actual goals. For example:
   - If the project is about building a SaaS product, include development and content steps — NOT market research unless the summary says research is needed.
   - If the project is about writing a book, include content creation steps — NOT outbound sales.
   - If the project already has a niche defined, do NOT include "define niche" as a step.
   - If the project already has a description, do NOT include "define offer" unless the description is vague.
3. Order steps logically — what must happen first, second, third. Each step should build on the previous one.
4. For each skill step, write a "promptContext" that is the specific instruction to pass to that skill, referencing the ACTUAL project content (name, niche, audience, description). Never use generic prompts.
5. Write labels and descriptions that reference the actual project by name and specifics, not generic text.
6. Use 5-10 steps total. Include enough steps to give the user a complete path forward.
7. For badge values, use one of: "Setup", "Research", "Content", "Sales", "Operations", "Development", or a short custom label.
8. For badgeVariant, use one of: "default", "info", "warning", "rose", "amber".
9. For saveAs (only for skill steps), use ONLY one of these exact values: "insight", "landing_page", "email", "post", "lead_magnet", "script". No other values are allowed. Pick what best matches the skill's output type.

VALIDATION: Before returning your answer, check each step:
- Is this step justified by the project summary? If not, remove it.
- Would the user expect this step given their project description? If not, remove it.
- Does this step use a generic label like "Conduct Market Research" without the project calling for it? If so, remove it.

Return ONLY a JSON array of steps. No markdown, no explanation, no code fences.

Each step object must have exactly these fields:
{
  "id": "step-1",
  "label": "Short action label referencing the project",
  "desc": "One sentence explaining why this step matters for THIS project",
  "actionType": "skill" or "define-niche" or "define-offer" or "add-contacts",
  "skillId": "skill-id-here (only if actionType is skill)",
  "skillName": "Skill Name (only if actionType is skill)",
  "promptContext": "Specific instruction for the skill (only if actionType is skill)",
  "badge": "Category",
  "badgeVariant": "info",
  "saveAs": "insight (only if actionType is skill)"
}`;

    const { provider, base_url, api_key_encrypted, model } = activeConnection;
    let output: string;

    if (provider === "ollama") {
      output = await callOllama(prompt, model || "llama3", base_url || "http://127.0.0.1:11434");
    } else if (provider === "anthropic") {
      output = await callClaude(prompt, api_key_encrypted || "", model || "claude-sonnet-4-20250514");
    } else {
      output = await callOpenAI(prompt, model || "gpt-4o-mini", base_url || "https://api.openai.com", api_key_encrypted || "");
    }

    // Parse the JSON from the LLM response
    const plan = parseActionPlan(output);

    if (!plan || plan.length === 0) {
      return NextResponse.json({
        error: "Failed to generate a valid action plan. The LLM response could not be parsed.",
        raw: output.slice(0, 500),
      }, { status: 500 });
    }

    // Validate each step has required fields and valid skillId references
    const validSkillIds = new Set(skills.map((s) => s.id));
    const validSaveAs = new Set(["insight", "landing_page", "email", "post", "lead_magnet", "script"]);
    const validatedPlan: ActionPlanStep[] = plan.map((step: ActionPlanStep, idx: number) => {
      const validated: ActionPlanStep = {
        id: step.id || `step-${idx + 1}`,
        label: step.label || `Step ${idx + 1}`,
        desc: step.desc || "",
        actionType: step.actionType || "skill",
        badge: step.badge || "Action",
        badgeVariant: step.badgeVariant || "default",
      };

      if (validated.actionType === "skill") {
        if (step.skillId && validSkillIds.has(step.skillId)) {
          validated.skillId = step.skillId;
          validated.skillName = step.skillName || skills.find((s) => s.id === step.skillId)?.name || "";
          validated.promptContext = step.promptContext || "";
          // Coerce saveAs to valid values only
          validated.saveAs = (step.saveAs && validSaveAs.has(step.saveAs)) ? step.saveAs : "insight";
        } else {
          // Invalid skill reference — skip this step
          return null;
        }
      }

      return validated;
    }).filter(Boolean) as ActionPlanStep[];

    // Re-number step IDs after filtering
    validatedPlan.forEach((step, idx) => {
      step.id = `step-${idx + 1}`;
    });

    if (validatedPlan.length === 0) {
      return NextResponse.json({
        error: "Generated plan had no valid steps. Skills may not match available skills.",
      }, { status: 500 });
    }

    // Save to project
    saveProjectPlan(id, validatedPlan);

    logActivity({
      action: "plan_generated",
      project_id: id,
      details: `Generated ${validatedPlan.length}-step action plan based on project summary`,
    });

    return NextResponse.json({ plan: validatedPlan });
  } catch (error) {
    console.error("POST /api/projects/[id]/generate-plan error:", error);
    return NextResponse.json({ error: "Failed to generate action plan" }, { status: 500 });
  }
}

function parseActionPlan(raw: string): ActionPlanStep[] | null {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Try extracting JSON array from markdown or surrounding text
  }

  // Try to find a JSON array in the response
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Could not parse
    }
  }

  return null;
}

async function callOllama(prompt: string, model: string, host: string): Promise<string> {
  const { Ollama } = await import("ollama");
  const ollama = new Ollama({ host });
  const response = await ollama.chat({
    model,
    messages: [{ role: "user", content: prompt }],
    stream: false,
  });
  return response.message.content;
}

async function callClaude(prompt: string, apiKey: string, model: string): Promise<string> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  let output = "";
  for await (const msg of query({
    prompt,
    options: {
      model,
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: apiKey },
      tools: [],
      maxTurns: 1,
      persistSession: false,
    },
  })) {
    if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "text") output += block.text;
      }
    } else if (msg.type === "result" && msg.subtype === "success") {
      if (msg.result && !output) output = msg.result;
    }
  }
  return output;
}

async function callOpenAI(prompt: string, model: string, baseUrl: string, apiKey: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
