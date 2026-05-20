import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { createHandoff } from "@/lib/agents/supervisor";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const db = getDb();

    // Step 0: Fetch the idea
    const idea = db.prepare("SELECT * FROM ideabrowser_ideas WHERE id = ?").get(id) as {
      id: string;
      title: string;
      description: string | null;
      category: string | null;
      target_market: string | null;
      overall_score: number;
      project_id: string | null;
    } | undefined;

    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    if (idea.project_id) {
      return NextResponse.json({
        error: "Idea already launched",
        project_id: idea.project_id,
      }, { status: 409 });
    }

    // Step 1: Create project from idea
    const projectId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO projects (id, name, description, status, niche, target_audience, score, rail_status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?, '{}', ?, ?)
    `).run(
      projectId,
      idea.title,
      idea.description || "",
      idea.category || "",
      idea.target_market || "",
      idea.overall_score || 0,
      now,
      now
    );

    // Link idea to project
    db.prepare("UPDATE ideabrowser_ideas SET project_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(projectId, idea.id);

    // Step 2: Generate blueprint by calling the metrics generate endpoint internally
    let blueprintId: string | null = null;
    try {
      const baseUrl = request.nextUrl.origin;
      const metricsRes = await fetch(`${baseUrl}/api/metrics/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: `${idea.category || "Business"}: ${idea.title}`,
          ideaId: idea.id,
          projectId: projectId,
        }),
      });

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        blueprintId = metricsData.blueprintId || null;

        // Link blueprint to project if it wasn't linked during generation
        if (blueprintId) {
          db.prepare("UPDATE blueprints SET project_id = ?, updated_at = datetime('now') WHERE id = ?")
            .run(projectId, blueprintId);
        }
      }
    } catch (err) {
      console.error("Blueprint generation failed during launch:", err);
      // Non-fatal: project is still created, blueprint can be generated later
    }

    // Step 3: Auto-assign to agents
    const tasksCreated: string[] = [];

    // Research task for Peter Thiel (agent-research)
    const researchTaskId = uuidv4();
    try {
      db.prepare(`
        INSERT INTO agent_tasks (id, name, description, status, agent_id, skill_id, progress_pct, current_step_label, created_at)
        VALUES (?, ?, ?, 'queued', 'agent-research', NULL, 0, 'Market analysis', datetime('now'))
      `).run(
        researchTaskId,
        `Research: ${idea.title}`,
        `Conduct market intelligence research for "${idea.title}". Analyze competitors, market size, and validate the opportunity identified in the IdeaBrowser scoring.`
      );
      tasksCreated.push(researchTaskId);
    } catch { /* agent may not exist yet */ }

    // Executive review task for Ray Dalio (agent-executive)
    const execTaskId = uuidv4();
    try {
      db.prepare(`
        INSERT INTO agent_tasks (id, name, description, status, agent_id, skill_id, progress_pct, current_step_label, depends_on, created_at)
        VALUES (?, ?, ?, 'idle', 'agent-executive', NULL, 0, 'Awaiting research', ?, datetime('now'))
      `).run(
        execTaskId,
        `Review: ${idea.title}`,
        `Executive review for "${idea.title}". Evaluate the research findings and blueprint, then greenlight for execution.`,
        JSON.stringify([researchTaskId])
      );
      tasksCreated.push(execTaskId);
    } catch { /* agent may not exist yet */ }

    // Marketing task for Alex Hormozi (agent-marketing)
    const marketingTaskId = uuidv4();
    try {
      db.prepare(`
        INSERT INTO agent_tasks (id, name, description, status, agent_id, skill_id, progress_pct, current_step_label, depends_on, created_at)
        VALUES (?, ?, ?, 'idle', 'agent-marketing', NULL, 0, 'Awaiting exec review', ?, datetime('now'))
      `).run(
        marketingTaskId,
        `Marketing: ${idea.title}`,
        `Plan and execute marketing strategy for "${idea.title}". Create content, outbound campaigns, and growth playbook based on the blueprint.`,
        JSON.stringify([execTaskId])
      );
      tasksCreated.push(marketingTaskId);
    } catch { /* agent may not exist yet */ }

    // Create inter-agent handoff messages — tracked with deadline
    const agentTargets = ["agent-marketing", "agent-sales", "agent-product", "agent-research"];
    for (const targetAgent of agentTargets) {
      try {
        createHandoff({
          from_agent_id: "agent-executive",
          to_agent_id: targetAgent,
          message: `New project launched: "${idea.title}". Review blueprint and begin execution. Project ID: ${projectId}.`,
          message_type: "handoff",
          deadline_minutes: 240, // 4h to review and kick off
        });
      } catch { /* agent may not exist */ }
    }

    // Step 4: Log everything
    logActivity({
      project_id: projectId,
      action: "idea_launched",
      details: `Idea "${idea.title}" launched as project with ${blueprintId ? "blueprint" : "no blueprint"} and ${tasksCreated.length} agent tasks assigned`,
    });

    // Create notification
    try {
      db.prepare(`
        INSERT INTO notifications (id, type, title, message, link, is_read, created_at)
        VALUES (?, 'success', ?, ?, ?, 0, datetime('now'))
      `).run(
        uuidv4(),
        `Idea Launched: ${idea.title}`,
        `Project created with blueprint and ${tasksCreated.length} agent tasks. Agents are being briefed.`,
        `/projects/${projectId}`
      );
    } catch { /* notifications table may not exist */ }

    return NextResponse.json({
      success: true,
      project_id: projectId,
      blueprint_id: blueprintId,
      tasks_created: tasksCreated.length,
      message: `Launched "${idea.title}" successfully`,
    });
  } catch (error) {
    console.error("POST /api/ideabrowser/ideas/[id]/launch error:", error);
    return NextResponse.json({ error: "Failed to launch idea" }, { status: 500 });
  }
}
