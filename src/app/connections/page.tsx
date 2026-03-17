"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

export default function ConnectionsPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    }>
      <ConnectionsPage />
    </Suspense>
  );
}

interface Connection {
  id: string;
  provider: string;
  api_key_encrypted: string | null;
  base_url: string;
  model: string;
  is_active: number;
  created_at: string;
}

interface PlatformConnection {
  id: string;
  platform: string;
  label: string | null;
  username: string | null;
  profile_image: string | null;
  access_token: string | null;
  account_id: string | null;
  is_active: number;
  created_at: string;
  // email-specific
  api_key: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  from_email: string | null;
}

const socialPlatforms = [
  {
    key: "twitter",
    name: "Twitter / X",
    color: "bg-sky-500",
    textColor: "text-sky-400",
    bgHover: "hover:bg-sky-500/20",
    bgLight: "bg-sky-500/10",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    color: "bg-blue-600",
    textColor: "text-blue-400",
    bgHover: "hover:bg-blue-500/20",
    bgLight: "bg-blue-500/10",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    key: "facebook",
    name: "Facebook",
    color: "bg-blue-500",
    textColor: "text-blue-300",
    bgHover: "hover:bg-blue-400/20",
    bgLight: "bg-blue-400/10",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    key: "instagram",
    name: "Instagram",
    color: "bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400",
    textColor: "text-pink-400",
    bgHover: "hover:bg-pink-500/20",
    bgLight: "bg-pink-500/10",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    key: "tiktok",
    name: "TikTok",
    color: "bg-black",
    textColor: "text-[#e2e8f0]",
    bgHover: "hover:bg-white/10",
    bgLight: "bg-white/5",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.18 8.18 0 004.77 1.52V6.84a4.85 4.85 0 01-1-.15z" />
      </svg>
    ),
  },
  {
    key: "youtube",
    name: "YouTube",
    color: "bg-red-600",
    textColor: "text-red-400",
    bgHover: "hover:bg-red-500/20",
    bgLight: "bg-red-500/10",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
];

