"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

interface Fix {
  id: string;
  gap_id: string | null;
  status: "pending" | "applied" | "rejected" | "rolled_back" | "failed";
  mode: "auto" | "review";
  title: string;
  gap_text: string | null;
  proposed_fix_text: string | null;
  llm_reasoning: string | null;
  files_touched: string[];
  diff: string;
  diff_lines: number;
  typecheck_ok: boolean;
  smoke_ok: boolean | null;
  git_commit: string | null;
  error: string | null;
  created_at: string;
  applied_at: string | null;
  rolled_back_at: string | null;
}

interface Settings {
  enabled: boolean;
  threshold: number;
  daily_cap: number;
  today_count: number;
  consecutive_failures: number;
}

interface Counts {
  pending: number;
  applied: number;
  rolled_back: number;
  failed: number;
  rejected: number;
}

const STATUS_CLASSES: Record<string, string> = {
  pending:     "bg-amber-500/15 text-amber-300 border-amber-500/30",
  applied:     "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected:    "bg-slate-500/15 text-slate-300 border-slate-500/30",
  rolled_back: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  failed:      "bg-rose-600/20 text-rose-300 border-rose-500/40",
};

export default function WatchdogFixesPage() {
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Fix | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === "all" ? "/api/agents/watchdog/fixes" : `/api/agents/watchdog/fixes?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      setFixes(data.fixes || []);
      setSettings(data.settings || null);
      setCounts(data.counts || null);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function action(payload: Record<string, unknown>, fixId?: string) {
    setBusy(fixId || "global");
    try {
      const res = await fetch("/api/agents/watchdog/fixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(`Failed: ${data.error || res.status}`);
      }
      await load();
      return data;
    } finally {
      setBusy(null);
    }
  }

  async function toggleEnabled() {
    if (!settings) return;
    if (!settings.enabled) {
      const ok = confirm(
        "Arm the watchdog coder?\n\nWhen armed, it will:\n• Read code-level gaps reported by agents\n• Spawn Claude CLI with file-edit access in a git worktree\n• Auto-apply patches under " +
        settings.threshold + " lines that pass typecheck and smoke check\n• Queue larger patches here for your review\n\nThe path allowlist is enforced. The coder cannot edit auth, payment, or its own infrastructure files. Auto-disables after 2 consecutive failures."
      );
      if (!ok) return;
    }
    await action({ action: "set_enabled", enabled: !settings.enabled });
  }

  return (
    <div className="min-h-screen bg-[#0a0c14] text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Watchdog Coder — Fixes</h1>
          <p className="text-sm text-[#94a3b8] max-w-2xl">
            Autonomous code-fix queue. Code-level capability gaps trigger a Claude CLI session in
            an isolated git worktree. Patches under the auto-apply threshold land directly with a
            commit + smoke check; larger patches queue here for review.
          </p>
        </header>

        {/* Header bar */}
        {settings && (
          <div className="mb-6 grid md:grid-cols-2 gap-3">
            <div className={`p-4 border rounded-xl ${settings.enabled ? "bg-emerald-500/10 border-emerald-500/40" : "bg-[#141822] border-[#1e293b]"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[#64748b]">Coder</div>
                  <div className="text-lg font-semibold">{settings.enabled ? "ARMED" : "Disarmed"}</div>
                  {settings.consecutive_failures > 0 && (
                    <div className="text-[10px] text-rose-400 mt-1">{settings.consecutive_failures} consecutive failures</div>
                  )}
                </div>
                <button
                  onClick={toggleEnabled}
                  disabled={busy === "global"}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                    settings.enabled
                      ? "bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25"
                      : "bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-400"
                  }`}
                >
                  {settings.enabled ? "Disable" : "Arm coder"}
                </button>
              </div>
            </div>
            <div className="p-4 bg-[#141822] border border-[#1e293b] rounded-xl">
              <div className="text-[10px] uppercase tracking-wide text-[#64748b]">Today / Cap</div>
              <div className="text-lg font-semibold">{settings.today_count} / {settings.daily_cap}</div>
              <div className="text-[10px] text-[#64748b] mt-1">Auto-apply threshold: ≤ {settings.threshold} lines</div>
            </div>
          </div>
        )}

        {/* Counts strip */}
        {counts && (
          <div className="mb-6 flex flex-wrap gap-2">
            {(["pending", "applied", "failed", "rolled_back", "rejected"] as const).map(k => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                  filter === k
                    ? STATUS_CLASSES[k]
                    : "bg-[#141822] border-[#1e293b] text-[#94a3b8] hover:border-[#475569]"
                }`}
              >
                {k.replace("_", " ")} ({counts[k] ?? 0})
              </button>
            ))}
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                filter === "all"
                  ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                  : "bg-[#141822] border-[#1e293b] text-[#94a3b8] hover:border-[#475569]"
              }`}
            >
              all
            </button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <p className="text-[#64748b] text-sm">Loading…</p>
        ) : fixes.length === 0 ? (
          <p className="text-[#64748b] text-sm">No fixes yet.</p>
        ) : (
          <ul className="space-y-2">
            {fixes.map(fix => (
              <li
                key={fix.id}
                onClick={() => setSelected(fix)}
                className="cursor-pointer p-4 bg-[#141822] border border-[#1e293b]/40 rounded-xl hover:border-[#475569] transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_CLASSES[fix.status]}`}>
                        {fix.status.replace("_", " ")}
                      </span>
                      <span className="text-[10px] text-[#64748b]">{fix.mode}</span>
                      <span className="text-[10px] text-[#64748b]">{fix.diff_lines} lines</span>
                      {fix.git_commit && (
                        <span className="text-[10px] font-mono text-[#94a3b8]">{fix.git_commit.slice(0, 7)}</span>
                      )}
                    </div>
                    <div className="text-sm font-medium truncate">{fix.title}</div>
                    <div className="text-[11px] text-[#64748b] mt-1">
                      {fix.files_touched.length} file{fix.files_touched.length !== 1 ? "s" : ""} · {new Date(fix.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <FixDrawer
          fix={selected}
          onClose={() => setSelected(null)}
          onAction={async (a, payload) => {
            const res = await action({ action: a, fix_id: selected.id, ...payload }, selected.id);
            if (res?.ok || res?.applied) setSelected(null);
          }}
          busy={busy === selected.id}
        />
      )}
    </div>
  );
}

