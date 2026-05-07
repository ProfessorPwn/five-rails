// ─── Claude Agent SDK Client Factory ──────────────────────────────────────────
// Ported from autoforge/client.py — centralized SDK client creation with
// agent-type-specific configuration, security hooks, and rate-limit fallback.
//
// Autoforge pattern: create_client() builds a ClaudeSDKClient with rich options.
// Five Rails adaptation: wraps the TS SDK query() with equivalent configuration.

import { getConnections } from "@/lib/db";
import { isRateLimitError, parseRetryAfter } from "./rate-limit";

// ── Types ────────────────────────────────────────────────────────────────────

export type AgentType = "executive" | "marketing" | "sales" | "product" | "research" | "operations";

export interface SDKClientOptions {
  /** Agent department type — controls system prompt, tools, max turns */
  agentType: AgentType;
  /** System prompt for persona injection */
  systemPrompt?: string;
  /** Max conversation turns (autoforge: coding=300, testing=100) */
  maxTurns?: number;
  /** Connection override (skip DB lookup) */
  connection?: SDKConnection;
  /** Environment overrides for Ollama failover */
  sdkEnvOverride?: Record<string, string> | null;
  /**
   * Tools the SDK session is allowed to invoke during the run. This is the
   * "spawn boundary" — without it, skills assigned at the agent config layer
   * (e.g. skill-gstack-open-gstack-browser, which needs shell-exec) have no
   * runtime tool surface and the session can only echo Indeed MCP tools that
   * the prompt happens to mention. Callers (agent run route, orchestrator)
   * should derive this from the agent's `assigned_skills` and pass it in so
   * that gstack/browser/exec skills get a real Bash binding inside the
   * Claude Code subprocess. Empty array (or omitted) means "no tools" —
   * preserves the previous default for non-skill paths.
   */
  allowedTools?: string[];
}

export interface SDKConnection {
  provider: string;
  base_url: string | null;
  api_key_encrypted: string | null;
  model: string | null;
}

export interface SDKQueryResult {
  text: string;
  status: "success" | "rate_limit" | "error";
  retryAfterSeconds?: number;
  errorMessage?: string;
}

// ── Agent-Type Configuration (from autoforge's per-agent tool lists) ─────────

/** Max turns per agent type — mirrors autoforge's max_turns_map */
const MAX_TURNS_MAP: Record<AgentType, number> = {
  executive: 10,   // Dalio: delegation + arbitration, focused
  marketing: 10,   // Hormozi: content/ads/email, moderate complexity
  sales: 10,       // Voss: outbound/deals, moderate
  product: 15,     // Cagan: system admin, may need more turns
  research: 10,    // Thiel: analysis, focused
  operations: 10,  // Watchdog: system monitoring, focused
};

/** Default model per provider */
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  ollama: "qwen3:14b",
  openai: "gpt-4o-mini",
};

// ── Ollama Failover (from autoforge's _get_ollama_fallback_env) ──────────────

/** Warm fallback model — always available locally */
const OLLAMA_WARM_FALLBACK = "qwen3:14b";

/** Failover state — persists across calls within the same process */
let _failoverState = {
  usingOllamaFallback: false,
  claudeRetryAfterTs: null as number | null,
  tryingClaudeRecovery: false,
  originalConnection: null as SDKConnection | null,
};

/**
 * Build Ollama failover connection, preferring user-configured Ollama model.
 * Mirrors autoforge's _get_ollama_fallback_env().
 */
export function getOllamaFallbackConnection(): SDKConnection {
  // Check if there's already an Ollama connection configured
  try {
    const connections = getConnections();
    const ollama = connections.find(
      (c) => c.provider === "ollama" && c.is_active === 1
    );
    if (ollama) {
      return {
        provider: "ollama",
        base_url: ollama.base_url || "http://127.0.0.1:11434",
        api_key_encrypted: null,
        model: ollama.model || OLLAMA_WARM_FALLBACK,
      };
    }
  } catch {
    // Stick with warm fallback on any error
  }

  return {
    provider: "ollama",
    base_url: "http://127.0.0.1:11434",
    api_key_encrypted: null,
    model: OLLAMA_WARM_FALLBACK,
  };
}

/**
 * Get the current failover state — used by agent-session.ts for auto-recovery.
 */
