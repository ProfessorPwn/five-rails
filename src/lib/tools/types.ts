// ─── Tool Adapter Interface (Command Center Stage 6) ────────────────────────
// Defines the shape that external tool surfaces (AgentMail, Composio, Orgo,
// AITable, Sendpilot, Late, etc.) plug into when Five Rails grows past its
// in-process persona fleet. v1 ships a local no-op adapter so the registry
// + lookup path is exercised; external integrations are explicitly out of
// scope for the Command Center sprint and slot in via this interface later
// without runtime changes.
//
// Adapters do NOT replace existing primitives — playbooks, skills, agents,
// and the heartbeat continue to drive scheduling. An adapter is just a
// uniform handle for "do thing X against external surface Y" so the same
// orchestration code can target a local function or a hosted tool.

/**
 * Generic shape of a tool invocation. Adapters receive this and translate
 * to their underlying SDK call. Keep this minimal — adapters with richer
 * concepts (email threads, calendars, file IDs) embed those in `params`.
 */
export interface ToolInvocation {
  /** Adapter-defined operation name. Examples: "send_email", "fetch_url". */
  action: string;
  /** Arbitrary JSON-compatible parameters for the action. */
  params: Record<string, unknown>;
  /** Optional originating agent id for audit + cost attribution. */
  agentId?: string;
  /** Optional project id for cross-rail context. */
  projectId?: string;
  /** Idempotency key for retries (caller-chosen). Adapters MAY de-dup on this. */
  idempotencyKey?: string;
}

/**
 * Uniform return shape across adapters. ok=true means the call succeeded
 * from the adapter's perspective; the caller still needs to inspect `output`.
 */
export interface ToolResult {
  ok: boolean;
  output: unknown;
  /** Error message when ok=false. Adapters MUST set this on failure. */
  error?: string;
  /** Estimated cost in USD for the invocation (best-effort, may be 0). */
  costUsd?: number;
  /** Tokens billed by the adapter (best-effort). */
  tokens?: { in?: number; out?: number };
  /** Adapter-defined raw payload — useful for trace assembly. */
  raw?: unknown;
}

/**
 * Adapter shape. Implementations live alongside this file; the registry
 * (see ./registry.ts) wires them by name.
 */
export interface ToolAdapter {
  /** Stable adapter id used in the registry lookup. */
  readonly id: string;
  /** Human-readable name for UI surfaces. */
  readonly displayName: string;
  /** Vendor or system that the adapter targets ("local", "AgentMail", "Composio", ...). */
  readonly vendor: string;
  /** Health check — used to gray out unavailable adapters in the UI. */
  readonly available: () => Promise<boolean> | boolean;
  /** Execute the invocation. MUST handle its own errors and return a ToolResult. */
  readonly invoke: (invocation: ToolInvocation) => Promise<ToolResult>;
}
