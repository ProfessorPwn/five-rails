// ─── Shared LLM Client ────────────────────────────────────────────────────────
// Unified interface for calling Ollama, OpenAI-compatible, and Anthropic LLMs.
//
// Now delegates to the centralized SDK client (sdk-client.ts) for Claude calls,
// mirroring autoforge's pattern where client.py handles all SDK configuration.
//
// Existing callLLMWithFallback() is preserved for backward compatibility but
// enhanced with rate-limit-aware failover from autoforge's agent.py.

import { getConnections } from "@/lib/db";
import {
  type SDKConnection,
  querySDK,
  queryWithFailover,
  getOllamaFallbackConnection,
  getFailoverState,
} from "./sdk-client";
import { isRateLimitError } from "./rate-limit";

export interface LLMConnection {
  provider: string;
  base_url: string | null;
  api_key_encrypted: string | null;
  model: string | null;
  priority?: number;
}

export interface LLMCallOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Tools the SDK session is allowed to invoke during this call. Forwarded to
   * querySDK so Claude-Agent-SDK callers (orchestrator chat path, delegation
   * handoffs, etc.) get the same runtime tool surface as the run/route.ts
   * path. Without this, skills assigned in agents.assigned_skills surfaced
   * only as prompt text and had no Bash/exec binding inside the subprocess —
   * the "spawn boundary" gap reported by agent-product (e2e64647).
   */
  allowedTools?: string[];
}

/**
 * Get the first active LLM connection, or null if none configured.
 */
export function getActiveLLMConnection(): LLMConnection | null {
  const connections = getConnections();
  const active = connections.find((c) => c.is_active === 1);
  return active || null;
}

/**
 * Get all active LLM connections ordered by priority (lowest first).
 * Used for fallback: if primary fails, try secondary.
 */
export function getAllActiveLLMConnections(): LLMConnection[] {
  const connections = getConnections() as Array<LLMConnection & { is_active: number }>;
  return connections.filter((c) => c.is_active === 1);
}

/**
 * Call an LLM with automatic failover across all active connections.
 * Enhanced with autoforge-style rate-limit detection + Ollama failover.
 */
export async function callLLMWithFallback(
  prompt: string,
  options: LLMCallOptions = {}
): Promise<{ text: string; connection: LLMConnection }> {
  // Use autoforge-style failover for Claude connections
  const failoverState = getFailoverState();

  // If on Ollama fallback, use SDK client directly
  if (failoverState.usingOllamaFallback) {
    const result = await queryWithFailover(prompt, {
      agentType: "executive", // default for non-agent calls
      systemPrompt: options.systemPrompt,
    });
    if (result.status === "success" && result.text.trim()) {
      const ollamaConn = getOllamaFallbackConnection();
      return { text: result.text, connection: ollamaConn };
    }
  }

  // Standard fallback chain
  const connections = getAllActiveLLMConnections();
  if (connections.length === 0) {
    throw new Error("No active LLM connections configured");
  }

  const errors: string[] = [];
  for (const conn of connections) {
    try {
      const text = await callLLM(conn, prompt, options);
      if (text && text.trim().length > 0) {
        return { text, connection: conn };
      }
      errors.push(`${conn.provider}: empty response`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${conn.provider}: ${errMsg}`);

      // If rate-limited on Claude, try Ollama immediately (autoforge pattern)
      if (conn.provider === "anthropic" && isRateLimitError(errMsg)) {
        try {
          const ollamaConn = getOllamaFallbackConnection();
          const ollamaText = await callLLM(ollamaConn, prompt, options);
          if (ollamaText && ollamaText.trim().length > 0) {
            return { text: ollamaText, connection: ollamaConn };
          }
        } catch {
          // Ollama also failed — continue to next connection
        }
      }
    }
  }

  throw new Error(`All LLM connections failed: ${errors.join("; ")}`);
}

/**
 * Call an LLM provider with a prompt and return the text response.
 * Anthropic calls now delegate to the centralized SDK client (sdk-client.ts).
 */
export async function callLLM(
  connection: LLMConnection,
  prompt: string,
  options: LLMCallOptions = {}
): Promise<string> {
  const { provider, base_url, api_key_encrypted, model } = connection;

  if (provider === "ollama") {
    return callOllama(prompt, model || "qwen3:14b", base_url || "http://127.0.0.1:11434", options);
  } else if (provider === "anthropic" || provider === "claude-cli") {
    // Delegate to centralized SDK client — single source of truth for Claude calls
    const sdkConn: SDKConnection = { provider, base_url, api_key_encrypted, model };
    const result = await querySDK(prompt, {
      agentType: "executive",
      systemPrompt: options.systemPrompt,
      connection: sdkConn,
      allowedTools: options.allowedTools,
    });
    if (result.status === "error") {
      throw new Error(result.errorMessage || "Claude SDK call failed");
    }
    if (result.status === "rate_limit") {
      throw new Error(result.errorMessage || "Rate limit hit");
    }
    return result.text;
  } else {
    return callOpenAI(prompt, model || "gpt-4o-mini", base_url || "https://api.openai.com", api_key_encrypted || "", options);
  }
}

async function callOllama(
  prompt: string,
  model: string,
  host: string,
  options: LLMCallOptions
): Promise<string> {
  const { Ollama } = await import("ollama");
  const { resolveOllamaModel } = await import("@/lib/ai/ollama-client");
  const ollama = new Ollama({ host });
  const resolvedModel = await resolveOllamaModel(model, host);

  const messages: { role: string; content: string }[] = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await ollama.chat({
    model: resolvedModel,
    messages,
    stream: false,
  });
  return response.message.content;
}

async function callOpenAI(
  prompt: string,
  model: string,
  baseUrl: string,
  apiKey: string,
  options: LLMCallOptions
): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const messages: { role: string; content: string }[] = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const body: Record<string, unknown> = { model, messages };
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.temperature !== undefined) body.temperature = options.temperature;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
