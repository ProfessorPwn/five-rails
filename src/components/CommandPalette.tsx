"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  url: string;
}

const TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  project: { color: "#3b82f6", label: "Project" },
  contact: { color: "#10b981", label: "Contact" },
  content: { color: "#8b5cf6", label: "Content" },
  deal: { color: "#10b981", label: "Deal" },
  idea: { color: "#f59e0b", label: "Idea" },
  skill: { color: "#06b6d4", label: "Skill" },
  agent: { color: "#ef4444", label: "Agent" },
  newsletter: { color: "#ec4899", label: "Newsletter" },
  blueprint: { color: "#14b8a6", label: "Blueprint" },
};

const QUICK_ACTIONS = [
  { label: "Create Project", url: "/projects", icon: "+" },
  { label: "Run All Agents", url: "__run_agents__", icon: "\u25B6" },
  { label: "Open Settings", url: "/settings", icon: "\u2699" },
  { label: "View Pipeline", url: "/pipeline", icon: "\u2261" },
  { label: "Browse Ideas", url: "/ideabrowser", icon: "\u2605" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();

  // Cmd+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Auto-focus on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
    }
  }, [open]);

  // Debounced search
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`);
        const data = await res.json();
        setResults(data.results || []);
        setSelectedIdx(0);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    search(val);
  };

  const handleSelect = async (url: string) => {
    setOpen(false);
    if (url === "__run_agents__") {
      await fetch("/api/agents/run-all", { method: "POST" });
      return;
    }
    router.push(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = query.length < 2 ? QUICK_ACTIONS : results;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && items.length > 0) {
      e.preventDefault();
      if (query.length < 2) {
        handleSelect(QUICK_ACTIONS[selectedIdx]?.url || "/");
      } else {
        handleSelect(results[selectedIdx]?.url || "/");
      }
    }
  };

  if (!open) return null;

  const showQuickActions = query.length < 2;

  // Group results by type
  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  }

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-[#141822] border border-[#1e293b] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e293b]">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-[#64748b] shrink-0">
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, contacts, content, ideas..."
            className="flex-1 bg-transparent text-sm text-white placeholder-[#484f58] outline-none"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          )}
          <kbd className="text-[10px] text-[#484f58] border border-[#1e293b] rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {showQuickActions ? (
            <div className="p-2">
              <div className="text-[10px] text-[#484f58] uppercase tracking-wider px-3 py-1.5">Quick Actions</div>
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={action.label}
                  onClick={() => handleSelect(action.url)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                    selectedIdx === i ? "bg-amber-500/10 border-l-2 border-amber-500" : "hover:bg-[#1e293b]/50"
                  }`}
                >
                  <span className="w-6 h-6 rounded bg-[#1e293b] flex items-center justify-center text-xs text-[#94a3b8]">
                    {action.icon}
                  </span>
                  <span className="text-sm text-[#e2e8f0]">{action.label}</span>
                </button>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="p-2">
              {Object.entries(grouped).map(([type, items]) => {
                const config = TYPE_CONFIG[type] || { color: "#64748b", label: type };
                return (
                  <div key={type}>
                    <div className="text-[10px] uppercase tracking-wider px-3 py-1.5" style={{ color: config.color }}>
                      {config.label}s
                    </div>
                    {items.map((result) => {
                      const idx = globalIdx++;
                      return (
                        <button
                          key={result.id}
                          onClick={() => handleSelect(result.url)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                            selectedIdx === idx ? "bg-amber-500/10 border-l-2 border-amber-500" : "hover:bg-[#1e293b]/50"
                          }`}
                        >
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: config.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-[#e2e8f0] truncate">{result.title}</div>
                            {result.subtitle && (
                              <div className="text-[11px] text-[#64748b] truncate">{result.subtitle}</div>
                            )}
                          </div>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#484f58] shrink-0">
                            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : query.length >= 2 && !loading ? (
            <div className="p-8 text-center text-sm text-[#484f58]">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-[#1e293b] px-4 py-2 flex items-center justify-between">
          <div className="flex gap-3 text-[10px] text-[#484f58]">
            <span><kbd className="border border-[#1e293b] rounded px-1">↑↓</kbd> Navigate</span>
            <span><kbd className="border border-[#1e293b] rounded px-1">↵</kbd> Open</span>
          </div>
          <div className="text-[10px] text-[#484f58]">
            <kbd className="border border-[#1e293b] rounded px-1">⌘K</kbd> Toggle
          </div>
        </div>
      </div>
    </div>
  );
}
