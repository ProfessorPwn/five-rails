import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getOrCreateSessionForTelegram } from "@/lib/db/chat-sessions";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    text?: string;
    from?: { id: number; username?: string };
    entities?: { type: string; offset: number; length: number }[];
    reply_to_message?: { from?: { id: number; is_bot?: boolean } };
  };
}

interface BotRow {
  agent_id: string;
  config: string;
}

// Send "typing..." indicator to Telegram — repeats every 4s until stopped
function startTypingLoop(botToken: string, chatId: number): { stop: () => void } {
  const send = () =>
    fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    }).catch(() => {});

  send(); // fire immediately
  const interval = setInterval(send, 4000); // Telegram typing expires after 5s
  return { stop: () => clearInterval(interval) };
}

// Send a message via Telegram — try Markdown first, fall back to plain text ONCE
async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyToMessageId?: number
): Promise<void> {
  const basePayload: Record<string, unknown> = { chat_id: chatId, text };
  if (replyToMessageId) basePayload.reply_to_message_id = replyToMessageId;

  // Try Markdown
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...basePayload, parse_mode: "Markdown" }),
    });
    if (res.ok) return; // sent successfully
  } catch { /* network error — fall through to plain text */ }

  // Single fallback: plain text (strip markdown chars to avoid double-send)
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...basePayload, text: text.replace(/[*_`\[\]]/g, "") }),
    });
  } catch { /* give up */ }
}

// Simple lock to prevent overlapping polls from client + automation/process
let _polling = false;

// POST: Poll all connected Telegram bots for new messages, process them, and reply
export async function POST(request: NextRequest) {
  // Prevent overlapping polls (client-side + automation/process can both trigger)
  if (_polling) {
    return NextResponse.json({ polled: 0, processed: 0, message: "Poll already in progress, skipping" });
  }
  _polling = true;

  try {
    const baseUrl = request.nextUrl.origin;

    const rows = getDb().prepare(
      "SELECT agent_id, config FROM agent_remote_config WHERE channel = 'telegram' AND is_active = 1"
    ).all() as BotRow[];

    if (rows.length === 0) {
      _polling = false;
      return NextResponse.json({ polled: 0, processed: 0, message: "No bots configured" });
    }

    // Build a lookup of bot_username -> agent_id so bots can be @mentioned
    const botUsernames: Record<string, string> = {};
    for (const r of rows) {
      const cfg = JSON.parse(r.config);
      if (cfg.bot_username) {
        botUsernames[cfg.bot_username.toLowerCase()] = r.agent_id;
      }
    }

    let totalProcessed = 0;
    const debugInfo: Array<{ agent: string; updates: number; offset: number | undefined; error?: string }> = [];

    for (const row of rows) {
      const parsedConfig = JSON.parse(row.config);
      const { bot_token, bot_username, last_update_id } = parsedConfig;
      if (!bot_token) continue;

      // Fetch new updates
      const offset = last_update_id ? last_update_id + 1 : undefined;
      const url = `https://api.telegram.org/bot${bot_token}/getUpdates?limit=10&timeout=0${offset ? `&offset=${offset}` : ""}`;

      let updates: TelegramUpdate[] = [];
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.ok) {
          debugInfo.push({ agent: row.agent_id, updates: 0, offset, error: `Telegram API not ok: ${JSON.stringify(data).slice(0, 100)}` });
          continue;
        }
        updates = data.result || [];
      } catch (err) {
        debugInfo.push({ agent: row.agent_id, updates: 0, offset, error: String(err).slice(0, 100) });
        continue;
      }

      debugInfo.push({ agent: row.agent_id, updates: updates.length, offset });
      if (updates.length === 0) continue;

      // Compute max update_id and persist IMMEDIATELY to prevent re-processing on overlapping polls
      let maxUpdateId = last_update_id || 0;
      for (const u of updates) {
        if (u.update_id > maxUpdateId) maxUpdateId = u.update_id;
      }
      if (maxUpdateId > (last_update_id || 0)) {
        parsedConfig.last_update_id = maxUpdateId;
        getDb().prepare(
          "UPDATE agent_remote_config SET config = ? WHERE agent_id = ? AND channel = 'telegram'"
        ).run(JSON.stringify(parsedConfig), row.agent_id);
      }

      for (const update of updates) {

        const msg = update.message;
        if (!msg?.text) continue;

        const chatId = msg.chat.id;
        const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
        const text = msg.text;

        // Skip bare commands like /start
        if (/^\/\w+$/.test(text.trim())) continue;

        // ── Group chat logic ──
        // In groups, only respond if:
        //   1. The bot is @mentioned in the message
        //   2. The user is replying to this bot's message
        //   3. A /command is used (routed to the right bot below)
        if (isGroup) {
          const mentionsThisBot = msg.entities?.some(
            (e) =>
              e.type === "mention" &&
              bot_username &&
              text.substring(e.offset, e.offset + e.length).toLowerCase() === `@${bot_username.toLowerCase()}`
          );

          const isReplyToBot = msg.reply_to_message?.from?.is_bot === true;

          const hasCommand = /^\/\w+/.test(text);

          if (!mentionsThisBot && !isReplyToBot && !hasCommand) {
            continue; // Not for this bot, skip
          }
        }

        // Route to agent
        let agentId = row.agent_id;
        let userMsg = text;

        // /command routing — in groups, only the matching bot should handle it
        const cmdMatch = text.match(/^\/(marketing|sales|product|research|executive)\s+([\s\S]*)/i);
        if (cmdMatch) {
          const targetAgent = `agent-${cmdMatch[1].toLowerCase()}`;
          if (isGroup && targetAgent !== row.agent_id) {
            continue; // Different bot should handle this command
          }
          agentId = targetAgent;
          userMsg = cmdMatch[2];
        }

        // Strip @mention from message text
        if (bot_username) {
          userMsg = userMsg.replace(new RegExp(`@${bot_username}`, "gi"), "").trim();
        }

        if (!userMsg) continue;

        // ── Show "typing..." while agent thinks ──
        const typing = startTypingLoop(bot_token, chatId);

        // Look up (or create) the persistent session for this (agent, chat)
        // so the orchestrator gets the full conversation history. Without
        // a session_id, every Telegram reply hits the chat endpoint cold
        // and the agent has zero memory of what was said before.
        const sessionId = getOrCreateSessionForTelegram(agentId, chatId);

        // Call the agent chat API with a 120s timeout
        let responseText = "";
        try {
          const chatController = new AbortController();
          const chatTimer = setTimeout(() => chatController.abort(), 120_000);
          const chatRes = await fetch(`${baseUrl}/api/agents/${agentId}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userMsg, session_id: sessionId }),
            signal: chatController.signal,
          });
          clearTimeout(chatTimer);
          const chatData = await chatRes.json();

          if (chatRes.ok) {
            responseText = chatData.response || "Done.";
          } else {
            // LLM or agent error — tell the user what happened
            const errMsg = chatData.error || "Unknown error";
            const hint = chatData.hint ? `\n\n${chatData.hint}` : "";
            const agentName = getDb().prepare("SELECT name FROM agents WHERE id = ?").get(agentId) as { name: string } | undefined;
            responseText = `⚠️ *${agentName?.name || agentId}* couldn't process that right now.\n\nReason: ${errMsg}${hint}`;
          }
        } catch (err) {
          const errMsg = err instanceof Error && err.name === "AbortError"
            ? "Response took too long (>2 min). Try a shorter question."
            : "Agent is unreachable. The server may be restarting.";
          console.error(`Agent chat error (${agentId}):`, err);
          responseText = `⚠️ ${errMsg}`;
        }

        // ── Stop typing, send the reply ──
        typing.stop();

        await sendTelegramMessage(
          bot_token,
          chatId,
          responseText,
          isGroup ? msg.message_id : undefined
        );

        // Update chat_id in config if not set
        if (!parsedConfig.chat_id) {
          parsedConfig.chat_id = String(chatId);
        }

        totalProcessed++;
      }

      // Save chat_id if it was updated during processing
      if (parsedConfig.chat_id) {
        getDb().prepare(
          "UPDATE agent_remote_config SET config = ? WHERE agent_id = ? AND channel = 'telegram'"
        ).run(JSON.stringify(parsedConfig), row.agent_id);
      }
    }

    _polling = false;
    return NextResponse.json({ polled: rows.length, processed: totalProcessed, debug: debugInfo });
  } catch (error) {
    _polling = false;
    console.error("Telegram poll error:", error);
    return NextResponse.json({ error: "Poll failed" }, { status: 500 });
  }
}
