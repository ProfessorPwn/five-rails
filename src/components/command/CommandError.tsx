"use client";

import Link from "next/link";

interface CommandErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  area: string;
}

export default function CommandError({ error, reset, area }: CommandErrorProps) {
  return (
    <div className="max-w-2xl mx-auto mt-12 bg-[#141822] border border-rose-500/30 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-widest text-rose-400 px-2 py-0.5 border border-rose-500/40 rounded">
          {area}
        </span>
        <h2 className="text-base font-semibold text-[#e2e8f0]">Something broke.</h2>
      </div>
      <p className="text-sm text-[#94a3b8] mb-4">
        This Command Center surface hit an unexpected error. The rest of Five
        Rails is unaffected — only this view crashed.
      </p>
      {error.message ? (
        <pre className="text-xs text-rose-300 bg-[#0d0f17] border border-[#1e293b]/60 rounded-md px-3 py-2 mb-4 whitespace-pre-wrap break-words font-mono">
          {error.message.slice(0, 1500)}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="px-3 py-1.5 text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-md hover:bg-amber-500/25 transition-colors"
        >
          Retry
        </button>
        <Link
          href="/dashboard"
          className="px-3 py-1.5 text-xs text-[#94a3b8] hover:text-[#e2e8f0] border border-transparent hover:border-[#2a3348] rounded-md transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
