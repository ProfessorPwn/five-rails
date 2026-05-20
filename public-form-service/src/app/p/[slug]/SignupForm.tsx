"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  slug: string;
}

export default function SignupForm({ slug }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Honeypot field. Real humans never fill this. Bots that auto-fill every
  // input flag themselves.
  const [trap, setTrap] = useState("");

  // Render-time anchor to record how long the visitor was on page before
  // submitting. Sub-2s submissions are almost always bots.
  const renderedAt = useRef<number>(0);
  useEffect(() => {
    renderedAt.current = Date.now();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("submitting");
    setError(null);

    const dwellMs = renderedAt.current ? Date.now() - renderedAt.current : 0;

    try {
      const res = await fetch(`/api/submit/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // credentials:"same-origin" so cookies are not leaked across origins.
        credentials: "same-origin",
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          // honeypot — server side rejects (or marks spam) when non-empty
          website: trap,
          // dwell time hint
          dwell_ms: dwellMs,
        }),
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
      <div style={{ color: "var(--good)", fontSize: 14 }}>
        ✓ You&apos;re on the list. We&apos;ll be in touch.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Honeypot — visually hidden, accessible-hidden, not autofocused. */}
      <label
        style={{
          position: "absolute",
          left: "-10000px",
          top: "auto",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        Website
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={trap}
          onChange={e => setTrap(e.target.value)}
        />
      </label>

      <input
        type="text"
        placeholder="Your name (optional)"
        value={name}
        onChange={e => setName(e.target.value)}
        autoComplete="name"
        style={inputStyle}
      />

      <input
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        autoComplete="email"
        style={inputStyle}
      />

      <button
        type="submit"
        disabled={state === "submitting"}
        style={{
          padding: "12px 16px",
          borderRadius: 8,
          border: "none",
          background: state === "submitting" ? "rgba(99,102,241,0.5)" : "var(--accent)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          transition: "background 120ms",
        }}
        onMouseEnter={e => {
          if (state !== "submitting") e.currentTarget.style.background = "var(--accent-hover)";
        }}
        onMouseLeave={e => {
          if (state !== "submitting") e.currentTarget.style.background = "var(--accent)";
        }}
      >
        {state === "submitting" ? "Sending…" : "Request early access"}
      </button>

      {error && <p style={{ fontSize: 12, color: "var(--bad)", margin: 0 }}>{error}</p>}
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  background: "var(--bg)",
  border: "1px solid var(--border)",
  fontSize: 14,
  outline: "none",
};
