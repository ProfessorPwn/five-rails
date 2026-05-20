import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle Slack URL verification challenge
    if (body.type === "url_verification") {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Handle message events
    if (body.event?.type === "message" && !body.event.bot_id) {
      const text = body.event.text as string;
      const channel = body.event.channel;

      let agentId = "agent-executive";
      let userMsg = text;
      const cmdMatch = text.match(/^@?(marketing|sales|product|research|executive)\s+(.*)/i);
      if (cmdMatch) {
        agentId = `agent-${cmdMatch[1].toLowerCase()}`;
        userMsg = cmdMatch[2];
      }

      const baseUrl = request.nextUrl.origin;
      const res = await fetch(`${baseUrl}/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();

      // Reply in Slack (requires bot token)
      const { getDb } = await import("@/lib/db");
      const config = getDb().prepare(
        "SELECT config FROM agent_remote_config WHERE channel = 'slack' AND is_active = 1 LIMIT 1"
      ).get() as { config: string } | undefined;

      if (config) {
        const { bot_token } = JSON.parse(config.config);
        if (bot_token) {
          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${bot_token}` },
            body: JSON.stringify({ channel, text: data.response || "No response" }),
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Slack webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}
