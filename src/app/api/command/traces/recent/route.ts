import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RecentRow {
  id: string;
  playbook_name: string;
  trigger_entity_type: string | null;
  trigger_entity_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  result: string | null;
  error: string | null;
}

export async function GET() {
  try {
    const runs = getDb().prepare(`
      SELECT id, playbook_name, trigger_entity_type, trigger_entity_id,
             status, started_at, completed_at, result, error
      FROM playbook_runs
      ORDER BY started_at DESC
      LIMIT 40
    `).all() as RecentRow[];

    return NextResponse.json({ runs });
  } catch (error) {
    console.error("GET /api/command/traces/recent error:", error);
    return NextResponse.json({ error: "Failed to fetch recent traces" }, { status: 500 });
  }
}
