import { NextResponse } from "next/server";
import { getDb, getActiveConnection, getConnectionWithFallback } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET() {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // 1. Database connectivity
  try {
    const result = getDb().prepare("SELECT COUNT(*) as count FROM projects").get() as { count: number };
    checks.database = { status: "ok", detail: `${result.count} projects` };
  } catch (e) {
    checks.database = { status: "error", detail: String(e) };
  }

  // 2. Database file info
  try {
    const dbPaths = [
      path.join(process.cwd(), "data", "fiverails.db"),
      path.join(process.cwd(), "src", "lib", "db", "fiverails.db"),
    ];
    for (const dbPath of dbPaths) {
      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        checks.database_file = {
          status: "ok",
          detail: `${(stats.size / 1024 / 1024).toFixed(2)} MB at ${dbPath}`,
        };
        break;
      }
    }
    if (!checks.database_file) {
      checks.database_file = { status: "ok", detail: "In-memory or default location" };
    }
  } catch {
    checks.database_file = { status: "ok", detail: "Could not check file" };
  }

  // 3. LLM primary connection
  try {
    const conn = getActiveConnection();
    if (conn) {
      checks.llm_primary = {
        status: "ok",
        detail: `${conn.provider} (${conn.model || "default"})`,
      };
    } else {
      checks.llm_primary = { status: "warning", detail: "No active LLM connection" };
    }
  } catch {
    checks.llm_primary = { status: "error", detail: "Failed to check" };
  }

  // 4. LLM fallback
  try {
    const { fallback } = getConnectionWithFallback();
    if (fallback) {
      checks.llm_fallback = {
        status: "ok",
        detail: `${fallback.provider} (${fallback.model || "default"})`,
      };
    } else {
      checks.llm_fallback = { status: "warning", detail: "No fallback LLM configured" };
    }
  } catch {
    checks.llm_fallback = { status: "warning", detail: "No fallback" };
  }

  // 5. Agents status
  try {
    const agents = getDb().prepare("SELECT id, name, state, last_run_at FROM agents").all() as {
      id: string; name: string; state: string; last_run_at: string | null;
    }[];
    const active = agents.filter(a => a.state !== "idle").length;
    checks.agents = {
      status: active > 0 ? "busy" : "ok",
      detail: `${agents.length} agents (${active} active)`,
    };
  } catch {
    checks.agents = { status: "error", detail: "Failed to check agents" };
  }

  // 6. MCP tools
  try {
    const tools = getDb().prepare("SELECT COUNT(*) as total, SUM(CASE WHEN is_connected = 1 THEN 1 ELSE 0 END) as connected FROM mcp_tools").get() as { total: number; connected: number };
    checks.mcp_tools = {
      status: tools.connected > 0 ? "ok" : "warning",
      detail: `${tools.connected}/${tools.total} connected`,
    };
  } catch {
    checks.mcp_tools = { status: "warning", detail: "Could not check" };
  }

  // 7. Automation engine
  try {
    const lastRun = getDb().prepare("SELECT status, completed_at, duration_ms FROM automation_runs ORDER BY started_at DESC LIMIT 1").get() as { status: string; completed_at: string; duration_ms: number } | undefined;
    if (lastRun) {
      checks.automation = {
        status: lastRun.status === "completed" ? "ok" : "warning",
        detail: `Last: ${lastRun.status} at ${lastRun.completed_at} (${lastRun.duration_ms}ms)`,
      };
    } else {
      checks.automation = { status: "warning", detail: "Never run" };
    }
  } catch {
    checks.automation = { status: "warning", detail: "Could not check" };
  }

  // 8. Table counts
  try {
    const counts: Record<string, number> = {};
    const tables = ["projects", "outbound_contacts", "content_pieces", "deals", "ideabrowser_ideas", "newsletters", "skills", "agent_decisions"];
    for (const table of tables) {
      try {
        const r = getDb().prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
        counts[table] = r.c;
      } catch { /* table may not exist */ }
    }
    checks.data = { status: "ok", detail: JSON.stringify(counts) };
  } catch {
    checks.data = { status: "ok" };
  }

  const hasError = Object.values(checks).some(c => c.status === "error");
  const overallStatus = hasError ? "unhealthy" : "healthy";

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: "3.0.0",
    checks,
  });
}
