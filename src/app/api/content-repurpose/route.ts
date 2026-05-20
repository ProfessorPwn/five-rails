import { NextRequest, NextResponse } from "next/server";
import { getDb, getConnections, createContent } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content_id, target_platforms } = body;

    if (!content_id) {
      return NextResponse.json({ error: "content_id is required" }, { status: 400 });
    }

    const source = getDb().prepare("SELECT * FROM content_pieces WHERE id = ?").get(content_id) as { id: string; title: string; content: string; project_id: string } | undefined;
    if (!source || !source.content) {
      return NextResponse.json({ error: "Source content not found or empty" }, { status: 404 });
    }

    const platforms = target_platforms || ["Twitter", "LinkedIn", "Email"];
    const connections = getConnections();
    const conn = connections.find((c) => c.is_active === 1);

    if (!conn) {
      return NextResponse.json({ error: "No active LLM connection" }, { status: 503 });
    }

    // Get brand voice if exists
    const voice = getDb().prepare("SELECT * FROM brand_voices WHERE is_default = 1 LIMIT 1").get() as { tone_keywords: string; rules: string } | undefined;
    const voiceContext = voice
      ? `\nBrand voice: ${JSON.parse(voice.tone_keywords || "[]").join(", ")}. Rules: ${JSON.parse(voice.rules || "[]").join(". ")}`
      : "";

    const prompt = `Repurpose this content for multiple platforms.${voiceContext}

SOURCE CONTENT:
Title: ${source.title}
Body: ${source.content.slice(0, 2000)}

Generate platform-specific versions for: ${platforms.join(", ")}

Return ONLY valid JSON:
{
  "versions": [
    {"platform": "Twitter", "text": "tweet under 280 chars with hashtags"},
    {"platform": "LinkedIn", "text": "professional post 200-500 chars"},
    {"platform": "Email", "subject": "email subject", "text": "email body"}
  ]
}`;

    let output: string;
    if (conn.provider === "ollama") {
      const { Ollama } = await import("ollama");
      const ollama = new Ollama({ host: conn.base_url || "http://127.0.0.1:11434" });
      const r = await ollama.chat({ model: conn.model || "llama3", messages: [{ role: "user", content: prompt }], stream: false });
      output = r.message.content;
    } else {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (conn.api_key_encrypted) headers["Authorization"] = `Bearer ${conn.api_key_encrypted}`;
      const r = await fetch(`${conn.base_url || "https://api.openai.com"}/v1/chat/completions`, {
        method: "POST", headers,
        body: JSON.stringify({ model: conn.model || "gpt-4o-mini", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
      });
      const d = await r.json();
      output = d.choices?.[0]?.message?.content || "";
    }

    let versions;
    try {
      const cleaned = output.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      versions = JSON.parse(cleaned);
    } catch {
      const match = output.match(/\{[\s\S]*\}/);
      if (match) versions = JSON.parse(match[0]);
      else return NextResponse.json({ error: "Failed to parse repurposed content" }, { status: 500 });
    }

    // Save each version as a new content piece + auto-schedule social posts
    const created = [];
    const bestTimes: Record<string, number> = { Twitter: 9, LinkedIn: 10, Facebook: 13, Instagram: 18, TikTok: 19 };

    for (const v of (versions.versions || [])) {
      const piece = createContent({
        project_id: source.project_id,
        type: v.platform === "Email" ? "email" : "post",
        title: `${source.title} (${v.platform})`,
        content: v.text || v.body || "",
        platform: v.platform,
        status: "draft",
      });

      // Auto-schedule social posts at best time
      const hour = bestTimes[v.platform];
      if (hour && body.auto_schedule !== false) {
        const schedTime = new Date();
        schedTime.setDate(schedTime.getDate() + 1);
        schedTime.setHours(hour, 0, 0, 0);

        const schedId = require("uuid").v4();
        getDb().prepare(`
          INSERT INTO scheduled_posts (id, project_id, content_id, platform, post_text, scheduled_at, best_time_used, status)
          VALUES (?, ?, ?, ?, ?, ?, 1, 'scheduled')
        `).run(schedId, source.project_id || null, piece.id, v.platform.toLowerCase(), v.text || "", schedTime.toISOString());
      }

      created.push({ platform: v.platform, content_id: piece.id, preview: (v.text || "").slice(0, 100), scheduled: !!hour });
    }

    return NextResponse.json({
      source_id: content_id,
      repurposed: created,
      total: created.length,
      auto_scheduled: created.filter(c => c.scheduled).length,
    });
  } catch (error) {
    console.error("POST /api/content-repurpose error:", error);
    return NextResponse.json({ error: "Failed to repurpose content" }, { status: 500 });
  }
}
