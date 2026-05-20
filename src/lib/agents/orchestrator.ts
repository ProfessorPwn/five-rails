// ─── Agent Orchestrator ──────────────────────────────────────────────────────
// Single in-process entry point for running an agent chat turn. Used by:
//   - HTTP route /api/agents/[id]/chat (thin wrapper)
//   - Delegations (in-process, no HTTP round-trip)
//   - Scheduled runs that need a chat-style response
//
// This replaces the previous pattern where agent-to-agent delegation issued
// fetch() calls back to /api/agents/X/chat, which saturated the dev server:
// each handoff cascaded into 2–4 additional HTTP requests, each one compiling
// another route on the single-threaded Turbopack worker. With in-process
// delegation, a cascade is just recursive function calls sharing one LLM
// connection, no sockets, no compile thrash.

import { getDb, getActiveConnection, getConnectionWithFallback, logActivity } from "@/lib/db";
import {
  createChatSession,
  recordUserTurn,
  recordAgentTurn,
  bumpSessionActivity,
  updateAgentMemory,
  getRecentHistory,
} from "@/lib/db/chat-sessions";
import { logger } from "@/lib/logger";
import {
  createHandoff,
  completeHandoff,
  findPendingHandoffFor,
  reportCapabilityGap,
} from "@/lib/agents/supervisor";
import { buildAgentContext } from "@/lib/agents/context-builder";
import { sendEmail, getUserEmail } from "@/lib/email/send";

const MAX_DELEGATION_DEPTH = 3;

export interface RunAgentChatOptions {
  agentId: string;
  userMessage: string;
  sessionId?: string;
  connectionId?: string;
  delegationDepth?: number;
  /** Origin of the host app, used for calling skill-execute + notify routes */
  baseUrl: string;
}

export interface RunAgentChatResult {
  response: string;
  session_id: string;
  action: { skill: string | null; result: string | null } | null;
  delegations?: Array<{ agent: string; response: string }>;
  suggested_followups: string[];
  agent_name: string;
  provider: string;
}

interface AgentRow {
  id: string; name: string; role: string; system_prompt: string;
  memory: string; department: string; assigned_skills: string;
}

type ParsedAgentResponse = {
  response: string;
  action?: { execute_skill: string; skill_input: string; reasoning: string } | null;
  delegate_to?: Array<{ agent_id: string; task: string; deadline_minutes?: number }> | null;
  memory_update?: Record<string, unknown> | null;
  suggested_followups?: string[];
  notify?: { message: string; type?: string } | null;
  complete_handoff?: { message_id?: string; result_ref?: string } | null;
  report_gap?: { missing_capability: string; proposed_fix?: string; install_command?: string } | null;
  // Marty (agent-product) only — invoke /api/agents/system-action to create
  // skills, assign skills, update agent configs, modify settings, etc.
  system_action?: { action: string; [key: string]: unknown } | null;
};

