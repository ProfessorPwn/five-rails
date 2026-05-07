import { NextRequest, NextResponse } from "next/server";
import { getDb, getConnections, getActiveConnection, getConnectionWithFallback, logActivity, createAgentTask, updateAgentTaskStatus, updateAgentTaskProgress, checkoutTask, releaseTask, addTaskComment, startAgentRun, completeAgentRun } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { parseValidationVerdict, processGate1 } from "@/lib/validation/gate1";
import { queryWithFailover, type AgentType } from "@/lib/ai/sdk-client";
import { createHandoff } from "@/lib/agents/supervisor";
import { buildAgentContext } from "@/lib/agents/context-builder";
import { runAgentChat } from "@/lib/agents/orchestrator";

type RouteContext = { params: Promise<{ id: string }> };

const AGENT_RUN_TIMEOUT_MS = 300_000; // 5 min max for entire run (agents need time for think + act + delegate)
const FETCH_TIMEOUT_MS = 120_000;     // 2 min max for any single fetch (skill execution can be slow)
const LLM_TIMEOUT_MS = 120_000;       // 2 min max for LLM calls

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

interface Agent {
  id: string; name: string; role: string; department: string;
  system_prompt: string; assigned_skills: string; memory: string;
  project_id: string | null; schedule: string;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  let taskId: string | null = null;
  // Start run audit trail
  const run = startAgentRun(id);
  const runId = run.id;

  try {
    const agent = getDb().prepare("SELECT * FROM agents WHERE id = ?").get(id) as Agent | undefined;
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const connectionId = (body as { connection_id?: string }).connection_id;
    let activeConn = getActiveConnection(connectionId);
    const { fallback } = getConnectionWithFallback();
    if (!activeConn) return NextResponse.json({ error: "No active LLM connection" }, { status: 503 });

    // Create a kanban task for this agent run
    const agentTask = createAgentTask({
      name: `${agent.department.charAt(0).toUpperCase() + agent.department.slice(1)} Department Run`,
      description: `Autonomous run by ${agent.name} (${agent.role})`,
      agent_id: id,
      status: 'working',
    });
    taskId = agentTask.id;

    // Checkout task — prevents another agent from grabbing it
    const checkout = checkoutTask(taskId, id, runId);
    if (!checkout.success) {
      completeAgentRun(runId, { status: 'failed', error: checkout.error, task_id: taskId });
      return NextResponse.json({ error: checkout.error }, { status: 409 });
    }

    // Wrap entire run in a timeout so it can never hang forever
    const result = await withTimeout((async () => {

    // Update state: OBSERVING
    getDb().prepare("UPDATE agents SET state = 'observing' WHERE id = ?").run(id);
    updateAgentTaskProgress(taskId!, { current_step_label: `Observing ${agent.department} data...`, progress_pct: 10 });

    // ── STEP 1: OBSERVE ──────────────────────────────────────────────────────
    const observations = observe(agent);

    // Update state: THINKING
    getDb().prepare("UPDATE agents SET state = 'thinking' WHERE id = ?").run(id);
    updateAgentTaskProgress(taskId, { current_step_label: "Analyzing observations...", progress_pct: 40 });

    // ── STEP 2: THINK ────────────────────────────────────────────────────────
    const memory = JSON.parse(agent.memory || "{}");
    const assignedSkills = JSON.parse(agent.assigned_skills || "[]") as string[];
    const skillDetails = getDb().prepare(
      `SELECT id, name, description FROM skills WHERE id IN (${assignedSkills.map(() => "?").join(",")}) AND is_active = 1`
    ).all(...assignedSkills) as Array<{ id: string; name: string; description: string }>;

    // Get recent decisions for context
    const recentDecisions = getDb().prepare(
      "SELECT reasoning, action_taken, result_summary FROM agent_decisions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 5"
    ).all(id) as Array<{ reasoning: string; action_taken: string; result_summary: string }>;

    // Get unread messages from other agents
    const unreadMessages = getDb().prepare(
      "SELECT m.*, a.name as from_name FROM agent_messages m JOIN agents a ON m.from_agent_id = a.id WHERE m.to_agent_id = ? AND m.is_read = 0"
    ).all(id) as Array<{ from_name: string; message: string; message_type: string }>;

    // Get connected MCP tools
    const mcpTools = getDb().prepare("SELECT id, name, description, is_connected FROM mcp_tools").all() as Array<{ id: string; name: string; description: string; is_connected: number }>;

    const thinkPrompt = buildThinkPrompt(agent, observations, skillDetails, recentDecisions, unreadMessages, memory, mcpTools);

    // Bind the SDK session's runtime tool surface to the agent's actually-
    // assigned skills (closes capability gap e2e64647). Without this, the
    // SDK was always spawned with `tools: []` and gstack-style skills had
    // nothing to dispatch to inside the Claude Code subprocess.
    const allowedTools = deriveAllowedTools(assignedSkills);

    let thinkResult: string;
    try {
      thinkResult = await withTimeout(callLLM(thinkPrompt, activeConn, agent.department, allowedTools), LLM_TIMEOUT_MS, `LLM call (${activeConn.provider})`);
    } catch (primaryErr) {
      // Fallback to secondary connection (SDK client also has autoforge-style Ollama failover)
      if (fallback && fallback.id !== activeConn.id) {
        console.log(`Primary LLM (${activeConn.provider}) failed, falling back to ${fallback.provider}`);
        thinkResult = await withTimeout(callLLM(thinkPrompt, fallback, agent.department, allowedTools), LLM_TIMEOUT_MS, `LLM fallback (${fallback.provider})`);
        activeConn = fallback;
      } else {
        throw primaryErr;
      }
    }

    let decision: {
      should_act: boolean;
      reasoning: string;
      chosen_skill?: string;
      skill_input?: string;
      mcp_tool?: { tool_id: string; action: string; params: Record<string, unknown> };
      system_action?: { action: string; [key: string]: unknown };
      confidence: number;
      messages_to_other_agents?: Array<{ to: string; message: string }>;
      memory_update?: Record<string, unknown>;
    };

    try {
      const cleaned = thinkResult.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      decision = JSON.parse(cleaned.includes("{") ? cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1) : cleaned);
    } catch {
      decision = { should_act: false, reasoning: thinkResult.slice(0, 500), confidence: 0.3 };
    }

    // Mark messages as read
    if (unreadMessages.length > 0) {
      getDb().prepare("UPDATE agent_messages SET is_read = 1 WHERE to_agent_id = ? AND is_read = 0").run(id);
    }

    // ── STEP 3: ACT ──────────────────────────────────────────────────────────
    let actionResult = "No action taken";
    let fullSkillOutput: string | null = null;
    let skillNameUsed: string | null = null;

    if (decision.should_act && decision.chosen_skill && decision.confidence >= 0.5) {
      getDb().prepare("UPDATE agents SET state = 'acting' WHERE id = ?").run(id);
      skillNameUsed = skillDetails.find(s => s.id === decision.chosen_skill)?.name || decision.chosen_skill;
      updateAgentTaskProgress(taskId, { current_step_label: `Executing ${skillNameUsed}...`, progress_pct: 70 });

      // Execute the chosen skill — inject agent's persona and frameworks into the input
      const baseUrl = request.nextUrl.origin;
      const agentContext = `[AGENT PERSONA: You are operating as ${agent.name}. ${agent.role}. Apply these frameworks in ALL your output:\n${agent.system_prompt.slice(0, 1500)}]\n\nTASK: `;
      try {
        const res = await fetchWithTimeout(`${baseUrl}/api/skills/${decision.chosen_skill}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: agentContext + (decision.skill_input || `Execute as ${agent.name}`),
            project_id: agent.project_id,
          }),
        }, FETCH_TIMEOUT_MS);
        if (res.ok) {
          const data = await res.json();
          fullSkillOutput = data.result || data.output || "Skill executed successfully";
          actionResult = fullSkillOutput!.slice(0, 1000);
        } else {
          actionResult = `Skill execution failed: ${res.status}`;
        }
      } catch (err) {
        actionResult = `Skill execution error: ${err instanceof Error ? err.message : "unknown"}`;
      }
    } else if (decision.confidence < 0.5 && decision.should_act) {
      actionResult = `Low confidence (${decision.confidence}) — flagged for human review. Reasoning: ${decision.reasoning}`;
    }

    // Execute MCP tool if the agent decided to use one
    if (decision.mcp_tool && decision.confidence >= 0.5) {
      const baseUrl = request.nextUrl.origin;
      const { tool_id, action: toolAction, params: toolParams } = decision.mcp_tool;
      try {
        getDb().prepare("UPDATE agents SET state = 'acting' WHERE id = ?").run(id);
        updateAgentTaskProgress(taskId, { current_step_label: `Using MCP tool ${tool_id}...`, progress_pct: 75 });

        const toolRes = await fetchWithTimeout(`${baseUrl}/api/mcp/tools/${tool_id}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: toolAction, params: toolParams }),
        }, FETCH_TIMEOUT_MS);
        const toolData = await toolRes.json();
        const toolSummary = `MCP Tool ${tool_id}/${toolAction}: ${JSON.stringify(toolData).slice(0, 500)}`;
        actionResult = actionResult === "No action taken" ? toolSummary : actionResult + "\n" + toolSummary;
      } catch (err) {
        const errMsg = `MCP tool error (${tool_id}): ${err instanceof Error ? err.message : "unknown"}`;
        actionResult = actionResult === "No action taken" ? errMsg : actionResult + "\n" + errMsg;
      }
    }

