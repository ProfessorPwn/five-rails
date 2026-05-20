import { NextRequest, NextResponse } from "next/server";
import { getAutomationSettings, setAutomationSetting } from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json(getAutomationSettings());
  } catch (error) {
    console.error("GET /api/automation/settings error:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Bulk update: { settings: { key: value, ... } }
    if (body.settings && typeof body.settings === "object") {
      for (const [key, value] of Object.entries(body.settings)) {
        setAutomationSetting(key, String(value));
      }
      return NextResponse.json(getAutomationSettings());
    }

    // Single update: { key, value }
    if (body.key && body.value !== undefined) {
      setAutomationSetting(body.key, String(body.value));
      return NextResponse.json({ [body.key]: String(body.value) });
    }

    return NextResponse.json({ error: "Provide {key, value} or {settings: {...}}" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/automation/settings error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // Bulk update: { settings: { key: value, ... } }
    if (body.settings && typeof body.settings === "object") {
      for (const [key, value] of Object.entries(body.settings)) {
        setAutomationSetting(key, String(value));
      }
      return NextResponse.json(getAutomationSettings());
    }

    // Single update: { key, value }
    if (body.key && body.value !== undefined) {
      setAutomationSetting(body.key, String(body.value));
      return NextResponse.json({ [body.key]: String(body.value) });
    }

    return NextResponse.json({ error: "Provide {key, value} or {settings: {...}}" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/automation/settings error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
