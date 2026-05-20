import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = body.message;
    if (!message?.text) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const text = message.text as string;

    // Determine which agent this bot belongs to via query param
    const agentParam = request.nextUrl.searchParams.get("agent");
    let agentId = agentParam || "agent-executive";
    let userMsg = text;

    // Allow /command overrides to switch agents within any bot
    const cmdMatch = text.match(/^\/(marketing|sales|product|research|executive)\s+(.*)/i);
    if (cmdMatch) {
      agentId = `agent-${cmdMatch[1].toLowerCase()}`;
      userMsg = cmdMatch[2];
    }

    // Get the bot token for THIS agent's config
    const config = getDb().prepare(
      "SELECT config FROM agent_remote_config WHERE channel = 'telegram' AND agent_id = ? AND is_active = 1 LIMIT 1"
    ).get(agentParam || agentId) as { config: string } | undefined;

    const botToken = config ? JSON.parse(config.config).bot_token : null;

    // ── Show "typing..." while agent thinks ──
    if (botToken) {
      fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" }),
      }).catch(() => {});
    }

    // Set up typing loop (Telegram typing expires after 5s)
    let typingInterval: ReturnType<typeof setInterval> | null = null;
    if (botToken) {
      typingInterval = setInterval(() => {
        fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, action: "typing" }),
        }).catch(() => {});
      }, 4000);
    }

    // Chat with the agent
    const baseUrl = request.nextUrl.origin;
    let responseText = "";
    try {
      const res = await fetch(`${baseUrl}/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();

      if (res.ok) {
        responseText = data.response || "Done.";
      } else {
        const agentName = getDb().prepare("SELECT name FROM agents WHERE id = ?").get(agentId) as { name: string } | undefined;
        responseText = `⚠️ *${agentName?.name || agentId}* couldn't process that right now.\n\nReason: ${data.error || "Unknown error"}\n\nCheck the Connections page to make sure an LLM is configured.`;
      }
    } catch (err) {
      console.error(`Webhook agent chat error (${agentId}):`, err);
      responseText = `⚠️ Agent is unreachable. The server may be restarting — try again in a moment.`;
    }

    // ── Stop typing, send the reply ──
    if (typingInterval) clearInterval(typingInterval);

    if (botToken) {
      // Try Markdown, single fallback to plain text
      let sent = false;
      try {
        const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: responseText, parse_mode: "Markdown" }),
        });
        sent = sendRes.ok;
      } catch { /* fall through */ }
      if (!sent) {
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: responseText.replace(/[*_`\[\]]/g, "") }),
          });
        } catch { /* give up */ }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}
