import { NextRequest, NextResponse } from "next/server";
import { getSkill, getConnections, logActivity } from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const { project_id, input } = body;

    if (!input) {
      return NextResponse.json({ error: "input is required" }, { status: 400 });
    }

    const skill = getSkill(id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const prompt = skill.prompt_template
      ? skill.prompt_template
          .replace(/\{\{input\}\}/g, input)
          .replace(/\{\{project_id\}\}/g, project_id || "")
      : `You are "${skill.name}". ${skill.description || ""}\n\nUser request: ${input}`;

    const connections = getConnections();
    const activeConnection = connections.find((c) => c.is_active === 1);

    if (!activeConnection) {
      return NextResponse.json({
        error: "No active LLM connection configured",
        hint: "Go to Connections and add an Ollama or Anthropic connection.",
      }, { status: 503 });
    }

    const { provider, base_url, api_key_encrypted, model } = activeConnection;
    let output: string;

    if (provider === "ollama") {
      output = await executeWithOllama(prompt, model || "llama3", base_url || "http://127.0.0.1:11434");
    } else if (provider === "anthropic") {
      output = await executeWithClaude(prompt, api_key_encrypted || "", model || "claude-sonnet-4-20250514");
    } else {
      output = await executeWithOpenAI(prompt, model || "gpt-4o-mini", base_url || "https://api.openai.com", api_key_encrypted || "");
    }

    logActivity({
      action: "skill_executed",
      project_id: project_id || undefined,
      details: `Executed skill: ${skill.name}`,
      skill_used: skill.name,
    });

    return NextResponse.json({
      skill_id: id,
      skill_name: skill.name,
      project_id: project_id || null,
      input,
      output,
      provider: `${provider}/${model}`,
      executed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/skills/[id]/execute error:", error);
    return NextResponse.json({ error: "Failed to execute skill" }, { status: 500 });
  }
}

async function executeWithOllama(prompt: string, model: string, host: string): Promise<string> {
  const { Ollama } = await import("ollama");
  const ollama = new Ollama({ host });
  const response = await ollama.chat({
    model,
    messages: [{ role: "user", content: prompt }],
    stream: false,
  });
  return response.message.content;
}

async function executeWithClaude(prompt: string, apiKey: string, model: string): Promise<string> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  let output = "";
  for await (const msg of query({
    prompt,
    options: {
      model,
      env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
      tools: [],
      maxTurns: 1,
      persistSession: false,
    },
  })) {
    if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "text") output += block.text;
      }
    } else if (msg.type === "result" && msg.subtype === "success") {
      if (msg.result && !output) output = msg.result;
    }
  }
  return output;
}

async function executeWithOpenAI(prompt: string, model: string, baseUrl: string, apiKey: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
