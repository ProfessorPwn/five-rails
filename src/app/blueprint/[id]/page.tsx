"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface LayerStatus {
  status: string;
  items: number;
  executed_at?: string;
}

interface Layer {
  id: string;
  label: string;
  metrics: Array<{ name: string; desc: string; rationale?: string }>;
}

interface BlueprintData {
  id: string;
  niche: string;
  status: string;
  project_id: string | null;
  idea_id: string | null;
  created_at: string;
  data: {
    businessName?: string;
    model?: string;
    layers: Layer[];
    funnel?: Array<{ stage: string; count: string; rate: string }>;
    timeline?: Array<{ phase: string; items: string[] }>;
  };
  layer_status: Record<string, LayerStatus>;
}

const LAYER_ICONS: Record<string, string> = {
  "north-star": "★", revenue: "$", "pricing-tiers": "◆", acquisition: "◎",
  traffic: "↗", content: "✎", email: "✉", paid: "▶",
  seo: "⚡", product: "♥", attribution: "⊕", budget: "⚖",
};

const LAYER_COLORS: Record<string, string> = {
  "north-star": "#ff6b35", revenue: "#e85d26", "pricing-tiers": "#c75020",
  acquisition: "#1a365d", traffic: "#2a4a7f", content: "#3b5998",
  email: "#4a6fa5", paid: "#5a80b5", seo: "#6b92c7",
  product: "#10b981", attribution: "#8b5cf6", budget: "#64748b",
};

