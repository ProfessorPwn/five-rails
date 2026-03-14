import { NextRequest, NextResponse } from "next/server";
import { getConnections, createConnection, logActivity } from "@/lib/db";

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
    const body = await request.json();
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
