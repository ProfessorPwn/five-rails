import { NextRequest, NextResponse } from "next/server";
import { updatePlatformConnection, deletePlatformConnection, logActivity } from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const connection = updatePlatformConnection(id, body);
    if (!connection) {
      return NextResponse.json({ error: "Platform connection not found" }, { status: 404 });
    }
    logActivity({
      action: "platform_connection_updated",
      details: `Updated ${connection.platform} platform connection`,
    });
    return NextResponse.json(connection);
  } catch (error) {
    console.error("PATCH /api/platform-connections/[id] error:", error);
    return NextResponse.json({ error: "Failed to update platform connection" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deleted = deletePlatformConnection(id);
    if (!deleted) {
      return NextResponse.json({ error: "Platform connection not found" }, { status: 404 });
    }
    logActivity({
      action: "platform_connection_deleted",
      details: `Deleted platform connection: ${id}`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/platform-connections/[id]:", error);
    return NextResponse.json({ error: "Failed to delete platform connection" }, { status: 500 });
  }
}
