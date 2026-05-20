import { NextRequest, NextResponse } from "next/server";
import { getConnections } from "@/lib/db";

// Combinatorial ad variant generator (AdEspresso Grid Composer pattern)
// Input: arrays of headlines, descriptions, images
// Output: all combinations as individual ad variants

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { niche, num_headlines, num_descriptions } = body;

    if (!niche) {
      return NextResponse.json({ error: "niche is required" }, { status: 400 });
    }

    // Use LLM to generate headline and description variants
    const connections = getConnections();
    const activeConn = connections.find((c) => c.is_active === 1);

    if (!activeConn) {
      return NextResponse.json({ error: "No active LLM connection" }, { status: 503 });
    }

    const hCount = num_headlines || 5;
    const dCount = num_descriptions || 3;

    const prompt = `Generate ad copy variants for this business: "${niche}"

Return ONLY valid JSON, no markdown:
{
  "headlines": [${Array(hCount).fill('"headline under 30 chars"').join(",")}],
  "descriptions": [${Array(dCount).fill('"description under 90 chars"').join(",")}],
  "ctas": ["Learn More", "Get Started", "Sign Up Free", "Try Now", "Shop Now"]
}

Rules:
- Headlines: under 30 characters, action-oriented, varied angles (benefit, curiosity, urgency, social proof, question)
- Descriptions: under 90 characters, expand on the headline's angle
- Be specific to "${niche}", not generic`;

    let output: string;
    const { provider, base_url, api_key_encrypted, model } = activeConn;

    if (provider === "ollama") {
      const { Ollama } = await import("ollama");
      const ollama = new Ollama({ host: base_url || "http://127.0.0.1:11434" });
      const response = await ollama.chat({ model: model || "llama3", messages: [{ role: "user", content: prompt }], stream: false });
      output = response.message.content;
    } else {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (api_key_encrypted) headers["Authorization"] = `Bearer ${api_key_encrypted}`;
      const res = await fetch(`${base_url || "https://api.openai.com"}/v1/chat/completions`, {
        method: "POST", headers,
        body: JSON.stringify({ model: model || "gpt-4o-mini", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error(`LLM error: ${res.status}`);
      const data = await res.json();
      output = data.choices?.[0]?.message?.content || "";
    }

    // Parse the variants
    let variants;
    try {
      const cleaned = output.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      variants = JSON.parse(cleaned);
    } catch {
      const match = output.match(/\{[\s\S]*\}/);
      if (match) variants = JSON.parse(match[0]);
      else return NextResponse.json({ error: "Failed to parse LLM response" }, { status: 500 });
    }

    // Generate all combinations (Grid Composer)
    const headlines: string[] = variants.headlines || [];
    const descriptions: string[] = variants.descriptions || [];
    const ctas: string[] = variants.ctas || ["Learn More"];

    const combinations: Array<{ id: number; headline: string; description: string; cta: string }> = [];
    let id = 1;
    for (const h of headlines) {
      for (const d of descriptions) {
        for (const c of ctas) {
          combinations.push({ id: id++, headline: h, description: d, cta: c });
        }
      }
    }

    return NextResponse.json({
      variants,
      combinations,
      total: combinations.length,
      summary: `${headlines.length} headlines x ${descriptions.length} descriptions x ${ctas.length} CTAs = ${combinations.length} ad variants`,
    });
  } catch (error) {
    console.error("POST /api/ads/generate-variants error:", error);
    return NextResponse.json({ error: "Failed to generate variants" }, { status: 500 });
  }
}
