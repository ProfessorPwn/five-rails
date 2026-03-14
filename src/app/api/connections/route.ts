import { NextRequest, NextResponse } from "next/server";
import { getConnections, createConnection, logActivity } from "@/lib/db";
import { validateRequired, sanitizeBody, safeParseJson, isValidProvider } from "@/lib/validation";

export async function GET() {
  try {
    const connections = await getConnections();
    return NextResponse.json(connections);
  } catch (error) {
    console.error("GET /api/connections error:", error);
    return NextResponse.json(
      { error: "Failed to fetch connections" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await safeParseJson(request);
    if (!raw) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const err = validateRequired(raw, ["provider"]);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    if (!isValidProvider(String(raw.provider))) {
      return NextResponse.json(
        { error: "Invalid provider. Must be one of: openai, anthropic, ollama, perplexity, exa, firecrawl" },
        { status: 400 }
      );
    }
    const body = sanitizeBody(raw);
    const connection = await createConnection(body);
    await logActivity({
      action: "connection_created",
      details: `Created connection: ${body.name || body.provider || "Unknown"}`,
    });
    return NextResponse.json(connection, { status: 201 });
  } catch (error) {
    console.error("POST /api/connections error:", error);
    return NextResponse.json(
      { error: "Failed to create connection" },
      { status: 500 }
    );
  }
}