function ConnectionsPage() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [platformConns, setPlatformConns] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // LLM modals
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [editingConn, setEditingConn] = useState(false);
  const [editConnForm, setEditConnForm] = useState({ base_url: "", api_key: "", model: "" });
  const [form, setForm] = useState({ provider: "ollama", base_url: "", api_key: "", model: "" });

  // Email config modal
  const [showEmailConfig, setShowEmailConfig] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({
    api_key: "", from_email: "", smtp_host: "", smtp_port: "", smtp_user: "", smtp_pass: "",
  });

  const fetchConnections = () => {
    Promise.all([
      fetch("/api/connections").then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/platform-connections").then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([llm, plat]) => {
      setConnections(Array.isArray(llm) ? llm : []);
      setPlatformConns(Array.isArray(plat) ? plat : []);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchConnections();
    // Handle OAuth callback messages
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("error");
    if (connected) {
      setSuccess(`Successfully connected your ${connected} account!`);
      window.history.replaceState({}, "", "/connections");
    }
    if (oauthError) {
      setError(oauthError);
      window.history.replaceState({}, "", "/connections");
    }
  }, [searchParams]);

  // ─── LLM Handlers ──────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        provider: form.provider, base_url: form.base_url || undefined, model: form.model || undefined,
      };
      if (form.api_key) payload.api_key_encrypted = form.api_key;
      const res = await fetch("/api/connections", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (res.ok) {
        setForm({ provider: "ollama", base_url: "", api_key: "", model: "" });
        setShowCreate(false);
        fetchConnections();
      } else setError("Failed to create connection");
    } catch { setError("Failed to create connection"); }
    finally { setCreating(false); }
  };

  const handleToggle = async (conn: Connection) => {
    try {
      const res = await fetch(`/api/connections/${conn.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !conn.is_active }),
      });
      if (!res.ok) setError("Failed to toggle connection");
      fetchConnections();
    } catch { setError("Failed to toggle connection"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this connection?")) return;
    try {
      await fetch(`/api/connections/${id}`, { method: "DELETE" });
      fetchConnections();
    } catch { setError("Failed to delete connection"); }
  };

  const openEditConnection = (conn: Connection) => {
    setEditingConnection(conn);
    setEditConnForm({ base_url: conn.base_url || "", api_key: "", model: conn.model || "" });
  };

  const handleEditConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConnection) return;
    setEditingConn(true);
    try {
      const payload: Record<string, unknown> = {
        base_url: editConnForm.base_url || undefined, model: editConnForm.model || undefined,
      };
      if (editConnForm.api_key) payload.api_key_encrypted = editConnForm.api_key;
      const res = await fetch(`/api/connections/${editingConnection.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (res.ok) { setEditingConnection(null); fetchConnections(); }
      else setError("Failed to update connection");
    } catch { setError("Failed to update connection"); }
    finally { setEditingConn(false); }
  };

  // ─── Platform Handlers ─────────────────────────────────────────────────

  const handleConnect = (platform: string) => {
    if (platform === "email") {
      // Pre-populate form with existing email connection data if editing
      const existing = connectedPlatforms.get("email");
      if (existing) {
        setEmailForm({
          api_key: "", // Don't pre-fill secrets
          from_email: existing.from_email || "",
          smtp_host: existing.smtp_host || "",
          smtp_port: existing.smtp_port ? String(existing.smtp_port) : "",
          smtp_user: existing.smtp_user || "",
          smtp_pass: "", // Don't pre-fill secrets
        });
      }
      setShowEmailConfig(true);
      return;
    }
    // Redirect to OAuth flow
    window.location.href = `/api/auth/${platform}`;
  };

  const handleDisconnect = async (id: string, platform: string) => {
    if (!confirm(`Disconnect your ${platform} account?`)) return;
    try {
      await fetch(`/api/platform-connections/${id}`, { method: "DELETE" });
      fetchConnections();
    } catch { setError("Failed to disconnect"); }
  };

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmail(true);
    try {
      // Validate port if provided
      if (emailForm.smtp_port) {
        const port = parseInt(emailForm.smtp_port);
        if (isNaN(port) || port < 1 || port > 65535) {
          setError("SMTP port must be a number between 1 and 65535");
          setSavingEmail(false);
          return;
        }
      }

      const existing = connectedPlatforms.get("email");
      const payload: Record<string, unknown> = {
        platform: "email",
        label: emailForm.from_email || "Email",
      };
      // Only include fields that were actually filled in (don't wipe existing values)
      if (emailForm.from_email) payload.from_email = emailForm.from_email;
      if (emailForm.api_key) payload.api_key = emailForm.api_key;
      if (emailForm.smtp_host) payload.smtp_host = emailForm.smtp_host;
      if (emailForm.smtp_port) payload.smtp_port = parseInt(emailForm.smtp_port);
      if (emailForm.smtp_user) payload.smtp_user = emailForm.smtp_user;
      if (emailForm.smtp_pass) payload.smtp_pass = emailForm.smtp_pass;

      let res: Response;
      if (existing) {
        // Update existing connection (preserves fields not sent)
        res = await fetch(`/api/platform-connections/${existing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
      } else {
        // Create new connection
        res = await fetch("/api/platform-connections", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
      }
      if (res.ok) {
        setShowEmailConfig(false);
        setEmailForm({ api_key: "", from_email: "", smtp_host: "", smtp_port: "", smtp_user: "", smtp_pass: "" });
        setSuccess("Email connection configured!");
        fetchConnections();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to configure email");
      }
    } catch { setError("Failed to configure email"); }
    finally { setSavingEmail(false); }
  };

  const providerDefaults: Record<string, { base_url: string; model: string }> = {
    ollama: { base_url: "http://127.0.0.1:11434", model: "llama3" },
    openai: { base_url: "https://api.openai.com", model: "gpt-4o-mini" },
    anthropic: { base_url: "https://api.anthropic.com", model: "claude-sonnet-4-20250514" },
    perplexity: { base_url: "https://api.perplexity.ai", model: "sonar" },
    exa: { base_url: "https://api.exa.ai", model: "" },
    firecrawl: { base_url: "https://api.firecrawl.dev", model: "" },
  };

  const connectedPlatforms = new Map(platformConns.map((c) => [c.platform, c]));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#e2e8f0]">Connections</h1>
        <p className="text-sm text-[#94a3b8] mt-1">Connect your accounts and AI providers</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300 cursor-pointer text-sm">&#x2715;</button>
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-emerald-400">{success}</span>
          <button onClick={() => setSuccess("")} className="text-emerald-400 hover:text-emerald-300 cursor-pointer text-sm">&#x2715;</button>
        </div>
      )}

      {/* ─── Social Media Accounts ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold text-[#e2e8f0]">Social Accounts</h2>
          <Badge variant="rose">Publishing</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {socialPlatforms.map((plat) => {
            const connected = connectedPlatforms.get(plat.key);
            const isConnected = !!connected;

            return (
              <Card key={plat.key} hover={false} className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${plat.bgLight} flex items-center justify-center ${plat.textColor}`}>
                  {plat.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#e2e8f0]">{plat.name}</h3>
                    {isConnected && (
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[10px] text-emerald-400 font-medium">Connected</span>
                      </div>
                    )}
                  </div>
                  {isConnected && connected.username ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      {connected.profile_image && (
                        <img src={connected.profile_image} alt="" className="w-4 h-4 rounded-full" />
                      )}
                      <span className="text-xs text-[#94a3b8]">{connected.username}</span>
                    </div>
                  ) : isConnected && connected.from_email ? (
                    <span className="text-xs text-[#94a3b8]">{connected.from_email}</span>
                  ) : !isConnected ? (
                    <span className="text-xs text-[#64748b]">Not connected</span>
                  ) : null}
                </div>
                <div>
                  {isConnected ? (
                    <button
                      onClick={() => handleDisconnect(connected.id, plat.name)}
                      className="text-xs text-[#64748b] hover:text-red-400 transition-colors cursor-pointer px-3 py-1.5 rounded-lg border border-[#1e293b] hover:border-red-500/30"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(plat.key)}
                      className={`text-xs font-medium px-4 py-1.5 rounded-lg transition-all cursor-pointer ${plat.bgLight} ${plat.textColor} ${plat.bgHover} border border-transparent hover:border-current/20`}
                    >
                      {plat.key === "email" ? "Configure" : "Connect"}
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ─── LLM Providers Section ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-[#e2e8f0]">AI Providers</h2>
            <Badge variant="amber">Skills</Badge>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add Provider
          </Button>
        </div>

        {connections.length === 0 ? (
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="14" cy="14" r="6" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="34" cy="14" r="6" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="24" cy="34" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M18 18l4 12M30 18l-4 12" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            }
            title="No AI providers configured"
            description="Add an LLM provider to power your skills and chat."
            actionLabel="Add Provider"
            onAction={() => setShowCreate(true)}
          />
        ) : (
          <div className="space-y-3">
            {connections.map((conn) => {
              const isActive = !!conn.is_active;
              return (
                <Card key={conn.id} hover={false} className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg ${isActive ? "bg-amber-500/10 text-amber-400" : "bg-[#1e293b] text-[#64748b]"} flex items-center justify-center`}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3
                        className="text-sm font-semibold text-[#e2e8f0] cursor-pointer hover:text-amber-400 transition-colors"
                        onClick={() => openEditConnection(conn)}
                      >
                        {conn.provider}
                      </h3>
                      <Badge variant={conn.provider === "ollama" ? "emerald" : conn.provider === "anthropic" ? "violet" : "blue"}>
                        {conn.provider}
                      </Badge>
                    </div>
                    <span className="text-xs text-[#64748b] cursor-pointer hover:text-amber-400 transition-colors" onClick={() => openEditConnection(conn)}>
                      {conn.model || "default"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggle(conn)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${isActive ? "bg-amber-500" : "bg-[#1e293b]"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${isActive ? "translate-x-4.5" : "translate-x-0.5"}`} />
                    </button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(conn.id)} className="!text-[#64748b] hover:!text-red-400">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 3.5h8M5.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1M4 3.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── LLM Create Modal ──────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add AI Provider">
        <form onSubmit={handleCreate} className="space-y-4">
          <Select label="Provider" value={form.provider}
            onChange={(e) => {
              const t = e.target.value;
              const d = providerDefaults[t] || { base_url: "", model: "" };
              setForm({ ...form, provider: t, base_url: d.base_url, model: d.model });
            }}
            options={[
              { value: "ollama", label: "Ollama" }, { value: "openai", label: "OpenAI" },
              { value: "anthropic", label: "Anthropic" }, { value: "perplexity", label: "Perplexity" },
              { value: "exa", label: "Exa" }, { value: "firecrawl", label: "Firecrawl" },
            ]}
          />
          <Input label="Base URL" placeholder="https://api.openai.com" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
          {form.provider !== "ollama" && (
            <Input label={form.provider === "anthropic" ? "OAuth Token" : "API Key"} type="password"
              placeholder={form.provider === "anthropic" ? "OAuth token from Claude CLI" : "sk-..."}
              value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
          )}
          <Input label="Model" placeholder="e.g. gpt-4o-mini" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" disabled={creating}>{creating ? "Adding..." : "Add Provider"}</Button>
          </div>
        </form>
      </Modal>

      {/* ─── LLM Edit Modal ───────────────────────────────────────────── */}
      <Modal open={!!editingConnection} onClose={() => setEditingConnection(null)} title="Edit AI Provider">
        <form onSubmit={handleEditConnection} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Provider</label>
            <div className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#64748b]">{editingConnection?.provider}</div>
          </div>
          <Input label="Base URL" value={editConnForm.base_url} onChange={(e) => setEditConnForm({ ...editConnForm, base_url: e.target.value })} />
          <Input label="API Key" type="password" placeholder="Leave blank to keep current" value={editConnForm.api_key} onChange={(e) => setEditConnForm({ ...editConnForm, api_key: e.target.value })} />
          <Input label="Model" value={editConnForm.model} onChange={(e) => setEditConnForm({ ...editConnForm, model: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setEditingConnection(null)}>Cancel</Button>
            <Button type="submit" disabled={editingConn}>{editingConn ? "Saving..." : "Save Changes"}</Button>
          </div>
        </form>
      </Modal>

      {/* ─── Email Config Modal ────────────────────────────────────────── */}
      <Modal open={showEmailConfig} onClose={() => setShowEmailConfig(false)} title="Configure Email">
        <form onSubmit={handleSaveEmail} className="space-y-4">
          <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3">
            <p className="text-xs text-rose-400">Use Resend for easy setup, or SMTP for any email provider.</p>
          </div>
          <Input label="Resend API Key (recommended)" type="password" placeholder="re_..." value={emailForm.api_key} onChange={(e) => setEmailForm({ ...emailForm, api_key: e.target.value })} />
          <Input label="From Email" placeholder="you@yourdomain.com" value={emailForm.from_email} onChange={(e) => setEmailForm({ ...emailForm, from_email: e.target.value })} />
          <div className="border-t border-[#1e293b] pt-3">
            <p className="text-[10px] text-[#64748b] uppercase tracking-wider mb-3">Or use SMTP</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="SMTP Host" placeholder="smtp.gmail.com" value={emailForm.smtp_host} onChange={(e) => setEmailForm({ ...emailForm, smtp_host: e.target.value })} />
              <Input label="Port" placeholder="587" value={emailForm.smtp_port} onChange={(e) => setEmailForm({ ...emailForm, smtp_port: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Input label="User" placeholder="you@gmail.com" value={emailForm.smtp_user} onChange={(e) => setEmailForm({ ...emailForm, smtp_user: e.target.value })} />
              <Input label="Password" type="password" value={emailForm.smtp_pass} onChange={(e) => setEmailForm({ ...emailForm, smtp_pass: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowEmailConfig(false)}>Cancel</Button>
            <Button type="submit" disabled={savingEmail}>{savingEmail ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
