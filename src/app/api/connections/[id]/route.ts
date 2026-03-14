import { NextRequest, NextResponse } from "next/server";
import { updateConnection, deleteConnection, logActivity } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const connection = await updateConnection(id, body);
    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }
    await logActivity({
      action: "connection_updated",
      details: `Updated connection: ${id}`,
    });
    return NextResponse.json(connection);
  } catch (error) {
    console.error("PATCH /api/connections/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update connection" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteConnection(id);
    await logActivity({
      action: "connection_deleted",
      details: `Deleted connection: ${id}`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/connections/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete connection" },
      { status: 500 }
    );
  }
}
