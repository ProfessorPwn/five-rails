import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface MessageRow {
  id: string;
  from_agent_id: string;
  to_agent_id: string | null;
  message: string;
  message_type: string;
  priority: string | null;
  is_read: number;
  seen_at: string | null;
  deadline_at: string | null;
  created_at: string;
  from_name: string | null;
  to_name: string | null;
}

interface InboxItem {
  id: string;
  from_agent_id: string;
  from_name: string | null;
  to_agent_id: string | null;
  to_name: string | null;
  message: string;
  message_type: string;
  priority: "low" | "normal" | "high" | "urgent";
  is_read: boolean;
  seen_at: string | null;
  deadline_at: string | null;
  created_at: string;
}

const PRIORITY_RANK: Record<InboxItem["priority"], number> = {
  urgent: 0, high: 1, normal: 2, low: 3,
};

function asPriority(value: string | null, messageType: string): InboxItem["priority"] {
  if (value === "urgent" || value === "high" || value === "normal" || value === "low") return value;
  if (messageType === "alert") return "urgent";
  if (messageType === "handoff") return "high";
  if (messageType === "request") return "normal";
  return "low";
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "unread"; // unread | all | acked
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);

    let where = "WHERE 1=1";
    if (view === "unread") where = "WHERE m.is_read = 0 AND m.seen_at IS NULL";
    else if (view === "acked") where = "WHERE m.seen_at IS NOT NULL";

    const rows = getDb().prepare(`
      SELECT m.id, m.from_agent_id, m.to_agent_id, m.message, m.message_type,
             m.priority, m.is_read, m.seen_at, m.deadline_at, m.created_at,
             af.name AS from_name, at.name AS to_name
      FROM agent_messages m
      LEFT JOIN agents af ON af.id = m.from_agent_id
      LEFT JOIN agents at ON at.id = m.to_agent_id
      ${where}
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(limit) as MessageRow[];

    const items: InboxItem[] = rows.map((m) => ({
      id: m.id,
      from_agent_id: m.from_agent_id,
      from_name: m.from_name,
      to_agent_id: m.to_agent_id,
      to_name: m.to_name,
      message: m.message,
      message_type: m.message_type,
      priority: asPriority(m.priority, m.message_type),
      is_read: !!m.is_read,
      seen_at: m.seen_at,
      deadline_at: m.deadline_at,
      created_at: m.created_at,
    }));

    items.sort((a, b) => {
      const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (p !== 0) return p;
      return a.created_at < b.created_at ? 1 : -1;
    });

    return NextResponse.json({ items, view, total: items.length });
  } catch (error) {
    console.error("GET /api/command/inbox error:", error);
    return NextResponse.json({ error: "Failed to fetch inbox" }, { status: 500 });
  }
}
