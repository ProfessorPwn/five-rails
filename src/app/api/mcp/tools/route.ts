import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const tools = getDb().prepare("SELECT * FROM mcp_tools ORDER BY category ASC, name ASC").all();
    return NextResponse.json(tools);
  } catch (error) {
    console.error("GET /api/mcp/tools error:", error);
    return NextResponse.json({ error: "Failed to fetch MCP tools" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Connect a tool (link to platform_connection)
    if (body.action === "connect") {
      getDb().prepare(
        "UPDATE mcp_tools SET is_connected = 1, platform_connection_id = ?, config = ? WHERE id = ?"
      ).run(body.platform_connection_id || null, JSON.stringify(body.config || {}), body.tool_id);
      return NextResponse.json({ connected: true });
    }

    // Disconnect
    if (body.action === "disconnect") {
      getDb().prepare("UPDATE mcp_tools SET is_connected = 0, platform_connection_id = NULL WHERE id = ?").run(body.tool_id);
      return NextResponse.json({ disconnected: true });
    }

    return NextResponse.json({ error: "Use action: 'connect' or 'disconnect'" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/mcp/tools error:", error);
    return NextResponse.json({ error: "Failed to update MCP tool" }, { status: 500 });
  }
}
