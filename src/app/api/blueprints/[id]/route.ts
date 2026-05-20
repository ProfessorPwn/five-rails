import { NextRequest, NextResponse } from "next/server";
import { getBlueprint } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const blueprint = getBlueprint(id);
    if (!blueprint) {
      return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...blueprint,
      data: JSON.parse(blueprint.data),
      layer_status: JSON.parse(blueprint.layer_status || "{}"),
    });
  } catch (error) {
    console.error("GET /api/blueprints/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch blueprint" }, { status: 500 });
  }
}
