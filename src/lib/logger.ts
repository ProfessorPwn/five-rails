// ─── Logger ──────────────────────────────────────────────────────────────────
// Tiny structured logger. Replaces ad-hoc console.log/console.error sprinkled
// across 50+ files with a consistent format that's easy to grep in PM2 logs.
//
//   logger.info("orchestrator", "agent ready", { agentId, model });
//   logger.warn("supervisor", "handoff stalled", { id, deadline });
//   logger.error("pdf", "generation failed", err);
//
// Output format: `[LEVEL] [scope] message | {json}` — one line per event,
// easy to pipe through grep/awk.

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) || "info";

function emit(level: Level, scope: string, message: string, extra?: unknown): void {
  if (LEVELS[level] < LEVELS[MIN_LEVEL]) return;

  const tag = `[${level.toUpperCase()}] [${scope}]`;
  const parts: unknown[] = [tag, message];
  if (extra !== undefined) {
    if (extra instanceof Error) {
      parts.push(`| ${extra.message}`);
      if (level === "error" && extra.stack) parts.push(`\n${extra.stack}`);
    } else if (typeof extra === "object" && extra !== null) {
      try {
        parts.push(`| ${JSON.stringify(extra).slice(0, 500)}`);
      } catch {
        parts.push("| [unserializable]");
      }
    } else {
      parts.push(`| ${String(extra).slice(0, 300)}`);
    }
  }

  const line = parts.join(" ");
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (scope: string, msg: string, extra?: unknown) => emit("debug", scope, msg, extra),
  info: (scope: string, msg: string, extra?: unknown) => emit("info", scope, msg, extra),
  warn: (scope: string, msg: string, extra?: unknown) => emit("warn", scope, msg, extra),
  error: (scope: string, msg: string, extra?: unknown) => emit("error", scope, msg, extra),
};