export default function BlueprintDashboard() {
  const params = useParams();
  const id = params.id as string;
  const [blueprint, setBlueprint] = useState<BlueprintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [executingAll, setExecutingAll] = useState(false);
  const [results, setResults] = useState<Record<string, { content_id?: string; summary?: string; error?: string }>>({});

  const fetchBlueprint = useCallback(async () => {
    const res = await fetch(`/api/blueprints/${id}`);
    if (res.ok) {
      setBlueprint(await res.json());
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchBlueprint(); }, [fetchBlueprint]);

  const executeLayer = async (layerId: string) => {
    setExecuting(layerId);
    try {
      const res = await fetch(`/api/blueprints/${id}/execute-layer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layerId }),
      });
      const data = await res.json();
      setResults(prev => ({ ...prev, [layerId]: data }));
      await fetchBlueprint();
    } catch (err) {
      setResults(prev => ({
        ...prev,
        [layerId]: { error: err instanceof Error ? err.message : "Failed" },
      }));
    }
    setExecuting(null);
  };

  const executeAll = async () => {
    setExecutingAll(true);
    try {
      const res = await fetch(`/api/blueprints/${id}/execute-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.results) {
        const newResults: typeof results = {};
        for (const r of data.results) {
          newResults[r.layer_id] = r;
        }
        setResults(newResults);
      }
      await fetchBlueprint();
    } catch { /* ignore */ }
    setExecutingAll(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!blueprint) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <p className="text-[#8b949e]">Blueprint not found</p>
      </div>
    );
  }

  const layers = blueprint.data.layers || [];
  const completedCount = Object.values(blueprint.layer_status).filter(s => s.status === "completed").length;
  const progress = layers.length > 0 ? Math.round((completedCount / layers.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-transparent">
      {/* Header */}
      <div className="bg-[#161b22] border-b border-[#30363d] px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-[#484f58] mb-2">
            <Link href="/metrics" className="hover:text-[#8b949e]">Metrics</Link>
            <span>/</span>
            <span className="text-[#c9d1d9]">Blueprint</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#e2e8f0]">{blueprint.data.businessName || blueprint.niche}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-medium">
                  {blueprint.data.model || "SaaS"}
                </span>
                <span className="text-xs text-[#484f58]">
                  {layers.length} layers &middot; {completedCount} executed
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  blueprint.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                  blueprint.status === "executing" ? "bg-amber-50 text-amber-700" :
                  "bg-[#21262d] text-[#8b949e]"
                }`}>
                  {blueprint.status}
                </span>
              </div>
            </div>
            <button
              onClick={executeAll}
              disabled={executingAll || executing !== null}
              className="px-5 py-2.5 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {executingAll ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Executing All...
                </>
              ) : (
                <>
                  ▶ Execute All Layers
                </>
              )}
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-2 bg-[#21262d] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Layer Grid */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {layers.map((layer) => {
            const status = blueprint.layer_status[layer.id];
            const isCompleted = status?.status === "completed";
            const isExecuting = executing === layer.id || status?.status === "executing";
            const result = results[layer.id];
            const color = LAYER_COLORS[layer.id] || "#64748b";

            return (
              <div
                key={layer.id}
                className={`bg-[#161b22] rounded-xl border p-5 transition-all ${
                  isCompleted ? "border-emerald-200 bg-emerald-50/30" :
                  isExecuting ? "border-amber-200 bg-amber-50/30" :
                  "border-[#30363d] hover:border-[#484f58] hover:shadow-sm"
                }`}
              >
                {/* Layer header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-lg" style={{ color }}>{LAYER_ICONS[layer.id] || "◯"}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[#e2e8f0] truncate">{layer.label}</h3>
                    <span className="text-[10px] text-[#484f58]">{layer.metrics.length} metrics</span>
                  </div>
                  {isCompleted && <span className="text-emerald-500 text-lg">✓</span>}
                </div>

                {/* Metrics preview */}
                <div className="space-y-1 mb-4">
                  {layer.metrics.slice(0, 3).map((m, i) => (
                    <div key={i} className="text-[11px] text-[#8b949e] truncate">
                      <span className="font-medium text-[#c9d1d9]">{m.name}</span> — {m.desc}
                    </div>
                  ))}
                  {layer.metrics.length > 3 && (
                    <div className="text-[10px] text-[#484f58]">+{layer.metrics.length - 3} more</div>
                  )}
                </div>

                {/* Result preview */}
                {result?.summary && (
                  <div className="text-[11px] text-[#8b949e] bg-transparent rounded-lg p-2 mb-3 line-clamp-3">
                    {result.summary}
                  </div>
                )}
                {result?.error && (
                  <div className="text-[11px] text-red-500 bg-red-50 rounded-lg p-2 mb-3">
                    {result.error}
                  </div>
                )}

                {/* Execute button */}
                <button
                  onClick={() => executeLayer(layer.id)}
                  disabled={isExecuting || executingAll}
                  className={`w-full py-2 text-xs font-medium rounded-lg transition-all ${
                    isCompleted
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                      : isExecuting
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-indigo-600 text-white hover:bg-gray-800"
                  }`}
                >
                  {isExecuting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-3 h-3 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                      Generating...
                    </span>
                  ) : isCompleted ? (
                    "Re-execute"
                  ) : (
                    "Execute"
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Funnel visualization */}
        {blueprint.data.funnel && blueprint.data.funnel.length > 0 && (
          <div className="mt-8 bg-[#161b22] rounded-xl border border-[#30363d] p-6">
            <h3 className="text-sm font-bold text-[#e2e8f0] mb-4">Conversion Funnel</h3>
            <div className="space-y-2">
              {blueprint.data.funnel.map((f, i) => {
                const widths = ["100%", "85%", "65%", "45%", "40%"];
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="h-8 rounded-md flex items-center justify-between px-4 text-white text-xs font-medium"
                      style={{
                        width: widths[i] || "40%",
                        backgroundColor: ["#1a365d", "#2a4a7f", "#3b5998", "#e85d26", "#ff6b35"][i] || "#555",
                      }}
                    >
                      <span>{f.stage}</span>
                      <span className="opacity-80">{f.count}</span>
                    </div>
                    <span className="text-[10px] text-[#484f58] whitespace-nowrap">{f.rate}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
