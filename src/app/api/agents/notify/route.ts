import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Send a notification to the user via Telegram (and any other connected channels)
// Called by agents after completing work

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<boolean> {
  // Telegram max message length is 4096 — truncate if needed
  const safeText = text.length > 4000 ? text.slice(0, 3997) + "..." : text;

  // Try Markdown first
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: safeText, parse_mode: "Markdown" }),
    });
    if (res.ok) return true;
  } catch { /* network error — fall through to plain text */ }

  // Single fallback: plain text (strip markdown chars)
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: safeText.replace(/[*_`\[\]]/g, "") }),
    });
    return res.ok;
  } catch (err) {
    console.error("[Notify] Telegram send failed:", err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_name, message, type, agent_id } = body;

    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    const results: Array<{ channel: string; sent: boolean; error?: string }> = [];
    const icon = type === "completed" ? "\u2705" : type === "alert" ? "\u26a0\ufe0f" : type === "error" ? "\u274c" : "\ud83d\udcdd";
    const text = `${icon} *${agent_name || "Agent"}*\n\n${message}`;

    // If agent_id is provided, use that agent's specific bot first
    if (agent_id) {
      const agentConfig = getDb().prepare(
        "SELECT config FROM agent_remote_config WHERE channel = 'telegram' AND agent_id = ? AND is_active = 1 LIMIT 1"
      ).get(agent_id) as { config: string } | undefined;

      if (agentConfig) {
        const parsed = JSON.parse(agentConfig.config);
        if (parsed.bot_token && parsed.chat_id) {
          const sent = await sendTelegram(parsed.bot_token, parsed.chat_id, text);
          results.push({ channel: "telegram", sent });
          if (!sent) console.error(`[Notify] Telegram failed for agent ${agent_id}`);
          return NextResponse.json({ notified: results.length, results });
        }
      }
    }

    // Fallback: send via all active configs
    const configs = getDb().prepare(
      "SELECT * FROM agent_remote_config WHERE is_active = 1"
    ).all() as Array<{ agent_id: string; channel: string; config: string }>;

    // Deduplicate — only send one Telegram notification (pick first bot with chat_id)
    let telegramSent = false;

    for (const cfg of configs) {
      const parsed = JSON.parse(cfg.config);

      if (cfg.channel === "telegram" && parsed.bot_token && parsed.chat_id && !telegramSent) {
        const sent = await sendTelegram(parsed.bot_token, parsed.chat_id, text);
        results.push({ channel: "telegram", sent });
        if (!sent) console.error(`[Notify] Telegram fallback failed for config agent=${cfg.agent_id}`);
        telegramSent = true;
      }

      if (cfg.channel === "slack" && parsed.bot_token && parsed.channel_id) {
        try {
          const res = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${parsed.bot_token}` },
            body: JSON.stringify({ channel: parsed.channel_id, text: `*${agent_name || "Agent"}*: ${message}` }),
          });
          results.push({ channel: "slack", sent: res.ok });
        } catch (err) {
          results.push({ channel: "slack", sent: false, error: err instanceof Error ? err.message : "failed" });
        }
      }
    }

    if (results.length === 0) {
      console.warn("[Notify] No active notification channels configured — message dropped");
    }

    return NextResponse.json({ notified: results.length, results });
  } catch (error) {
    console.error("POST /api/agents/notify error:", error);
    return NextResponse.json({ error: "Notification failed" }, { status: 500 });
  }
}
