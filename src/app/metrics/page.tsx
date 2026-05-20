"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface Metric {
  name: string;
  desc: string;
  rationale?: string;
}

interface Layer {
  id: string;
  label: string;
  metrics: Metric[];
}

interface TimelinePhase {
  phase: string;
  items: string[];
}

interface SummarySection {
  title: string;
  rows: [string, string][];
}

interface Attribution {
  label: string;
  pct: string;
}

interface FunnelStage {
  stage: string;
  count: string;
  rate: string;
}

interface MetricsData {
  businessName?: string;
  niche?: string;
  model?: string;
  layers: Layer[];
  timeline?: TimelinePhase[];
  summary?: SummarySection[];
  attributionModel?: Attribution[];
  funnel?: FunnelStage[];
}

const LAYER_STYLES = [
  { color: "#ff6b35", bg: "rgba(255,107,53,0.08)", border: "rgba(255,107,53,0.25)" },
  { color: "#e85d26", bg: "rgba(232,93,38,0.06)", border: "rgba(232,93,38,0.2)" },
  { color: "#c75020", bg: "rgba(199,80,32,0.05)", border: "rgba(199,80,32,0.18)" },
  { color: "#1a365d", bg: "rgba(26,54,93,0.06)", border: "rgba(26,54,93,0.2)" },
  { color: "#2a4a7f", bg: "rgba(42,74,127,0.05)", border: "rgba(42,74,127,0.18)" },
  { color: "#3b5998", bg: "rgba(59,89,152,0.05)", border: "rgba(59,89,152,0.15)" },
  { color: "#4a6fa5", bg: "rgba(74,111,165,0.05)", border: "rgba(74,111,165,0.15)" },
  { color: "#5a80b5", bg: "rgba(90,128,181,0.04)", border: "rgba(90,128,181,0.15)" },
  { color: "#6b92c7", bg: "rgba(107,146,199,0.04)", border: "rgba(107,146,199,0.12)" },
  { color: "#7ca3d4", bg: "rgba(124,163,212,0.04)", border: "rgba(124,163,212,0.12)" },
  { color: "#8db3e0", bg: "rgba(141,179,224,0.04)", border: "rgba(141,179,224,0.1)" },
  { color: "#555", bg: "rgba(85,85,85,0.04)", border: "rgba(85,85,85,0.12)" },
];

const SUMMARY_COLORS = ["#ff6b35", "#e85d26", "#1a365d", "#4a6fa5"];
const FUNNEL_COLORS = ["#1a365d", "#2a4a7f", "#3b5998", "#e85d26", "#ff6b35"];
const FUNNEL_WIDTHS = ["100%", "85%", "65%", "45%", "40%"];

const PRESETS = [
  "AI SaaS for solopreneurs",
  "Online fitness coaching",
  "B2B consulting agency",
  "E-commerce DTC brand",
  "Online course platform",
  "Mobile app (freemium)",
  "Real estate tech",
  "Healthcare SaaS",
  "Creator economy tool",
  "Local service marketplace",
];

interface IdeaSnapshot {
  search_volume: number;
  growth_rate: number;
  pain_level: number;
  feasibility: number;
  revenue_potential: number;
  overall: number;
}

export default function NicheMetricsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    }>
      <NicheMetricsPageInner />
    </Suspense>
  );
}

function NicheMetricsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialNiche = searchParams.get("niche") || "";
  const ideaId = searchParams.get("ideaId") || "";
  const [blueprintId, setBlueprintId] = useState<string | null>(null);

  const [niche, setNiche] = useState(initialNiche);
  const [data, setData] = useState<MetricsData | null>(null);
  const [ideaSnapshot, setIdeaSnapshot] = useState<IdeaSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [view, setView] = useState<"layers" | "timeline" | "summary">("layers");
  const [showRationale, setShowRationale] = useState(false);
  const [progress, setProgress] = useState(0);

  const generate = useCallback(async (input: string, linkedIdeaId?: string) => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    setIdeaSnapshot(null);
    setProgress(0);
    setView("layers");
    setActiveLayer(null);

    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 8, 92));
    }, 400);

    try {
      const payload: Record<string, string> = { niche: input.trim() };
      if (linkedIdeaId) payload.ideaId = linkedIdeaId;

      const response = await fetch("/api/metrics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      clearInterval(progressInterval);
      setProgress(95);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `API returned ${response.status}`);
      }

      if (!result.layers) {
        throw new Error("Could not parse metrics data from response");
      }

      setProgress(100);
      if (result.ideaSnapshot) {
        setIdeaSnapshot(result.ideaSnapshot as IdeaSnapshot);
      }
      if (result.blueprintId) {
        setBlueprintId(result.blueprintId as string);
      }
      setTimeout(() => {
        setData(result as MetricsData);
        setLoading(false);
      }, 300);
    } catch (err) {
      clearInterval(progressInterval);
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
      setLoading(false);
    }
  }, []);

  const totalMetrics = data?.layers ? data.layers.reduce((a, l) => a + (l.metrics?.length || 0), 0) : 0;

  return (
    <div style={{
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      background: "#0d1117",
      color: "#c9d1d9",
      minHeight: "100vh",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1a365d 0%, #0d1117 70%)",
        borderBottom: "1px solid rgba(255,107,53,0.3)",
        padding: "28px 24px 24px",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: "#ff6b35", boxShadow: "0 0 12px rgba(255,107,53,0.6)",
            }} />
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#ff6b35", letterSpacing: 2, textTransform: "uppercase" }}>
              AI Metrics Architect
            </span>
          </div>
          <h1 style={{ fontWeight: 700, fontSize: 26, color: "#fff", margin: "0 0 4px", lineHeight: 1.2 }}>
            Niche Metrics Blueprint Generator
          </h1>
          <p style={{ fontSize: 13, color: "#8b949e", margin: "0 0 20px", maxWidth: 600 }}>
            Enter any business niche and get a complete metrics architecture with realistic, industry-specific targets across 12 categories.
          </p>

          {/* Input */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={niche}
              onChange={e => setNiche(e.target.value)}
              onKeyDown={e => e.key === "Enter" && generate(niche)}
              placeholder="Describe your business niche (e.g., 'AI-powered meal planning app for busy parents')"
              disabled={loading}
              style={{
                flex: 1, padding: "12px 16px", borderRadius: 8,
                background: "rgba(22,27,34,0.9)",
                border: "1px solid rgba(48,54,61,0.8)",
                color: "#c9d1d9", fontSize: 14, outline: "none",
              }}
            />
            <button
              onClick={() => generate(niche, ideaId)}
              disabled={loading || !niche.trim()}
              style={{
                padding: "12px 24px", borderRadius: 8,
                background: loading ? "rgba(255,107,53,0.3)" : "#ff6b35",
                border: "none", color: "#fff",
                fontFamily: "monospace", fontSize: 12, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                letterSpacing: 0.5, whiteSpace: "nowrap",
                opacity: !niche.trim() ? 0.4 : 1,
              }}
            >
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>

          {/* Presets */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRESETS.map(p => (
              <button
                key={p}
                onClick={() => { setNiche(p); generate(p, ""); }}
                disabled={loading}
                style={{
                  padding: "5px 12px", borderRadius: 20,
                  background: "rgba(48,54,61,0.4)",
                  border: "1px solid rgba(48,54,61,0.6)",
                  color: "#8b949e", fontSize: 11,
                  fontFamily: "monospace",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
          <div style={{
            width: "100%", height: 4, background: "rgba(48,54,61,0.5)",
            borderRadius: 2, overflow: "hidden", marginBottom: 16,
          }}>
            <div style={{
              width: `${progress}%`, height: "100%",
              background: "linear-gradient(90deg, #ff6b35, #e85d26)",
              borderRadius: 2, transition: "width 0.4s ease",
            }} />
          </div>
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#8b949e" }}>
            {progress < 30 ? "Analyzing niche and industry benchmarks..." :
             progress < 60 ? "Calculating realistic conversion rates..." :
             progress < 85 ? "Building pricing tiers and funnel targets..." :
             "Finalizing metrics architecture..."}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          maxWidth: 960, margin: "20px auto", padding: "16px 24px",
          background: "rgba(248,81,73,0.1)", border: "1px solid rgba(248,81,73,0.3)",
          borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ color: "#f85149", fontFamily: "monospace", fontSize: 12 }}>{error}</span>
          <button onClick={() => generate(niche, ideaId)} style={{
            padding: "6px 16px", borderRadius: 6,
            background: "rgba(248,81,73,0.2)", border: "1px solid rgba(248,81,73,0.4)",
            color: "#f85149", fontFamily: "monospace", fontSize: 11, cursor: "pointer",
          }}>Retry</button>
        </div>
      )}

      {/* Data */}
      {data && !loading && (
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px" }}>
          {/* Badge */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                padding: "6px 14px", borderRadius: 20,
                background: "rgba(255,107,53,0.15)", border: "1px solid rgba(255,107,53,0.3)",
                fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "#ff6b35",
              }}>{data.businessName || data.niche}</div>
              <span style={{
                padding: "4px 10px", borderRadius: 12, background: "rgba(48,54,61,0.5)",
                fontFamily: "monospace", fontSize: 10, color: "#8b949e",
              }}>{data.model || "SaaS"}</span>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#484f58" }}>
                {data.layers.length} layers - {totalMetrics} metrics
              </span>
            </div>
            <button onClick={() => setShowRationale(!showRationale)} style={{
              padding: "6px 14px", borderRadius: 6,
              background: showRationale ? "rgba(255,107,53,0.15)" : "rgba(48,54,61,0.4)",
              border: `1px solid ${showRationale ? "rgba(255,107,53,0.3)" : "rgba(48,54,61,0.6)"}`,
              color: showRationale ? "#ff6b35" : "#8b949e",
              fontFamily: "monospace", fontSize: 11, cursor: "pointer",
            }}>{showRationale ? "Hide" : "Show"} Rationale</button>
          </div>

          {/* Idea Snapshot — scores derived from the framework */}
          {ideaSnapshot && (
            <div style={{
              background: "rgba(22,27,34,0.8)", border: "1px solid rgba(255,107,53,0.3)",
              borderRadius: 12, padding: 20, marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#ff6b35", letterSpacing: 1.5 }}>
                  IDEA SNAPSHOT {ideaId ? "(Scores saved to idea)" : ""}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#ff6b35" }}>
                  {ideaSnapshot.overall}/100
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {([
                  { label: "Search Volume", value: ideaSnapshot.search_volume, color: "#4a6fa5" },
                  { label: "Growth Rate", value: ideaSnapshot.growth_rate, color: "#10b981" },
                  { label: "Pain Level", value: ideaSnapshot.pain_level, color: "#e85d26" },
                  { label: "Feasibility", value: ideaSnapshot.feasibility, color: "#8b5cf6" },
                  { label: "Revenue", value: ideaSnapshot.revenue_potential, color: "#ff6b35" },
                ] as const).map((m) => (
                  <div key={m.label} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: m.color }}>{m.value}</div>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(48,54,61,0.5)", marginTop: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${m.value}%`, background: m.color, borderRadius: 2 }} />
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 9, color: "#8b949e", marginTop: 4 }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
            {([
              { key: "layers" as const, label: "Metric Layers" },
              { key: "timeline" as const, label: "Timeline View" },
              { key: "summary" as const, label: "Quick Reference" },
            ]).map(t => (
              <button key={t.key} onClick={() => setView(t.key)} style={{
                fontFamily: "monospace", fontSize: 11, padding: "8px 16px",
                border: `1px solid ${view === t.key ? "#ff6b35" : "rgba(139,148,158,0.3)"}`,
                background: view === t.key ? "rgba(255,107,53,0.15)" : "transparent",
                color: view === t.key ? "#ff6b35" : "#8b949e",
                borderRadius: 6, cursor: "pointer", letterSpacing: 0.5,
              }}>{t.label}</button>
            ))}
          </div>

          {/* LAYERS VIEW */}
          {view === "layers" && (
            <div>
              {(data.layers || []).map((layer, li) => {
                const s = LAYER_STYLES[li] || LAYER_STYLES[LAYER_STYLES.length - 1];
                const isOpen = activeLayer === layer.id;
                return (
                  <div key={layer.id} style={{ marginBottom: 8 }}>
                    <button
                      onClick={() => setActiveLayer(isOpen ? null : layer.id)}
                      style={{
                        width: "100%", textAlign: "left", cursor: "pointer",
                        background: isOpen ? s.bg : "rgba(22,27,34,0.8)",
                        border: `1px solid ${isOpen ? s.border : "rgba(48,54,61,0.8)"}`,
                        borderRadius: isOpen ? "10px 10px 0 0" : 10,
                        padding: "14px 20px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, boxShadow: isOpen ? `0 0 8px ${s.color}60` : "none" }} />
                        <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: isOpen ? s.color : "#c9d1d9", letterSpacing: 1 }}>{layer.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#8b949e", background: "rgba(48,54,61,0.6)", padding: "2px 8px", borderRadius: 4 }}>{layer.metrics.length}</span>
                        <span style={{ color: "#8b949e", fontSize: 14, transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "none" }}>&#9662;</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "4px 8px 8px" }}>
                        {layer.metrics.map((m, i) => (
                          <div key={i} style={{ padding: "12px 14px", borderBottom: i < layer.metrics.length - 1 ? `1px solid ${s.border}` : "none" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
                              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: s.color, minWidth: 160 }}>{m.name}</span>
                              <span style={{ fontSize: 13, color: "#c9d1d9", flex: 1 }}>{m.desc}</span>
                            </div>
                            {showRationale && m.rationale && (
                              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(48,54,61,0.3)", borderRadius: 6, fontSize: 12, color: "#8b949e", lineHeight: 1.5, borderLeft: `2px solid ${s.color}40` }}>
                                {m.rationale}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TIMELINE VIEW */}
          {view === "timeline" && (
            <div>
              <div style={{ position: "relative", paddingLeft: 28 }}>
                <div style={{ position: "absolute", left: 11, top: 8, bottom: 8, width: 2, background: "linear-gradient(to bottom, #ff6b35, #1a365d)", borderRadius: 1 }} />
                {(data.timeline || []).map((t, ti) => (
                  <div key={ti} style={{ marginBottom: 32, position: "relative" }}>
                    <div style={{
                      position: "absolute", left: -22, top: 4, width: 12, height: 12, borderRadius: "50%",
                      background: ti === 0 ? "#ff6b35" : ti === 1 ? "#c75020" : "#1a365d",
                      border: "2px solid #0d1117",
                      boxShadow: `0 0 8px ${ti === 0 ? "rgba(255,107,53,0.4)" : "rgba(26,54,93,0.3)"}`,
                    }} />
                    <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: ti === 0 ? "#ff6b35" : ti === 1 ? "#e85d26" : "#4a6fa5", marginBottom: 12, letterSpacing: 0.5 }}>{t.phase}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                      {(t.items || []).map((item, ii) => (
                        <div key={ii} style={{ background: "rgba(22,27,34,0.8)", border: "1px solid rgba(48,54,61,0.8)", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#c9d1d9" }}>{item}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Funnel */}
              {data.funnel && (
                <div style={{ marginTop: 32, background: "rgba(22,27,34,0.8)", border: "1px solid rgba(48,54,61,0.8)", borderRadius: 12, padding: 24 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "#ff6b35", marginBottom: 16, letterSpacing: 1 }}>CONVERSION FUNNEL (Target Rates)</div>
                  {data.funnel.map((f, i) => (
                    <div key={i} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: FUNNEL_WIDTHS[i] || "50%", height: 32, borderRadius: 6,
                        background: `linear-gradient(90deg, ${FUNNEL_COLORS[i] || "#555"}, ${FUNNEL_COLORS[i] || "#555"}80)`,
                        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", minWidth: 200,
                      }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#fff", fontWeight: 600 }}>{f.stage}</span>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.8)" }}>{f.count}</span>
                      </div>
                      <span style={{ fontFamily: "monospace", fontSize: 10, color: "#8b949e", whiteSpace: "nowrap" }}>{f.rate}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUMMARY VIEW */}
          {view === "summary" && (
            <div>
              {(data.summary || []).map((section, si) => (
                <div key={si} style={{ background: "rgba(22,27,34,0.8)", border: "1px solid rgba(48,54,61,0.8)", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(48,54,61,0.8)", background: `linear-gradient(90deg, ${SUMMARY_COLORS[si] || "#555"}15, transparent)` }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: SUMMARY_COLORS[si] || "#8b949e", letterSpacing: 1.5 }}>{section.title}</span>
                  </div>
                  <div style={{ padding: "4px 0" }}>
                    {(section.rows || []).map((row, ri) => (
                      <div key={ri} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderBottom: ri < section.rows.length - 1 ? "1px solid rgba(48,54,61,0.4)" : "none" }}>
                        <span style={{ fontSize: 13, color: "#c9d1d9" }}>{row[0]}</span>
                        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: SUMMARY_COLORS[si] || "#8b949e" }}>{row[1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Attribution */}
              {data.attributionModel && (
                <div style={{ background: "rgba(22,27,34,0.8)", border: "1px solid rgba(48,54,61,0.8)", borderRadius: 12, padding: 20, marginTop: 8 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#8b949e", letterSpacing: 1.5, marginBottom: 12 }}>ATTRIBUTION MODEL</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {data.attributionModel.map((a, i) => (
                      <div key={i} style={{
                        flex: parseInt(a.pct) <= 20 ? 1 : 2,
                        background: `${["#ff6b35", "#e85d26", "#1a365d"][i] || "#555"}20`,
                        border: `1px solid ${["#ff6b35", "#e85d26", "#1a365d"][i] || "#555"}40`,
                        borderRadius: 8, padding: "12px 16px", textAlign: "center",
                      }}>
                        <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: ["#ff6b35", "#e85d26", "#1a365d"][i] || "#8b949e" }}>{a.pct}</div>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#8b949e", marginTop: 2 }}>{a.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Execute Blueprint CTA */}
          {blueprintId && (
            <div style={{
              marginTop: 24, padding: 20,
              background: "linear-gradient(135deg, rgba(255,107,53,0.15), rgba(232,93,38,0.1))",
              border: "1px solid rgba(255,107,53,0.3)", borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ff6b35", marginBottom: 4 }}>
                  Blueprint saved. Ready to execute.
                </div>
                <div style={{ fontSize: 12, color: "#8b949e" }}>
                  Execute all 12 layers to generate ads, emails, content, SEO, pricing pages, and more.
                </div>
              </div>
              <button
                onClick={() => router.push(`/blueprint/${blueprintId}`)}
                style={{
                  padding: "10px 24px", borderRadius: 8,
                  background: "#ff6b35", border: "none", color: "#fff",
                  fontFamily: "monospace", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                ▶ Go to Blueprint Dashboard
              </button>
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 32, padding: "16px 0", borderTop: "1px solid rgba(48,54,61,0.5)", fontFamily: "monospace", fontSize: 10, color: "#484f58", display: "flex", justifyContent: "space-between" }}>
            <span>Generated for: {data.niche || niche} - {data.model || "SaaS"} model - {totalMetrics} metrics</span>
            <span>AI Metrics Architect</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!data && !loading && !error && (
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "60px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>&#9678;</div>
          <p style={{ fontFamily: "monospace", fontSize: 13, color: "#484f58", maxWidth: 400, margin: "0 auto" }}>
            Enter a business niche above or pick a preset to generate your complete metrics blueprint
          </p>
        </div>
      )}
    </div>
  );
}
