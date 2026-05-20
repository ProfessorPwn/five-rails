"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Select, Textarea } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

interface Newsletter {
  id: string;
  project_id: string | null;
  title: string;
  subject: string | null;
  content: string | null;
  status: "draft" | "generating" | "ready" | "sent";
  newsletter_type: string;
  recipients: string | null;
  sent_at: string | null;
  sent_count: number;
  subject_b: string | null;
  subject_c: string | null;
  subject_d: string | null;
  ab_test_sample_pct: number;
  ab_winner: string | null;
  open_rate: number;
  click_rate: number;
  unsubscribe_count: number;
  created_at: string;
  updated_at: string;
}

interface Project {
  id: string;
  name: string;
  niche: string | null;
}

interface OutboundContact {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  project_id: string | null;
  status: string;
}

const newsletterTypes = [
  { value: "weekly", label: "Weekly Update" },
  { value: "monthly", label: "Monthly Recap" },
  { value: "roundup", label: "Content Roundup" },
  { value: "announcement", label: "Announcement" },
  { value: "educational", label: "Educational" },
  { value: "promotional", label: "Promotional" },
];

const typeDescriptions: Record<string, string> = {
  weekly: "Summarizes this week's activity, new content, and upcoming plans",
  monthly: "High-level recap with metrics, wins, lessons, and next month's roadmap",
  roundup: "Curates and highlights the best recent content and insights",
  announcement: "Announces a milestone, launch, or important update",
  educational: "Teaches something valuable using your project's research and data",
  promotional: "Highlights your value proposition with a clear call-to-action",
};

const statusColors: Record<string, "default" | "info" | "warning" | "success"> = {
  draft: "default",
  generating: "warning",
  ready: "info",
  sent: "success",
};

const typeColors: Record<string, "amber" | "blue" | "emerald" | "violet" | "rose"> = {
  weekly: "blue",
  monthly: "violet",
  roundup: "amber",
  announcement: "rose",
  educational: "emerald",
  promotional: "amber",
};

