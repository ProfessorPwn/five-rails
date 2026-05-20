// ─── Agent Session Runner ─────────────────────────────────────────────────────
// Ported from autoforge/agent.py — autonomous agent loop with:
//   - Single session execution (run_agent_session)
//   - Auto-continue loop (run_autonomous_agent)
//   - Rate-limit detection + Ollama failover with auto-recovery
//   - Error backoff
//
// Adapted for Five Rails' Next.js API route context.

import {
  type AgentType,
  type SDKClientOptions,
  type SDKQueryResult,
  queryWithFailover,
  getFailoverState,
  activateOllamaFailover,
  restoreClaude,
  getOllamaFallbackConnection,
} from "./sdk-client";
import {
  isRateLimitError,
  parseRetryAfter,
  calculateRateLimitBackoff,
  calculateErrorBackoff,
} from "./rate-limit";

// ── Configuration ────────────────────────────────────────────────────────────

/** Delay between auto-continue sessions (seconds) */
const AUTO_CONTINUE_DELAY_MS = 3_000;

/** Maximum iterations for autonomous loop (safety limit) */
const DEFAULT_MAX_ITERATIONS = 50;

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentSessionResult {
  /** "continue" if agent should keep working, "complete" if done, "error" if failed */
  status: "continue" | "complete" | "rate_limit" | "error";
  /** The LLM's response text */
  responseText: string;
  /** Which provider was used */
  provider: string;
  /** Error message if status is "error" */
  errorMessage?: string;
}

export interface AutonomousRunResult {
  /** Total iterations executed */
  iterations: number;
  /** Final status */
  status: "complete" | "max_iterations" | "error";
  /** Summary of all session results */
  sessionResults: AgentSessionResult[];
}

export interface AutonomousRunOptions {
  /** Agent department type */
  agentType: AgentType;
  /** System prompt with persona */
  systemPrompt: string;
  /** Max iterations before stopping */
  maxIterations?: number;
  /** Callback: build the prompt for each iteration (receives iteration number, previous result) */
  buildPrompt: (iteration: number, previousResult?: AgentSessionResult) => string;
  /** Callback: check if work is complete (receives LLM response) */
  isComplete: (responseText: string) => boolean;
  /** Callback: process each session result (for logging, DB updates, etc.) */
  onSessionComplete?: (iteration: number, result: AgentSessionResult) => void | Promise<void>;
  /** Callback: called before each session starts */
  onSessionStart?: (iteration: number) => void | Promise<void>;
}

// ── Single Session ───────────────────────────────────────────────────────────

/**
 * Run a single agent session.
 * Mirrors autoforge's run_agent_session() — sends prompt, collects response,
 * detects rate limits, returns structured result.
 */
export async function runAgentSession(
  prompt: string,
  options: SDKClientOptions
): Promise<AgentSessionResult> {
  const result = await queryWithFailover(prompt, options);
  const failover = getFailoverState();
  const provider = failover.usingOllamaFallback ? "ollama" : "anthropic";

  if (result.status === "rate_limit") {
    return {
      status: "rate_limit",
      responseText: result.text,
      provider,
      errorMessage: result.errorMessage || "Rate limit hit",
    };
  }

  if (result.status === "error") {
    return {
      status: "error",
      responseText: "",
      provider,
      errorMessage: result.errorMessage,
    };
  }

  return {
    status: "continue",
    responseText: result.text,
    provider,
  };
}

// ── Autonomous Loop ──────────────────────────────────────────────────────────

/**
 * Run the autonomous agent loop.
 * Mirrors autoforge's run_autonomous_agent() — iterates sessions with:
 *   - Fresh context per session (no persistent conversation)
 *   - Rate-limit failover to Ollama with scheduled Claude recovery
 *   - Error backoff (linear, capped at 5 min)
 *   - Completion detection via callback
 *
 * @param options - Configuration for the autonomous run
 */
export async function runAutonomousAgent(
  options: AutonomousRunOptions
): Promise<AutonomousRunResult> {
  const maxIterations = options.maxIterations || DEFAULT_MAX_ITERATIONS;
  const sessionResults: AgentSessionResult[] = [];

  let rateLimitRetries = 0;
  let errorRetries = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // Notify session start
    if (options.onSessionStart) {
      await options.onSessionStart(iteration);
    }

    // Build prompt for this iteration (fresh context — autoforge pattern)
    const previousResult = sessionResults[sessionResults.length - 1];
    const prompt = options.buildPrompt(iteration, previousResult);

    // Run session with failover
    const result = await runAgentSession(prompt, {
      agentType: options.agentType,
      systemPrompt: options.systemPrompt,
    });

    sessionResults.push(result);

    // Notify session complete
    if (options.onSessionComplete) {
      await options.onSessionComplete(iteration, result);
    }

    // Check for completion
    if (result.status === "continue" && options.isComplete(result.responseText)) {
      return { iterations: iteration, status: "complete", sessionResults };
    }

    // Handle status — mirrors autoforge's status handling in agent.py
    if (result.status === "continue") {
      // Success — reset error counters
      errorRetries = 0;

      // Check for rate limit indicators in response text
      if (isRateLimitError(result.responseText)) {
        rateLimitRetries++;
        const delay = calculateRateLimitBackoff(rateLimitRetries);
        console.log(`[Agent] Rate limit in response. Waiting ${delay}s...`);
        await sleep(delay * 1000);
      } else {
        rateLimitRetries = 0;
        // Normal auto-continue delay
        await sleep(AUTO_CONTINUE_DELAY_MS);
      }
    } else if (result.status === "rate_limit") {
      // Rate limit — failover already handled by queryWithFailover
      errorRetries = 0;
      rateLimitRetries++;
      const delay = calculateRateLimitBackoff(rateLimitRetries);
      console.log(`[Agent] Rate limited. Waiting ${delay}s before retry...`);
      await sleep(delay * 1000);
    } else if (result.status === "error") {
      // Non-rate-limit error — linear backoff
      rateLimitRetries = 0;
      errorRetries++;
      const delay = calculateErrorBackoff(errorRetries);
      console.log(
        `[Agent] Error (attempt #${errorRetries}). Waiting ${delay}s... Error: ${result.errorMessage}`
      );
      await sleep(delay * 1000);
    }
  }

  return {
    iterations: maxIterations,
    status: "max_iterations",
    sessionResults,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