    // Handle task completion — any agent can complete their own tasks
    if (decision.system_action?.action === "complete_task" && decision.system_action.task_id) {
      try {
        const taskId = decision.system_action.task_id as string;
        getDb().prepare("UPDATE agent_tasks SET status = 'done', completed_at = datetime('now'), progress_pct = 100 WHERE id = ? AND agent_id = ?").run(taskId, id);
        actionResult = (actionResult === "No action taken" ? "" : actionResult + "\n") + `Task completed: ${taskId}`;

        // Auto-promote downstream tasks whose dependencies are now met
        const downstream = getDb().prepare("SELECT id, depends_on FROM agent_tasks WHERE status IN ('idle', 'blocked') AND depends_on LIKE ?").all(`%${taskId}%`) as Array<{ id: string; depends_on: string }>;
        for (const dt of downstream) {
          const deps = JSON.parse(dt.depends_on || "[]") as string[];
          const done = getDb().prepare(`SELECT COUNT(*) as cnt FROM agent_tasks WHERE id IN (${deps.map(() => "?").join(",")}) AND status = 'done'`).get(...deps) as { cnt: number };
          if (done.cnt === deps.length) {
            getDb().prepare("UPDATE agent_tasks SET status = 'queued' WHERE id = ?").run(dt.id);
          }
        }
      } catch { /* non-blocking */ }
    }