export default function NewslettersPage() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<OutboundContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    newsletter_type: "weekly",
    project_id: "",
    recipients: "",
    subject_b: "",
    subject_c: "",
    ab_test_sample_pct: 20,
  });

  // View/Edit modal
  const [viewing, setViewing] = useState<Newsletter | null>(null);
  const [editingRecipients, setEditingRecipients] = useState("");
  const [savingRecipients, setSavingRecipients] = useState(false);

  // Generate
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // Send
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Filter
  const [filterProject, setFilterProject] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const fetchData = () => {
    Promise.all([
      fetch("/api/newsletters").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/projects").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/outbound").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([nl, proj, cts]) => {
      setNewsletters(Array.isArray(nl) ? nl : []);
      setProjects(Array.isArray(proj) ? proj : []);
      setContacts(Array.isArray(cts) ? cts : []);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/newsletters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          newsletter_type: form.newsletter_type,
          project_id: form.project_id || null,
          recipients: form.recipients || null,
          subject_b: form.subject_b || null,
          subject_c: form.subject_c || null,
          ab_test_sample_pct: form.subject_b ? form.ab_test_sample_pct : 20,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setForm({ title: "", newsletter_type: "weekly", project_id: "", recipients: "", subject_b: "", subject_c: "", ab_test_sample_pct: 20 });
        setShowCreate(false);
        fetchData();
        setSuccess(`Newsletter "${created.title}" created!`);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create newsletter");
      }
    } catch {
      setError("Failed to create newsletter");
    } finally {
      setCreating(false);
    }
  };

  const handleGenerate = async (nl: Newsletter) => {
    setGeneratingId(nl.id);
    setError("");
    try {
      const res = await fetch(`/api/newsletters/${nl.id}/generate`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Newsletter generated! Review it before sending.`);
        fetchData();
        // Refresh viewing modal if open
        if (viewing?.id === nl.id) {
          setViewing(data);
        }
      } else {
        setError(data.error || "Generation failed");
      }
    } catch {
      setError("Failed to generate newsletter");
    } finally {
      setGeneratingId(null);
    }
  };

  const handleSend = async (nl: Newsletter) => {
    if (!nl.content?.trim()) {
      setError("Generate content before sending.");
      return;
    }
    if (!nl.recipients?.trim()) {
      setError("Add recipients before sending.");
      return;
    }
    if (!confirm(`Send "${nl.title}" to ${formatRecipientCount(nl.recipients)} recipient(s)?`)) return;

    setSendingId(nl.id);
    try {
      const res = await fetch(`/api/newsletters/${nl.id}/send`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Newsletter sent to ${data.sent_count} recipient(s)!${data.failed_count ? ` (${data.failed_count} failed)` : ""}`);
        fetchData();
        if (viewing?.id === nl.id) {
          const updated = await fetch(`/api/newsletters/${nl.id}`).then((r) => r.json());
          setViewing(updated);
        }
      } else {
        setError(data.error || "Send failed");
      }
    } catch {
      setError("Failed to send newsletter");
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this newsletter?")) return;
    try {
      await fetch(`/api/newsletters/${id}`, { method: "DELETE" });
      if (viewing?.id === id) setViewing(null);
      fetchData();
    } catch {
      setError("Failed to delete");
    }
  };

  const handleSaveRecipients = async () => {
    if (!viewing) return;
    setSavingRecipients(true);
    try {
      const res = await fetch(`/api/newsletters/${viewing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: editingRecipients }),
      });
      if (res.ok) {
        const updated = await res.json();
        setViewing(updated);
        setSuccess("Recipients updated!");
        fetchData();
      }
    } catch {
      setError("Failed to save recipients");
    } finally {
      setSavingRecipients(false);
    }
  };

  const formatRecipientCount = (recipients: string | null): number => {
    if (!recipients) return 0;
    try {
      const parsed = JSON.parse(recipients);
      return Array.isArray(parsed) ? parsed.length : 1;
    } catch {
      return recipients.split(",").filter((e) => e.trim()).length;
    }
  };

  const getProjectName = (projectId: string | null): string => {
    if (!projectId) return "Global";
    return projects.find((p) => p.id === projectId)?.name || "Unknown";
  };

  const filtered = newsletters.filter((nl) => {
    if (filterProject !== "all") {
      if (filterProject === "global" && nl.project_id) return false;
      if (filterProject !== "global" && nl.project_id !== filterProject) return false;
    }
    if (filterStatus !== "all" && nl.status !== filterStatus) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Newsletters</h1>
          <p className="text-sm text-[#94a3b8] mt-1">
            Auto-generate newsletters from your project activity, content, and insights
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New Newsletter
        </Button>
      </div>

      {/* Alerts */}
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

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">All Sources</option>
          <option value="global">Global (No Project)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="ready">Ready</option>
          <option value="sent">Sent</option>
        </select>
      </div>

      {/* Newsletter List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="6" y="10" width="36" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 18l18 10 18-10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 10l18 12 18-12" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
            </svg>
          }
          title="No newsletters yet"
          description="Create a newsletter to auto-generate content from your projects, social posts, insights, and activity."
          actionLabel="New Newsletter"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((nl) => (
            <Card key={nl.id} hover={false} className="flex items-center gap-4">
              {/* Icon */}
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                nl.status === "sent" ? "bg-emerald-500/10 text-emerald-400" :
                nl.status === "ready" ? "bg-blue-500/10 text-blue-400" :
                nl.status === "generating" ? "bg-amber-500/10 text-amber-400" :
                "bg-[#1e293b] text-[#64748b]"
              }`}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M2 8l8 4 8-4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3
                    className="text-sm font-semibold text-[#e2e8f0] truncate cursor-pointer hover:text-amber-400 transition-colors"
                    onClick={() => { setViewing(nl); setEditingRecipients(nl.recipients || ""); }}
                  >
                    {nl.title}
                  </h3>
                  <Badge variant={typeColors[nl.newsletter_type] || "amber"}>
                    {nl.newsletter_type}
                  </Badge>
                  <Badge variant={statusColors[nl.status] || "default"}>
                    {nl.status}
                  </Badge>
                  {nl.subject_b && (
                    <Badge variant="violet">
                      A/B{nl.subject_c ? "/C" : ""}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-[#64748b]">{getProjectName(nl.project_id)}</span>
                  {nl.sent_at && (
                    <span className="text-xs text-emerald-400/70">
                      Sent {new Date(nl.sent_at).toLocaleDateString()} to {nl.sent_count} recipient(s)
                    </span>
                  )}
                  {!nl.sent_at && (
                    <span className="text-xs text-[#64748b]">
                      {new Date(nl.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {nl.status === "draft" && (
                  <Button
                    size="sm"
                    onClick={() => handleGenerate(nl)}
                    disabled={generatingId === nl.id}
                  >
                    {generatingId === nl.id ? (
                      <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent" />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M11.2 2.8l-1.4 1.4M4.2 9.8l-1.4 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                    {generatingId === nl.id ? "Generating..." : "Generate"}
                  </Button>
                )}
                {(nl.status === "ready" || nl.status === "sent") && (
                  <Button
                    size="sm"
                    variant={nl.status === "sent" ? "ghost" : "primary"}
                    onClick={() => handleSend(nl)}
                    disabled={sendingId === nl.id}
                  >
                    {sendingId === nl.id ? (
                      <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path d="M2 12L12 2M12 2H5M12 2v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {sendingId === nl.id ? "Sending..." : nl.status === "sent" ? "Resend" : "Send"}
                  </Button>
                )}
                <button
                  onClick={() => { setViewing(nl); setEditingRecipients(nl.recipients || ""); }}
                  className="p-1.5 text-[#64748b] hover:text-[#e2e8f0] transition-colors cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M7 4v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(nl.id)}
                  className="p-1.5 text-[#64748b] hover:text-red-400 transition-colors cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 3.5h8M5.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1M4 3.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Create Modal ────────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Newsletter">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g. Weekly Update #12"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <Select
            label="Type"
            value={form.newsletter_type}
            onChange={(e) => setForm({ ...form, newsletter_type: e.target.value })}
            options={newsletterTypes}
          />
          {form.newsletter_type && typeDescriptions[form.newsletter_type] && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
              <p className="text-xs text-amber-400/80">{typeDescriptions[form.newsletter_type]}</p>
            </div>
          )}
          <Select
            label="Source Project"
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            options={[
              { value: "", label: "Global (all projects)" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Recipients</label>
            <Textarea
              placeholder="user@example.com, team@company.com"
              value={form.recipients}
              onChange={(e) => setForm({ ...form, recipients: e.target.value })}
              rows={2}
            />
            {(() => {
              const projectContacts = form.project_id
                ? contacts.filter((c) => c.email && c.project_id === form.project_id)
                : contacts.filter((c) => c.email);
              if (projectContacts.length > 0) {
                return (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const emails = projectContacts.map((c) => c.email).filter(Boolean);
                        const existing = form.recipients ? form.recipients.split(",").map((e) => e.trim()).filter(Boolean) : [];
                        const merged = [...new Set([...existing, ...emails])];
                        setForm({ ...form, recipients: merged.join(", ") });
                      }}
                      className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer flex items-center gap-1 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" />
                        <circle cx="9" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M7 9v4M5 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      Import {projectContacts.length} contact{projectContacts.length !== 1 ? "s" : ""} from Outbound
                    </button>
                  </div>
                );
              }
              return null;
            })()}
          </div>
          {/* A/B Testing */}
          <div className="border border-[#1e293b] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2h4v10H2V2zM8 2h4v10H8V2z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <text x="3" y="9" fill="currentColor" fontSize="5" fontWeight="bold">A</text>
                <text x="9" y="9" fill="currentColor" fontSize="5" fontWeight="bold">B</text>
              </svg>
              <span className="text-xs font-medium text-[#94a3b8]">A/B Subject Line Testing (optional)</span>
            </div>
            <Input
              label="Subject B"
              placeholder="Alternative subject line to test..."
              value={form.subject_b}
              onChange={(e) => setForm({ ...form, subject_b: e.target.value, subject_c: e.target.value ? form.subject_c : "" })}
            />
            {form.subject_b && (
              <>
                <Input
                  label="Subject C"
                  placeholder="Third subject line variant (optional)..."
                  value={form.subject_c}
                  onChange={(e) => setForm({ ...form, subject_c: e.target.value })}
                />
                <div>
                  <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">
                    Sample Size: {form.ab_test_sample_pct}% per variant
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={form.ab_test_sample_pct}
                    onChange={(e) => setForm({ ...form, ab_test_sample_pct: Number(e.target.value) })}
                    className="w-full h-1.5 bg-[#1e293b] rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-[#64748b] mt-1">
                    <span>5%</span>
                    <span>Each variant gets {form.ab_test_sample_pct}% of recipients</span>
                    <span>50%</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" disabled={creating || !form.title.trim()}>
              {creating ? "Creating..." : "Create Newsletter"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ─── View/Preview Modal ──────────────────────────────────────── */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title || "Newsletter"}
      >
        {viewing && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Status bar */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={statusColors[viewing.status]}>{viewing.status}</Badge>
              <Badge variant={typeColors[viewing.newsletter_type] || "amber"}>{viewing.newsletter_type}</Badge>
              <span className="text-xs text-[#64748b]">
                Project: {getProjectName(viewing.project_id)}
              </span>
              {viewing.subject && (
                <span className="text-xs text-[#94a3b8]">
                  Subject: {viewing.subject}
                </span>
              )}
            </div>

            {viewing.sent_at && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                <p className="text-xs text-emerald-400">
                  Sent on {new Date(viewing.sent_at).toLocaleString()} to {viewing.sent_count} recipient(s)
                </p>
              </div>
            )}

            {/* A/B Test Info */}
            {viewing.subject_b && (
              <div className="border border-[#1e293b] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#e2e8f0] flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 2h4v10H2V2zM8 2h4v10H8V2z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    A/B Test {viewing.subject_c ? "(3 variants)" : "(2 variants)"}
                  </span>
                  {viewing.ab_winner && (
                    <Badge variant="emerald">Winner: Variant {viewing.ab_winner}</Badge>
                  )}
                  {viewing.status === "sent" && !viewing.ab_winner && (
                    <span className="text-[10px] text-amber-400/70">Awaiting results</span>
                  )}
                </div>

                <div className="space-y-2">
                  {/* Variant A */}
                  <div className={`flex items-center gap-2 p-2 rounded-md ${viewing.ab_winner === "A" ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-[#0f1118]"}`}>
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 rounded px-1.5 py-0.5 flex-shrink-0">A</span>
                    <span className="text-xs text-[#e2e8f0] truncate flex-1">{viewing.subject || viewing.title}</span>
                    {viewing.ab_winner === "A" && <span className="text-[10px] text-emerald-400 flex-shrink-0">WINNER</span>}
                  </div>

                  {/* Variant B */}
                  <div className={`flex items-center gap-2 p-2 rounded-md ${viewing.ab_winner === "B" ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-[#0f1118]"}`}>
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 rounded px-1.5 py-0.5 flex-shrink-0">B</span>
                    <span className="text-xs text-[#e2e8f0] truncate flex-1">{viewing.subject_b}</span>
                    {viewing.ab_winner === "B" && <span className="text-[10px] text-emerald-400 flex-shrink-0">WINNER</span>}
                  </div>

                  {/* Variant C */}
                  {viewing.subject_c && (
                    <div className={`flex items-center gap-2 p-2 rounded-md ${viewing.ab_winner === "C" ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-[#0f1118]"}`}>
                      <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 rounded px-1.5 py-0.5 flex-shrink-0">C</span>
                      <span className="text-xs text-[#e2e8f0] truncate flex-1">{viewing.subject_c}</span>
                      {viewing.ab_winner === "C" && <span className="text-[10px] text-emerald-400 flex-shrink-0">WINNER</span>}
                    </div>
                  )}
                </div>

                {/* Metrics row */}
                {viewing.status === "sent" && (
                  <div className="flex items-center gap-4 pt-1 border-t border-[#1e293b]">
                    <div className="text-center">
                      <p className="text-[10px] text-[#64748b]">Sample</p>
                      <p className="text-xs font-semibold text-[#e2e8f0]">{viewing.ab_test_sample_pct}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-[#64748b]">Open Rate</p>
                      <p className="text-xs font-semibold text-[#e2e8f0]">{(viewing.open_rate * 100).toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-[#64748b]">Click Rate</p>
                      <p className="text-xs font-semibold text-[#e2e8f0]">{(viewing.click_rate * 100).toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-[#64748b]">Unsubs</p>
                      <p className="text-xs font-semibold text-[#e2e8f0]">{viewing.unsubscribe_count}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Recipients editor */}
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Recipients</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editingRecipients}
                  onChange={(e) => setEditingRecipients(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                  className="flex-1 bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#64748b] focus:outline-none focus:border-amber-500"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveRecipients}
                  disabled={savingRecipients || editingRecipients === (viewing.recipients || "")}
                >
                  {savingRecipients ? "..." : "Save"}
                </Button>
              </div>
              {(() => {
                const viewContacts = viewing.project_id
                  ? contacts.filter((c) => c.email && c.project_id === viewing.project_id)
                  : contacts.filter((c) => c.email);
                if (viewContacts.length > 0) {
                  return (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const emails = viewContacts.map((c) => c.email).filter(Boolean);
                          const existing = editingRecipients ? editingRecipients.split(",").map((e) => e.trim()).filter(Boolean) : [];
                          const merged = [...new Set([...existing, ...emails])];
                          setEditingRecipients(merged.join(", "));
                        }}
                        className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer flex items-center gap-1 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                          <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" />
                          <circle cx="9" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M7 9v4M5 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        Import {viewContacts.length} contact{viewContacts.length !== 1 ? "s" : ""} from Outbound
                      </button>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Content preview or empty state */}
            {viewing.content ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[#94a3b8]">Preview</label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleGenerate(viewing)}
                      disabled={generatingId === viewing.id}
                    >
                      {generatingId === viewing.id ? "Regenerating..." : "Regenerate"}
                    </Button>
                  </div>
                </div>
                <div
                  className="bg-white rounded-lg p-4 max-h-[400px] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: viewing.content }}
                />
              </div>
            ) : (
              <div className="bg-[#0f1118] border border-[#1e293b] border-dashed rounded-lg p-8 text-center">
                <p className="text-sm text-[#64748b] mb-3">
                  No content yet. Click &quot;Generate&quot; to create this newsletter from your project data.
                </p>
                <Button
                  onClick={() => handleGenerate(viewing)}
                  disabled={generatingId === viewing.id}
                >
                  {generatingId === viewing.id ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M11.2 2.8l-1.4 1.4M4.2 9.8l-1.4 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      Generate from Project Data
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-between pt-2 border-t border-[#1e293b]">
              <Button variant="ghost" size="sm" onClick={() => handleDelete(viewing.id)} className="!text-red-400 hover:!text-red-300">
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setViewing(null)}>Close</Button>
                {viewing.content && (viewing.status === "ready" || viewing.status === "sent") && (
                  <Button
                    onClick={() => handleSend(viewing)}
                    disabled={sendingId === viewing.id || !viewing.recipients?.trim()}
                  >
                    {sendingId === viewing.id ? "Sending..." : viewing.status === "sent" ? "Resend" : "Send Newsletter"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
