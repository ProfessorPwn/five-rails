import { NextRequest, NextResponse } from "next/server";
import { getBlueprint, updateBlueprintStatus, LAYER_SKILL_MAP, logActivity } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

// Execution order — each layer's output feeds context into subsequent layers
const EXECUTION_ORDER = [
  "north-star",
  "revenue",
  "pricing-tiers",
  "product",
  "seo",
  "content",
  "traffic",
  "email",
  "acquisition",
  "paid",
  "attribution",
  "budget",
];

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const blueprint = getBlueprint(id);

    if (!blueprint) {
      return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
    }

    const bpData = JSON.parse(blueprint.data);
    const availableLayers = (bpData.layers || []).map((l: { id: string }) => l.id);

    // Filter to only layers that exist in this blueprint
    const layersToExecute = EXECUTION_ORDER.filter(
      (layerId) => availableLayers.includes(layerId) && LAYER_SKILL_MAP[layerId]
    );

    updateBlueprintStatus(id, "executing");

    const results: Array<{ layer_id: string; status: string; content_id?: string; error?: string }> = [];
    const baseUrl = request.nextUrl.origin;

    // Execute layers sequentially so each feeds context to the next
    for (const layerId of layersToExecute) {
      try {
        const res = await fetch(`${baseUrl}/api/blueprints/${id}/execute-layer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layerId }),
        });

        const data = await res.json();

        if (res.ok) {
          results.push({ layer_id: layerId, status: "completed", content_id: data.content_id });
        } else {
          results.push({ layer_id: layerId, status: "failed", error: data.error });
        }
      } catch (err) {
        results.push({
          layer_id: layerId,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const completed = results.filter((r) => r.status === "completed").length;
    const failed = results.filter((r) => r.status === "failed").length;

    updateBlueprintStatus(id, completed > 0 ? "completed" : "generated");

    logActivity({
      action: "blueprint_full_execution",
      project_id: blueprint.project_id || undefined,
      details: `Full blueprint execution for "${blueprint.niche}": ${completed} layers completed, ${failed} failed`,
    });

    return NextResponse.json({
      blueprint_id: id,
      total_layers: layersToExecute.length,
      completed,
      failed,
      results,
    });
  } catch (error) {
    console.error("POST /api/blueprints/[id]/execute-all error:", error);
    return NextResponse.json({ error: "Failed to execute blueprint" }, { status: 500 });
  }
}
