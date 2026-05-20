"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

interface Webinar {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  video_url: string | null;
  is_automated: number;
  schedule: string;
  registration_count: number;
  attendance_count: number;
  status: string;
  created_at: string;
}

interface Registration {
  id: string;
  webinar_id: string;
  email: string;
  name: string | null;
  session_datetime: string | null;
  attended: number;
  watched_pct: number;
  created_at: string;
}

const statusOptions = ["draft", "scheduled", "live", "completed", "evergreen"];

const statusBadgeStyles: Record<string, string> = {
  draft: "bg-[#1e293b] text-[#94a3b8]",
  scheduled: "bg-blue-500/10 text-blue-400",
  live: "bg-red-500/10 text-red-400",
  completed: "bg-emerald-500/10 text-emerald-400",
  evergreen: "bg-amber-500/10 text-amber-400",
};

export default function WebinarsPage() {
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    video_url: "",
    status: "draft",
    is_automated: false,
  });

  // Detail panel
  const [selectedWebinar, setSelectedWebinar] = useState<Webinar | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loadingRegs, setLoadingRegs] = useState(false);

  // Register form
  const [regForm, setRegForm] = useState({ email: "", name: "" });
  const [registering, setRegistering] = useState(false);

  const fetchWebinars = async () => {
    try {
      const res = await fetch("/api/webinars");
      if (res.ok) {
        const data = await res.json();
        setWebinars(Array.isArray(data) ? data : []);
      }
    } catch {
      setError("Failed to fetch webinars");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebinars();
  }, []);

  const fetchRegistrations = async (webinarId: string) => {
    setLoadingRegs(true);
    try {
      const res = await fetch(`/api/webinars?webinar_id=${webinarId}&registrations=true`);
      if (res.ok) {
        const data = await res.json();
        setRegistrations(Array.isArray(data.registrations) ? data.registrations : []);
      }
    } catch {
      setError("Failed to fetch registrations");
    } finally {
      setLoadingRegs(false);
    }
  };

  const openDetail = (webinar: Webinar) => {
    setSelectedWebinar(webinar);
    setRegForm({ email: "", name: "" });
    fetchRegistrations(webinar.id);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/webinars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (res.ok) {
        setCreateForm({ title: "", description: "", video_url: "", status: "draft", is_automated: false });
        setShowCreate(false);
        fetchWebinars();
      } else {
        setError("Failed to create webinar");
      }
    } catch {
      setError("Failed to create webinar");
    } finally {
      setCreating(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.email.trim() || !selectedWebinar) return;
    setRegistering(true);
    try {
      const res = await fetch("/api/webinars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          webinar_id: selectedWebinar.id,
          email: regForm.email,
          name: regForm.name || null,
        }),
      });
      if (res.ok) {
        setRegForm({ email: "", name: "" });
        fetchRegistrations(selectedWebinar.id);
        fetchWebinars(); // refresh counts
      } else {
        setError("Failed to register");
      }
    } catch {
      setError("Failed to register");
    } finally {
      setRegistering(false);
    }
  };

  // Stats for detail panel
  const totalRegs = registrations.length;
  const totalAttended = registrations.filter((r) => r.attended).length;
  const avgWatchPct =
    totalAttended > 0
      ? Math.round(
          registrations.filter((r) => r.attended).reduce((sum, r) => sum + (r.watched_pct || 0), 0) / totalAttended
        )
      : 0;

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
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Webinars</h1>
          <p className="text-sm text-[#94a3b8] mt-1">Manage webinars and track registrations</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Create Webinar
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300 cursor-pointer text-sm">
            &#x2715;
          </button>
        </div>
      )}

      {/* Webinar List */}
      {webinars.length === 0 ? (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="8" y="12" width="32" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M20 20l8 4-8 4V20z" fill="currentColor" opacity="0.5" />
              <circle cx="24" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M24 11v1" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          }
          title="No webinars yet"
          description="Create webinars to engage your audience with live or automated presentations."
          actionLabel="Create Webinar"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {webinars.map((webinar) => (
            <Card key={webinar.id} onClick={() => openDetail(webinar)}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#e2e8f0] pr-2 line-clamp-2">{webinar.title}</h3>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    statusBadgeStyles[webinar.status] || statusBadgeStyles.draft
                  }`}
                >
                  {webinar.status === "live" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  )}
                  {webinar.status}
                </span>
              </div>

              {webinar.description && (
                <p className="text-xs text-[#64748b] mb-3 line-clamp-2">{webinar.description}</p>
              )}

              <div className="flex items-center gap-4 pt-3 border-t border-[#1e293b]">
                <div className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="5" r="2.5" stroke="#64748b" strokeWidth="1.2" />
                    <path d="M3 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="#64748b" strokeWidth="1.2" />
                  </svg>
                  <span className="text-xs text-[#94a3b8]">{webinar.registration_count} registered</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7l4 4 6-8" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xs text-[#94a3b8]">{webinar.attendance_count} attended</span>
                </div>
              </div>

              {webinar.is_automated === 1 && (
                <div className="mt-2">
                  <Badge variant="info">Automated</Badge>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Webinar">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Title"
            placeholder="Webinar title..."
            value={createForm.title}
            onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
            required
          />
          <Textarea
            label="Description"
            placeholder="Describe your webinar..."
            value={createForm.description}
            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            rows={3}
          />
          <Input
            label="Video URL"
            placeholder="https://... (for replay or automated webinars)"
            value={createForm.video_url}
            onChange={(e) => setCreateForm({ ...createForm, video_url: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Status"
              value={createForm.status}
              onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
              options={statusOptions.map((s) => ({ value: s, label: s }))}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#94a3b8]">Automated</label>
              <button
                type="button"
                onClick={() => setCreateForm({ ...createForm, is_automated: !createForm.is_automated })}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
                  createForm.is_automated ? "bg-amber-500" : "bg-[#1e293b]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
                    createForm.is_automated ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !createForm.title.trim()}>
              {creating ? "Creating..." : "Create Webinar"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Detail Slideout */}
      <Modal
        open={!!selectedWebinar}
        onClose={() => setSelectedWebinar(null)}
        title={selectedWebinar?.title || "Webinar Details"}
        wide
      >
        {selectedWebinar && (
          <div className="space-y-6">
            {/* Webinar Info */}
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  statusBadgeStyles[selectedWebinar.status] || statusBadgeStyles.draft
                }`}
              >
                {selectedWebinar.status === "live" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                )}
                {selectedWebinar.status}
              </span>
              {selectedWebinar.is_automated === 1 && <Badge variant="info">Automated</Badge>}
              {selectedWebinar.video_url && (
                <a
                  href={selectedWebinar.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path d="M4 10L10 4M10 4H5M10 4v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Video Link
                </a>
              )}
            </div>

            {selectedWebinar.description && (
              <p className="text-sm text-[#94a3b8]">{selectedWebinar.description}</p>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#0f1118] border border-[#1e293b] rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-[#e2e8f0]">{selectedWebinar.registration_count}</div>
                <div className="text-xs text-[#64748b] mt-1">Registrations</div>
              </div>
              <div className="bg-[#0f1118] border border-[#1e293b] rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-[#e2e8f0]">{selectedWebinar.attendance_count}</div>
                <div className="text-xs text-[#64748b] mt-1">Attendees</div>
              </div>
              <div className="bg-[#0f1118] border border-[#1e293b] rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-[#e2e8f0]">{avgWatchPct}%</div>
                <div className="text-xs text-[#64748b] mt-1">Avg Watch %</div>
              </div>
            </div>

            {/* Register Someone */}
            <div className="bg-[#0f1118] border border-[#1e293b] rounded-lg p-4">
              <h4 className="text-sm font-semibold text-[#e2e8f0] mb-3">Register Attendee</h4>
              <form onSubmit={handleRegister} className="flex items-end gap-3">
                <div className="flex-1">
                  <Input
                    label="Email"
                    type="email"
                    placeholder="attendee@example.com"
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="flex-1">
                  <Input
                    label="Name"
                    placeholder="Name (optional)"
                    value={regForm.name}
                    onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                  />
                </div>
                <Button type="submit" size="sm" disabled={registering || !regForm.email.trim()}>
                  {registering ? "Registering..." : "Register"}
                </Button>
              </form>
            </div>

            {/* Registrations List */}
            <div>
              <h4 className="text-sm font-semibold text-[#e2e8f0] mb-3">
                Registrations ({totalRegs})
              </h4>
              {loadingRegs ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent" />
                </div>
              ) : registrations.length === 0 ? (
                <p className="text-sm text-[#64748b] py-4 text-center">No registrations yet.</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {registrations.map((reg) => (
                    <div
                      key={reg.id}
                      className="flex items-center gap-4 bg-[#0f1118] border border-[#1e293b] rounded-lg px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#e2e8f0] truncate">
                          {reg.name || reg.email}
                        </div>
                        {reg.name && (
                          <div className="text-xs text-[#64748b] truncate">{reg.email}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Attended badge */}
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            reg.attended
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-[#1e293b] text-[#64748b]"
                          }`}
                        >
                          {reg.attended ? "Attended" : "No-show"}
                        </span>
                        {/* Watch % progress bar */}
                        {reg.attended ? (
                          <div className="flex items-center gap-2 w-28">
                            <div className="flex-1 h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full transition-all"
                                style={{ width: `${reg.watched_pct || 0}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-[#94a3b8] w-8 text-right">
                              {reg.watched_pct || 0}%
                            </span>
                          </div>
                        ) : (
                          <div className="w-28" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
