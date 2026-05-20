import { NextRequest, NextResponse } from "next/server";
import { getWatchdogIncidents, createWatchdogIncident } from "@/lib/db";

// GET /api/agents/watchdog/incidents — List incidents with optional filters
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const severity = url.searchParams.get("severity") || undefined;
    const category = url.searchParams.get("category") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "100");

    const incidents = getWatchdogIncidents({ status, severity, category, limit });
    return NextResponse.json(incidents);
  } catch (error) {
    console.error("GET /api/agents/watchdog/incidents error:", error);
    return NextResponse.json({ error: "Failed to fetch incidents" }, { status: 500 });
  }
}

// POST /api/agents/watchdog/incidents — Create a new incident manually
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, category, severity, description, source_channel_id, source_message, related_agent_id } = body;

    if (!title || !category || !severity) {
      return NextResponse.json({ error: "title, category, and severity are required" }, { status: 400 });
    }

    const validCategories = ['explicit_complaint', 'bug_report', 'broken_feature', 'agent_claim_mismatch', 'silent_failure', 'performance_degradation', 'security_alert'];
    const validSeverities = ['low', 'medium', 'high', 'critical'];

    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` }, { status: 400 });
    }
    if (!validSeverities.includes(severity)) {
      return NextResponse.json({ error: `Invalid severity. Must be one of: ${validSeverities.join(', ')}` }, { status: 400 });
    }

    const incident = createWatchdogIncident({
      title,
      category,
      severity,
      description,
      source_channel_id,
      source_message,
      related_agent_id,
    });

    return NextResponse.json(incident, { status: 201 });
  } catch (error) {
    console.error("POST /api/agents/watchdog/incidents error:", error);
    return NextResponse.json({ error: "Failed to create incident" }, { status: 500 });
  }
}
