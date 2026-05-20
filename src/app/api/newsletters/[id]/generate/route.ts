import { NextRequest, NextResponse } from "next/server";
import {
  getNewsletter,
  updateNewsletter,
  getNewsletterContext,
  getConnections,
  getActivity,
  getContent,
  getInsights,
  logActivity,
} from "@/lib/db";
import type { Newsletter } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const newsletter = getNewsletter(id);
    if (!newsletter) {
      return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });
    }

    // Mark as generating
    updateNewsletter(id, { status: "generating" });

    // Gather context from all sources
    const prompt = buildNewsletterPrompt(newsletter);

    // Get LLM connection
    const connections = getConnections();
    const activeConnection = connections.find((c) => c.is_active === 1);
    if (!activeConnection) {
      updateNewsletter(id, { status: "draft" });
      return NextResponse.json({
        error: "No active LLM connection configured",
        hint: "Go to Connections and add an Ollama or Anthropic connection.",
      }, { status: 503 });
    }

    const { provider, base_url, api_key_encrypted, model } = activeConnection;
    let output: string;

    try {
      if (provider === "ollama") {
        output = await executeWithOllama(prompt, model || "llama3", base_url || "http://127.0.0.1:11434");
      } else if (provider === "anthropic") {
        output = await executeWithClaude(prompt, api_key_encrypted || "", model || "claude-sonnet-4-20250514");
      } else {
        output = await executeWithOpenAI(prompt, model || "gpt-4o-mini", base_url || "https://api.openai.com", api_key_encrypted || "");
      }
    } catch (err) {
      updateNewsletter(id, { status: "draft" });
      return NextResponse.json({
        error: `LLM generation failed: ${err instanceof Error ? err.message : String(err)}`,
      }, { status: 502 });
    }

    // Extract subject line if the LLM included one
    let subject = newsletter.subject;
    const subjectMatch = output.match(/^(?:Subject|Subject Line|SUBJECT):\s*(.+?)$/m);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
      // Remove the subject line from content so it's stored separately
      output = output.replace(subjectMatch[0], "").trim();
    }

    // Update newsletter with generated content
    const updated = updateNewsletter(id, {
      content: output,
      subject: subject || `${newsletter.title} - Newsletter`,
      status: "ready",
    });

    logActivity({
      action: "newsletter_generated",
      project_id: newsletter.project_id || undefined,
      details: `Generated "${newsletter.newsletter_type}" newsletter: "${newsletter.title}" via ${provider}/${model}`,
      rail: "audience",
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("POST /api/newsletters/[id]/generate error:", error);
    return NextResponse.json({ error: "Failed to generate newsletter" }, { status: 500 });
  }
}

// ─── Prompt Builder ─────────────────────────────────────────────────────────

