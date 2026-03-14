"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  status: string;
  sequence_step: number;
  project_id?: string;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
}

const statusStages = ["lead", "contacted", "replied", "converted"];

const statusColors: Record<string, "default" | "info" | "warning" | "success"> = {
  lead: "default",
  contacted: "info",
  replied: "warning",
  converted: "success",
};

export default function OutboundPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filterProject, setFilterProject] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
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
      fetch("/api/outbound").then((r) => r.json()).catch(() => []),
      fetch("/api/projects").then((r) => r.json()).catch(() => []),
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
      }
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (contact: Contact, newStatus: string) => {
    try {
      await fetch(`/api/outbound/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchData();
    } catch {
      // ignore
    }
  };

  const filtered = contacts.filter((c) => {
    if (filterProject !== "all" && c.project_id !== filterProject) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    return true;
  });

  // Pipeline counts
  const pipelineCounts = statusStages.map((stage) => ({
    stage,
    count: contacts.filter((c) => c.status === stage).length,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Outbound</h1>
          <p className="text-sm text-[#94a3b8] mt-1">Pipeline and deal management</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add Contact
        </Button>
      </div>

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
          title={filterProject !== "all" || filterStatus !== "all" ? "No matching contacts" : "No contacts yet"}
          description="Add contacts to start your outbound pipeline."
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
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-[#1e293b]/50 hover:bg-[#1c2030] transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-[#e2e8f0]">{contact.name || "-"}</td>
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
    </div>
  );
}
