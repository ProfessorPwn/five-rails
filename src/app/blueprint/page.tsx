"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Blueprint {
  id: string;
  niche: string;
  status: string;
  project_id: string | null;
  idea_id: string | null;
  layer_status: string;
  created_at: string;
}

export default function BlueprintsPage() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/blueprints")
      .then((r) => r.json())
      .then(setBlueprints)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#e2e8f0]">Blueprints</h1>
            <p className="text-sm text-[#8b949e] mt-1">
              Your business execution blueprints — each one generates all the content, ads, emails, and strategy you need.
            </p>
          </div>
          <Link
            href="/metrics"
            className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700"
          >
            + New Blueprint
          </Link>
        </div>

        {blueprints.length === 0 ? (
          <div className="text-center py-16 bg-[#161b22] rounded-2xl border border-[#30363d]">
            <div className="text-4xl mb-4 opacity-30">◎</div>
            <p className="text-[#8b949e] mb-4">No blueprints yet.</p>
            <Link href="/metrics" className="text-orange-600 hover:text-orange-700 text-sm font-medium">
              Generate your first Metrics Blueprint →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {blueprints.map((bp) => {
              const layerStatus = JSON.parse(bp.layer_status || "{}");
              const completedLayers = Object.values(layerStatus).filter(
                (s) => (s as { status: string }).status === "completed"
              ).length;
              const totalLayers = 12;

              return (
                <Link
                  key={bp.id}
                  href={`/blueprint/${bp.id}`}
                  className="bg-[#161b22] rounded-xl border border-[#30363d] p-5 hover:shadow-md hover:border-gray-300 transition-all group"
                >
                  <h3 className="text-sm font-bold text-[#e2e8f0] mb-1 group-hover:text-orange-600 transition-colors">
                    {bp.niche}
                  </h3>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      bp.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                      bp.status === "executing" ? "bg-amber-50 text-amber-700" :
                      "bg-gray-100 text-[#8b949e]"
                    }`}>
                      {bp.status}
                    </span>
                    <span className="text-[10px] text-[#484f58]">
                      {completedLayers}/{totalLayers} layers
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full"
                      style={{ width: `${(completedLayers / totalLayers) * 100}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-[#484f58]">
                    {new Date(bp.created_at).toLocaleDateString()}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
