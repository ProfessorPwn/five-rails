import { NextRequest, NextResponse } from "next/server";
import { updateContact, logActivity } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const contact = await updateContact(id, body);
    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }
    await logActivity({
      action: "contact_updated",
      project_id: body.project_id,
      details: `Updated contact: ${id}`,
    });
    return NextResponse.json(contact);
  } catch (error) {
    console.error("PATCH /api/outbound/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update contact" },
      { status: 500 }
    );
  }
}
