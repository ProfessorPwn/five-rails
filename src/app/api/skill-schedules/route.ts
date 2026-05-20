import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const schedules = getDb().prepare(
      "SELECT ss.*, s.name as skill_name, s.category as skill_category FROM skill_schedules ss JOIN skills s ON ss.skill_id = s.id ORDER BY ss.next_run_at ASC"
    ).all();
    return NextResponse.json(schedules);
  } catch (error) {
    console.error("GET /api/skill-schedules error:", error);
    return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.skill_id) {
      return NextResponse.json({ error: "skill_id is required" }, { status: 400 });
    }

    // Verify skill exists
    const skill = getDb().prepare("SELECT id, name FROM skills WHERE id = ?").get(body.skill_id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const id = uuidv4();
    const cronExpr = body.cron_expression || "0 9 * * *"; // Default: 9am daily
    const nextRun = calculateNextRun(cronExpr);

    getDb().prepare(`
      INSERT INTO skill_schedules (id, skill_id, project_id, input, cron_expression, is_active, next_run_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(id, body.skill_id, body.project_id || null, body.input || null, cronExpr, nextRun);

    const schedule = getDb().prepare(
      "SELECT ss.*, s.name as skill_name FROM skill_schedules ss JOIN skills s ON ss.skill_id = s.id WHERE ss.id = ?"
    ).get(id);

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    console.error("POST /api/skill-schedules error:", error);
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}

// Simple cron-like next run calculator
// Supports: "0 9 * * *" (daily at 9am), "0 9 * * 1" (Mondays at 9am), "0 */6 * * *" (every 6 hours)
function calculateNextRun(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length < 5) return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const [minute, hour, , , dayOfWeek] = parts;
  const now = new Date();
  const next = new Date(now);

  // Set time
  next.setMinutes(parseInt(minute) || 0);
  next.setSeconds(0);
  next.setMilliseconds(0);

  if (hour.startsWith("*/")) {
    // Every N hours
    const interval = parseInt(hour.slice(2)) || 6;
    next.setHours(now.getHours() + interval);
  } else {
    next.setHours(parseInt(hour) || 9);
  }

  // If time already passed today, move to tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  // Handle day-of-week (0=Sun, 1=Mon, ... 6=Sat)
  if (dayOfWeek !== "*") {
    const targetDay = parseInt(dayOfWeek);
    while (next.getDay() !== targetDay) {
      next.setDate(next.getDate() + 1);
    }
  }

  return next.toISOString();
}