export function getFailoverState() {
  return { ..._failoverState };
}

/**
 * Activate Ollama failover — called when Claude rate-limits.
 */
export function activateOllamaFailover(
  originalConn: SDKConnection,
  retryAfterSeconds?: number
) {
  _failoverState = {
    usingOllamaFallback: true,
    claudeRetryAfterTs: Date.now() + (retryAfterSeconds || 3600) * 1000,
    tryingClaudeRecovery: false,
    originalConnection: originalConn,
  };
  console.log(
    `[Failover] Claude rate limit. Switching to Ollama. Will retry Claude in ~${Math.round((retryAfterSeconds || 3600) / 60)}m.`
  );
}

/**
 * Check if Claude recovery should be attempted.
 */
export function shouldAttemptClaudeRecovery(): boolean {
  if (
    !_failoverState.usingOllamaFallback ||
    !_failoverState.claudeRetryAfterTs
  ) {
    return false;
  }
  return Date.now() >= _failoverState.claudeRetryAfterTs;
}

/**
 * Restore Claude as primary after successful recovery.
 */
export function restoreClaude() {
  console.log("[Failover] Claude is available again. Restoring as primary.");
  _failoverState = {
    usingOllamaFallback: false,
    claudeRetryAfterTs: null,
    tryingClaudeRecovery: false,
    originalConnection: null,
  };
}

/**
 * Reset failover state (e.g. on app restart).
 */
export function resetFailoverState() {
  _failoverState = {
    usingOllamaFallback: false,
    claudeRetryAfterTs: null,
    tryingClaudeRecovery: false,
    originalConnection: null,
  };
}

// ── SDK Query Function ───────────────────────────────────────────────────────

/**
 * Execute a query via the Claude Agent SDK with autoforge-style configuration.
 *
 * Mirrors autoforge's run_agent_session() — sends prompt, streams response,
 * detects rate limits, returns structured result.
 *
 * @param prompt - The prompt to send
 * @param options - Client configuration (agent type, system prompt, etc.)
 */
export async function querySDK(
  prompt: string,
  options: SDKClientOptions
): Promise<SDKQueryResult> {
  const conn = resolveConnection(options);
  const model = conn.model || DEFAULT_MODELS[conn.provider] || "claude-sonnet-4-20250514";
  const maxTurns = options.maxTurns || MAX_TURNS_MAP[options.agentType] || 10;

  // Route to the appropriate provider
  if (conn.provider === "ollama") {
    return queryOllama(prompt, conn, options);
  } else if (conn.provider === "claude-cli") {
    // Claude CLI: always use Agent SDK with inherited env (no API key override)
    return queryClaudeSDK(prompt, conn, model, maxTurns, options);
  } else if (conn.provider === "anthropic") {
    return queryClaude(prompt, conn, model, maxTurns, options);
  } else {
    return queryOpenAI(prompt, conn, model, options);
  }
}

/**
 * Query with automatic failover — tries primary, falls back to Ollama on rate limit.
 * Mirrors autoforge's agent.py rate-limit failover logic.
 */
export async function queryWithFailover(
  prompt: string,
  options: SDKClientOptions
): Promise<SDKQueryResult> {
  // Check if we should try recovering Claude
  if (shouldAttemptClaudeRecovery() && _failoverState.originalConnection) {
    console.log("[Failover] Rate limit window expired. Attempting Claude recovery...");
    _failoverState.tryingClaudeRecovery = true;

    const result = await querySDK(prompt, {
      ...options,
      connection: _failoverState.originalConnection,
    });

    if (result.status !== "rate_limit") {
      restoreClaude();
      return result;
    }
    // Recovery failed — stay on Ollama
    _failoverState.tryingClaudeRecovery = false;
  }

  // If currently on Ollama fallback, use it
  if (_failoverState.usingOllamaFallback) {
    return querySDK(prompt, {
      ...options,
      connection: getOllamaFallbackConnection(),
    });
  }

  // Normal path: try primary connection
  const result = await querySDK(prompt, options);

  // If rate-limited, activate Ollama failover and retry
  if (result.status === "rate_limit") {
    const conn = resolveConnection(options);
    activateOllamaFailover(conn, result.retryAfterSeconds);

    // Immediate retry on Ollama
    return querySDK(prompt, {
      ...options,
      connection: getOllamaFallbackConnection(),
    });
  }

  return result;
}

