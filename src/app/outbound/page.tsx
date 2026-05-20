"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

// ─── Types ───────────────────────────────────────────────────────

interface SendEmailTarget {
  id: string;
  name: string;
  email: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  notes: string;
  status: string;
  sequence_step: number;
  sequence_id?: string;
  project_id?: string;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
}

interface SequenceStep {
  id: string;
  type: "email" | "delay" | "condition";
  delay_days: number;
  subject: string | null;
  body: string | null;
  condition: { type: string; step_id: string; then_step: string; else_step: string } | null;
}

interface Sequence {
  id: string;
  project_id: string | null;
  name: string;
  status: "draft" | "active" | "paused" | "completed";
  steps: string;
  settings: string;
  stats: string;
  created_at: string;
  updated_at: string;
  enrolled_contacts?: Contact[];
}

// ─── Constants ───────────────────────────────────────────────────

const statusStages = ["lead", "contacted", "replied", "converted"];

const statusColors: Record<string, "default" | "info" | "warning" | "success"> = {
  lead: "default",
  contacted: "info",
  replied: "warning",
  converted: "success",
};

const seqStatusColors: Record<string, "default" | "info" | "warning" | "success" | "emerald" | "amber"> = {
  draft: "default",
  active: "emerald",
  paused: "amber",
  completed: "success",
};

export default function OutboundPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    }>
      <OutboundPageInner />
    </Suspense>
  );
}

function OutboundPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"contacts" | "sequences">(
    tabParam === "sequences" ? "sequences" : "contacts"
  );

  // Sync tab when URL changes (e.g., clicking sidebar link)
  useEffect(() => {
    if (tabParam === "sequences") {
      setActiveTab("sequences");
    }
  }, [tabParam]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Outbound</h1>
          <p className="text-sm text-[#94a3b8] mt-1">Pipeline, contacts, and automated sequences</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-[#0f1118] rounded-lg p-1 w-fit border border-[#1e293b]">
        <button
          onClick={() => setActiveTab("contacts")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${
            activeTab === "contacts"
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              : "text-[#94a3b8] hover:text-[#e2e8f0] border border-transparent"
          }`}
        >
          Contacts
        </button>
        <button
          onClick={() => setActiveTab("sequences")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${
            activeTab === "sequences"
              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
              : "text-[#94a3b8] hover:text-[#e2e8f0] border border-transparent"
          }`}
        >
          Sequences
        </button>
      </div>

      {activeTab === "contacts" ? <ContactsTab /> : <SequencesTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONTACTS TAB (original outbound page content)
// ═══════════════════════════════════════════════════════════════════

function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [error, setError] = useState("");
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [sendTarget, setSendTarget] = useState<SendEmailTarget | null>(null);
  const [sendForm, setSendForm] = useState({ subject: "", body: "" });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    notes: "",
  });
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    status: "lead",
    project_id: "",
  });

  const fetchData = () => {
    Promise.all([
      fetch("/api/outbound").then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/projects").then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([cont, proj]) => {
      setContacts(Array.isArray(cont) ? cont : []);
      setProjects(Array.isArray(proj) ? proj : []);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() && !form.email.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ name: "", email: "", company: "", role: "", status: "lead", project_id: "" });
        setShowCreate(false);
        fetchData();
      } else {
        setError("Failed to create contact");
      }
    } catch {
      setError("Failed to create contact");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (contact: Contact, newStatus: string) => {
    const previousStatus = contact.status;
    setContacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, status: newStatus } : c))
    );
    try {
      const res = await fetch(`/api/outbound/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        setContacts((prev) =>
          prev.map((c) => (c.id === contact.id ? { ...c, status: previousStatus } : c))
        );
        setError("Failed to update contact status");
      }
    } catch {
      setContacts((prev) =>
        prev.map((c) => (c.id === contact.id ? { ...c, status: previousStatus } : c))
      );
      setError("Failed to update contact status");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    try {
      const res = await fetch(`/api/outbound/${id}`, { method: "DELETE" });
      if (!res.ok) setError("Failed to delete contact");
      fetchData();
    } catch {
      setError("Failed to delete contact");
    }
  };

  const openEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setEditForm({
      name: contact.name || "",
      email: contact.email || "",
      company: contact.company || "",
      role: contact.role || "",
      notes: contact.notes || "",
    });
  };

  const handleEditContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/outbound/${editingContact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingContact(null);
        fetchData();
      } else {
        setError("Failed to update contact");
      }
    } catch {
      setError("Failed to update contact");
    } finally {
      setEditSaving(false);
    }
  };

  const openSendEmail = (contact: Contact) => {
    if (!contact.email) {
      setError("This contact has no email address.");
      return;
    }
    setSendTarget({ id: contact.id, name: contact.name, email: contact.email });
    setSendForm({ subject: "", body: "" });
    setSendResult(null);
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendTarget) return;
    setSending(true);
    try {
      const res = await fetch(`/api/outbound/${sendTarget.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendForm),
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult({ success: true, message: `Email sent to ${sendTarget.name} (${sendTarget.email})` });
        setSendTarget(null);
        fetchData();
      } else {
        setSendResult({ success: false, message: data.error || "Failed to send email" });
      }
    } catch {
      setSendResult({ success: false, message: "Network error while sending email" });
    } finally {
      setSending(false);
    }
  };

  const filtered = contacts.filter((c) => {
    if (filterProject !== "all" && c.project_id !== filterProject) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.role?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pipelineCounts = statusStages.map((stage) => ({
    stage,
    count: contacts.filter((c) => c.status === stage).length,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => window.open("/api/outbound/export", "_blank")}
          className="px-3 py-2 text-xs bg-[#141822] border border-[#1e293b]/50 rounded-lg text-[#94a3b8] hover:text-white hover:border-[#334155] transition-colors cursor-pointer"
        >
          Export CSV
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="px-3 py-2 text-xs bg-[#141822] border border-[#1e293b]/50 rounded-lg text-[#94a3b8] hover:text-white hover:border-[#334155] transition-colors cursor-pointer"
        >
          Import CSV
        </button>
        <Button onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add Contact
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300 cursor-pointer text-sm">&#x2715;</button>
        </div>
      )}

      {sendResult && (
        <div className={`${sendResult.success ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"} border rounded-lg px-4 py-3 flex items-center justify-between`}>
          <span className={`text-sm ${sendResult.success ? "text-emerald-400" : "text-red-400"}`}>{sendResult.message}</span>
          <button onClick={() => setSendResult(null)} className={`${sendResult.success ? "text-emerald-400 hover:text-emerald-300" : "text-red-400 hover:text-red-300"} cursor-pointer text-sm`}>&#x2715;</button>
        </div>
      )}

      {/* Pipeline visualization */}
      <div className="grid grid-cols-4 gap-3">
        {pipelineCounts.map(({ stage, count }, i) => (
          <Card key={stage} hover={false} className="!p-4 text-center relative overflow-hidden">
            {i < pipelineCounts.length - 1 && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 text-[#1e293b] z-10">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 8h8M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            <div className="text-3xl font-bold text-[#e2e8f0] mb-1">{count}</div>
            <Badge variant={statusColors[stage] || "default"}>
              {stage}
            </Badge>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#64748b] focus:outline-none focus:border-amber-500"
          />
        </div>
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">All Projects</option>
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
          {statusStages.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M12 24h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M28 18l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="38" cy="24" r="4" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          }
          title={search || filterProject !== "all" || filterStatus !== "all" ? "No matching contacts" : "No contacts yet"}
          description={search || filterProject !== "all" || filterStatus !== "all" ? "Try adjusting your filters." : "Add contacts to start your outbound pipeline."}
          actionLabel="Add Contact"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="bg-[#141822] border border-[#1e293b] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1e293b]">
                <th className="text-left text-xs font-medium text-[#64748b] uppercase tracking-wider px-4 py-3">
                  Name
                </th>
                <th className="text-left text-xs font-medium text-[#64748b] uppercase tracking-wider px-4 py-3">
                  Email
                </th>
                <th className="text-left text-xs font-medium text-[#64748b] uppercase tracking-wider px-4 py-3">
                  Company
                </th>
                <th className="text-left text-xs font-medium text-[#64748b] uppercase tracking-wider px-4 py-3">
                  Role
                </th>
                <th className="text-left text-xs font-medium text-[#64748b] uppercase tracking-wider px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-[#64748b] uppercase tracking-wider px-4 py-3">
                  Step
                </th>
                <th className="text-right text-xs font-medium text-[#64748b] uppercase tracking-wider px-4 py-3">
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-[#1e293b]/50 hover:bg-[#1c2030] transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-[#e2e8f0]">
                    <span
                      className="cursor-pointer hover:text-amber-400 transition-colors"
                      onClick={() => openEditContact(contact)}
                    >
                      {contact.name || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#94a3b8]">{contact.email || "-"}</td>
                  <td className="px-4 py-3 text-sm text-[#94a3b8]">{contact.company || "-"}</td>
                  <td className="px-4 py-3 text-sm text-[#94a3b8]">{contact.role || "-"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={contact.status || "lead"}
                      onChange={(e) => handleStatusChange(contact, e.target.value)}
                      className="bg-transparent border border-[#1e293b] rounded px-2 py-1 text-xs text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      {statusStages.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#64748b]">{contact.sequence_step || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {contact.email && (
                        <button
                          onClick={() => openSendEmail(contact)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors cursor-pointer"
                          title="Send email"
                        >
                          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                            <rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                            <path d="M1 4.5l6 4 6-4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                          </svg>
                          Send
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(contact.id)}
                        className="text-[#64748b] hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3 3.5h8M5.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1M4 3.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Contact">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Name"
            placeholder="John Doe"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            placeholder="john@company.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Company"
              placeholder="Acme Inc."
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
            <Input
              label="Role"
              placeholder="CTO"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={statusStages.map((s) => ({ value: s, label: s }))}
            />
            {projects.length > 0 && (
              <Select
                label="Project"
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                options={[
                  { value: "", label: "None" },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || (!form.name.trim() && !form.email.trim())}>
              {creating ? "Adding..." : "Add Contact"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal open={showImport} onClose={() => { setShowImport(false); setImportResult(null); setCsvText(""); }} title="Import Contacts from CSV">
        <div className="space-y-4">
          <p className="text-xs text-[#64748b]">
            Paste CSV with headers: <code className="text-amber-400">name, email, company, role, notes, tags</code>
          </p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={"name,email,company,role\nJohn Doe,john@example.com,Acme Corp,CEO\nJane Smith,jane@example.com,Widget Inc,CTO"}
            rows={8}
            className="w-full bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500/50"
          />
          {importResult && (
            <div className={`rounded-lg px-4 py-3 text-sm ${importResult.imported > 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/10 text-amber-400 border border-amber-500/30"}`}>
              Imported {importResult.imported} contacts, {importResult.skipped} skipped
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => { setShowImport(false); setImportResult(null); setCsvText(""); }}>
              {importResult ? "Close" : "Cancel"}
            </Button>
            {!importResult && (
              <Button
                disabled={importing || !csvText.trim()}
                onClick={async () => {
                  setImporting(true);
                  try {
                    const res = await fetch("/api/outbound/import", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ csv: csvText }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setImportResult({ imported: data.imported, skipped: data.skipped });
                      fetchData();
                    } else {
                      setError(data.error || "Import failed");
                    }
                  } catch {
                    setError("Import failed");
                  } finally {
                    setImporting(false);
                  }
                }}
              >
                {importing ? "Importing..." : "Import"}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Send Email Modal */}
      <Modal open={!!sendTarget} onClose={() => setSendTarget(null)} title={`Send Email to ${sendTarget?.name || ""}`}>
        <form onSubmit={handleSendEmail} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">To</label>
            <div className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#64748b]">
              {sendTarget?.name} &lt;{sendTarget?.email}&gt;
            </div>
          </div>
          <Input
            label="Subject"
            placeholder="Email subject line..."
            value={sendForm.subject}
            onChange={(e) => setSendForm({ ...sendForm, subject: e.target.value })}
            required
          />
          <Textarea
            label="Body"
            placeholder="Write your email content here..."
            value={sendForm.body}
            onChange={(e) => setSendForm({ ...sendForm, body: e.target.value })}
            rows={8}
          />
          {sendResult && !sendResult.success && (
            <div className="text-xs text-red-400">{sendResult.message}</div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setSendTarget(null)}>Cancel</Button>
            <Button type="submit" disabled={sending || !sendForm.subject.trim() || !sendForm.body.trim()}>
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                  Sending...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 12L12 2M12 2H5M12 2v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Send Email
                </>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Contact Modal */}
      <Modal open={!!editingContact} onClose={() => setEditingContact(null)} title="Edit Contact">
        <form onSubmit={handleEditContact} className="space-y-4">
          <Input
            label="Name"
            placeholder="John Doe"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            placeholder="john@company.com"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Company"
              placeholder="Acme Inc."
              value={editForm.company}
              onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
            />
            <Input
              label="Role"
              placeholder="CTO"
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
            />
          </div>
          <Textarea
            label="Notes"
            placeholder="Additional notes about this contact..."
            value={editForm.notes}
            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setEditingContact(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={editSaving}>
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SEQUENCES TAB (new)
// ═══════════════════════════════════════════════════════════════════

function SequencesTab() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingSequence, setEditingSequence] = useState<Sequence | null>(null);
  const [detailSequence, setDetailSequence] = useState<(Sequence & { enrolled_contacts: Contact[] }) | null>(null);
  const [saving, setSaving] = useState(false);

  // Builder form state
  const [builderName, setBuilderName] = useState("");
  const [builderSteps, setBuilderSteps] = useState<SequenceStep[]>([
    { id: "step-1", type: "email", delay_days: 0, subject: "", body: "", condition: null },
  ]);

  const fetchSequences = async () => {
    try {
      const res = await fetch("/api/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences(Array.isArray(data) ? data : []);
      }
    } catch {
      setError("Failed to load sequences");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSequences();
  }, []);

  const parseSteps = (stepsStr: string): SequenceStep[] => {
    try {
      return JSON.parse(stepsStr);
    } catch {
      return [];
    }
  };

  const parseStats = (statsStr: string): Record<string, number> => {
    try {
      return JSON.parse(statsStr);
    } catch {
      return {};
    }
  };

  const openBuilder = (sequence?: Sequence) => {
    if (sequence) {
      setEditingSequence(sequence);
      setBuilderName(sequence.name);
      setBuilderSteps(parseSteps(sequence.steps));
    } else {
      setEditingSequence(null);
      setBuilderName("");
      setBuilderSteps([
        { id: "step-1", type: "email", delay_days: 0, subject: "", body: "", condition: null },
      ]);
    }
    setShowBuilder(true);
  };

  const addStep = () => {
    const nextId = `step-${builderSteps.length + 1}`;
    setBuilderSteps([
      ...builderSteps,
      { id: nextId, type: "email", delay_days: 2, subject: "", body: "", condition: null },
    ]);
  };

  const removeStep = (idx: number) => {
    if (builderSteps.length <= 1) return;
    setBuilderSteps(builderSteps.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, updates: Partial<SequenceStep>) => {
    setBuilderSteps(
      builderSteps.map((s, i) => (i === idx ? { ...s, ...updates } : s))
    );
  };

  const handleSaveSequence = async (activate = false) => {
    if (!builderName.trim()) {
      setError("Sequence name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: builderName,
        steps: builderSteps,
        ...(activate ? { status: "active" } : {}),
      };

      let res;
      if (editingSequence) {
        res = await fetch(`/api/sequences/${editingSequence.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/sequences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setShowBuilder(false);
        setEditingSequence(null);
        fetchSequences();
      } else {
        setError("Failed to save sequence");
      }
    } catch {
      setError("Failed to save sequence");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (seq: Sequence, status: string) => {
    try {
      const res = await fetch(`/api/sequences/${seq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchSequences();
      } else {
        setError("Failed to update sequence status");
      }
    } catch {
      setError("Failed to update sequence status");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this sequence? Enrolled contacts will be unenrolled.")) return;
    try {
      const res = await fetch(`/api/sequences/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchSequences();
        if (detailSequence?.id === id) setDetailSequence(null);
      } else {
        setError("Failed to delete sequence");
      }
    } catch {
      setError("Failed to delete sequence");
    }
  };

  const openDetail = async (seq: Sequence) => {
    try {
      const res = await fetch(`/api/sequences/${seq.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailSequence({
          ...data,
          enrolled_contacts: data.enrolled_contacts || [],
        });
      }
    } catch {
      setError("Failed to load sequence details");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300 cursor-pointer text-sm">&#x2715;</button>
        </div>
      )}

      {/* ─── Sequence List View ─── */}
      {!showBuilder && !detailSequence && (
        <>
          <div className="flex items-center justify-end">
            <Button onClick={() => openBuilder()}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Create Sequence
            </Button>
          </div>

          {sequences.length === 0 ? (
            <EmptyState
              icon={
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <path d="M12 14h24M12 24h20M12 34h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="36" cy="24" r="3" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="32" cy="34" r="3" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              }
              title="No sequences yet"
              description="Create automated email sequences to nurture your leads through multi-step outreach campaigns."
              actionLabel="Create Sequence"
              onAction={() => openBuilder()}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sequences.map((seq) => {
                const steps = parseSteps(seq.steps);
                const stats = parseStats(seq.stats);
                const emailSteps = steps.filter((s) => s.type === "email");

                return (
                  <Card key={seq.id} onClick={() => openDetail(seq)} className="relative group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-[#e2e8f0] truncate">{seq.name}</h3>
                        <p className="text-xs text-[#64748b] mt-0.5">
                          {emailSteps.length} email{emailSteps.length !== 1 ? "s" : ""} &middot; {steps.length} step{steps.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Badge variant={seqStatusColors[seq.status] || "default"}>
                        {seq.status}
                      </Badge>
                    </div>

                    {/* Mini step preview */}
                    <div className="flex items-center gap-1.5 mb-3">
                      {steps.slice(0, 6).map((step, i) => (
                        <div key={step.id} className="flex items-center gap-1.5">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                              step.type === "email"
                                ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                                : step.type === "delay"
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                            }`}
                          >
                            {step.type === "email" ? "E" : step.type === "delay" ? "D" : "?"}
                          </div>
                          {i < Math.min(steps.length - 1, 5) && (
                            <div className="w-3 h-px bg-[#1e293b]" />
                          )}
                        </div>
                      ))}
                      {steps.length > 6 && (
                        <span className="text-[10px] text-[#64748b]">+{steps.length - 6}</span>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-xs text-[#64748b]">
                      {stats.sent !== undefined && (
                        <span>Sent: <span className="text-[#94a3b8]">{stats.sent}</span></span>
                      )}
                      {stats.replies !== undefined && (
                        <span>Replies: <span className="text-[#94a3b8]">{stats.replies}</span></span>
                      )}
                      <span className="ml-auto text-[10px]">
                        {new Date(seq.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>

                    {/* Hover actions */}
                    <div className="absolute top-3 right-12 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); openBuilder(seq); }}
                        className="p-1 rounded hover:bg-white/10 text-[#64748b] hover:text-[#e2e8f0] transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M8.5 1.5l2 2-7 7H1.5V8.5l7-7z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(seq.id); }}
                        className="p-1 rounded hover:bg-red-500/10 text-[#64748b] hover:text-red-400 transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 3h7M4.5 3V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M3.5 3l.4 6.5a.5.5 0 00.5.5h3.2a.5.5 0 00.5-.5L8.5 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── Sequence Builder ─── */}
      {showBuilder && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setShowBuilder(false); setEditingSequence(null); }}
              className="flex items-center gap-2 text-sm text-[#94a3b8] hover:text-[#e2e8f0] transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to Sequences
            </button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => handleSaveSequence(false)} disabled={saving}>
                {saving ? "Saving..." : "Save as Draft"}
              </Button>
              <Button onClick={() => handleSaveSequence(true)} disabled={saving}>
                {saving ? "Saving..." : "Save & Activate"}
              </Button>
            </div>
          </div>

          {/* Sequence name */}
          <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-5">
            <Input
              label="Sequence Name"
              placeholder="e.g., Cold Outreach, Onboarding Follow-up..."
              value={builderName}
              onChange={(e) => setBuilderName(e.target.value)}
            />
          </div>

          {/* Steps builder */}
          <div className="space-y-0">
            {builderSteps.map((step, idx) => (
              <div key={step.id}>
                {/* Connector line */}
                {idx > 0 && (
                  <div className="flex justify-center py-1">
                    <div className="w-px h-6 bg-gradient-to-b from-indigo-500/30 to-indigo-500/10" />
                  </div>
                )}

                {/* Step card */}
                <div className={`bg-[#141822] border rounded-xl p-5 transition-all ${
                  step.type === "email"
                    ? "border-indigo-500/20 hover:border-indigo-500/40"
                    : step.type === "delay"
                    ? "border-amber-500/20 hover:border-amber-500/40"
                    : "border-violet-500/20 hover:border-violet-500/40"
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        step.type === "email"
                          ? "bg-indigo-500/20 text-indigo-400"
                          : step.type === "delay"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-violet-500/20 text-violet-400"
                      }`}>
                        {idx + 1}
                      </div>
                      <div>
                        <select
                          value={step.type}
                          onChange={(e) => updateStep(idx, { type: e.target.value as SequenceStep["type"] })}
                          className="bg-transparent border border-[#1e293b] rounded px-2 py-1 text-xs text-[#e2e8f0] focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="email">Email</option>
                          <option value="delay">Wait / Delay</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Delay input for all steps */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-[#64748b]">Wait</span>
                        <input
                          type="number"
                          min="0"
                          value={step.delay_days}
                          onChange={(e) => updateStep(idx, { delay_days: parseInt(e.target.value) || 0 })}
                          className="w-12 bg-[#0f1118] border border-[#1e293b] rounded px-2 py-1 text-xs text-[#e2e8f0] text-center focus:outline-none focus:border-indigo-500"
                        />
                        <span className="text-[10px] text-[#64748b]">days</span>
                      </div>
                      {builderSteps.length > 1 && (
                        <button
                          onClick={() => removeStep(idx)}
                          className="p-1 rounded hover:bg-red-500/10 text-[#64748b] hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M3 3.5h8M5.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1M4 3.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {step.type === "email" && (
                    <div className="space-y-3">
                      <Input
                        label="Subject"
                        placeholder="Email subject line..."
                        value={step.subject || ""}
                        onChange={(e) => updateStep(idx, { subject: e.target.value })}
                      />
                      <Textarea
                        label="Body"
                        placeholder="Write your email body here. Use {{name}}, {{company}} for personalization..."
                        value={step.body || ""}
                        onChange={(e) => updateStep(idx, { body: e.target.value })}
                        rows={4}
                      />
                    </div>
                  )}

                  {step.type === "delay" && (
                    <div className="text-center py-4">
                      <div className="text-sm text-amber-400">
                        Wait {step.delay_days} day{step.delay_days !== 1 ? "s" : ""} before next step
                      </div>
                      <p className="text-xs text-[#64748b] mt-1">The automation engine will hold contacts at this step for the specified delay</p>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Add step button */}
            <div className="flex justify-center pt-2">
              <div className="w-px h-4 bg-[#1e293b]" />
            </div>
            <div className="flex justify-center">
              <button
                onClick={addStep}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-[#1e293b] text-sm text-[#64748b] hover:text-[#e2e8f0] hover:border-indigo-500/30 transition-all cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Add Step
              </button>
            </div>
          </div>

          {/* How it works */}
          <div className="bg-[#0f1118] border border-[#1e293b] rounded-xl p-5">
            <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-3">How the Automation Engine Processes This</h3>
            <div className="space-y-2 text-xs text-[#64748b]">
              <p>1. When a contact is enrolled, the engine starts at Step 1</p>
              <p>2. For each email step, the engine sends the email and advances the contact</p>
              <p>3. Delay steps hold the contact for the specified number of days before proceeding</p>
              <p>4. The engine checks for due sequence steps periodically and processes them automatically</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sequence Detail View ─── */}
      {detailSequence && !showBuilder && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setDetailSequence(null)}
              className="flex items-center gap-2 text-sm text-[#94a3b8] hover:text-[#e2e8f0] transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to Sequences
            </button>
            <div className="flex items-center gap-2">
              {detailSequence.status === "draft" && (
                <Button size="sm" onClick={() => { handleStatusChange(detailSequence, "active"); setDetailSequence({ ...detailSequence, status: "active" }); }}>
                  Activate
                </Button>
              )}
              {detailSequence.status === "active" && (
                <Button size="sm" variant="secondary" onClick={() => { handleStatusChange(detailSequence, "paused"); setDetailSequence({ ...detailSequence, status: "paused" }); }}>
                  Pause
                </Button>
              )}
              {detailSequence.status === "paused" && (
                <Button size="sm" onClick={() => { handleStatusChange(detailSequence, "active"); setDetailSequence({ ...detailSequence, status: "active" }); }}>
                  Resume
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => { openBuilder(detailSequence); setDetailSequence(null); }}>
                Edit
              </Button>
            </div>
          </div>

          {/* Header card */}
          <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#e2e8f0]">{detailSequence.name}</h2>
                <p className="text-xs text-[#64748b] mt-1">
                  Created {new Date(detailSequence.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <Badge variant={seqStatusColors[detailSequence.status] || "default"} className="text-sm">
                {detailSequence.status}
              </Badge>
            </div>

            {/* Stats */}
            {(() => {
              const stats = parseStats(detailSequence.stats);
              return Object.keys(stats).length > 0 ? (
                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[#1e293b]">
                  <div>
                    <div className="text-xs text-[#64748b]">Emails Sent</div>
                    <div className="text-lg font-bold text-[#e2e8f0]">{stats.sent || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#64748b]">Replies</div>
                    <div className="text-lg font-bold text-emerald-400">{stats.replies || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#64748b]">Conversions</div>
                    <div className="text-lg font-bold text-amber-400">{stats.conversions || 0}</div>
                  </div>
                </div>
              ) : null;
            })()}
          </div>

          {/* Steps visualization */}
          <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-5">
            <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-4">Sequence Steps</h3>
            <div className="space-y-0">
              {parseSteps(detailSequence.steps).map((step, idx, arr) => (
                <div key={step.id}>
                  <div className="flex items-start gap-4">
                    {/* Timeline dot + line */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        step.type === "email"
                          ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                          : step.type === "delay"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                      }`}>
                        {step.type === "email" ? (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                            <path d="M1 4.5l6 4 6-4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
                            <path d="M7 4v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                          </svg>
                        )}
                      </div>
                      {idx < arr.length - 1 && (
                        <div className="w-px h-10 bg-gradient-to-b from-[#1e293b] to-transparent mt-1" />
                      )}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-[#e2e8f0]">
                          {step.type === "email" ? `Email: ${step.subject || "(no subject)"}` : `Wait ${step.delay_days} day${step.delay_days !== 1 ? "s" : ""}`}
                        </span>
                        {step.delay_days > 0 && step.type === "email" && (
                          <span className="text-[10px] text-amber-400">+{step.delay_days}d delay</span>
                        )}
                      </div>
                      {step.type === "email" && step.body && (
                        <p className="text-xs text-[#64748b] line-clamp-2">{step.body}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Enrolled Contacts */}
          <div className="bg-[#141822] border border-[#1e293b] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1e293b] flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
                Enrolled Contacts
              </h3>
              <span className="text-xs text-[#64748b]">
                {detailSequence.enrolled_contacts.length} enrolled
              </span>
            </div>

            {detailSequence.enrolled_contacts.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1e293b]">
                    <th className="text-left text-xs font-medium text-[#64748b] uppercase tracking-wider px-5 py-2">Name</th>
                    <th className="text-left text-xs font-medium text-[#64748b] uppercase tracking-wider px-4 py-2">Email</th>
                    <th className="text-left text-xs font-medium text-[#64748b] uppercase tracking-wider px-4 py-2">Status</th>
                    <th className="text-left text-xs font-medium text-[#64748b] uppercase tracking-wider px-4 py-2">Current Step</th>
                  </tr>
                </thead>
                <tbody>
                  {detailSequence.enrolled_contacts.map((contact) => (
                    <tr key={contact.id} className="border-b border-[#1e293b]/50 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-2.5 text-sm text-[#e2e8f0]">{contact.name || "-"}</td>
                      <td className="px-4 py-2.5 text-sm text-[#94a3b8]">{contact.email || "-"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={statusColors[contact.status] || "default"}>{contact.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-[#64748b]">Step {contact.sequence_step || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-[#484f58]">No contacts enrolled in this sequence yet</p>
                <p className="text-xs text-[#64748b] mt-1">Assign contacts to this sequence from the Contacts tab</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
