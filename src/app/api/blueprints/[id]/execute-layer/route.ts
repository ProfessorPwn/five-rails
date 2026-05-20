import { NextRequest, NextResponse } from "next/server";
import {
  getBlueprint, updateBlueprintLayerStatus, getConnections,
  getSkill, createContent, logActivity, LAYER_SKILL_MAP,
} from "@/lib/db";
import type { ContentPiece } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const layerId = body.layerId as string;

    if (!layerId) {
      return NextResponse.json({ error: "layerId is required" }, { status: 400 });
    }

    const blueprint = getBlueprint(id);
    if (!blueprint) {
      return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
    }

    const connections = getConnections();
    const activeConnection = connections.find((c) => c.is_active === 1);
    if (!activeConnection) {
      return NextResponse.json({ error: "No active LLM connection" }, { status: 503 });
    }

    const mapping = LAYER_SKILL_MAP[layerId];
    if (!mapping) {
      return NextResponse.json({ error: `Unknown layer: ${layerId}` }, { status: 400 });
    }

    const skill = getSkill(mapping.skillId);
    if (!skill) {
      return NextResponse.json({ error: `Skill not found: ${mapping.skillId}` }, { status: 404 });
    }

    // Extract the layer's metrics from the blueprint data
    const bpData = JSON.parse(blueprint.data);
    const layer = (bpData.layers || []).find((l: { id: string }) => l.id === layerId);
    if (!layer) {
      return NextResponse.json({ error: `Layer ${layerId} not found in blueprint` }, { status: 404 });
    }

    // Build the execution prompt with layer context
    const metricsContext = layer.metrics
      .map((m: { name: string; desc: string }) => `- ${m.name}: ${m.desc}`)
      .join("\n");

    const prompt = `${skill.prompt_template}

BUSINESS CONTEXT:
Niche: ${blueprint.niche}
Business Model: ${bpData.model || "SaaS"}

METRICS TARGETS FOR THIS LAYER (${layer.label}):
${metricsContext}

${bpData.funnel ? `FUNNEL DATA:\n${bpData.funnel.map((f: { stage: string; count: string; rate: string }) => `${f.stage}: ${f.count} ${f.rate}`).join("\n")}` : ""}

Generate actionable output based on these specific metrics targets. Be concrete and specific to "${blueprint.niche}".`;

    // Mark layer as executing
    updateBlueprintLayerStatus(id, layerId, "executing", 0);

    // Call the LLM
    const { provider, base_url, api_key_encrypted, model } = activeConnection;
    let output: string;

    if (provider === "ollama") {
      const { Ollama } = await import("ollama");
      const ollama = new Ollama({ host: base_url || "http://127.0.0.1:11434" });
      const response = await ollama.chat({
        model: model || "llama3",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      });
      output = response.message.content;
    } else if (provider === "anthropic") {
      // Delegates to centralized SDK client (autoforge pattern)
      const { querySDK } = await import("@/lib/ai/sdk-client");
      const result = await querySDK(prompt, {
        agentType: "executive",
        connection: { provider: "anthropic", base_url, api_key_encrypted, model },
      });
      if (result.status === "error") throw new Error(result.errorMessage || "Claude call failed");
      output = result.text;
    } else {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (api_key_encrypted) headers["Authorization"] = `Bearer ${api_key_encrypted}`;
      const res = await fetch(`${base_url || "https://api.openai.com"}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`LLM error: ${res.status}`);
      const data = await res.json();
      output = data.choices?.[0]?.message?.content || "";
    }

    // Save the output as a content piece
    const contentType = mapping.contentType as ContentPiece['type'];
    const contentPiece = createContent({
      title: `${layer.label} — ${blueprint.niche}`,
      content: output,
      type: contentType,
      project_id: blueprint.project_id || undefined,
      status: "draft",
    });

    // Mark layer as completed
    updateBlueprintLayerStatus(id, layerId, "completed", 1);

    logActivity({
      action: "blueprint_layer_executed",
      project_id: blueprint.project_id || undefined,
      details: `Executed ${layer.label} for "${blueprint.niche}" → created ${mapping.contentType}`,
    });

    return NextResponse.json({
      layer_id: layerId,
      layer_label: layer.label,
      content_id: contentPiece.id,
      content_type: mapping.contentType,
      summary: output.slice(0, 300) + "...",
    });
  } catch (error) {
    console.error("POST /api/blueprints/[id]/execute-layer error:", error);
    return NextResponse.json({ error: "Failed to execute layer" }, { status: 500 });
  }
}
