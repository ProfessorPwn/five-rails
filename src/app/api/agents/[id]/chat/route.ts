import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  createChatSession,
  listSessions,
  getSessionMessages,
  deleteLastAgentTurn,
  getLastUserMessage,
  setTurnFeedback,
} from "@/lib/db/chat-sessions";
import { runAgentChat } from "@/lib/agents/orchestrator";

type RouteContext = { params: Promise<{ id: string }> };

// GET: list sessions, get messages, search, or export transcript
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sessionId = request.nextUrl.searchParams.get("session_id");
    const action = request.nextUrl.searchParams.get("action");

    if (action === "search") {
      const q = request.nextUrl.searchParams.get("q") || "";
      const results = getDb().prepare(
        "SELECT ac.*, cs.title as session_title FROM agent_conversations ac LEFT JOIN chat_sessions cs ON ac.session_id = cs.id WHERE ac.agent_id = ? AND LOWER(ac.message) LIKE ? ORDER BY ac.created_at DESC LIMIT 50"
      ).all(id, `%${q.toLowerCase()}%`);
      return NextResponse.json(results);
    }

    if (action === "export" && sessionId) {
      const msgs = getDb().prepare(
        "SELECT role, message, action_taken, created_at FROM agent_conversations WHERE agent_id = ? AND session_id = ? ORDER BY created_at ASC"
      ).all(id, sessionId) as Array<{ role: string; message: string; action_taken: string | null; created_at: string }>;
      const agent = getDb().prepare("SELECT name FROM agents WHERE id = ?").get(id) as { name: string } | undefined;
      let md = `# Chat with ${agent?.name || "Agent"}\n\n`;
      for (const m of msgs) {
        md += `**${m.role === "user" ? "You" : agent?.name || "Agent"}** (${new Date(m.created_at).toLocaleString()}):\n${m.message}\n\n`;
        if (m.action_taken) md += `> Action: ${m.action_taken}\n\n`;
      }
      return new NextResponse(md, { headers: { "Content-Type": "text/markdown", "Content-Disposition": `attachment; filename="chat-${sessionId.slice(0, 8)}.md"` } });
    }

    if (sessionId) {
      return NextResponse.json(getSessionMessages(id, sessionId));
    }
    return NextResponse.json(listSessions(id));
  } catch (error) {
    console.error("GET /api/agents/[id]/chat error:", error);
    return NextResponse.json({ error: "Failed to fetch chat data" }, { status: 500 });
  }
}

// POST: new session, feedback, regenerate, or send a chat message (dispatches to orchestrator)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    // Create new session
    if (body.action === "new_session") {
      const sessionId = createChatSession(id, body.title || "New Chat");
      return NextResponse.json({ session_id: sessionId });
    }

    // Feedback on a message
    if (body.action === "feedback") {
      setTurnFeedback(body.message_id, body.value);
      return NextResponse.json({ updated: true });
    }

    // Regenerate last response: delete the last agent turn + re-run the last user message
    if (body.action === "regenerate") {
      const sessionId = body.session_id;
      deleteLastAgentTurn(id, sessionId);
      const lastMessage = getLastUserMessage(id, sessionId);
      if (!lastMessage) return NextResponse.json({ error: "No message to regenerate from" }, { status: 400 });
      body.message = lastMessage;
      body.session_id = sessionId;
    }

    const userMessage = body.message as string;
    if (!userMessage?.trim()) return NextResponse.json({ error: "message is required" }, { status: 400 });

    const result = await runAgentChat({
      agentId: id,
      userMessage,
      sessionId: body.session_id,
      connectionId: body.connection_id,
      baseUrl: request.nextUrl.origin,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/agents/[id]/chat error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    let hint = "";
    if (msg.includes("timed out")) {
      hint = "The LLM took too long to respond. Try a smaller/faster model, or check that Ollama is running.";
    } else if (msg.includes("401") || msg.includes("authentication") || msg.includes("Invalid")) {
      hint = "Your API key appears invalid. Go to Connections and update your credentials.";
    } else if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED")) {
      hint = "Could not reach the LLM provider. Make sure Ollama is running or check your connection URL.";
    } else if (msg.includes("rate limit") || msg.includes("429")) {
      hint = "Rate limited by the LLM provider. Wait a moment and try again, or switch to a local model.";
    }
    return NextResponse.json({ error: `Chat failed: ${msg}`, hint }, { status: 500 });
  }
}
