"use client";

import { useEffect, useState, useMemo } from "react";

interface LibraryItem {
  id: string;
  source: string;
  type: string;
  title: string;
  preview: string;
  body_text?: string;
  project_id: string | null;
  project_name: string | null;
  status: string | null;
  agent: string | null;
  created_at: string;
  updated_at?: string | null;
  platform?: string | null;
  url?: string | null;
  download_url?: string | null;
  size_bytes?: number;
}

interface LibraryResponse {
  items: LibraryItem[];
  total: number;
  counts: Record<string, number>;
}

const TABS: Array<{ key: string; label: string }> = [
  { key: "all",        label: "All" },
  { key: "report",     label: "Reports" },
  { key: "landing",    label: "Landing Pages" },
  { key: "email",      label: "Emails" },
  { key: "ad",         label: "Ads" },
  { key: "social",     label: "Social" },
  { key: "newsletter", label: "Newsletters" },
  { key: "research",   label: "Research" },
];

const TYPE_COLORS: Record<string, string> = {
  "PDF Report":     "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "Landing Page":   "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Email":          "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  "Ad":             "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Ad Campaign":    "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Social Post":    "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Newsletter":     "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "Research":       "bg-teal-500/15 text-teal-300 border-teal-500/30",
  "Lead Magnet":    "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  "Script":         "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

export default function LibraryPage() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<LibraryItem | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tab !== "all") params.set("type", tab);
    setLoading(true);
    fetch(`/api/library?${params}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [tab]);

  const items = useMemo(() => {
    if (!data?.items) return [];
    if (!q.trim()) return data.items;
    const needle = q.toLowerCase();
    return data.items.filter(i =>
      i.title.toLowerCase().includes(needle)
      || i.preview.toLowerCase().includes(needle)
      || (i.body_text || "").toLowerCase().includes(needle)
    );
  }, [data, q]);

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Library</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Everything the agents have produced — reports, landing pages, emails, ads, social posts, research.
            Click any item to preview the full output. Reuse them as templates for new projects.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {TABS.map(t => {
            const count = data?.counts?.[t.key] ?? 0;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  active
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                    : "bg-[#141822] text-[#94a3b8] border-[#1e293b]/50 hover:border-[#334155]"
                }`}
              >
                {t.label} <span className="ml-1 text-[10px] text-[#64748b]">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search titles, content, project names..."
          className="w-full mb-5 px-3 py-2 bg-[#141822] border border-[#1e293b]/50 rounded-lg text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-amber-500/50"
        />

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-center py-16 text-[#484f58] text-sm bg-[#141822] rounded-2xl border border-[#1e293b]/30">
            Nothing in this category yet. Agents will fill this page as they work.
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => {
            const color = TYPE_COLORS[item.type] || "bg-gray-500/15 text-gray-300 border-gray-500/30";
            return (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="text-left p-4 bg-[#141822] border border-[#1e293b]/40 rounded-xl hover:border-[#334155] transition-colors group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${color}`}>
                    {item.type}
                  </span>
                  {item.status && (
                    <span className="text-[10px] text-[#64748b]">{item.status}</span>
                  )}
                  {item.platform && (
                    <span className="text-[10px] text-[#64748b]">· {item.platform}</span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-[#e2e8f0] mb-1 line-clamp-2 group-hover:text-white">
                  {item.title}
                </h3>
                <p className="text-xs text-[#94a3b8] line-clamp-2 mb-3">{item.preview}</p>
                <div className="flex items-center justify-between text-[10px] text-[#64748b]">
                  <span>{timeAgo(item.created_at)}</span>
                  {item.project_name && <span className="truncate max-w-[50%]">{item.project_name}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail drawer */}
      {selected && <DetailDrawer item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DetailDrawer({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  const color = TYPE_COLORS[item.type] || "bg-gray-500/15 text-gray-300 border-gray-500/30";
  const isPdf = item.source === "pdf_report";

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={e => e.stopPropagation()}
        className="relative ml-auto h-full w-full max-w-3xl bg-[#0a0c14] border-l border-[#1e293b] overflow-y-auto"
      >
        <div className="sticky top-0 bg-[#0a0c14] border-b border-[#1e293b]/40 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>{item.type}</span>
            {item.project_name && <span className="text-xs text-[#64748b]">{item.project_name}</span>}
          </div>
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-6">
          <h2 className="text-xl font-bold text-white mb-2">{item.title}</h2>
          <div className="flex items-center gap-3 text-xs text-[#64748b] mb-6">
            <span>Created {new Date(item.created_at).toLocaleString()}</span>
            {item.agent && <span>· {item.agent.replace("agent-", "")}</span>}
            {item.size_bytes && <span>· {Math.round(item.size_bytes / 1024)} KB</span>}
          </div>

          <div className="flex gap-2 mb-6">
            {item.download_url && (
              <a
                href={item.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/25"
              >
                Download
              </a>
            )}
            {item.url && !isPdf && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-xs bg-sky-500/15 text-sky-300 border border-sky-500/30 rounded-lg hover:bg-sky-500/25"
              >
                Open live
              </a>
            )}
            <button
              onClick={() => {
                navigator.clipboard.writeText(item.body_text || item.preview || "");
              }}
              className="px-4 py-2 text-xs bg-[#141822] border border-[#1e293b]/50 rounded-lg text-[#94a3b8] hover:text-white"
            >
              Copy text
            </button>
          </div>

          {/* Content preview */}
          {isPdf && item.download_url && (
            <iframe
              src={item.download_url}
              className="w-full h-[70vh] rounded-lg border border-[#1e293b]/50 bg-white"
              title={item.title}
            />
          )}
          {!isPdf && item.body_text && (
            <div className="bg-[#141822] border border-[#1e293b]/40 rounded-xl p-5">
              <pre className="text-xs text-[#cbd5e1] whitespace-pre-wrap font-mono leading-relaxed">
                {item.body_text}
              </pre>
            </div>
          )}
          {!isPdf && !item.body_text && (
            <div className="text-xs text-[#64748b] italic">No inline preview available.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().split("T")[0];
}