function FixDrawer({
  fix,
  onClose,
  onAction,
  busy,
}: {
  fix: Fix;
  onClose: () => void;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={e => e.stopPropagation()}
        className="relative ml-auto h-full w-full max-w-3xl bg-[#0a0c14] border-l border-[#1e293b] overflow-y-auto"
      >
        <div className="sticky top-0 bg-[#0a0c14] border-b border-[#1e293b]/40 px-6 py-4 flex items-center justify-between z-10">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_CLASSES[fix.status]}`}>
            {fix.status.replace("_", " ")}
          </span>
          <button onClick={onClose} className="text-[#64748b] hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Status timeline (Command Center Stage 4) */}
          <FixStatusTimeline fix={fix} />

          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1">Fix ID</div>
            <code className="text-[11px] text-[#94a3b8]">{fix.id}</code>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">{fix.title}</h2>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className="px-2 py-0.5 rounded-full bg-[#141822] border border-[#1e293b] text-[#94a3b8]">{fix.mode}</span>
              <span className="px-2 py-0.5 rounded-full bg-[#141822] border border-[#1e293b] text-[#94a3b8]">{fix.diff_lines} lines</span>
              <span className="px-2 py-0.5 rounded-full bg-[#141822] border border-[#1e293b] text-[#94a3b8]">{fix.files_touched.length} files</span>
              {fix.typecheck_ok && <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">typecheck ✓</span>}
              {fix.smoke_ok === true && <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">smoke ✓</span>}
              {fix.smoke_ok === false && <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">smoke ✗</span>}
              {fix.git_commit && (
                <span className="px-2 py-0.5 rounded-full bg-[#141822] border border-[#1e293b] font-mono text-[#94a3b8]">{fix.git_commit.slice(0, 7)}</span>
              )}
            </div>
          </div>

          {fix.error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <div className="text-[10px] uppercase tracking-wide text-rose-300 mb-1">Error</div>
              <p className="text-sm text-rose-100 whitespace-pre-wrap">{fix.error}</p>
            </div>
          )}

          {fix.gap_text && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1.5">Gap reported</div>
              <p className="text-sm text-[#cbd5e1] whitespace-pre-wrap p-3 bg-[#141822] border border-[#1e293b]/40 rounded-lg">{fix.gap_text}</p>
            </div>
          )}

          {fix.proposed_fix_text && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1.5">Proposed fix (from agent)</div>
              <p className="text-sm text-[#cbd5e1] whitespace-pre-wrap p-3 bg-[#141822] border border-[#1e293b]/40 rounded-lg">{fix.proposed_fix_text}</p>
            </div>
          )}

          {fix.llm_reasoning && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1.5">Coder reasoning</div>
              <p className="text-sm text-[#cbd5e1] whitespace-pre-wrap p-3 bg-[#141822] border border-[#1e293b]/40 rounded-lg">{fix.llm_reasoning}</p>
            </div>
          )}

          {fix.files_touched.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#64748b] mb-1.5">Files touched</div>
              <ul className="text-xs space-y-1">
                {fix.files_touched.map(f => (
                  <li key={f}>
                    <code className="text-[#94a3b8]">{f}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fix.diff && <DiffViewer diff={fix.diff} />}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {fix.status === "pending" && (
              <>
                <button
                  onClick={() => onAction("apply")}
                  disabled={busy}
                  className="px-4 py-2 text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {busy ? "Applying…" : "Apply"}
                </button>
                <button
                  onClick={() => onAction("reject", { note: "User rejected via UI" })}
                  disabled={busy}
                  className="px-4 py-2 text-xs bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded-lg hover:bg-rose-500/25 disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}
            {fix.status === "applied" && fix.git_commit && (
              <button
                onClick={() => {
                  if (confirm("Revert this commit and restart the app? This will run `git revert` on the commit and pm2 restart five-rails.")) {
                    onAction("revert");
                  }
                }}
                disabled={busy}
                className="px-4 py-2 text-xs bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded-lg hover:bg-rose-500/25 disabled:opacity-50"
              >
                {busy ? "Reverting…" : "Revert"}
              </button>
            )}
            {fix.gap_id && (
              <a
                href={`/agents/watchdog`}
                className="px-4 py-2 text-xs bg-[#141822] text-[#94a3b8] border border-[#1e293b] rounded-lg hover:border-[#475569]"
              >
                Open watchdog
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status timeline (Stage 4) ──────────────────────────────────────────────

function FixStatusTimeline({ fix }: { fix: Fix }) {
  interface Step { label: string; at: string | null; tone: string; }
  const steps: Step[] = [
    { label: "Detected", at: fix.created_at, tone: "border-amber-500/30 text-amber-400" },
    {
      label: fix.status === "rejected" ? "Rejected"
           : fix.status === "failed" ? "Failed"
           : "Applied",
      at: fix.applied_at,
      tone: fix.status === "rejected" || fix.status === "failed"
        ? "border-rose-500/40 text-rose-400"
        : "border-emerald-500/40 text-emerald-400",
    },
  ];
  if (fix.status === "rolled_back" || fix.rolled_back_at) {
    steps.push({
      label: "Rolled back",
      at: fix.rolled_back_at,
      tone: "border-rose-500/40 text-rose-400",
    });
  }

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#64748b] mb-2">Status timeline</div>
      <ol className="relative border-l border-[#1e293b]/60 ml-2 space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="ml-4">
            <span className={`absolute -left-[5px] w-2.5 h-2.5 rounded-full border-2 ${step.tone} bg-[#0a0c14]`} aria-hidden="true" />
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 border rounded ${step.tone}`}>
                {step.label}
              </span>
              <span className="text-[10px] text-[#64748b]">
                {step.at ? new Date(step.at.replace(" ", "T") + (step.at.endsWith("Z") ? "" : "Z")).toLocaleString() : "—"}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Diff viewer with unified / side-by-side toggle (Stage 4) ───────────────

interface DiffPair { left: string | null; right: string | null; tone: "ctx" | "add" | "del" | "hdr" | "hunk"; }

function buildSideBySide(diff: string): DiffPair[] {
  const pairs: DiffPair[] = [];
  const lines = diff.split("\n");
  let pendingDels: string[] = [];

  const flushDels = () => {
    for (const d of pendingDels) pairs.push({ left: d, right: null, tone: "del" });
    pendingDels = [];
  };

  for (const line of lines) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      flushDels();
      pairs.push({ left: line, right: line, tone: "hdr" });
      continue;
    }
    if (line.startsWith("@@")) {
      flushDels();
      pairs.push({ left: line, right: line, tone: "hunk" });
      continue;
    }
    if (line.startsWith("-")) {
      pendingDels.push(line);
      continue;
    }
    if (line.startsWith("+")) {
      if (pendingDels.length > 0) {
        // Pair up with the first pending deletion.
        const left = pendingDels.shift() ?? null;
        pairs.push({ left, right: line, tone: left ? "del" : "add" });
        continue;
      }
      pairs.push({ left: null, right: line, tone: "add" });
      continue;
    }
    flushDels();
    pairs.push({ left: line, right: line, tone: "ctx" });
  }
  flushDels();
  return pairs;
}

function DiffViewer({ diff }: { diff: string }) {
  const [mode, setMode] = useState<"unified" | "split">("unified");
  const pairs = useMemo(() => mode === "split" ? buildSideBySide(diff) : null, [diff, mode]);

  const cls = (line: string) =>
    line.startsWith("+++") || line.startsWith("---") ? "text-[#94a3b8]"
    : line.startsWith("+") ? "text-emerald-300"
    : line.startsWith("-") ? "text-rose-300"
    : line.startsWith("@@") ? "text-sky-300"
    : "text-[#cbd5e1]";

  const cellCls = (tone: DiffPair["tone"], side: "left" | "right") => {
    if (tone === "hdr") return "text-[#94a3b8] bg-[#0d0f17]";
    if (tone === "hunk") return "text-sky-300 bg-[#0d0f17]";
    if (tone === "add" && side === "right") return "text-emerald-300 bg-emerald-500/5";
    if (tone === "del" && side === "left") return "text-rose-300 bg-rose-500/5";
    return "text-[#cbd5e1]";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-wide text-[#64748b]">Diff</div>
        <div className="flex items-center gap-1 bg-[#141822] border border-[#1e293b] rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setMode("unified")}
            className={`px-2 py-0.5 text-[10px] uppercase tracking-widest rounded ${
              mode === "unified" ? "bg-amber-500/15 text-amber-400" : "text-[#94a3b8] hover:text-[#e2e8f0]"
            }`}
          >
            Unified
          </button>
          <button
            type="button"
            onClick={() => setMode("split")}
            className={`px-2 py-0.5 text-[10px] uppercase tracking-widest rounded ${
              mode === "split" ? "bg-amber-500/15 text-amber-400" : "text-[#94a3b8] hover:text-[#e2e8f0]"
            }`}
          >
            Split
          </button>
        </div>
      </div>
      {mode === "unified" ? (
        <pre className="text-[11px] font-mono whitespace-pre overflow-x-auto p-3 bg-black border border-[#1e293b]/40 rounded-lg max-h-96 leading-relaxed">
          {diff.split("\n").map((line, i) => (
            <span key={i} className={`block ${cls(line)}`}>{line || " "}</span>
          ))}
        </pre>
      ) : (
        <div className="grid grid-cols-2 gap-0 text-[11px] font-mono bg-black border border-[#1e293b]/40 rounded-lg overflow-x-auto max-h-96 overflow-y-auto leading-relaxed">
          {(pairs ?? []).map((p, i) => (
            <div key={`pair-${i}`} className="contents">
              <pre className={`px-3 py-px whitespace-pre border-r border-[#1e293b]/40 ${cellCls(p.tone, "left")}`}>
                {p.left ?? " "}
              </pre>
              <pre className={`px-3 py-px whitespace-pre ${cellCls(p.tone, "right")}`}>
                {p.right ?? " "}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
