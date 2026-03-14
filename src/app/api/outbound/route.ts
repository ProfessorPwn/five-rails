import { NextRequest, NextResponse } from "next/server";
import {
  getContacts,
  getProjectContacts,
  createContact,
  logActivity,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const contacts = projectId
      ? await getProjectContacts(projectId)
      : await getContacts();
    return NextResponse.json(contacts);
  } catch (error) {
    console.error("GET /api/outbound error:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const contact = await createContact(body);
    await logActivity({
      action: "contact_created",
      project_id: body.project_id,
      details: `Created contact: ${body.name || body.email || "Unknown"}`,
    });
    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("POST /api/outbound error:", error);
    return NextResponse.json(
      { error: "Failed to create contact" },
      { status: 500 }
    );
  }
}
