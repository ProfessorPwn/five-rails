import { NextRequest, NextResponse } from "next/server";
import { resolveOllamaModel, clearOllamaResolverCache } from "@/lib/ai/ollama-client";

// GET /api/connections/ollama/models — list installed + loaded + resolved-for-"auto"
export async function GET(request: NextRequest) {
  const host = request.nextUrl.searchParams.get("host") || "http://127.0.0.1:11434";
  try {
    const [tagsRes, psRes] = await Promise.all([
      fetch(`${host.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(3000) }).catch(() => null),
      fetch(`${host.replace(/\/$/, "")}/api/ps`, { signal: AbortSignal.timeout(3000) }).catch(() => null),
    ]);

    const tagsData = tagsRes?.ok ? await tagsRes.json() : { models: [] };
    const psData = psRes?.ok ? await psRes.json() : { models: [] };

    const installed = (tagsData.models || []).map((m: { name: string; size?: number; details?: { parameter_size?: string } }) => ({
      name: m.name,
      size_bytes: m.size || 0,
      parameter_size: m.details?.parameter_size || "",
    }));
    const loaded = (psData.models || []).map((m: { name: string; details?: { parameter_size?: string } }) => ({
      name: m.name,
      parameter_size: m.details?.parameter_size || "",
    }));

    clearOllamaResolverCache(); // force fresh pick
    const autoPick = installed.length > 0 ? await resolveOllamaModel("auto", host) : null;

    return NextResponse.json({
      host,
      installed,
      loaded,
      auto_resolves_to: autoPick,
    });
  } catch (error) {
    console.error("GET /api/connections/ollama/models error:", error);
    return NextResponse.json({ error: "Failed to list models", details: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}
