import { NextRequest, NextResponse } from "next/server";
import { getDb, getConnections } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const pages = getDb().prepare("SELECT * FROM landing_pages ORDER BY created_at DESC").all();
    return NextResponse.json(pages);
  } catch (error) {
    console.error("GET /api/landing-pages error:", error);
    return NextResponse.json({ error: "Failed to fetch landing pages" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = uuidv4();
    const slug = (body.title || "page").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) + "-" + id.slice(0, 6);

    let html = body.html || "";

    // If no HTML provided, generate via LLM
    if (!html && body.generate) {
      const connections = getConnections();
      const conn = connections.find((c) => c.is_active === 1);
      if (conn) {
        // Load brand voice for consistent tone
        const brandVoice = getDb().prepare("SELECT * FROM brand_voices WHERE is_default = 1 LIMIT 1").get() as { description: string; tone_keywords: string } | undefined;
        const voiceCtx = brandVoice
          ? `\nBrand voice: ${brandVoice.description}. Tone: ${JSON.parse(brandVoice.tone_keywords || "[]").join(", ")}.`
          : "";

        const prompt = `Generate a complete, modern, responsive landing page HTML for: "${body.title || body.niche || 'product'}".${voiceCtx}
Include: hero section with headline + CTA, features section, social proof, pricing, FAQ, footer.
${body.widgets?.includes("countdown") ? "Add an evergreen countdown timer (JavaScript, 24 hours from page load)." : ""}
${body.widgets?.includes("exit_intent") ? "Add an exit-intent popup with email capture form." : ""}
${body.widgets?.includes("social_proof") ? 'Add a social proof notification bar ("X people signed up in the last 24 hours").' : ""}
Add this tracking pixel before </body>: <script>fetch('/api/funnels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_name:'landing_page_visit',event_data:{page_id:'${id}',slug:'${slug}'}})});</script>
Use inline CSS. Make it dark-themed, professional. No external dependencies.
Return ONLY the HTML, no markdown.`;

        try {
          if (conn.provider === "ollama") {
            const { Ollama } = await import("ollama");
            const ollama = new Ollama({ host: conn.base_url || "http://127.0.0.1:11434" });
            const r = await ollama.chat({ model: conn.model || "llama3", messages: [{ role: "user", content: prompt }], stream: false });
            html = r.message.content.replace(/```html?\n?/g, "").replace(/```/g, "").trim();
          } else {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (conn.api_key_encrypted) headers["Authorization"] = `Bearer ${conn.api_key_encrypted}`;
            const r = await fetch(`${conn.base_url || "https://api.openai.com"}/v1/chat/completions`, {
              method: "POST", headers,
              body: JSON.stringify({ model: conn.model || "gpt-4o-mini", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
            });
            const d = await r.json();
            html = (d.choices?.[0]?.message?.content || "").replace(/```html?\n?/g, "").replace(/```/g, "").trim();
          }
        } catch { /* fallback to empty */ }
      }
    }

    getDb().prepare(`
      INSERT INTO landing_pages (id, project_id, title, slug, html, widgets, status)
      VALUES (?, ?, ?, ?, ?, ?, 'draft')
    `).run(id, body.project_id || null, body.title || "Landing Page", slug, html, JSON.stringify(body.widgets || []));

    const page = getDb().prepare("SELECT * FROM landing_pages WHERE id = ?").get(id);
    return NextResponse.json({ ...page as Record<string, unknown>, url: `/api/landing-pages/${slug}` }, { status: 201 });
  } catch (error) {
    console.error("POST /api/landing-pages error:", error);
    return NextResponse.json({ error: "Failed to create landing page" }, { status: 500 });
  }
}
