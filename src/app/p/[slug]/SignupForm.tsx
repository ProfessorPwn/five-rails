"use client";

import { useState } from "react";

export default function SignupForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("submitting");
    setError(null);
    try {
      const res = await fetch(`/api/p/${encodeURIComponent(slug)}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't sign up — try again");
        setState("error");
        return;
      }
      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="text-emerald-300 text-sm">
        ✓ You&apos;re on the list. We&apos;ll be in touch.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="Your name (optional)"
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full px-4 py-3 rounded-lg bg-[#0a0c14] border border-[#1e293b] text-sm text-white placeholder-[#475569] focus:outline-none focus:border-indigo-500/60"
        autoComplete="name"
      />
      <input
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="w-full px-4 py-3 rounded-lg bg-[#0a0c14] border border-[#1e293b] text-sm text-white placeholder-[#475569] focus:outline-none focus:border-indigo-500/60"
        autoComplete="email"
      />
      <button
        type="submit"
        disabled={state === "submitting"}
        className="w-full px-4 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition"
      >
        {state === "submitting" ? "Sending…" : "Request early access"}
      </button>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </form>
  );
}
