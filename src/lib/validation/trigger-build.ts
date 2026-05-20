// ─── Build Trigger: Validated Idea → Project + Blueprint ─────────────────────
// When an idea passes Gate 2, this creates a Project, generates a Blueprint,
// assigns agent tasks, and notifies all agents to activate.

import { getDb, logActivity } from "@/lib/db";
import { callLLMWithFallback } from "@/lib/ai/llm-client";
import { v4 as uuidv4 } from "uuid";
import { createHandoff } from "@/lib/agents/supervisor";

/**
 * Trigger the build sequence for a validated idea.
 * Creates project, blueprint, and assigns agent tasks.
 */
export async function triggerBuild(campaignId: string, ideaId: string): Promise<void> {
  const db = getDb();

  const idea = db.prepare("SELECT * FROM ideabrowser_ideas WHERE id = ?").get(ideaId) as {
    id: string; title: string; description: string | null;
    category: string | null; target_market: string | null;
  } | undefined;

  const campaign = db.prepare("SELECT * FROM validation_campaigns WHERE id = ?").get(campaignId) as {
    id: string; actual_signups: number; actual_ctr_pct: number; actual_cpl_usd: number;
  } | undefined;

  if (!idea) throw new Error(`Idea ${ideaId} not found`);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  // Generate build spec via LLM
  let spec: {
    product_name: string; one_liner: string;
    tech_stack: Record<string, string>;
    core_features_v1: string[];
    explicitly_excluded_v1: string[];
    mvp_timeline_weeks: number;
    primary_monetization: string;
    first_milestone: string;
  };

  try {
    const { text: buildSpec } = await callLLMWithFallback(
      `Validated idea: ${idea.title}\nDescription: ${idea.description || "N/A"}\nCategory: ${idea.category || "N/A"}\nValidation signals: ${JSON.stringify({ signups: campaign.actual_signups, ctr: campaign.actual_ctr_pct, cpl: campaign.actual_cpl_usd })}\n\nOutput ONLY valid JSON, no other text:\n{\n  "product_name": "...",\n  "one_liner": "...",\n  "tech_stack": { "frontend": "...", "backend": "...", "database": "...", "hosting": "..." },\n  "core_features_v1": ["feature 1", "feature 2", "feature 3"],\n  "explicitly_excluded_v1": ["exclude 1", "exclude 2"],\n  "mvp_timeline_weeks": 4,\n  "primary_monetization": "...",\n  "first_milestone": "..."\n}`,
      { systemPrompt: "You are Marty Cagan and Ray Dalio. Generate a precise MVP build specification for a validated startup idea. Be specific about tech stack, core features, and what NOT to build in v1. Output JSON only." },
    );
    const cleaned = buildSpec.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    spec = JSON.parse(cleaned.includes("{") ? cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1) : cleaned);
  } catch {
    // Fallback spec
    spec = {
      product_name: idea.title,
      one_liner: idea.description || `${idea.title} - validated SaaS`,
      tech_stack: { frontend: "Next.js", backend: "Node.js", database: "PostgreSQL", hosting: "Vercel" },
      core_features_v1: ["User authentication", "Core value delivery", "Stripe payments"],
      explicitly_excluded_v1: ["Admin dashboard", "Mobile app", "Multi-tenancy"],
      mvp_timeline_weeks: 4,
      primary_monetization: "SaaS subscription",
      first_milestone: "10 paying customers",
    };
  }

  // 1. Create a Project
  const projectId = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO projects (id, name, description, status, niche, target_audience, score, rail_status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, 100, '{}', ?, ?)
  `).run(projectId, spec.product_name, spec.one_liner, idea.category || "", idea.target_market || "", now, now);

  // Link idea to project
  db.prepare("UPDATE ideabrowser_ideas SET project_id = ?, validation_status = 'building' WHERE id = ?")
    .run(projectId, ideaId);

  // 2. Create a Blueprint
  const blueprintId = uuidv4();
  db.prepare(`
    INSERT INTO blueprints (id, project_id, idea_id, niche, data, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
  `).run(blueprintId, projectId, ideaId, `${idea.category || "Business"}: ${idea.title}`, JSON.stringify(spec));

  // 3. Update campaign
  db.prepare(`
    UPDATE validation_campaigns
    SET status = 'building', build_triggered_at = datetime('now'),
        project_id = ?, blueprint_id = ?, build_status = 'queued'
    WHERE id = ?
  `).run(projectId, blueprintId, campaignId);

  // 4. Create agent tasks with dependencies (same pattern as launch route)
  const researchTaskId = uuidv4();
  const execTaskId = uuidv4();
  const marketingTaskId = uuidv4();

  try {
    db.prepare(`
      INSERT INTO agent_tasks (id, name, description, status, agent_id, progress_pct, current_step_label, created_at)
      VALUES (?, ?, ?, 'queued', 'agent-research', 0, 'Market validation', datetime('now'))
    `).run(researchTaskId, `Research: ${idea.title}`, `Deep-dive research for validated idea "${idea.title}". Refine competitive analysis now that market signals are confirmed.`);
  } catch { /* non-blocking */ }

  try {
    db.prepare(`
      INSERT INTO agent_tasks (id, name, description, status, agent_id, progress_pct, current_step_label, depends_on, created_at)
      VALUES (?, ?, ?, 'idle', 'agent-executive', 0, 'Awaiting research', ?, datetime('now'))
    `).run(execTaskId, `Review: ${idea.title}`, `Executive review for validated idea "${idea.title}". Greenlight build execution.`, JSON.stringify([researchTaskId]));
  } catch { /* non-blocking */ }

  try {
    db.prepare(`
      INSERT INTO agent_tasks (id, name, description, status, agent_id, progress_pct, current_step_label, depends_on, created_at)
      VALUES (?, ?, ?, 'idle', 'agent-marketing', 0, 'Awaiting exec review', ?, datetime('now'))
    `).run(marketingTaskId, `Marketing: ${idea.title}`, `Execute marketing strategy for validated idea "${idea.title}". Blueprint ready.`, JSON.stringify([execTaskId]));
  } catch { /* non-blocking */ }

  // 5. Notify all agents — tracked handoffs with deadline
  const agentTargets = ["agent-marketing", "agent-sales", "agent-product", "agent-research"];
  for (const targetAgent of agentTargets) {
    try {
      createHandoff({
        from_agent_id: "agent-executive",
        to_agent_id: targetAgent,
        message: `[BUILD TRIGGERED] Validated idea "${idea.title}" is now a project. Project ID: ${projectId}, Blueprint ID: ${blueprintId}. Begin department activation.`,
        message_type: "handoff",
        deadline_minutes: 240, // 4h to activate department
      });
    } catch { /* non-blocking */ }
  }

  // 6. Log and notify
  logActivity({
    project_id: projectId,
    action: "build_triggered",
    details: `Build sequence initiated for validated idea: ${idea.title}. Project and blueprint created automatically from validation campaign ${campaignId}.`,
  });

  // Create notification
  try {
    db.prepare(
      "INSERT INTO notifications (id, type, title, message, link, is_read, created_at) VALUES (?, 'success', ?, ?, ?, 0, datetime('now'))"
    ).run(
      uuidv4(),
      `Build Triggered: ${idea.title}`,
      `Idea passed validation and auto-launched as project with blueprint and ${3} agent tasks.`,
      `/projects/${projectId}`,
    );
  } catch { /* non-blocking */ }
}