// ── Provider-Specific Implementations ────────────────────────────────────────

/** Wraps a promise with a timeout — rejects if it doesn't resolve in time */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/** Default LLM call timeout: 90 seconds */
const LLM_TIMEOUT_MS = 90_000;

async function queryClaude(
  prompt: string,
  conn: SDKConnection,
  model: string,
  maxTurns: number,
  options: SDKClientOptions
): Promise<SDKQueryResult> {
  const apiKey = conn.api_key_encrypted || process.env.ANTHROPIC_API_KEY || "";
  const isOAuth = apiKey.startsWith("sk-ant-oat");

  // OAuth tokens must use the Claude Agent SDK (only way they work).
  // Standard API keys normally use the direct Messages API (faster, no
  // subprocess) — but that path has no tool-execution loop, so any
  // `allowedTools` requested by the caller would be silently dropped.
  // That's the spawn-boundary leak reported in gap e2e64647: skills
  // assigned at the config layer (e.g. skill-gstack-open-gstack-browser
  // → ["Bash","Read","Write"]) flow correctly into options.allowedTools
  // but vanish here on the API-key branch, leaving the runtime session
  // with no real tool surface. Fix: if the caller explicitly requested
  // any allowedTools, route through the SDK path regardless of auth
  // mode. The Claude Agent SDK happily picks up ANTHROPIC_API_KEY from
  // env, so API-key callers still authenticate correctly. Tool-less
  // calls keep using the fast Messages API path unchanged.
  const wantsTools = (options.allowedTools?.length ?? 0) > 0;
  if (isOAuth || wantsTools) {
    return queryClaudeSDK(prompt, conn, model, maxTurns, options);
  } else {
    return queryClaudeAPI(prompt, conn, model, apiKey, options);
  }
}

/** OAuth tokens: use Claude Agent SDK (spawns subprocess, needs timeout) */
async function queryClaudeSDK(
  prompt: string,
  conn: SDKConnection,
  model: string,
  maxTurns: number,
  options: SDKClientOptions
): Promise<SDKQueryResult> {
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const fullPrompt = options.systemPrompt
      ? `${options.systemPrompt}\n\n${prompt}`
      : prompt;

    // claude-cli provider: inherit env as-is (uses CLI's own auth).
    // anthropic provider: route the credential into the env var that
    // matches its kind. OAuth tokens (sk-ant-oat…) → CLAUDE_CODE_OAUTH_TOKEN.
    // Standard API keys (sk-ant-api…) → ANTHROPIC_API_KEY. This second
    // branch is reachable now that gap-e2e64647's fix in queryClaude()
    // routes tool-needing API-key calls through the SDK so assigned
    // skills get a real runtime tool surface.
    const credential = conn.api_key_encrypted || "";
    const credentialIsOAuth = credential.startsWith("sk-ant-oat");
    const sdkEnv = conn.provider === "claude-cli"
      ? { ...process.env }
      : credentialIsOAuth
        ? { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: credential }
        : { ...process.env, ANTHROPIC_API_KEY: credential || process.env.ANTHROPIC_API_KEY || "" };

    // Tool-surface wiring: derive the SDK allowedTools from the caller's
    // options. Previously this was hardcoded to `tools: []`, which is the
    // "spawn boundary" gap reported by agent-product (e2e64647): skills
    // listed in agents.assigned_skills surfaced in the prompt's "Available
    // Skills" block but never bound any runtime tools, so gstack/browser
    // skills had no Bash to dispatch to. Callers now pass `allowedTools`
    // through SDKClientOptions; we forward it under both `tools` (legacy
    // SDK option name kept here for backward compat) and `allowedTools`
    // (canonical name used by Claude Agent SDK, matches watchdog-coder).
    const allowedTools = options.allowedTools ?? [];
    const output = await withTimeout(
      (async () => {
        let result = "";
        for await (const msg of query({
          prompt: fullPrompt,
          options: {
            model,
            env: sdkEnv,
            tools: allowedTools,
            allowedTools,
            maxTurns,
            persistSession: false,
          },
        })) {
          if (msg.type === "assistant" && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === "text") result += block.text;
            }
          } else if (msg.type === "result" && msg.subtype === "success") {
            if (msg.result && !result) result = msg.result;
          }
        }
        return result;
      })(),
      LLM_TIMEOUT_MS,
      `Claude SDK (${model})`
    );

    if (isRateLimitError(output)) {
      return { text: output, status: "rate_limit", retryAfterSeconds: parseRetryAfter(output) || undefined };
    }
    return { text: output, status: "success" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (isRateLimitError(errMsg)) {
      return { text: "", status: "rate_limit", retryAfterSeconds: parseRetryAfter(errMsg) || undefined, errorMessage: errMsg };
    }
    return { text: "", status: "error", errorMessage: errMsg };
  }
}

