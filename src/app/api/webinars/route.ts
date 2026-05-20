import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const webinarId = searchParams.get("webinar_id");

    // If webinar_id provided, return that webinar + its registrations
    if (webinarId) {
      const webinar = getDb().prepare("SELECT * FROM webinars WHERE id = ?").get(webinarId);
      if (!webinar) {
        return NextResponse.json({ error: "Webinar not found" }, { status: 404 });
      }
      const registrations = getDb()
        .prepare("SELECT * FROM webinar_registrations WHERE webinar_id = ? ORDER BY created_at DESC")
        .all(webinarId);
      return NextResponse.json({ webinar, registrations });
    }

    const webinars = getDb().prepare("SELECT * FROM webinars ORDER BY created_at DESC").all();
    return NextResponse.json(webinars);
  } catch (error) {
    console.error("GET /api/webinars error:", error);
    return NextResponse.json({ error: "Failed to fetch webinars" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Register for a webinar
    if (body.action === "register") {
      const regId = uuidv4();
      getDb().prepare(`
        INSERT INTO webinar_registrations (id, webinar_id, email, name, session_datetime)
        VALUES (?, ?, ?, ?, ?)
      `).run(regId, body.webinar_id, body.email, body.name || null, body.session_datetime || null);

      // Increment registration count
      getDb().prepare("UPDATE webinars SET registration_count = registration_count + 1 WHERE id = ?").run(body.webinar_id);

      // Create or update outbound contact from registration
      const existing = getDb().prepare("SELECT id FROM outbound_contacts WHERE email = ?").get(body.email) as { id: string } | undefined;
      if (!existing) {
        const contactId = uuidv4();
        getDb().prepare(`
          INSERT INTO outbound_contacts (id, project_id, name, email, status, tags)
          VALUES (?, ?, ?, ?, 'lead', ?)
        `).run(contactId, body.project_id || null, body.name || body.email, body.email, JSON.stringify(["webinar-registrant"]));
      } else {
        // Add webinar tag
        const contact = getDb().prepare("SELECT tags FROM outbound_contacts WHERE id = ?").get(existing.id) as { tags: string } | undefined;
        const tags = JSON.parse(contact?.tags || "[]");
        if (!tags.includes("webinar-registrant")) {
          tags.push("webinar-registrant");
          getDb().prepare("UPDATE outbound_contacts SET tags = ? WHERE id = ?").run(JSON.stringify(tags), existing.id);
        }
      }

      // Track as funnel event
      getDb().prepare(`
        INSERT INTO funnel_events (id, project_id, event_name, event_data, user_id, source)
        VALUES (?, ?, 'webinar_registered', ?, ?, 'webinar')
      `).run(uuidv4(), body.project_id || null, JSON.stringify({ webinar_id: body.webinar_id }), body.email);

      logActivity({ action: "webinar_registration", project_id: body.project_id, details: `${body.email} registered for webinar` });

      return NextResponse.json({ registration_id: regId, status: "registered" }, { status: 201 });
    }

    // Track webinar attendance
    if (body.action === "track_attendance") {
      getDb().prepare(`
        UPDATE webinar_registrations SET attended = 1, watched_pct = ? WHERE id = ?
      `).run(body.watched_pct || 0, body.registration_id);

      getDb().prepare("UPDATE webinars SET attendance_count = attendance_count + 1 WHERE id = ?").run(body.webinar_id);

      // Track as funnel event
      getDb().prepare(`
        INSERT INTO funnel_events (id, project_id, event_name, event_data, source)
        VALUES (?, ?, 'webinar_attended', ?, 'webinar')
      `).run(uuidv4(), body.project_id || null, JSON.stringify({ webinar_id: body.webinar_id, watched_pct: body.watched_pct }));

      // Update lead score for attendee
      const reg = getDb().prepare("SELECT email FROM webinar_registrations WHERE id = ?").get(body.registration_id) as { email: string } | undefined;
      if (reg) {
        const contact = getDb().prepare("SELECT id, lead_score FROM outbound_contacts WHERE email = ?").get(reg.email) as { id: string; lead_score: number } | undefined;
        if (contact) {
          const points = (body.watched_pct || 0) >= 75 ? 25 : (body.watched_pct || 0) >= 50 ? 15 : 5;
          getDb().prepare("UPDATE outbound_contacts SET lead_score = lead_score + ? WHERE id = ?").run(points, contact.id);
        }
      }

      return NextResponse.json({ tracked: true });
    }

    // Create webinar
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO webinars (id, project_id, title, description, video_url, is_automated, schedule, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.project_id || null, body.title, body.description || null,
      body.video_url || null, body.is_automated ? 1 : 0,
      JSON.stringify(body.schedule || []), body.status || "draft");

    logActivity({ action: "webinar_created", project_id: body.project_id, details: `Webinar "${body.title}" created` });

    const webinar = getDb().prepare("SELECT * FROM webinars WHERE id = ?").get(id);
    return NextResponse.json(webinar, { status: 201 });
  } catch (error) {
    console.error("POST /api/webinars error:", error);
    return NextResponse.json({ error: "Failed to process webinar action" }, { status: 500 });
  }
}
