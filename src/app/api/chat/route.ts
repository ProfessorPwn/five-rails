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
    } else if (provider === "claude-cli") {
      return handleClaudeCLI({ message, model: model || "claude-sonnet-4-20250514", project_id });
    } else if (provider === "anthropic") {
      return handleClaude({ message, apiKey: api_key_encrypted || "", model: model || "claude-sonnet-4-20250514", project_id });
    } else {
      return handleOpenAICompat({ message, model: model || "gpt-4o-mini", baseUrl: base_url || "https://api.openai.com", apiKey: api_key_encrypted || "", project_id });
    }
  } catch (error) {
    console.error("POST /api/chat error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Chat failed: ${msg}` }, { status: 500 });
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

// ─── Claude CLI: uses Agent SDK with inherited env (local CLI auth) ──────────

async function handleClaudeCLI(opts: { message: string; model: string; project_id?: string }) {
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
              env: { ...process.env },
              tools: [],
              maxTurns: 1,
              persistSession: false,
            },
          })) {
            if (msg.type === "stream_event") {
              const event = msg.event as Record<string, unknown>;
              if (event.type === "content_block_delta") {
                const delta = event.delta as Record<string, unknown>;
                if (delta?.type === "text_delta" && typeof delta.text === "string") {
                  const chunk = JSON.stringify({ content: delta.text, done: false }) + "\n";
                  controller.enqueue(encoder.encode(chunk));
                }
              }
            } else if (msg.type === "assistant" && msg.message?.content) {
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
          const errMsg = err instanceof Error ? err.message : "Claude CLI error";
          controller.enqueue(encoder.encode(JSON.stringify({ error: errMsg }) + "\n"));
        } finally {
          controller.close();
          logActivity({
            action: "chat_message",
            project_id: typeof opts.project_id === "string" ? opts.project_id : undefined,
            details: `Chat (claude-cli/${opts.model}): "${opts.message.slice(0, 80)}${opts.message.length > 80 ? "..." : ""}"`,
          });
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Claude CLI error";
    console.error("Claude CLI error:", msg);
    return NextResponse.json({ error: `Claude CLI error: ${msg}`, hint: "Make sure Claude Code is authenticated (run 'claude' in terminal)." }, { status: 502 });
  }
}

// ─── Claude: route OAuth tokens via Agent SDK, standard keys via Messages API ─

async function handleClaude(opts: { message: string; apiKey: string; model: string; project_id?: string }) {
  const isOAuth = opts.apiKey.startsWith("sk-ant-oat");

  // Standard API keys → direct Messages API (streaming via SSE)
  if (!isOAuth) {
    return handleClaudeAPI(opts);
  }

  // OAuth tokens → Agent SDK (only way they work)
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
              env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: opts.apiKey },
              tools: [],
              maxTurns: 1,
              persistSession: false,
            },
          })) {
            if (msg.type === "stream_event") {
              const event = msg.event as Record<string, unknown>;
              if (event.type === "content_block_delta") {
                const delta = event.delta as Record<string, unknown>;
                if (delta?.type === "text_delta" && typeof delta.text === "string") {
                  const chunk = JSON.stringify({ content: delta.text, done: false }) + "\n";
                  controller.enqueue(encoder.encode(chunk));
                }
              }
            } else if (msg.type === "assistant" && msg.message?.content) {
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
    return NextResponse.json({ error: `Claude error: ${msg}`, hint: "Check your API key in Connections." }, { status: 502 });
  }
}

// ─── Claude direct Messages API (for standard API keys) ─────────────────────

async function handleClaudeAPI(opts: { message: string; apiKey: string; model: string; project_id?: string }) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 4096,
        stream: true,
        messages: [{ role: "user", content: opts.message }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      const errText = await upstream.text();
      const hint = upstream.status === 401 ? "Your Anthropic API key is invalid. Update it in Connections." : "";
      return NextResponse.json({ error: `Claude API error (${upstream.status})`, detail: errText, hint }, { status: upstream.status });
    }

    if (!upstream.body) {
      return NextResponse.json({ error: "No response body from Claude" }, { status: 502 });
    }

    // Re-stream SSE as NDJSON for the frontend
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const stream = new ReadableStream({
      async start(ctrl) {
        const reader = upstream.body!.getReader();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
              try {
                const evt = JSON.parse(line.slice(6));
                if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                  ctrl.enqueue(encoder.encode(JSON.stringify({ content: evt.delta.text, done: false }) + "\n"));
                } else if (evt.type === "message_stop") {
                  ctrl.enqueue(encoder.encode(JSON.stringify({ content: "", done: true }) + "\n"));
                }
              } catch { /* skip malformed SSE lines */ }
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Stream error";
          ctrl.enqueue(encoder.encode(JSON.stringify({ error: errMsg }) + "\n"));
        } finally {
          ctrl.close();
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
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "Claude request timed out (90s)." }, { status: 504 });
    }
    const msg = err instanceof Error ? err.message : "Claude API error";
    console.error("Claude API error:", msg);
    return NextResponse.json({ error: `Claude error: ${msg}`, hint: "Check your API key in Connections." }, { status: 502 });
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
