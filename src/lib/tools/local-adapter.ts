// ─── Local no-op adapter ─────────────────────────────────────────────────────
// Default adapter that returns a structured "not implemented" result without
// reaching any external surface. Its purpose:
//   1. Exercise the registry/invocation path end-to-end at v1.
//   2. Give the Command Center a safe fallback when an external adapter is
//      referenced but not yet configured — no crashes, no silent successes.
//   3. Provide a template for future adapters to copy.

import type { ToolAdapter, ToolInvocation, ToolResult } from "./types";

export const localAdapter: ToolAdapter = {
  id: "local",
  displayName: "Local (no-op)",
  vendor: "local",
  available: () => true,
  invoke: async (invocation: ToolInvocation): Promise<ToolResult> => {
    return {
      ok: false,
      output: null,
      error: `Local adapter received action "${invocation.action}" but no real handler is wired. Configure an external adapter (AgentMail, Composio, Orgo, …) or call the corresponding in-process primitive (skill, playbook) directly.`,
      costUsd: 0,
      raw: {
        action: invocation.action,
        params_keys: Object.keys(invocation.params),
        idempotencyKey: invocation.idempotencyKey ?? null,
      },
    };
  },
};
