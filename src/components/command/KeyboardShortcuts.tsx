"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface Shortcut {
  key: string;
  href: string;
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { key: "d", href: "/dashboard", label: "Dashboard" },
  { key: "i", href: "/inbox", label: "Inbox" },
  { key: "t", href: "/traces", label: "Traces" },
  { key: "f", href: "/agents/watchdog/fixes", label: "Fixes" },
  { key: "w", href: "/agents/watchdog", label: "Watchdog" },
  { key: "a", href: "/agents", label: "Agents" },
  { key: "m", href: "/metrics/agents", label: "Agent Metrics" },
];

const SEQUENCE_TIMEOUT_MS = 1200;

function shouldIgnoreEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export default function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);
  const [armed, setArmed] = useState(false);
  const armedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (shouldIgnoreEvent(e.target)) return;

      // "?" toggles the help overlay (no leader needed)
      if (e.key === "?" && !armed) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }

      // Escape closes the overlay
      if (e.key === "Escape" && showHelp) {
        e.preventDefault();
        setShowHelp(false);
        return;
      }

      // Leader: 'g' arms the shortcut sequence for SEQUENCE_TIMEOUT_MS
      if (e.key === "g" && !armed) {
        e.preventDefault();
        setArmed(true);
        if (armedTimer.current) clearTimeout(armedTimer.current);
        armedTimer.current = setTimeout(() => setArmed(false), SEQUENCE_TIMEOUT_MS);
        return;
      }

      // Armed — match the second key
      if (armed) {
        const match = SHORTCUTS.find((s) => s.key === e.key.toLowerCase());
        if (armedTimer.current) clearTimeout(armedTimer.current);
        setArmed(false);
        if (match) {
          e.preventDefault();
          router.push(match.href);
          setShowHelp(false);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (armedTimer.current) clearTimeout(armedTimer.current);
    };
  }, [router, armed, showHelp]);

  return (
    <>
      {armed ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#141822] border border-amber-500/40 rounded-lg px-3 py-2 text-xs text-amber-400 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
          <span className="font-mono">g</span> — waiting for next key…
        </div>
      ) : null}

      {showHelp ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-[#0d0f17] border border-[#1e293b] rounded-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#e2e8f0]">Keyboard shortcuts</h2>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="text-[#64748b] hover:text-[#e2e8f0] text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-[#94a3b8] mb-4">
              Press <KeyChip k="g" /> then the second key. <KeyChip k="?" /> toggles this overlay. <KeyChip k="Esc" /> closes.
            </p>
            <ul className="space-y-1.5">
              {SHORTCUTS.map((s) => (
                <li key={s.key} className="flex items-center justify-between text-sm">
                  <span className="text-[#e2e8f0]">{s.label}</span>
                  <span className="flex items-center gap-1">
                    <KeyChip k="g" />
                    <span className="text-[#475569]">then</span>
                    <KeyChip k={s.key} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

function KeyChip({ k }: { k: string }) {
  return (
    <kbd className="inline-block bg-[#141822] border border-[#1e293b] text-[#e2e8f0] text-[10px] font-mono px-1.5 py-0.5 rounded">
      {k}
    </kbd>
  );
}
