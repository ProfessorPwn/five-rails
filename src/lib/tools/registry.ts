// ─── Tool Adapter Registry ───────────────────────────────────────────────────
// Single source of truth for the set of adapters Five Rails knows about.
// Future external adapters register themselves here; the rest of the app
// looks them up by id via getAdapter() and never imports adapters directly.
//
// v1 has only the local no-op adapter. Adding AgentMail / Composio / Orgo
// later is purely a matter of dropping in another file under src/lib/tools/
// and adding it to the ADAPTERS array — no caller code changes.

import type { ToolAdapter, ToolInvocation, ToolResult } from "./types";
import { localAdapter } from "./local-adapter";

const ADAPTERS: ToolAdapter[] = [localAdapter];

const byId = new Map<string, ToolAdapter>(ADAPTERS.map((a) => [a.id, a]));

export function listAdapters(): ToolAdapter[] {
  return [...ADAPTERS];
}

export function getAdapter(id: string): ToolAdapter | undefined {
  return byId.get(id);
}

/**
 * Run an invocation against a named adapter. Always returns a ToolResult —
 * unknown adapter id resolves to a structured failure rather than throwing,
 * so callers don't need to defensively wrap.
 */
export async function invokeAdapter(
  adapterId: string,
  invocation: ToolInvocation
): Promise<ToolResult> {
  const adapter = getAdapter(adapterId);
  if (!adapter) {
    return {
      ok: false,
      output: null,
      error: `Unknown tool adapter: ${adapterId}. Known: ${[...byId.keys()].join(", ")}`,
    };
  }
  try {
    return await adapter.invoke(invocation);
  } catch (err) {
    return {
      ok: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
