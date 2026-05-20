import { NextRequest, NextResponse } from "next/server";
import { getWatchdogChannels, updateWatchdogChannel } from "@/lib/db";

// GET /api/agents/watchdog/channels — List all monitored channels
export async function GET() {
  try {
    const channels = getWatchdogChannels();
    return NextResponse.json(channels);
  } catch (error) {
    console.error("GET /api/agents/watchdog/channels error:", error);
    return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
  }
}

// PATCH /api/agents/watchdog/channels — Update a channel's config
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Channel id is required" }, { status: 400 });
    }

    updateWatchdogChannel(id, updates);
    const channels = getWatchdogChannels();
    return NextResponse.json(channels);
  } catch (error) {
    console.error("PATCH /api/agents/watchdog/channels error:", error);
    return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
  }
}
