"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

interface Connection {
  id: string;
  provider: string;
  api_key_encrypted: string | null;
  base_url: string;
  model: string;
  is_active: number;
  created_at: string;
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    provider: "ollama",
    base_url: "",
    api_key: "",
    model: "",
  });

  const fetchConnections = () => {
    fetch("/api/connections")
      .then((r) => r.json())
      .then((data) => {
        setConnections(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        provider: form.provider,
        base_url: form.base_url || undefined,
        model: form.model || undefined,
      };
      if (form.api_key) payload.api_key_encrypted = form.api_key;
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setForm({ provider: "ollama", base_url: "", api_key: "", model: "" });
        setShowCreate(false);
        fetchConnections();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (conn: Connection) => {
    const newActive = conn.is_active ? false : true;
    try {
      await fetch(`/api/connections/${conn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newActive }),
      });
      fetchConnections();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this connection?")) return;
    try {
      await fetch(`/api/connections/${id}`, { method: "DELETE" });
      fetchConnections();
    } catch {
      // ignore
    }
  };

  const providerDefaults: Record<string, { base_url: string; model: string }> = {
    ollama: { base_url: "http://127.0.0.1:11434", model: "llama3" },
    openai: { base_url: "https://api.openai.com", model: "gpt-4o-mini" },
    anthropic: { base_url: "https://api.anthropic.com", model: "claude-sonnet-4-20250514" },
    perplexity: { base_url: "https://api.perplexity.ai", model: "sonar" },
  };

  const providerIcons: Record<string, React.ReactNode> = {
    ollama: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 3v4M10 13v4M3 10h4M13 10h4" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      </svg>
    ),
    openai: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2l7 4v8l-7 4-7-4V6l7-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    anthropic: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 3L17 17H3L10 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 9v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    perplexity: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="10" r="2" fill="currentColor" opacity="0.3" />
      </svg>
    ),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Connections</h1>
          <p className="text-sm text-[#94a3b8] mt-1">LLM provider connections</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add Connection
        </Button>
      </div>

      {/* List */}
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
          title="No connections configured"
          description="Add an LLM provider to power your skills and chat."
          actionLabel="Add Connection"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => {
            const isActive = !!conn.is_active;
            return (
              <Card key={conn.id} hover={false} className="flex items-center gap-4">
                <div className={`${isActive ? "text-amber-400" : "text-[#64748b]"}`}>
                  {providerIcons[conn.provider] || providerIcons.ollama}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#e2e8f0]">
                      {conn.provider}
                    </h3>
                    <Badge variant={conn.provider === "ollama" ? "emerald" : conn.provider === "openai" ? "blue" : conn.provider === "anthropic" ? "violet" : "rose"}>
                      {conn.provider}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-[#64748b]">{conn.model || "default"}</span>
                    <span className="text-[10px] text-[#64748b]">{conn.base_url}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Status indicator */}
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isActive ? "bg-emerald-400" : "bg-[#64748b]"}`} />
                    <span className="text-xs text-[#94a3b8]">{isActive ? "Active" : "Inactive"}</span>
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(conn)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                      isActive ? "bg-amber-500" : "bg-[#1e293b]"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        isActive ? "translate-x-4.5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(conn.id)}
                    className="!text-[#64748b] hover:!text-red-400"
                  >
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

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Connection">
        <form onSubmit={handleCreate} className="space-y-4">
          <Select
            label="Provider"
            value={form.provider}
            onChange={(e) => {
              const t = e.target.value;
              const defaults = providerDefaults[t] || { base_url: "", model: "" };
              setForm({ ...form, provider: t, base_url: defaults.base_url, model: defaults.model });
            }}
            options={[
              { value: "ollama", label: "Ollama" },
              { value: "openai", label: "OpenAI" },
              { value: "anthropic", label: "Anthropic" },
              { value: "perplexity", label: "Perplexity" },
            ]}
          />
          <Input
            label="Base URL"
            placeholder="https://api.openai.com"
            value={form.base_url}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
          />
          {form.provider !== "ollama" && (
            <Input
              label="API Key"
              type="password"
              placeholder="sk-..."
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            />
          )}
          <Input
            label="Model"
            placeholder="e.g. gpt-4o-mini"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Adding..." : "Add Connection"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
