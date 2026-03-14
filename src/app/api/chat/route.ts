import { NextRequest, NextResponse } from "next/server";
import { getConnections, logActivity } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, project_id, skill_id } = body;

    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    // Get the first active connection
    const connections = await getConnections();
    const activeConnection = connections.find(
      (c) => c.is_active === 1
    );

    if (!activeConnection) {
      return NextResponse.json(
        {
          error: "No active LLM connection configured",
          hint: "Go to Settings > Connections and add an Ollama or OpenAI-compatible connection.",
        },
        { status: 503 }
      );
    }

    const { provider, base_url, api_key_encrypted, model } = activeConnection;

    let apiUrl: string;
    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    let requestBody: any;

    if (provider === "ollama") {
      // Ollama chat API
      apiUrl = `${base_url || "http://127.0.0.1:11434"}/api/chat`;
      requestBody = {
        model: model || "llama3",
        messages: [{ role: "user", content: message }],
        stream: true,
      };
    } else {
      // OpenAI-compatible API
      apiUrl = `${base_url || "https://api.openai.com"}/v1/chat/completions`;
      if (api_key_encrypted) {
        headers["Authorization"] = `Bearer ${api_key_encrypted}`;
      }
      requestBody = {
        model: model || "gpt-3.5-turbo",
        messages: [{ role: "user", content: message }],
        stream: true,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let upstream: Response;
    try {
      upstream = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        return NextResponse.json(
          { error: "LLM request timed out (30s). The model may still be loading." },
          { status: 504 }
        );
      }
      throw err;
    }
    clearTimeout(timeout);

    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.error("LLM API error:", upstream.status, errorText);
      return NextResponse.json(
        { error: "LLM API request failed", detail: errorText },
        { status: upstream.status }
      );
    }

    if (!upstream.body) {
      return NextResponse.json(
        { error: "No response body from LLM" },
        { status: 502 }
      );
    }

    // Stream the response back to the client
    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            if (provider === "ollama") {
              // Ollama streams newline-delimited JSON
              controller.enqueue(new TextEncoder().encode(chunk));
            } else {
              // OpenAI SSE format — pass through as-is
              controller.enqueue(new TextEncoder().encode(chunk));
            }
          }
        } catch (err) {
          console.error("Stream read error:", err);
        } finally {
          controller.close();
          // Log activity after stream completes
          logActivity({
            action: "chat_message",
            project_id: project_id || undefined,
            details: `Chat message: "${message.slice(0, 80)}${message.length > 80 ? "..." : ""}"`,
          });
        }
      },
    });

    const responseHeaders: Record<string, string> = {
      "Content-Type":
        provider === "ollama"
          ? "application/x-ndjson"
          : "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    };

    return new Response(stream, { headers: responseHeaders });
  } catch (error) {
    console.error("POST /api/chat error:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
