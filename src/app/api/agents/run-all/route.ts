import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const now = new Date().toISOString();
    const dueAgents = getDb().prepare(
      "SELECT id, name FROM agents WHERE is_active = 1 AND (next_run_at IS NULL OR next_run_at <= ?) ORDER BY last_run_at ASC NULLS FIRST LIMIT 3"
    ).all(now) as Array<{ id: string; name: string }>;

    if (dueAgents.length === 0) return NextResponse.json({ message: "No agents due", run: 0 });

    const baseUrl = request.nextUrl.origin;
    const results: Array<{ agent: string; status: string }> = [];

    for (let i = 0; i < dueAgents.length; i++) {
      const agent = dueAgents[i];
      try {
        const res = await fetch(`${baseUrl}/api/agents/${agent.id}/run`, { method: "POST" });
        results.push({ agent: agent.name, status: res.ok ? "completed" : "failed" });
        if (i < dueAgents.length - 1) await new Promise(r => setTimeout(r, 2000));
      } catch {
        results.push({ agent: agent.name, status: "error" });
      }
    }

    logActivity({ action: "agents_batch_run", details: `Ran ${results.length} agents: ${results.map(r => `${r.agent}(${r.status})`).join(", ")}` });
    return NextResponse.json({ run: results.length, results });
  } catch (error) {
    console.error("POST /api/agents/run-all error:", error);
    return NextResponse.json({ error: "Failed to run agents" }, { status: 500 });
  }
}
