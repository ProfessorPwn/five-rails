import { NextRequest, NextResponse } from "next/server";
import { getConnections, logActivity } from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const { message: rawMessage, project_id } = body;

    if (!rawMessage || typeof rawMessage !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    const message: string = rawMessage;

    const connections = getConnections();
    const activeConnection = connections.find((c) => c.is_active === 1);

    if (!activeConnection) {
      return NextResponse.json({
        error: "No active LLM connection configured",
        hint: "Go to Connections and add an Ollama or Anthropic connection.",
      }, { status: 503 });
    }

    const { provider, base_url, api_key_encrypted, model } = activeConnection;

    if (provider === "ollama") {
      return handleOllama({ message, model: model || "llama3", host: base_url || "http://127.0.0.1:11434", project_id });
    } else if (provider === "anthropic") {
      return handleClaude({ message, apiKey: api_key_encrypted || "", model: model || "claude-sonnet-4-20250514", project_id });
    } else {
      return handleOpenAICompat({ message, model: model || "gpt-4o-mini", baseUrl: base_url || "https://api.openai.com", apiKey: api_key_encrypted || "", project_id });
    }
  } catch (error) {
    console.error("POST /api/chat error:", error);
    return NextResponse.json({ error: "Failed to process chat request" }, { status: 500 });
  }
}

// ─── Ollama via official SDK ─────────────────────────────────────────────────

async function handleOllama(opts: { message: string; model: string; host: string; project_id?: string }) {
  try {
    const { Ollama } = await import("ollama");
    const ollama = new Ollama({ host: opts.host });

    const response = await ollama.chat({
      model: opts.model,
      messages: [{ role: "user", content: opts.message }],
      stream: true,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const part of response) {
            // Skip empty thinking tokens (e.g. qwen3 reasoning phase)
            if (!part.message.content && !part.done) continue;
            const chunk = JSON.stringify({ content: part.message.content, done: part.done }) + "\n";
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Stream error";
          controller.enqueue(encoder.encode(JSON.stringify({ error: errMsg }) + "\n"));
        } finally {
          controller.close();
          logActivity({
            action: "chat_message",
            project_id: typeof opts.project_id === "string" ? opts.project_id : undefined,
            details: `Chat (ollama/${opts.model}): "${opts.message.slice(0, 80)}${opts.message.length > 80 ? "..." : ""}"`,
          });
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ollama connection failed";
    console.error("Ollama error:", msg);
    return NextResponse.json(
      { error: `Ollama error: ${msg}`, hint: "Make sure Ollama is running locally." },
      { status: 502 }
    );
  }
}

// ─── Claude via Agent SDK ────────────────────────────────────────────────────

async function handleClaude(opts: { message: string; apiKey: string; model: string; project_id?: string }) {
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const msg of query({
            prompt: opts.message,
            options: {
              model: opts.model,
              env: { ...process.env, ANTHROPIC_API_KEY: opts.apiKey },
              tools: [],
              maxTurns: 1,
              persistSession: false,
            },
          })) {
            if (msg.type === "stream_event") {
              // Streaming delta events
              const event = msg.event as Record<string, unknown>;
              if (event.type === "content_block_delta") {
                const delta = event.delta as Record<string, unknown>;
                if (delta?.type === "text_delta" && typeof delta.text === "string") {
                  const chunk = JSON.stringify({ content: delta.text, done: false }) + "\n";
                  controller.enqueue(encoder.encode(chunk));
                }
              }
            } else if (msg.type === "assistant" && msg.message?.content) {
              // Full assistant message (if streaming not enabled or as final)
              for (const block of msg.message.content) {
                if (block.type === "text") {
                  const chunk = JSON.stringify({ content: block.text, done: false }) + "\n";
                  controller.enqueue(encoder.encode(chunk));
                }
              }
            } else if (msg.type === "result") {
              const chunk = JSON.stringify({ content: "", done: true }) + "\n";
              controller.enqueue(encoder.encode(chunk));
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Claude SDK error";
          controller.enqueue(encoder.encode(JSON.stringify({ error: errMsg }) + "\n"));
        } finally {
          controller.close();
          logActivity({
            action: "chat_message",
            project_id: typeof opts.project_id === "string" ? opts.project_id : undefined,
            details: `Chat (claude/${opts.model}): "${opts.message.slice(0, 80)}${opts.message.length > 80 ? "..." : ""}"`,
          });
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Claude SDK error";
    console.error("Claude SDK error:", msg);
    return NextResponse.json({ error: `Claude error: ${msg}` }, { status: 502 });
  }
}

// ─── OpenAI-compatible fallback via fetch ────────────────────────────────────

async function handleOpenAICompat(opts: { message: string; model: string; baseUrl: string; apiKey: string; project_id?: string }) {
  const apiUrl = `${opts.baseUrl}/v1/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let upstream: Response;
  try {
    upstream = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: opts.model, messages: [{ role: "user", content: opts.message }], stream: true }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "LLM request timed out (30s)." }, { status: 504 });
    }
    throw err;
  }
  clearTimeout(timeout);

  if (!upstream.ok) {
    const errorText = await upstream.text();
    return NextResponse.json({ error: "LLM API request failed", detail: errorText }, { status: upstream.status });
  }
  if (!upstream.body) {
    return NextResponse.json({ error: "No response body from LLM" }, { status: 502 });
  }

  const stream = new ReadableStream({
    async start(ctrl) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          ctrl.enqueue(new TextEncoder().encode(decoder.decode(value, { stream: true })));
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        ctrl.close();
        logActivity({
          action: "chat_message",
          project_id: typeof opts.project_id === "string" ? opts.project_id : undefined,
          details: `Chat (${opts.model}): "${opts.message.slice(0, 80)}${opts.message.length > 80 ? "..." : ""}"`,
        });
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