/** Standard API keys: use Messages API directly (fast, no subprocess) */
async function queryClaudeAPI(
  prompt: string,
  conn: SDKConnection,
  model: string,
  apiKey: string,
  options: SDKClientOptions
): Promise<SDKQueryResult> {
  try {
    const baseUrl = conn.base_url || "https://api.anthropic.com";
    const messages: Array<{ role: string; content: string }> = [{ role: "user", content: prompt }];
    const body: Record<string, unknown> = { model, max_tokens: 4096, messages };
    if (options.systemPrompt) body.system = options.systemPrompt;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429 || isRateLimitError(errText)) {
        return { text: "", status: "rate_limit", retryAfterSeconds: parseRetryAfter(errText) || undefined, errorMessage: errText.slice(0, 200) };
      }
      return { text: "", status: "error", errorMessage: `Claude API ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    const output = (data.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    return { text: output, status: "success" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (isRateLimitError(errMsg)) {
      return { text: "", status: "rate_limit", retryAfterSeconds: parseRetryAfter(errMsg) || undefined, errorMessage: errMsg };
    }
    return { text: "", status: "error", errorMessage: errMsg };
  }
}

async function queryOllama(
  prompt: string,
  conn: SDKConnection,
  options: SDKClientOptions
): Promise<SDKQueryResult> {
  try {
    const { Ollama } = await import("ollama");
    const { resolveOllamaModel } = await import("@/lib/ai/ollama-client");
    const host = conn.base_url || "http://127.0.0.1:11434";
    const ollama = new Ollama({ host });
    const model = await resolveOllamaModel(conn.model, host);

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await withTimeout(
      ollama.chat({
        model,
        messages,
        stream: false,
      }),
      LLM_TIMEOUT_MS,
      `Ollama (${model})`
    );

    return { text: response.message.content, status: "success" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { text: "", status: "error", errorMessage: errMsg };
  }
}

async function queryOpenAI(
  prompt: string,
  conn: SDKConnection,
  model: string,
  options: SDKClientOptions
): Promise<SDKQueryResult> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (conn.api_key_encrypted) {
      headers["Authorization"] = `Bearer ${conn.api_key_encrypted}`;
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    const res = await fetch(
      `${conn.base_url || "https://api.openai.com"}/v1/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ model, messages, max_tokens: 4096 }),
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429 || isRateLimitError(errText)) {
        return {
          text: "",
          status: "rate_limit",
          retryAfterSeconds: parseRetryAfter(errText) || undefined,
          errorMessage: errText,
        };
      }
      return { text: "", status: "error", errorMessage: `HTTP ${res.status}: ${errText}` };
    }

    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content || "",
      status: "success",
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { text: "", status: "error", errorMessage: errMsg };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the connection to use — explicit override > failover state > DB lookup.
 */
function resolveConnection(options: SDKClientOptions): SDKConnection {
  // Explicit connection override
  if (options.connection) return options.connection;

  // Failover state
  if (_failoverState.usingOllamaFallback && !_failoverState.tryingClaudeRecovery) {
    return getOllamaFallbackConnection();
  }

  // DB lookup — get active connections sorted by priority
  const connections = getConnections();
  const active = connections.find((c) => c.is_active === 1);
  if (active) {
    return {
      provider: active.provider,
      base_url: active.base_url,
      api_key_encrypted: active.api_key_encrypted,
      model: active.model,
    };
  }

  // Last resort: Ollama
  return getOllamaFallbackConnection();
}
