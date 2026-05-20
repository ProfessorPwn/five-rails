import { NextRequest, NextResponse } from "next/server";
import { getPlatformConnections, createPlatformConnection, logActivity } from "@/lib/db";
import { validateRequired, safeParseJson, isValidPlatform } from "@/lib/validation";

export async function GET() {
  try {
    const connections = getPlatformConnections();
    return NextResponse.json(connections);
  } catch (error) {
    console.error("GET /api/platform-connections error:", error);
    return NextResponse.json({ error: "Failed to fetch platform connections" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await safeParseJson(request);
    if (!raw) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const err = validateRequired(raw, ["platform"]);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    if (!isValidPlatform(String(raw.platform))) {
      return NextResponse.json(
        { error: "Invalid platform. Must be one of: twitter, linkedin, facebook, instagram, tiktok, youtube, email" },
        { status: 400 }
      );
    }
    const connection = createPlatformConnection(raw as any);
    logActivity({
      action: "platform_connection_created",
      details: `Created ${raw.platform} platform connection${raw.label ? `: ${raw.label}` : ""}`,
    });
    return NextResponse.json(connection, { status: 201 });
  } catch (error) {
    console.error("POST /api/platform-connections error:", error);
    return NextResponse.json({ error: "Failed to create platform connection" }, { status: 500 });
  }
}