export async function runAgentChat(opts: RunAgentChatOptions): Promise<RunAgentChatResult> {
  const { agentId, userMessage, baseUrl } = opts;
  const delegationDepth = opts.delegationDepth ?? 0;
  const db = getDb();

  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRow | undefined;
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  let conn = getActiveConnection(opts.connectionId);
  const { fallback } = getConnectionWithFallback();
  if (!conn) throw new Error("No LLM connection found. Add one in Connections.");

  // Session
  let sessionId = opts.sessionId;
  if (!sessionId) {
    const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? "..." : "");
    sessionId = createChatSession(agentId, title);
  }

  // Persist user message
  recordUserTurn({ agentId, sessionId, message: userMessage });

  // Build prompt
  const prompt = buildChatPrompt(agent, sessionId, userMessage);

  // Bind the SDK session's runtime tool surface to the agent's actually-
  // assigned skills (closes capability gap e2e64647 on the chat/delegation
  // path). Without this, delegated handoffs to agents like agent-sales
  // running gstack/browser skills had no Bash/exec inside the SDK subprocess.
  const assignedSkillsForTools = JSON.parse(agent.assigned_skills || "[]") as string[];
  const allowedTools = deriveAllowedTools(assignedSkillsForTools);

  // Call LLM with fallback
  let output: string;
  try {
    output = await callLLMChat(prompt, conn, agent.department, allowedTools);
  } catch (primaryErr) {
    if (fallback && fallback.id !== conn.id) {
      logger.warn("orchestrator", "primary LLM failed, falling back", { primary: `${conn.provider}/${conn.model}`, fallback: `${fallback.provider}/${fallback.model}`, error: primaryErr instanceof Error ? primaryErr.message : String(primaryErr) });
      conn = fallback;
      output = await callLLMChat(prompt, fallback, agent.department, allowedTools);
    } else {
      throw primaryErr;
    }
  }

  const parsed = parseAgentResponse(output);
  const isDelegatedMessage = userMessage.startsWith("[Delegated from ");

  // Execute skill (still HTTP because skills have their own setup + run across agents)
  let actionResult: string | null = null;
  let fullSkillResult: string | null = null;
  if (parsed.action?.execute_skill) {
    try {
      const agentContext = `[AGENT PERSONA: You are operating as ${agent.name}. ${agent.role}. Apply these frameworks in ALL your output:\n${agent.system_prompt.slice(0, 1500)}]\n\nTASK: `;
      const res = await fetch(`${baseUrl}/api/skills/${parsed.action.execute_skill}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: agentContext + (parsed.action.skill_input || ""), project_id: null }),
      });
      if (res.ok) {
        const data = await res.json();
        fullSkillResult = data.result || data.output || "Done";
        actionResult = fullSkillResult!.slice(0, 2000);
      }
    } catch { /* non-blocking */ }
  }

  // System action (Marty only) — POST to /api/agents/system-action so chat-mode
  // Marty has the same admin powers as scheduled-run-mode Marty. This unblocks
  // the watchdog resolver pipeline: Marty can create_skill, assign_skill,
  // update_agent, etc. without the user touching anything.
  if (parsed.system_action?.action && agentId === "agent-product") {
    try {
      const sysRes = await fetch(`${baseUrl}/api/agents/system-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.system_action, agent_id: agentId }),
      });
      const sysData = await sysRes.json();
      const sysSummary = sysRes.ok
        ? `system_action(${parsed.system_action.action}): ${JSON.stringify(sysData).slice(0, 300)}`
        : `system_action(${parsed.system_action.action}) FAILED: ${JSON.stringify(sysData).slice(0, 300)}`;
      actionResult = (actionResult ? actionResult + "\n" : "") + sysSummary;
      logger.info("orchestrator", `Marty executed system_action: ${parsed.system_action.action}`, sysData);
    } catch (err) {
      logger.error("orchestrator", "system_action call failed", err);
    }
  }

  // Email skill output to user
  if (fullSkillResult && parsed.action?.execute_skill) {
    try {
      const userEmail = getUserEmail();
      if (userEmail) {
        const taskTitle = parsed.action.skill_input?.slice(0, 100) || parsed.action.execute_skill;
        sendEmail({
          to: userEmail,
          subject: `[${agent.name}] ${taskTitle}`,
          body: [
            `# ${agent.name} — ${taskTitle}`,
            "",
            `**Skill:** ${parsed.action.execute_skill}`,
            `**Triggered by:** ${isDelegatedMessage ? "delegation" : "user chat"}`,
            "",
            `**User request:** ${userMessage.slice(0, 500)}`,
            "",
            "---",
            "",
            "## Result",
            "",
            fullSkillResult,
          ].join("\n"),
        }).catch((err) => logger.error("orchestrator", "email send failed", err));
      }
    } catch { /* non-blocking */ }
  }

  // Delegate to other agents — IN-PROCESS, no HTTP round-trip
  const delegations: Array<{ agent: string; response: string }> = [];
  if (parsed.delegate_to?.length && !isDelegatedMessage && delegationDepth < MAX_DELEGATION_DEPTH) {
    for (const del of parsed.delegate_to) {
      try {
        const handoffId = createHandoff({
          from_agent_id: agentId,
          to_agent_id: del.agent_id,
          message: del.task,
          message_type: "handoff",
          deadline_minutes: del.deadline_minutes,
        });

        try {
          const childResult = await runAgentChat({
            agentId: del.agent_id,
            userMessage: `[Delegated from ${agent.name} | handoff:${handoffId}]: ${del.task}`,
            connectionId: opts.connectionId,
            delegationDepth: delegationDepth + 1,
            baseUrl,
          });
          delegations.push({ agent: del.agent_id, response: (childResult.response || "Acknowledged").slice(0, 500) });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          delegations.push({ agent: del.agent_id, response: `Delegated (error: ${msg.slice(0, 100)})` });
        }
      } catch { /* non-blocking */ }
    }
  } else if (parsed.delegate_to?.length && delegationDepth >= MAX_DELEGATION_DEPTH) {
    logger.warn("orchestrator", "max delegation depth reached", { depth: delegationDepth, from: agentId, limit: MAX_DELEGATION_DEPTH });
    logActivity({
      action: "agent_delegation_depth_exceeded",
      details: `${agent.name} tried to delegate further at depth ${delegationDepth}, but was blocked to prevent cascade overload.`,
    });
  }

  // Handoff completion
  if (isDelegatedMessage) {
    const handoffIdFromMarker = userMessage.match(/handoff:([0-9a-f-]{36})/)?.[1];
    const explicitId = parsed.complete_handoff?.message_id;
    const handoffId = explicitId || handoffIdFromMarker;
    const didWork = !!(parsed.action?.execute_skill || parsed.response?.trim().length);

    if (handoffId && didWork) {
      completeHandoff(handoffId, `agent_conversations:${sessionId}`);
    } else if (didWork) {
      const pending = findPendingHandoffFor(agentId);
      if (pending) completeHandoff(pending.id, `agent_conversations:${sessionId}`);
    }
  }

  // Capability gap — agent declared it cannot complete the task without new tooling.
  // CRITICAL: Suppress report_gap when the incoming message is itself a Watchdog
  // resolution request. Otherwise Marty (or anyone else Watchdog consults) files
  // a new gap as part of the response, which Watchdog sees next cycle and
  // re-delegates — infinite loop that burns tokens and spams notifications.
  const isWatchdogConsult = userMessage.startsWith("[Watchdog autonomous resolution request]");
  if (parsed.report_gap?.missing_capability && !isWatchdogConsult) {
    const handoffIdFromMarker = userMessage.match(/handoff:([0-9a-f-]{36})/)?.[1];
    try {
      await reportCapabilityGap({
        agent_id: agentId,
        blocking_message_id: handoffIdFromMarker,
        task_description: userMessage.slice(0, 500),
        missing_capability: parsed.report_gap.missing_capability,
        proposed_fix: parsed.report_gap.proposed_fix,
        install_command: parsed.report_gap.install_command,
      });
    } catch (err) {
      logger.error("orchestrator", "reportCapabilityGap failed", err);
    }
  } else if (parsed.report_gap?.missing_capability && isWatchdogConsult) {
    logger.info("orchestrator", "suppressed report_gap during watchdog consult (loop-breaker)", {
      agent: agentId,
      would_have_filed: parsed.report_gap.missing_capability.slice(0, 100),
    });
  }

  // Telegram notification (HTTP — fire-and-forget)
  if (parsed.notify?.message) {
    fetch(`${baseUrl}/api/agents/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_name: agent.name,
        message: parsed.notify.message,
        type: parsed.notify.type || "info",
        agent_id: agentId,
      }),
    }).catch(() => {});
  }

  // Action summary + persist agent response
  const actionSummary: Record<string, unknown> = {};
  if (parsed.action?.execute_skill) actionSummary.skill = parsed.action.execute_skill;
  if (actionResult) actionSummary.result = actionResult;
  if (delegations.length > 0) actionSummary.delegations = delegations;

  recordAgentTurn({
    agentId,
    sessionId,
    message: parsed.response,
    actionTaken: actionSummary,
  });

  bumpSessionActivity(sessionId);

  if (parsed.memory_update) {
    const current = JSON.parse(agent.memory || "{}");
    const updated = { ...current, ...parsed.memory_update };
    updateAgentMemory(agentId, updated);
  }

  // Always include action when any side-effect ran (skill, system_action, etc.)
  // — not only when parsed.action.execute_skill was set. Watchdog reads
  // action.result to detect system_action outcomes from Marty.
  const returnAction = (parsed.action || actionResult) ? {
    skill: parsed.action?.execute_skill ?? null,
    result: actionResult,
  } : null;

  return {
    response: parsed.response,
    session_id: sessionId,
    action: returnAction,
    delegations: delegations.length > 0 ? delegations : undefined,
    suggested_followups: parsed.suggested_followups || [],
    agent_name: agent.name,
    provider: `${conn.provider}${conn.model ? ` (${conn.model})` : ""}`,
  };
}

// ── Prompt construction ──────────────────────────────────────────────────────

function buildChatPrompt(agent: AgentRow, sessionId: string, userMessage: string): string {
  const db = getDb();
  const history = getRecentHistory(agent.id, sessionId);

  const skillIds = JSON.parse(agent.assigned_skills || "[]") as string[];
  const skills = skillIds.length > 0 ? db.prepare(
    `SELECT id, name, description FROM skills WHERE id IN (${skillIds.map(() => "?").join(",")}) AND is_active = 1`
  ).all(...skillIds) as Array<{ id: string; name: string; description: string }> : [];

  // Skills that have a real runtime binding beyond the LLM prompt template —
  // pre-hooks in /api/skills/[id]/execute dispatch to shell binaries (gstack)
  // or post-hooks generate PDFs. Tagging these in the prompt closes the
  // tool-surface wiring gap reported by agent-product: skills assigned at the
  // config layer were being shown as advisory context, not as invokable
  // runtime tools. The agent now sees binding type explicitly so it knows
  // action.execute_skill on a [shell-exec] skill triggers a real subprocess,
  // not just another LLM call.
  const SHELL_EXEC_SKILLS = new Set([
    "skill-gstack-open-gstack-browser",
    "skill-gstack-setup-browser-cookies",
    "skill-gstack-browse",
  ]);
  const PDF_SKILLS = new Set(["skill-pdf-report", "skill-ideabrowser-pick"]);
  const skillBinding = (id: string): string => {
    if (SHELL_EXEC_SKILLS.has(id)) return "[shell-exec]";
    if (PDF_SKILLS.has(id)) return "[llm+pdf]";
    return "[llm]";
  };
  // Detect skills that the agent's config lists but that are missing or
  // inactive in the skills table. Surface these so the agent doesn't
  // hallucinate that a tool exists when it actually has no binding.
  const surfacedIds = new Set(skills.map((s) => s.id));
  const unboundSkillIds = skillIds.filter((id) => !surfacedIds.has(id));

  const memory = JSON.parse(agent.memory || "{}");

  const tgConfig = db.prepare(
    "SELECT config FROM agent_remote_config WHERE channel = 'telegram' AND agent_id = ? AND is_active = 1 LIMIT 1"
  ).get(agent.id) as { config: string } | undefined;

  const allTgBots = db.prepare(
    "SELECT agent_id, config FROM agent_remote_config WHERE channel = 'telegram' AND is_active = 1"
  ).all() as Array<{ agent_id: string; config: string }>;

  let telegramContext = "";
  if (tgConfig) {
    const parsed = JSON.parse(tgConfig.config);
    telegramContext = `
## Telegram Connection
You are connected to Telegram as @${parsed.bot_username}. The user can message you directly on Telegram.
You can notify the user by including "notify": {"message": "your notification text", "type": "completed|alert|info"} in your JSON response.
The user prefers Telegram for quick updates, alerts, and status notifications.`;
    if (allTgBots.length > 1) {
      const otherBots = allTgBots
        .filter((b) => b.agent_id !== agent.id)
        .map((b) => {
          const p = JSON.parse(b.config);
          return `- ${b.agent_id}: @${p.bot_username}`;
        });
      if (otherBots.length > 0) {
        telegramContext += `\nYour teammates are also on Telegram:\n${otherBots.join("\n")}`;
      }
    }
  }

  const worldContext = buildAgentContext(agent.id);

  return `${agent.system_prompt}

## Your Memory
${JSON.stringify(memory, null, 2)}

${worldContext}

## Available Skills (you can execute these if needed)
These ARE your runtime tool surface — invoking one via "action": {"execute_skill": "<id>", ...} dispatches to the bound runtime. Binding tags: [shell-exec] runs a real subprocess (e.g. gstack browser binary); [llm+pdf] runs an LLM template then renders/emails a PDF; [llm] runs a plain LLM prompt template.
${skills.map(s => `- ${skillBinding(s.id)} ${s.id}: ${s.name} — ${s.description}`).join("\n") || "None assigned"}${unboundSkillIds.length > 0 ? `\n\n⚠️ Skills assigned in your config but NOT registered as active runtime tools (do not invoke; ask Marty/agent-product to create or activate them):\n${unboundSkillIds.map(id => `- ${id}`).join("\n")}` : ""}

## Your Team — Delegate by name or ID
| Name | ID | Department | Capabilities |
|------|-----|-----------|-------------|
| Alex Hormozi | agent-marketing | Marketing | Content, social media, SEO, ads, email campaigns, copywriting |
| Chris Voss | agent-sales | Sales | Outbound prospecting, deals, lead nurturing, proposals, negotiations |
| Marty Cagan | agent-product | Product | Product metrics, pricing, funnel, subscriptions. **SYSTEM ADMIN: ONLY Marty can create skills, update skills, assign skills to agents, modify agent configs, change settings, add MCP tools, clear stuck messages. Delegate ALL system/tool changes to Marty (agent-product).** |
| Peter Thiel | agent-research | Research | Competitors, market trends, idea evaluation, strategic analysis |
| Ray Dalio | agent-executive | Executive | Daily briefs, cross-department coordination, task management |

IMPORTANT: When delegating, use the ID in the "to" field:
- Alex Hormozi = "agent-marketing"
- Chris Voss = "agent-sales"
- Marty Cagan = "agent-product"
- Peter Thiel = "agent-research"
- Ray Dalio = "agent-executive"
${telegramContext}

## Conversation History
${history.map(m => `${m.role === "user" ? "User" : agent.name}: ${m.message}`).join("\n")}

User: ${userMessage}

Respond naturally as ${agent.name}. Use markdown formatting (bold, lists, code blocks) in your response.
If the user asks you to DO something:
1. If it's in YOUR department, execute the skill yourself
2. If it belongs to ANOTHER department, delegate via "delegate_to"

Return JSON:
{
  "response": "Your markdown-formatted response",
  "action": {"execute_skill": "skill-id or null", "skill_input": "instruction", "reasoning": "why"} or null,
  "delegate_to": [{"agent_id": "agent-id", "task": "specific task", "deadline_minutes": 30}] or null,
  "notify": {"message": "notification text for Telegram", "type": "completed|alert|info"} or null,
  "complete_handoff": {"message_id": "uuid from [handoff:...] marker in delegation", "result_ref": "short description"} or null,
  "report_gap": {"missing_capability": "e.g. pdf generation", "proposed_fix": "e.g. install pdfkit", "install_command": "e.g. npm install pdfkit@0.17"} or null,
  "system_action": null,
  "memory_update": {"preferences": [...]} or null,
  "suggested_followups": ["follow-up question 1", "follow-up question 2"]
}
${agent.id === "agent-product" ? `
SYSTEM_ACTION (Marty/agent-product ONLY): you can directly modify the system to unblock other agents. Set "system_action" to one of:
  {"action":"create_skill","name":"...","description":"...","category":"...","prompt_template":"..."}
  {"action":"assign_skill","target_agent_id":"agent-...","skill_id":"skill-..."}
  {"action":"update_agent","target_agent_id":"agent-...","updates":{"system_prompt":"...","schedule":"...","is_active":1}}
  {"action":"update_setting","key":"...","value":"..."}
  {"action":"clear_messages","target_agent_id":"agent-...","mark_read":true}
Watchdog routes blocked-agent gaps to you so you can FIX them autonomously — assign an existing skill, create a new one, or update config. Only escalate to user if it requires an API key/credential the user must physically provide.
` : ""}
Use "notify" for Telegram updates. Use "complete_handoff" when you finish delegated work — parse the handoff UUID from the [handoff:...] marker in the delegation message. Use "report_gap" when you cannot complete a task because a needed tool/skill/library is missing — describe specifically what's missing and propose a fix. NEVER leave delegated work silently incomplete.`;
}

// ── Response parser ──────────────────────────────────────────────────────────

function parseAgentResponse(raw: string): ParsedAgentResponse {
  try {
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned.includes("{") ? cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1) : cleaned);
  } catch {
    return { response: raw, action: null };
  }
}

// ── LLM call — delegates to centralized llm-client ──────────────────────────

type LlmConnection = {
  id: string; provider: string; model: string | null; base_url: string | null;
  api_key_encrypted: string | null; is_active: number;
};

async function callLLMChat(prompt: string, conn: LlmConnection, _department: string, allowedTools?: string[]): Promise<string> {
  const { callLLM } = await import("@/lib/ai/llm-client");
  return callLLM({
    provider: conn.provider,
    base_url: conn.base_url,
    api_key_encrypted: conn.api_key_encrypted,
    model: conn.model,
  }, prompt, { maxTokens: 2000, allowedTools });
}

/**
 * Derive the SDK's runtime tool surface (allowedTools) from the agent's
 * assigned skills. Mirrors the function in
 * src/app/api/agents/[id]/run/route.ts so both the scheduled-run path and
 * the chat/delegation path agree on tool-binding for any given skill set.
 *
 * Mapping (kept narrow to preserve principle of least privilege):
 *   - skill-gstack-* / *-browser / *-shell / *-exec → Bash, Read, Write
 *   - skill-pdf-*                                   → Read, Write
 *   - everything else                               → no tools (LLM-only)
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
