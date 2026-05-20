import { NextRequest, NextResponse } from "next/server";
import { getWatchdogIncident, updateWatchdogIncident } from "@/lib/db";

// GET /api/agents/watchdog/incidents/[id] — Get single incident
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const incident = getWatchdogIncident(id);
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }
    return NextResponse.json(incident);
  } catch (error) {
    console.error("GET /api/agents/watchdog/incidents/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch incident" }, { status: 500 });
  }
}

// PATCH /api/agents/watchdog/incidents/[id] — Update incident status, root cause, etc.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, root_cause, action_taken, verification, assigned_to, escalated_to, severity } = body;

    const validStatuses = ['detected', 'investigating', 'fix_applied', 'verified', 'escalated', 'dismissed'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const incident = updateWatchdogIncident(id, {
      status,
      root_cause,
      action_taken,
      verification,
      assigned_to,
      escalated_to,
      severity,
    });

    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    return NextResponse.json(incident);
  } catch (error) {
    console.error("PATCH /api/agents/watchdog/incidents/[id] error:", error);
    return NextResponse.json({ error: "Failed to update incident" }, { status: 500 });
  }
}
