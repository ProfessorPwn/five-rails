import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// Funnel visualization with drop-off analysis (Mixpanel pattern)

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("project_id");

    // Get funnel events grouped by name
    let events;
    if (projectId) {
      events = getDb().prepare(
        "SELECT event_name, COUNT(*) as count, source FROM funnel_events WHERE project_id = ? GROUP BY event_name ORDER BY count DESC"
      ).all(projectId);
    } else {
      events = getDb().prepare(
        "SELECT event_name, COUNT(*) as count, source FROM funnel_events GROUP BY event_name ORDER BY count DESC"
      ).all();
    }

    // Build funnel stages from actual data
    const stageOrder = ["visit", "signup", "activate", "engage", "purchase", "retain", "refer"];
    const stages = stageOrder
      .map((stage) => {
        const match = (events as Array<{ event_name: string; count: number }>).find(
          (e) => e.event_name.toLowerCase().includes(stage)
        );
        return match ? { stage, count: match.count } : null;
      })
      .filter(Boolean);

    // Calculate conversion rates between stages
    const funnel = stages.map((stage, i) => {
      const prev = i > 0 ? stages[i - 1] : null;
      const rate = prev && prev!.count > 0 ? ((stage!.count / prev!.count) * 100).toFixed(1) : null;
      return {
        stage: stage!.stage,
        count: stage!.count,
        conversion_rate: rate ? `${rate}%` : null,
        drop_off: prev ? prev!.count - stage!.count : 0,
        drop_off_pct: prev && prev!.count > 0 ? `${((1 - stage!.count / prev!.count) * 100).toFixed(1)}%` : null,
      };
    });

    // Get recent individual events for timeline (last 50)
    let recentEvents;
    if (projectId) {
      recentEvents = getDb().prepare(
        "SELECT id, event_name, event_data, user_id, session_id, source, created_at FROM funnel_events WHERE project_id = ? ORDER BY created_at DESC LIMIT 50"
      ).all(projectId);
    } else {
      recentEvents = getDb().prepare(
        "SELECT id, event_name, event_data, user_id, session_id, source, created_at FROM funnel_events ORDER BY created_at DESC LIMIT 50"
      ).all();
    }

    // Quick stats
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let eventsThisWeek: number;
    let eventsToday: number;
    if (projectId) {
      eventsThisWeek = ((getDb().prepare(
        "SELECT COUNT(*) as count FROM funnel_events WHERE project_id = ? AND created_at >= ?"
      ).get(projectId, weekAgo)) as { count: number }).count;
      eventsToday = ((getDb().prepare(
        "SELECT COUNT(*) as count FROM funnel_events WHERE project_id = ? AND created_at >= ?"
      ).get(projectId, todayStr)) as { count: number }).count;
    } else {
      eventsThisWeek = ((getDb().prepare(
        "SELECT COUNT(*) as count FROM funnel_events WHERE created_at >= ?"
      ).get(weekAgo)) as { count: number }).count;
      eventsToday = ((getDb().prepare(
        "SELECT COUNT(*) as count FROM funnel_events WHERE created_at >= ?"
      ).get(todayStr)) as { count: number }).count;
    }

    // Most active stage
    const mostActive = (events as Array<{ event_name: string; count: number }>)[0] || null;

    return NextResponse.json({
      funnel,
      total_events: (events as Array<{ count: number }>).reduce((s, e) => s + e.count, 0),
      event_types: events,
      recent_events: recentEvents,
      quick_stats: {
        events_this_week: eventsThisWeek,
        events_today: eventsToday,
        most_active_stage: mostActive?.event_name || null,
        overall_conversion: funnel.length >= 2
          ? `${((funnel[funnel.length - 1].count / funnel[0].count) * 100).toFixed(1)}%`
          : null,
      },
    });
  } catch (error) {
    console.error("GET /api/funnels error:", error);
    return NextResponse.json({ error: "Failed to fetch funnel data" }, { status: 500 });
  }
}

// Track a funnel event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = uuidv4();

    if (!body.event_name) {
      return NextResponse.json({ error: "event_name is required" }, { status: 400 });
    }

    getDb().prepare(`
      INSERT INTO funnel_events (id, project_id, event_name, event_data, user_id, session_id, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.project_id || null,
      body.event_name,
      JSON.stringify(body.event_data || {}),
      body.user_id || null,
      body.session_id || null,
      body.source || null,
    );

    return NextResponse.json({ id, event_name: body.event_name, tracked: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/funnels error:", error);
    return NextResponse.json({ error: "Failed to track event" }, { status: 500 });
  }
}
