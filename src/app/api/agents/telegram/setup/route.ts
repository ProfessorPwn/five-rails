import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// GET: Return all Telegram bot configs (one per agent)
export async function GET() {
  try {
    const rows = getDb().prepare(
      "SELECT * FROM agent_remote_config WHERE channel = 'telegram'"
    ).all() as { id: string; agent_id: string; config: string; is_active: number }[];

    const bots = rows.map((row) => {
      const parsed = JSON.parse(row.config);
      return {
        agent_id: row.agent_id,
        connected: true,
        bot_username: parsed.bot_username || null,
        chat_id: parsed.chat_id || null,
      };
    });

    // Check if polling is active
    const pollSetting = getDb().prepare(
      "SELECT value FROM automation_settings WHERE key = 'telegram_polling'"
    ).get() as { value: string } | undefined;

    return NextResponse.json({
      bots,
      polling: pollSetting?.value === "true",
    });
  } catch (error) {
    console.error("GET /api/agents/telegram/setup error:", error);
    return NextResponse.json({ bots: [], polling: false });
  }
}

// POST: Setup a Telegram bot for a specific agent (polling mode — no webhook needed)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const botToken = body.bot_token as string;
    const chatId = body.chat_id as string | undefined;
    const agentId = (body.agent_id as string) || "agent-executive";

    if (!botToken) {
      return NextResponse.json({ error: "bot_token is required" }, { status: 400 });
    }

    // Step 1: Verify the bot token works
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    if (!meRes.ok) {
      return NextResponse.json({ error: "Invalid bot token. Check with @BotFather." }, { status: 400 });
    }
    const me = await meRes.json();
    const botUsername = me.result?.username || "unknown";

    // Step 2: Delete any existing webhook so getUpdates (polling) works
    await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`);

    // Step 3: If chat_id not provided, try to get it from recent messages
    let resolvedChatId = chatId;
    if (!resolvedChatId) {
      const updatesRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=1`);
      const updates = await updatesRes.json();
      if (updates.result?.length > 0) {
        const lastUpdate = updates.result[updates.result.length - 1];
        resolvedChatId = String(lastUpdate.message?.chat?.id || "");
      }
    }

    // Step 4: Save config (one row per agent)
    const configData = JSON.stringify({
      bot_token: botToken,
      bot_username: botUsername,
      chat_id: resolvedChatId || "",
      last_update_id: 0,
    });

    // Upsert per agent_id
    const existing = getDb().prepare(
      "SELECT id FROM agent_remote_config WHERE channel = 'telegram' AND agent_id = ?"
    ).get(agentId) as { id: string } | undefined;

    if (existing) {
      getDb().prepare(
        "UPDATE agent_remote_config SET config = ?, is_active = 1 WHERE id = ?"
      ).run(configData, existing.id);
    } else {
      getDb().prepare(
        "INSERT INTO agent_remote_config (id, agent_id, channel, config, is_active) VALUES (?, ?, 'telegram', ?, 1)"
      ).run(uuidv4(), agentId, configData);
    }

    // Step 5: Send a test message if we have a chat_id
    const agent = getDb().prepare("SELECT name FROM agents WHERE id = ?").get(agentId) as { name: string } | undefined;
    const agentName = agent?.name || agentId;

    if (resolvedChatId) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: resolvedChatId,
          text: `Five Rails connected.\n\nThis bot is linked to *${agentName}*. Just type to chat.`,
          parse_mode: "Markdown",
        }),
      });
    }

    return NextResponse.json({
      connected: true,
      bot_username: botUsername,
      chat_id: resolvedChatId || null,
      agent_id: agentId,
      message: resolvedChatId
        ? `Connected! @${botUsername} is linked to ${agentName}.`
        : `Bot verified (@${botUsername}). Send any message to @${botUsername} on Telegram, then connect again to get your chat_id.`,
    });
  } catch (error) {
    console.error("POST /api/agents/telegram/setup error:", error);
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}

// PATCH: Toggle polling on/off
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const polling = body.polling as boolean;

    // Upsert the polling setting
    const existing = getDb().prepare(
      "SELECT key FROM automation_settings WHERE key = 'telegram_polling'"
    ).get();

    if (existing) {
      getDb().prepare(
        "UPDATE automation_settings SET value = ? WHERE key = 'telegram_polling'"
      ).run(String(polling));
    } else {
      getDb().prepare(
        "INSERT INTO automation_settings (key, value) VALUES ('telegram_polling', ?)"
      ).run(String(polling));
    }

    return NextResponse.json({ polling });
  } catch (error) {
    console.error("PATCH /api/agents/telegram/setup error:", error);
    return NextResponse.json({ error: "Failed to update polling" }, { status: 500 });
  }
}

// DELETE: Remove Telegram config for a specific agent
export async function DELETE(request: NextRequest) {
  try {
    const agentId = request.nextUrl.searchParams.get("agent_id");

    // Get config(s) to clean up
    const query = agentId
      ? "SELECT config FROM agent_remote_config WHERE channel = 'telegram' AND agent_id = ?"
      : "SELECT config FROM agent_remote_config WHERE channel = 'telegram'";
    const rows = agentId
      ? getDb().prepare(query).all(agentId) as { config: string }[]
      : getDb().prepare(query).all() as { config: string }[];

    for (const row of rows) {
      try {
        const { bot_token } = JSON.parse(row.config);
        if (bot_token) {
          await fetch(`https://api.telegram.org/bot${bot_token}/deleteWebhook`);
        }
      } catch { /* ignore cleanup errors */ }
    }

    if (agentId) {
      getDb().prepare("DELETE FROM agent_remote_config WHERE channel = 'telegram' AND agent_id = ?").run(agentId);
    } else {
      getDb().prepare("DELETE FROM agent_remote_config WHERE channel = 'telegram'").run();
    }

    return NextResponse.json({ disconnected: true });
  } catch (error) {
    console.error("DELETE /api/agents/telegram/setup error:", error);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
