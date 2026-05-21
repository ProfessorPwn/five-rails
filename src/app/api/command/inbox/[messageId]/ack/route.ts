import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";

interface AckBody {
  note?: string;
  action?: "ack" | "ack_and_read" | "unread";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;
    const body = (await req.json().catch(() => ({}))) as AckBody;
    const action = body.action ?? "ack_and_read";

    const db = getDb();
    const existing = db.prepare(
      "SELECT id, from_agent_id, to_agent_id, message_type FROM agent_messages WHERE id = ?"
    ).get(messageId) as { id: string; from_agent_id: string; to_agent_id: string | null; message_type: string } | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (action === "unread") {
      db.prepare(
        "UPDATE agent_messages SET seen_at = NULL, is_read = 0 WHERE id = ?"
      ).run(messageId);
    } else if (action === "ack") {
      db.prepare(
        "UPDATE agent_messages SET seen_at = datetime('now') WHERE id = ?"
      ).run(messageId);
    } else {
      // ack_and_read (default)
      db.prepare(
        "UPDATE agent_messages SET seen_at = datetime('now'), is_read = 1 WHERE id = ?"
      ).run(messageId);
    }

    logActivity({
      action: "inbox_ack",
      details: `Operator ${action} message ${messageId.slice(0, 8)} (${existing.message_type}) from ${existing.from_agent_id}${body.note ? `: ${body.note.slice(0, 200)}` : ""}`,
    });

    return NextResponse.json({ ok: true, messageId, action });
  } catch (error) {
    console.error("POST /api/command/inbox/[messageId]/ack error:", error);
    return NextResponse.json({ error: "Failed to ack message" }, { status: 500 });
  }
}