function buildNewsletterPrompt(newsletter: Newsletter): string {
  const projectId = newsletter.project_id;
  const type = newsletter.newsletter_type;

  let contextSection = "";

  if (projectId) {
    // Project-specific newsletter: pull all project data
    const ctx = getNewsletterContext(projectId);
    const project = ctx.project;

    if (project) {
      contextSection += `\n## PROJECT: ${project.name}\n`;
      if (project.niche) contextSection += `Niche: ${project.niche}\n`;
      if (project.target_audience) contextSection += `Target Audience: ${project.target_audience}\n`;
      if (project.description) contextSection += `Description: ${project.description}\n`;
      contextSection += `Status: ${project.status}\n`;
    }

    // Published & recent content
    if (ctx.content.length > 0) {
      contextSection += `\n## RECENT CONTENT (${ctx.content.length} pieces)\n`;
      for (const c of ctx.content.slice(0, 15)) {
        contextSection += `- [${c.type}] "${c.title}" (${c.status}${c.platform ? `, ${c.platform}` : ""})`;
        if (c.published_url) contextSection += ` → ${c.published_url}`;
        if (c.published_at) contextSection += ` (published ${c.published_at})`;
        contextSection += "\n";
        if (c.content) {
          contextSection += `  Content preview: ${c.content.slice(0, 300)}${c.content.length > 300 ? "..." : ""}\n`;
        }
      }
    }

    // Insights & research
    if (ctx.insights.length > 0) {
      contextSection += `\n## RESEARCH & INSIGHTS (${ctx.insights.length} total)\n`;
      for (const ins of ctx.insights.slice(0, 10)) {
        contextSection += `- ${ins.title}`;
        if (ins.category) contextSection += ` [${ins.category}]`;
        contextSection += "\n";
        if (ins.description) contextSection += `  ${ins.description.slice(0, 300)}${ins.description.length > 300 ? "..." : ""}\n`;
        if (ins.pain_point) contextSection += `  Pain point: ${ins.pain_point}\n`;
        if (ins.solution) contextSection += `  Solution: ${ins.solution}\n`;
      }
    }

    // Recent activity
    if (ctx.activity.length > 0) {
      contextSection += `\n## RECENT PROJECT ACTIVITY (last 20 actions)\n`;
      for (const a of ctx.activity.slice(0, 20)) {
        contextSection += `- [${a.action}] ${a.details || ""}`;
        if (a.skill_used) contextSection += ` (skill: ${a.skill_used})`;
        contextSection += ` — ${a.created_at}\n`;
      }
    }

    // Tasks
    const completedTasks = ctx.tasks.filter((t) => t.status === "completed");
    const activeTasks = ctx.tasks.filter((t) => t.status !== "completed");
    if (ctx.tasks.length > 0) {
      contextSection += `\n## TASKS\n`;
      contextSection += `Completed: ${completedTasks.length} | Active: ${activeTasks.length}\n`;
      for (const t of completedTasks.slice(0, 10)) {
        contextSection += `- [DONE] ${t.title}\n`;
      }
      for (const t of activeTasks.slice(0, 5)) {
        contextSection += `- [${t.status.toUpperCase()}] ${t.title}\n`;
      }
    }

    // Outbound / pipeline stats
    if (ctx.contacts.length > 0) {
      const byStatus: Record<string, number> = {};
      for (const c of ctx.contacts) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      contextSection += `\n## OUTBOUND PIPELINE\n`;
      contextSection += `Total contacts: ${ctx.contacts.length}\n`;
      for (const [status, count] of Object.entries(byStatus)) {
        contextSection += `- ${status}: ${count}\n`;
      }
    }

    // Previous newsletters (to avoid repeating)
    if (ctx.newsletters.length > 0) {
      const previous = ctx.newsletters.filter((n) => n.id !== newsletter.id && n.content);
      if (previous.length > 0) {
        contextSection += `\n## PREVIOUS NEWSLETTERS (avoid repeating)\n`;
        for (const n of previous.slice(0, 3)) {
          contextSection += `- "${n.title}" (${n.newsletter_type}, ${n.created_at})\n`;
        }
      }
    }
  } else {
    // Global newsletter — pull from all sources
    const allContent = getContent();
    const allInsights = getInsights();
    const recentActivity = getActivity();

    if (allContent.length > 0) {
      contextSection += `\n## ALL RECENT CONTENT (${allContent.length} pieces)\n`;
      for (const c of allContent.slice(0, 15)) {
        contextSection += `- [${c.type}] "${c.title}" (${c.status}${c.platform ? `, ${c.platform}` : ""})`;
        if (c.published_url) contextSection += ` → ${c.published_url}`;
        contextSection += "\n";
        if (c.content) {
          contextSection += `  Preview: ${c.content.slice(0, 200)}${c.content.length > 200 ? "..." : ""}\n`;
        }
      }
    }

    if (allInsights.length > 0) {
      contextSection += `\n## RECENT INSIGHTS (${allInsights.length} total)\n`;
      for (const ins of allInsights.slice(0, 8)) {
        contextSection += `- ${ins.title}: ${(ins.description || "").slice(0, 200)}\n`;
      }
    }

    if (recentActivity.length > 0) {
      contextSection += `\n## RECENT ACTIVITY\n`;
      for (const a of recentActivity.slice(0, 15)) {
        contextSection += `- [${a.action}] ${a.details || ""} — ${a.created_at}\n`;
      }
    }
  }

  // Build newsletter type instructions
  const typeInstructions: Record<string, string> = {
    weekly: `Write a weekly update newsletter that summarizes what happened this week: new content published, research completed, milestones hit, and what's coming next. Keep it conversational and action-oriented.`,
    monthly: `Write a monthly recap newsletter with a high-level overview of progress, key metrics and wins, lessons learned, and the roadmap for next month. Include data-driven insights.`,
    roundup: `Write a content roundup newsletter that curates and highlights the best recent content, social posts, blog articles, and insights. Include brief summaries and links. Format as a "best of" collection.`,
    announcement: `Write an announcement newsletter for a specific milestone, launch, or update. Make it exciting but substantive. Include what changed, why it matters, and what readers should do next.`,
    educational: `Write an educational newsletter that teaches the audience something valuable based on the project's research, insights, and expertise. Use the project's actual findings and data as teaching material. Make it actionable with clear takeaways.`,
    promotional: `Write a promotional newsletter that highlights the project's value proposition, recent successes, and social proof. Include a clear call-to-action aligned with the project's goals. Not pushy — value-first with strategic positioning.`,
  };

  return `You are the Newsletter Composer for the Five Rails content platform.

## YOUR TASK
Generate a complete, ready-to-send newsletter.

Newsletter title: "${newsletter.title}"
Newsletter type: ${type}
${newsletter.subject ? `Subject line hint: ${newsletter.subject}` : ""}

## TYPE-SPECIFIC INSTRUCTIONS
${typeInstructions[type] || typeInstructions.weekly}

## SOURCE DATA
Everything below is real data from the project. Use it to create an authentic, context-aware newsletter. Do NOT make up facts — only reference what's in the data below.
${contextSection || "\n(No project data available yet — create a compelling intro/welcome newsletter)"}

## OUTPUT FORMAT
Start with exactly one line:
Subject: [Your subject line here]

Then write the full newsletter body in clean HTML suitable for email:
- Use inline styles (email clients don't support <style> blocks)
- Keep width under 600px
- Use a clean, modern design with good spacing
- Include sections with clear headers
- Add a footer with unsubscribe placeholder
- Make links clickable where relevant
- Use the project's actual content, not placeholders
- Write in a warm but professional tone
- Keep total length between 500-1200 words
- Include a clear CTA that aligns with the project's goals

Do NOT wrap the output in markdown code blocks. Output raw HTML only (after the Subject line).`;
}

// ─── LLM Backends (same pattern as skill execution) ──────────────────────────

async function executeWithOllama(prompt: string, model: string, host: string): Promise<string> {
  const { Ollama } = await import("ollama");
  const ollama = new Ollama({ host });
  const response = await ollama.chat({
    model,
    messages: [{ role: "user", content: prompt }],
    stream: false,
  });
  return response.message.content;
}

async function executeWithClaude(prompt: string, apiKey: string, model: string): Promise<string> {
  // Delegates to centralized SDK client (autoforge pattern)
  const { querySDK } = await import("@/lib/ai/sdk-client");
  const result = await querySDK(prompt, {
    agentType: "marketing",
    connection: { provider: "anthropic", base_url: null, api_key_encrypted: apiKey, model },
  });
  if (result.status === "error") throw new Error(result.errorMessage || "Claude call failed");
  return result.text;
}

async function executeWithOpenAI(prompt: string, model: string, baseUrl: string, apiKey: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
