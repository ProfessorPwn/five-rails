import { NextRequest, NextResponse } from "next/server";
import { getDb, getConnections } from "@/lib/db";

interface BrandVoice {
  id: string;
  name: string;
  description: string | null;
  tone_keywords: string;
  sample_content: string;
  rules: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { voice_id, test_prompt, inline_voice } = body;

    let voice: BrandVoice | undefined;

    if (voice_id) {
      voice = getDb().prepare("SELECT * FROM brand_voices WHERE id = ?").get(voice_id) as BrandVoice | undefined;
      if (!voice) {
        return NextResponse.json({ error: "Brand voice not found" }, { status: 404 });
      }
    } else if (inline_voice) {
      // Allow testing with unsaved voice data
      voice = {
        id: "test",
        name: inline_voice.name || "Test Voice",
        description: inline_voice.description || "",
        tone_keywords: JSON.stringify(inline_voice.tone_keywords || []),
        sample_content: JSON.stringify(inline_voice.sample_content || []),
        rules: JSON.stringify(inline_voice.rules || []),
      };
    } else {
      return NextResponse.json({ error: "voice_id or inline_voice is required" }, { status: 400 });
    }

    const prompt = test_prompt || "Write a short social media post about our product.";

    // Build the LLM prompt with brand voice injected
    const toneKeywords = (() => { try { return JSON.parse(voice.tone_keywords || "[]"); } catch { return []; } })() as string[];
    const rules = (() => { try { return JSON.parse(voice.rules || "[]"); } catch { return []; } })() as string[];
    const sampleContent = (() => { try { return JSON.parse(voice.sample_content || "[]"); } catch { return voice.sample_content || ""; } })();

    let systemPrompt = `You are a copywriter writing in the "${voice.name}" brand voice.\n`;
    if (voice.description) systemPrompt += `Voice description: ${voice.description}\n`;
    if (toneKeywords.length > 0) systemPrompt += `Tone: ${toneKeywords.join(", ")}\n`;
    if (rules.length > 0) systemPrompt += `Writing rules:\n${rules.map((r: string) => `- ${r}`).join("\n")}\n`;
    if (sampleContent && (Array.isArray(sampleContent) ? sampleContent.length > 0 : sampleContent)) {
      const samples = Array.isArray(sampleContent) ? sampleContent.join("\n---\n") : sampleContent;
      systemPrompt += `\nSample content in this voice:\n${samples}\n`;
    }
    systemPrompt += "\nWrite ONLY the requested content. No explanations or meta-commentary.";

    const connections = getConnections();
    const activeConnection = connections.find((c) => c.is_active === 1);

    if (!activeConnection) {
      return NextResponse.json({
        error: "No active LLM connection. Go to Connections to configure one.",
      }, { status: 503 });
    }

    const { provider, base_url, api_key_encrypted, model } = activeConnection;
    let output: string;

    if (provider === "ollama") {
      output = await callOllama(systemPrompt, prompt, model || "llama3", base_url || "http://127.0.0.1:11434");
    } else if (provider === "anthropic") {
      output = await callClaude(systemPrompt, prompt, api_key_encrypted || "", model || "claude-sonnet-4-20250514");
    } else {
      output = await callOpenAI(systemPrompt, prompt, model || "gpt-4o-mini", base_url || "https://api.openai.com", api_key_encrypted || "");
    }

    return NextResponse.json({
      voice_name: voice.name,
      test_prompt: prompt,
      output,
      provider: `${provider}/${model}`,
    });
  } catch (error) {
    console.error("POST /api/brand-voice/test error:", error);
    return NextResponse.json({ error: "Failed to test brand voice" }, { status: 500 });
  }
}

async function callOllama(system: string, user: string, model: string, host: string): Promise<string> {
  const { Ollama } = await import("ollama");
  const ollama = new Ollama({ host });
  const response = await ollama.chat({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
  });
  return response.message.content;
}

async function callClaude(system: string, user: string, apiKey: string, model: string): Promise<string> {
  // Delegates to centralized SDK client (autoforge pattern)
  const { querySDK } = await import("@/lib/ai/sdk-client");
  const result = await querySDK(user, {
    agentType: "executive",
    systemPrompt: system,
    connection: { provider: "anthropic", base_url: null, api_key_encrypted: apiKey, model },
  });
  if (result.status === "error") throw new Error(result.errorMessage || "Claude call failed");
  return result.text;
}

async function callOpenAI(system: string, user: string, model: string, baseUrl: string, apiKey: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
