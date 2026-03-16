import { NextRequest, NextResponse } from "next/server";
import { updateContact, deleteContact, logActivity } from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const contact = await updateContact(id, body);
    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }
    await logActivity({
      action: "contact_updated",
      project_id: contact.project_id || undefined,
      details: `Updated contact: ${contact.name || id}`,
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deleted = deleteContact(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }
    logActivity({
      action: "contact_deleted",
      details: `Deleted contact: ${id}`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/outbound/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete contact" },
      { status: 500 }
    );
  }
}
