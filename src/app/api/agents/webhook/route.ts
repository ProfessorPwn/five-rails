import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_id, message } = body;

    if (!agent_id || !message) {
      return NextResponse.json({ error: "agent_id and message are required" }, { status: 400 });
    }

    const baseUrl = request.nextUrl.origin;
    const res = await fetch(`${baseUrl}/api/agents/${agent_id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Generic webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