    // Execute system action if the product agent decided to modify the system
    if (decision.system_action && decision.system_action.action !== "complete_task" && id === "agent-product") {
      try {
        const sysRes = await fetchWithTimeout(`${request.nextUrl.origin}/api/agents/system-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...decision.system_action, agent_id: id }),
        }, FETCH_TIMEOUT_MS);
        const sysData = await sysRes.json();
        actionResult = (actionResult === "No action taken" ? "" : actionResult + "\n") + `System action: ${JSON.stringify(sysData).slice(0, 500)}`;
      } catch { /* non-blocking */ }
    }

    // Send inter-agent messages AND delegate work
    if (decision.messages_to_other_agents) {
      for (const msg of decision.messages_to_other_agents) {
        const msgType = (msg as { type?: string }).type || "info";
        let handoffId: string;
        if (msgType === "handoff" || msgType === "request") {
          handoffId = createHandoff({
            from_agent_id: id,
            to_agent_id: msg.to,
            message: msg.message,
            message_type: msgType as "handoff" | "request",
          });
        } else {
          handoffId = uuidv4();
          getDb().prepare(
            "INSERT INTO agent_messages (id, from_agent_id, to_agent_id, message, message_type) VALUES (?, ?, ?, ?, ?)"
          ).run(handoffId, id, msg.to, msg.message, msgType);
        }

        // If this is a delegation/handoff, run the target agent IN-PROCESS via
        // the orchestrator (no HTTP round-trip — prevents cascading request storms
        // that saturate the single-threaded Turbopack dev server).
        if (msgType === "handoff" || msgType === "request") {
          try {
            await runAgentChat({
              agentId: msg.to,
              userMessage: `[Delegated from ${agent.name} | handoff:${handoffId}]: ${msg.message}`,
              baseUrl: request.nextUrl.origin,
            });
          } catch (err) {
            console.error(`[run] in-process delegation to ${msg.to} failed:`, err instanceof Error ? err.message : err);
          }
        }
      }
    }

    // Log the decision
    const decisionId = uuidv4();
    getDb().prepare(`
      INSERT INTO agent_decisions (id, agent_id, observation, reasoning, action_taken, skill_used, result_summary, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(decisionId, id, JSON.stringify(observations).slice(0, 2000), decision.reasoning,
      decision.should_act ? (decision.mcp_tool ? `MCP: ${decision.mcp_tool.tool_id}/${decision.mcp_tool.action}` : (decision.skill_input || "Executed skill")) : "No action",
      decision.chosen_skill || decision.mcp_tool?.tool_id || null,
      // Store full skill output so it's visible on agent detail page
      fullSkillOutput ? fullSkillOutput.slice(0, 10000) : actionResult.slice(0, 5000),
      decision.confidence);

    // Log run progress as task comment
    addTaskComment(taskId, id, decision.should_act
      ? `**Decision** (${(decision.confidence * 100).toFixed(0)}% confidence): ${decision.reasoning.slice(0, 500)}${skillNameUsed ? `\n**Skill:** ${skillNameUsed}` : ''}${actionResult !== 'No action taken' ? `\n**Result:** ${actionResult.slice(0, 300)}` : ''}`
      : `**Observed, no action** (${(decision.confidence * 100).toFixed(0)}%): ${decision.reasoning.slice(0, 500)}`,
      'agent', runId);

    // ── VALIDATION PIPELINE: Process Thiel's idea verdicts ──────────────────
    if (id === "agent-research") {
      try {
        // Check for validation_verdicts in the parsed decision
        const verdicts = (decision as { validation_verdicts?: Array<{ idea_id: string; gate1_score: number; recommendation: string; reject_reason?: string; key_signals?: string[] }> }).validation_verdicts;
        if (verdicts && Array.isArray(verdicts)) {
          for (const verdict of verdicts) {
            if (verdict.idea_id && typeof verdict.gate1_score === "number" && verdict.recommendation) {
              const gate1Result = processGate1(
                verdict.idea_id,
                verdict.gate1_score,
                verdict.recommendation,
                decisionId,
                verdict.reject_reason,
              );
              if (gate1Result.passed) {
                actionResult += `\n[PIPELINE] Idea ${verdict.idea_id} passed Gate 1 (score: ${verdict.gate1_score}). Campaign: ${gate1Result.campaignId}`;
              } else {
                actionResult += `\n[PIPELINE] Idea ${verdict.idea_id} rejected at Gate 1 (score: ${verdict.gate1_score})`;
              }
            }
          }
        }

        // Also try parsing from raw LLM response for <validation_verdict> blocks
        const rawVerdict = parseValidationVerdict(thinkResult);
        if (rawVerdict && rawVerdict.idea_id) {
          const existingVerdict = verdicts?.find(v => v.idea_id === rawVerdict.idea_id);
          if (!existingVerdict) {
            processGate1(rawVerdict.idea_id, rawVerdict.gate1_score, rawVerdict.recommendation, decisionId, rawVerdict.reject_reason);
          }
        }
      } catch (e) {
        console.error("Validation pipeline processing error:", e);
      }
    }

    // Update memory if agent suggested changes
    if (decision.memory_update) {
      const currentMemory = JSON.parse(agent.memory || "{}");
      const updatedMemory = { ...currentMemory, ...decision.memory_update };
      getDb().prepare("UPDATE agents SET memory = ? WHERE id = ?").run(JSON.stringify(updatedMemory), id);
    }

    // Calculate next run
    const nextRun = calculateNextRun(agent.schedule);
    getDb().prepare("UPDATE agents SET state = 'idle', last_run_at = datetime('now'), next_run_at = ? WHERE id = ?").run(nextRun, id);

    // Mark kanban task as done + release checkout
    updateAgentTaskStatus(taskId, 'done', { progress_pct: 100, output_ref: decisionId });
    releaseTask(taskId, id);

    // Complete run audit trail
    completeAgentRun(runId, {
      status: 'completed',
      decision_id: decisionId,
      task_id: taskId,
      skill_used: skillNameUsed || undefined,
      action_taken: decision.should_act ? (decision.skill_input || 'Executed skill') : 'No action',
      delegations: decision.messages_to_other_agents?.map((m: { to: string; message: string }) => m.to) || [],
    });

    logActivity({
      action: "agent_run",
      project_id: agent.project_id || undefined,
      details: `${agent.name} ran (${runId}): ${decision.reasoning.slice(0, 100)}`,
    });

    // ── Save full skill output to content_pieces ──────────────────────────────
    let contentPieceId: string | null = null;
    if (fullSkillOutput && skillNameUsed) {
      try {
        contentPieceId = uuidv4();
        getDb().prepare(`
          INSERT INTO content_pieces (id, title, content, type, status, project_id, created_at)
          VALUES (?, ?, ?, ?, 'draft', ?, datetime('now'))
        `).run(
          contentPieceId,
          `[${agent.name}] ${decision.skill_input?.slice(0, 150) || skillNameUsed}`,
          fullSkillOutput,
          mapSkillToContentType(skillNameUsed),
          agent.project_id || null,
        );
      } catch (err) {
        console.error("Failed to save skill output to content_pieces:", err);
      }
    }

    // ── Email the work to the user ───────────────────────────────────────────
    if (fullSkillOutput && decision.should_act) {
      try {
        const { sendEmail, getUserEmail } = await import("@/lib/email/send");
        const userEmail = getUserEmail();
        if (userEmail) {
          const taskTitle = decision.skill_input?.slice(0, 100) || skillNameUsed || "Autonomous task";
          const subject = `[${agent.name}] ${taskTitle}`;
          const bodyParts: string[] = [];
          bodyParts.push(`# ${agent.name} completed work`);
          bodyParts.push("");
          bodyParts.push(`**Task:** ${decision.skill_input || taskTitle}`);
          if (skillNameUsed) bodyParts.push(`**Skill:** ${skillNameUsed}`);
          bodyParts.push(`**Confidence:** ${(decision.confidence * 100).toFixed(0)}%`);
          bodyParts.push("");
          bodyParts.push(`**Reasoning:** ${decision.reasoning}`);
          bodyParts.push("");
          bodyParts.push("---");
          bodyParts.push("");
          bodyParts.push("## Result");
          bodyParts.push("");
          bodyParts.push(fullSkillOutput);
          if (decision.messages_to_other_agents && decision.messages_to_other_agents.length > 0) {
            bodyParts.push("");
            bodyParts.push("---");
            bodyParts.push("## Delegations");
            for (const msg of decision.messages_to_other_agents) {
              bodyParts.push(`- **${msg.to.replace("agent-", "")}**: ${msg.message}`);
            }
          }

          // Fire-and-forget — don't block the run on email delivery
          sendEmail({ to: userEmail, subject, body: bodyParts.join("\n") })
            .then((r) => {
              if (!r.sent) console.error(`[Agent Email] Failed to send work from ${agent.name}: ${r.error}`);
            })
            .catch((err) => console.error(`[Agent Email] Send threw:`, err));
        }
      } catch (err) {
        console.error("Failed to email agent work:", err);
      }
    }

    // ── Send Telegram report — ONLY when agent actually did something ────────
    // Extra gate for agent-executive (Ray): routine "taste the soup" cycles
    // are noise to the user. Only notify when there's a tangible artifact —
    // a skill run, an MCP tool call, or a system_action. Inter-agent
    // delegations on their own count as operational chatter, not user signal.
    const hasUserSignalArtifact = !!(skillNameUsed || decision.mcp_tool || decision.system_action);
    const isExecutiveRoutine = id === "agent-executive" && !hasUserSignalArtifact;
    if (decision.should_act && !isExecutiveRoutine) {
      const lines: string[] = [];
      const conf = `${(decision.confidence * 100).toFixed(0)}%`;

      // Contextual header: what the agent did, not just "completed a run"
      const taskSummary = decision.skill_input?.slice(0, 100) || decision.reasoning?.slice(0, 100) || "autonomous task";
      lines.push(`*${agent.name}* — ${taskSummary}`);
      lines.push('');
      if (skillNameUsed) lines.push(`*Skill:* ${skillNameUsed}`);
      if (decision.mcp_tool) lines.push(`*Tool:* ${decision.mcp_tool.tool_id}/${decision.mcp_tool.action}`);
      lines.push(`*Confidence:* ${conf}`);
      if (fullSkillOutput) {
        lines.push('');
        lines.push('*Result:*');
        // Telegram max message is 4096 chars — leave room for header
        lines.push(fullSkillOutput.slice(0, 2500));
      }
      if (decision.messages_to_other_agents && decision.messages_to_other_agents.length > 0) {
        lines.push('');
        lines.push('*Delegated:*');
        for (const msg of decision.messages_to_other_agents) {
          lines.push(`→ ${msg.to.replace('agent-', '')}: ${msg.message.slice(0, 150)}`);
        }
      }
      if (contentPieceId) {
        lines.push('');
        lines.push(`_Output saved to content library_`);
      }

      const reportMsg = lines.join('\n');
      fetch(`${request.nextUrl.origin}/api/agents/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_name: agent.name, message: reportMsg, type: "completed", agent_id: agent.id }),
      }).catch((err) => console.error(`[Notify] Telegram report failed for ${agent.name}:`, err));

      // Create in-app notification with link to agent detail page
      fetch(`${request.nextUrl.origin}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "agent_completed",
          title: `${agent.name}: ${taskSummary}`,
          message: fullSkillOutput ? fullSkillOutput.slice(0, 300) : decision.reasoning.slice(0, 300),
          link: `/agents/${id}`,
        }),
      }).catch(() => {});
    }

    return {
      agent_id: id,
      agent_name: agent.name,
      decision: {
        should_act: decision.should_act,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        skill_used: decision.chosen_skill,
        mcp_tool_used: decision.mcp_tool ? `${decision.mcp_tool.tool_id}/${decision.mcp_tool.action}` : null,
      },
      result: actionResult.slice(0, 500),
      next_run_at: nextRun,
    };

    })(), AGENT_RUN_TIMEOUT_MS, `Full agent run (${id})`);
    // ── End of withTimeout wrapper ──

    return NextResponse.json(result);
  } catch (error) {
    // Mark run as failed in audit trail
    try {
      completeAgentRun(runId, {
        status: error instanceof Error && error.message.includes('Timeout') ? 'timeout' : 'failed',
        task_id: taskId || undefined,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } catch { /* don't mask original error */ }
    console.error("POST /api/agents/[id]/run error:", error);
    return NextResponse.json({ error: "Agent run failed" }, { status: 500 });
  } finally {
    // GUARANTEED: Always reset agent to idle and clean up tasks, even on hang/timeout/crash
    try {
      getDb().prepare("UPDATE agents SET state = 'idle' WHERE id = ?").run(id);
      if (taskId) {
        releaseTask(taskId, id);
        const task = getDb().prepare("SELECT status FROM agent_tasks WHERE id = ?").get(taskId) as { status: string } | undefined;
        if (task && task.status === 'working') {
          updateAgentTaskStatus(taskId, 'blocked', {
            blocker_reason: 'Agent run ended unexpectedly (timeout or error)',
          });
          addTaskComment(taskId, id, 'Run ended unexpectedly — task blocked for review', 'system', runId);
        }
      }
    } catch { /* ensure finally never throws */ }
  }
}

// ── Observation Gathering ─────────────────────────────────────────────────────

function observe(agent: Agent): Record<string, unknown> {
  const obs: Record<string, unknown> = {};
  const pid = agent.project_id;

  switch (agent.department) {
    case "marketing": {
      const recentContent = getDb().prepare(
        "SELECT title, type, platform, status, created_at FROM content_pieces ORDER BY created_at DESC LIMIT 10"
      ).all();
      const scheduledPosts = getDb().prepare(
        "SELECT platform, post_text, scheduled_at, status FROM scheduled_posts WHERE status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 5"
      ).all();
      const analytics = getDb().prepare("SELECT * FROM content_analytics ORDER BY fetched_at DESC LIMIT 10").all();
      obs.recent_content = recentContent;
      obs.scheduled_posts = scheduledPosts;
      obs.content_analytics = analytics;
      obs.content_count_this_week = (getDb().prepare("SELECT COUNT(*) as cnt FROM content_pieces WHERE created_at >= datetime('now', '-7 days')").get() as { cnt: number }).cnt;
      break;
    }
    case "sales": {
      const deals = getDb().prepare("SELECT title, value, stage, updated_at FROM deals ORDER BY updated_at DESC LIMIT 10").all();
      const stalledDeals = getDb().prepare("SELECT title, value, stage FROM deals WHERE stage NOT IN ('won','lost') AND updated_at < datetime('now', '-5 days')").all();
      const contacts = getDb().prepare("SELECT name, email, lead_score, status FROM outbound_contacts ORDER BY lead_score DESC LIMIT 10").all();
      const hotLeads = getDb().prepare("SELECT name, email, lead_score FROM outbound_contacts WHERE lead_score >= 50").all();
      obs.deals = deals;
      obs.stalled_deals = stalledDeals;
      obs.top_contacts = contacts;
      obs.hot_leads = hotLeads;
      break;
    }
    case "product": {
      const subs = getDb().prepare("SELECT SUM(amount) as mrr FROM subscriptions WHERE status = 'active' AND interval = 'monthly'").get();
      const failedPayments = getDb().prepare("SELECT COUNT(*) as cnt FROM payment_attempts WHERE status = 'failed'").get();
      const funnelEvents = getDb().prepare("SELECT event_name, COUNT(*) as cnt FROM funnel_events GROUP BY event_name").all();
      obs.mrr = subs;
      obs.failed_payments = failedPayments;
      obs.funnel = funnelEvents;
      break;
    }
    case "research": {
      const competitors = getDb().prepare("SELECT name, website_url FROM competitors").all();
      const alerts = getDb().prepare("SELECT * FROM competitor_alerts WHERE is_read = 0").all();
      const topIdeas = getDb().prepare("SELECT title, category, overall_score FROM ideabrowser_ideas WHERE overall_score >= 70 ORDER BY overall_score DESC LIMIT 5").all();
      // Ideas awaiting Thiel's validation verdict (unreviewed with decent scores)
      const unreviewedIdeas = getDb().prepare(
        "SELECT id, title, category, overall_score, description FROM ideabrowser_ideas WHERE (validation_status IS NULL OR validation_status = 'unreviewed') AND overall_score >= 50 ORDER BY overall_score DESC LIMIT 5"
      ).all();
      obs.competitors = competitors;
      obs.unread_alerts = alerts;
      obs.top_ideas = topIdeas;
      obs.unreviewed_ideas_for_validation = unreviewedIdeas;
      break;
    }
    case "executive": {
      const recentActivity = getDb().prepare("SELECT action, details, created_at FROM activity_log ORDER BY created_at DESC LIMIT 20").all();
      const overdueTasks = getDb().prepare("SELECT title, status FROM tasks WHERE status != 'completed' AND created_at < datetime('now', '-3 days')").all();
      const projectCount = (getDb().prepare("SELECT COUNT(*) as cnt FROM projects").get() as { cnt: number }).cnt;
      const agentStates = getDb().prepare("SELECT name, state, last_run_at FROM agents WHERE id != 'agent-executive'").all();
      obs.recent_activity = recentActivity;
      obs.overdue_tasks = overdueTasks;
      obs.project_count = projectCount;
      obs.agent_states = agentStates;
      break;
    }
  }

  // ── Always include assigned tasks for this agent ──
  const myTasks = getDb().prepare(
    "SELECT id, name, description, status, depends_on, current_step_label FROM agent_tasks WHERE agent_id = ? AND status IN ('queued', 'idle', 'working', 'blocked') ORDER BY created_at ASC"
  ).all(agent.id) as Array<{ id: string; name: string; description: string; status: string; depends_on: string; current_step_label: string | null }>;

  if (myTasks.length > 0) {
    // Check which dependencies are actually met
    const enrichedTasks = myTasks.map((t) => {
      const deps = JSON.parse(t.depends_on || "[]") as string[];
      let depsReady = true;
      if (deps.length > 0) {
        const doneDeps = getDb().prepare(
          `SELECT COUNT(*) as cnt FROM agent_tasks WHERE id IN (${deps.map(() => "?").join(",")}) AND status = 'done'`
        ).get(...deps) as { cnt: number };
        depsReady = doneDeps.cnt === deps.length;
      }
      return { ...t, dependencies_met: depsReady };
    });

    obs.assigned_tasks = enrichedTasks;

    // Auto-promote: if a task is idle/queued and its dependencies are met, mark it queued
    for (const task of enrichedTasks) {
      if ((task.status === "idle" || task.status === "blocked") && task.dependencies_met) {
        getDb().prepare("UPDATE agent_tasks SET status = 'queued' WHERE id = ?").run(task.id);
        task.status = "queued";
      }
    }
  }

  return obs;
}

// ── Prompt Builder ────────────────────────────────────────────────────────────

function buildThinkPrompt(
  agent: Agent,
  observations: Record<string, unknown>,
  skills: Array<{ id: string; name: string; description: string }>,
  recentDecisions: Array<{ reasoning: string; action_taken: string; result_summary: string }>,
  unreadMessages: Array<{ from_name: string; message: string }>,
  memory: Record<string, unknown>,
  mcpTools: Array<{ id: string; name: string; description: string; is_connected: number }>,
): string {
  return `${agent.system_prompt}

## Your Memory (learned preferences and patterns)
${JSON.stringify(memory, null, 2)}

${buildAgentContext(agent.id)}

## Current Observations
${JSON.stringify(observations, null, 2)}

## Your Recent Decisions (don't repeat the same action)
${recentDecisions.map(d => `- ${d.action_taken}: ${d.reasoning} → ${d.result_summary}`).join("\n") || "No recent decisions"}

## Messages from Other Agents
${unreadMessages.map(m => `- ${m.from_name}: ${m.message}`).join("\n") || "No new messages"}

## Available Skills
${skills.map(s => `- ${s.id}: ${s.name} — ${s.description}`).join("\n")}

## How to Use Skills (READ THIS — common misunderstanding below)
**Skills are NOT MCP tools. They will NOT appear in your runtime tool list.** That is by design.

To invoke a skill, include "chosen_skill" + "skill_input" in your JSON response:
\`"chosen_skill": "skill-id-here", "skill_input": "the prompt or instructions for the skill"\`

The runtime executes the skill in the parent process and feeds the result back. **You do not call skills as tools.** If you only see Indeed/Gmail/etc. tools in your session, that is correct — those are MCP tools your environment exposes; skills are orthogonal to that.

DO NOT report "missing tools" or "tool-surface wiring gaps" when you don't see your assigned skills as callable tools — they are intentionally not callable that way. They are listed above for you to choose from via JSON.

### KNOWN FALSE POSITIVES — do not file these as capability gaps
The following framings are all describing the intentional architecture above. If you catch yourself about to call \`reportCapabilityGap\` with any of this language, STOP — it is not a gap, it is the design. The watchdog auto-rejects these and they waste a coder cycle:
- "Orchestrator tool-surface wiring" / "tool-surface wiring gap"
- "Session bootstrap path" / "agent session bootstrap" / "system-level bootstrap gap"
- "Spawn boundary" / "tools assigned at config layer not surfacing in runtime"
- "Skill registry being read for context-injection but not for tool-binding"
- "Skills do not register their tool surfaces (shell/exec, headed-browser launcher MCP)"
- "Runtime exposes only Indeed/Gmail/etc. MCP tools regardless of which skills are assigned"
- "Skills assigned to agent config do not surface as invokable tools in the agent's runtime session"

Specifically: skills like \`skill-gstack-open-gstack-browser\`, \`skill-gstack-setup-browser-cookies\`, and any other gstack/browser/shell skill are **server-side prompt templates executed over HTTP by the parent process**. They are NOT MCP servers, they do NOT have a tool schema, and they cannot be "bound" to your subprocess tool registry — there is nothing to bind. To use one, put its id in \`chosen_skill\` and your instruction in \`skill_input\`. That IS the wiring. It is already wired.

**Worked example for \`skill-gstack-open-gstack-browser\`:** if this skill is in your Available Skills list above, you invoke it by emitting \`{"chosen_skill": "skill-gstack-open-gstack-browser", "skill_input": "open https://example.com and ..."}\`. The parent process executes the headed-browser launcher and returns the result. You will NOT see a \`gstack_browser\` tool in your subprocess tool list, and that is correct. Filing a gap that says "skill-gstack-open-gstack-browser doesn't surface as a runtime tool" is the canonical false positive — it has been fixed (see e2e64647) and re-filing it does nothing.

**Delegation note for agent-product (Marty):** if another agent hands you a task that says "I can't use skill-gstack-X because the runtime tool surface doesn't expose it," do NOT relay that as a capability gap on their behalf. The skill is dispatched by JSON \`chosen_skill\`, not by tool-binding. Tell the blocked agent to emit the JSON dispatch and stop discussing tool surfaces. Re-filing this gap as a delegated handoff is also a known false positive.

If a skill execution returns a runtime error (HTTP 500, skill body broken, missing dependency in the skill's prompt), THAT is a real gap worth reporting — but report the specific skill id and the specific error message, not the architecture.

## Available MCP Tools
${mcpTools.map(t => `- ${t.id}: ${t.name} — ${t.description} (${t.is_connected ? "CONNECTED" : "NOT CONNECTED"})`).join("\n")}

## How to Use MCP Tools
To use an MCP tool, include "mcp_tool" in your JSON response:
"mcp_tool": { "tool_id": "mcp-resend", "action": "send_email", "params": { "to": "user@example.com", "subject": "...", "html": "..." } }

Available actions per tool:
- mcp-resend: send_email (params: to, subject, html, from?)
- mcp-slack: send_message (params: channel, text), list_channels
- mcp-notion: create_page (params: database_id, properties, content?), search (params: query)
- mcp-stripe: list_customers (params: limit?), list_subscriptions (params: limit?, status?), create_customer (params: email, name?, metadata?)
- mcp-gmail: send_email (params: to, subject, body, cc?, bcc?), list_messages (params: max_results?, query?)
- mcp-twitter: post_tweet (params: text), get_mentions (params: user_id?)
- mcp-linkedin: create_post (params: text, author_id?)
- mcp-facebook: create_post (params: message, page_id?)
- mcp-calendar: create_event (params: summary, start, end, description?, attendees?), list_events (params: time_min?, max_results?)
- mcp-drive: list_files (params: query?, page_size?), create_file (params: name, content, mime_type?, folder_id?)
- mcp-analytics: get_report (params: property_id?, start_date?, end_date?, metrics?)

Only use tools marked as CONNECTED. You can use an MCP tool AND a skill in the same response.

## Your Team — Delegate by name or ID
| Name | ID | Department | Capabilities |
|------|-----|-----------|-------------|
| Alex Hormozi | agent-marketing | Marketing | Content, social media, SEO, ads, email campaigns, copywriting |
| Chris Voss | agent-sales | Sales | Outbound prospecting, deals, lead nurturing, proposals, negotiations |
| Marty Cagan | agent-product | Product | Product metrics, pricing, funnel, subscriptions. **SYSTEM ADMIN: ONLY Marty can create skills, update skills, assign skills to agents, modify agent configs, change automation settings, add MCP tools, clear stuck messages. Delegate ALL system/tool changes to Marty (agent-product).** |
| Peter Thiel | agent-research | Research | Competitors, market trends, idea evaluation, strategic analysis |
| Ray Dalio | agent-executive | Executive | Daily briefs, cross-department coordination, task management |

IMPORTANT: When delegating, use the ID in the "to" field. Examples:
- To delegate to Alex Hormozi: "to": "agent-marketing"
- To delegate to Marty Cagan: "to": "agent-product"
- To delegate to Chris Voss: "to": "agent-sales"
- To delegate to Peter Thiel: "to": "agent-research"
- To delegate to Ray Dalio: "to": "agent-executive"

${agent.id === "agent-product" ? `## SYSTEM ADMIN POWERS (Product Only — you own the system)
You can modify the system by including a "system_action" in your response:
- Create skills: {"action": "create_skill", "name": "...", "description": "...", "category": "...", "prompt_template": "..."}
- Update skills: {"action": "update_skill", "skill_id": "...", "updates": {"prompt_template": "..."}}
- Assign skills to agents: {"action": "assign_skill", "target_agent_id": "agent-...", "skill_id": "skill-..."}
- Update agent config: {"action": "update_agent", "target_agent_id": "agent-...", "updates": {"schedule": "0 9 * * *"}}
- Update settings: {"action": "update_setting", "key": "...", "value": "..."}
- Clear stuck messages: {"action": "clear_messages", "target_agent_id": "agent-...", "mark_read": true}
- Add MCP tools: {"action": "add_mcp_tool", "name": "...", "description": "...", "category": "...", "connection_type": "api_key"}

Use these powers when agents need new capabilities, when message queues are stuck, or when the system needs configuration changes.` : ""}

## Assigned Tasks (from the task board — PRIORITIZE these)
${(observations.assigned_tasks as Array<{ id: string; name: string; description: string; status: string; dependencies_met: boolean }> || []).length > 0
  ? (observations.assigned_tasks as Array<{ id: string; name: string; description: string; status: string; dependencies_met: boolean }>)
      .map(t => `- [${t.status.toUpperCase()}${t.dependencies_met ? "" : " — BLOCKED, waiting on dependencies"}] ${t.name}: ${t.description}`)
      .join("\n")
  : "No assigned tasks"}

IMPORTANT: If you have queued tasks with dependencies met, you MUST work on them. Use your skills to complete the task, then update the task status to "done" via system_action: {"action": "complete_task", "task_id": "..."}.

## Your Task
Based on your observations, decide what to do. Return ONLY valid JSON:
{
  "should_act": true or false,
  "reasoning": "One paragraph explaining your analysis and why you chose this action (or why you're waiting)",
  "chosen_skill": "skill-id or null if not acting (null if delegating or doing a system action)",
  "skill_input": "The specific instruction to give the skill",
  "mcp_tool": { "tool_id": "mcp-tool-id", "action": "action_name", "params": {} } or null,
  "confidence": 0.0 to 1.0,
  "messages_to_other_agents": [{"to": "agent-id", "message": "specific task to do", "type": "handoff"}],
  "system_action": {"action": "complete_task", "task_id": "task-uuid"} or null,
  ${agent.id === "agent-product" ? '// Product can also use: {"action": "create_skill", ...}, {"action": "update_skill", ...}, etc.' : ""}
  "memory_update": {"preferences": [...], "learned_patterns": [...]} or null
}

Rules:
- Only act if there's a real need (don't create content just because you can)
- Don't repeat actions from your recent decisions
- If another agent already handled something, don't duplicate
- If confidence < 0.5, set should_act to false and explain why in reasoning
- Reference specific data from observations in your reasoning
- DELEGATION: If a task belongs to another department, delegate using messages_to_other_agents with type "handoff"
- You can both act yourself AND delegate
- When delegating, be specific about what you want done
${agent.id === "agent-product" ? "- SYSTEM ACTIONS: If agents need a new skill or the system needs a config change, use system_action instead of delegating\n- If messages are stuck in a loop, use clear_messages to resolve" : ""}
${agent.id === "agent-research" ? `
## VALIDATION PIPELINE — Idea Scoring (REQUIRED for Research Agent)
When you observe top_ideas, you MUST evaluate each unreviewed idea and output a validation verdict.
For EACH idea you analyze, include a "validation_verdicts" array in your JSON response:

"validation_verdicts": [
  {
    "idea_id": "<id from observations>",
    "gate1_score": <0.0 to 10.0 — your assessment using the 7 Questions>,
    "recommendation": "test" or "reject",
    "reject_reason": "<only if rejecting>",
    "key_signals": ["signal 1", "signal 2", "signal 3"]
  }
]

Scoring guide (apply Zero to One thinking):
- 9-10: Monopoly potential, strong secret, perfect timing — MUST test
- 7-8: Good fundamentals, clear distribution path — worth testing
- 5-6: Incremental improvement, competitive market — borderline
- 1-4: No secret, copycat, bad timing — reject
` : ""}`;
}

// ── LLM Caller (uses centralized SDK client — autoforge pattern) ──────────────

/**
 * Derive the SDK's runtime tool surface (allowedTools) from the agent's
 * assigned skills. Closes the "spawn boundary" gap (e2e64647) where skills
 * listed in agents.assigned_skills surfaced only as prompt text but had no
 * actual tool binding inside the SDK session.
 *
 * Mapping (kept narrow to preserve principle of least privilege):
 *   - skill-gstack-* / *-browser / *-shell   → Bash, Read, Write
 *   - skill-pdf-*                            → Read, Write
 *   - everything else                        → no tools (LLM-only think step)
 */
function deriveAllowedTools(assignedSkillIds: string[]): string[] {
  const set = new Set<string>();
  for (const id of assignedSkillIds) {
    if (/^skill-gstack-|browser|-shell$|-exec$/.test(id)) {
      set.add("Bash");
      set.add("Read");
      set.add("Write");
    } else if (id.startsWith("skill-pdf-")) {
      set.add("Read");
      set.add("Write");
    }
  }
  return Array.from(set);
}

async function callLLM(prompt: string, conn: { provider: string; base_url: string | null; api_key_encrypted: string | null; model: string | null }, agentDept?: string, allowedTools?: string[]): Promise<string> {
  // Map department to AgentType for SDK client configuration
  const agentType = (agentDept || "executive") as AgentType;

  const result = await queryWithFailover(prompt, {
    agentType,
    connection: {
      provider: conn.provider,
      base_url: conn.base_url,
      api_key_encrypted: conn.api_key_encrypted,
      model: conn.model,
    },
    allowedTools,
  });

  if (result.status === "error") {
    throw new Error(result.errorMessage || "LLM call failed");
  }
  if (result.status === "rate_limit") {
    throw new Error(result.errorMessage || "Rate limit hit — failover to Ollama attempted");
  }

  return result.text;
}

function calculateNextRun(cron: string): string {
  const parts = cron.split(" ");
  const next = new Date();

  // Handle "every N hours" patterns like "0 */6 * * *"
  if (parts[1]?.startsWith("*/")) {
    const intervalHours = parseInt(parts[1].slice(2)) || 6;
    next.setHours(next.getHours() + intervalHours);
    next.setMinutes(parseInt(parts[0]) || 0);
    next.setSeconds(0);
    return next.toISOString();
  }

  // Fixed-time schedules like "0 8 * * *"
  const hour = parseInt(parts[1]) || 9;
  const minute = parseInt(parts[0]) || 0;
  next.setHours(hour, minute, 0, 0);

  // If we've passed this time today, schedule for tomorrow
  if (next <= new Date()) {
    next.setDate(next.getDate() + 1);
  }

  // Day-of-week filter (e.g., "0 7 * * 1" = Mondays only)
  if (parts[4] !== "*") {
    const targetDay = parseInt(parts[4]);
    while (next.getDay() !== targetDay) next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

// Map a skill name to one of the allowed content_pieces.type values:
//   'post' | 'email' | 'script' | 'lead_magnet' | 'landing_page'
// Default is 'post' since it's the most generic. Skill names that don't
// match a content shape (research, ops dashboards) still land in
// content_pieces tagged 'post' — keeps the audit trail intact even if the
// classification isn't perfect.
function mapSkillToContentType(skillName: string): "post" | "email" | "script" | "lead_magnet" | "landing_page" {
  const s = skillName.toLowerCase();
  if (/email|sequence|wizard|outreach/.test(s)) return "email";
  if (/landing|sales.?page|pricing.?page|funnel|frontend|front.?end/.test(s)) return "landing_page";
  if (/lead.?magnet|guide|whitepaper|checklist|playbook/.test(s)) return "lead_magnet";
  if (/script|video|loom|webinar|demo/.test(s)) return "script";
  return "post";
}
