"use client";

import { useState, useEffect, useCallback } from "react";

interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
}

interface Deal {
  id: string;
  title: string;
  value: number;
  stage: string;
  contact_id: string | null;
  contact_name?: string;
  expected_close: string | null;
  notes: string | null;
  created_at: string;
  updated_at?: string;
}

interface DealActivity {
  id: string;
  deal_id: string;
  type: string;
  description: string;
  created_at: string;
}

const STAGES = [
  { id: "lead", label: "Lead", color: "#6366f1" },
  { id: "contacted", label: "Contacted", color: "#8b5cf6" },
  { id: "qualified", label: "Qualified", color: "#3b82f6" },
  { id: "proposal", label: "Proposal", color: "#f59e0b" },
  { id: "negotiation", label: "Negotiation", color: "#f97316" },
  { id: "won", label: "Won", color: "#10b981" },
  { id: "lost", label: "Lost", color: "#ef4444" },
];

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [form, setForm] = useState({ title: "", value: "", stage: "lead", notes: "", contact_id: "" });
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/deals").then((r) => r.json()),
      fetch("/api/outbound").then((r) => r.json()).catch(() => []),
    ]).then(([d, c]) => {
      // Enrich deals with contact names
      const contactMap = new Map((Array.isArray(c) ? c : []).map((ct: Contact) => [ct.id, ct]));
      const enriched = (Array.isArray(d) ? d : []).map((deal: Deal) => ({
        ...deal,
        contact_name: deal.contact_id ? contactMap.get(deal.contact_id)?.name : undefined,
      }));
      setDeals(enriched);
      setContacts(Array.isArray(c) ? c : []);
    }).finally(() => setLoading(false));
  }, []);

  const createDeal = async () => {
    if (!form.title.trim()) return;
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title, value: parseFloat(form.value) || 0, stage: form.stage, notes: form.notes || null, contact_id: form.contact_id || null }),
    });
    if (res.ok) {
      const deal = await res.json();
      setDeals((prev) => [deal, ...prev]);
      setShowCreate(false);
      setForm({ title: "", value: "", stage: "lead", notes: "", contact_id: "" });
    }
  };

  const moveDeal = useCallback(async (dealId: string, newStage: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === newStage) return;

    // Optimistic update
    setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, stage: newStage } : d));

    const res = await fetch("/api/deals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dealId, stage: newStage }),
    });
    if (!res.ok) {
      // Revert on failure
      setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, stage: deal.stage } : d));
    } else {
      const updated = await res.json();
      setDeals((prev) => prev.map((d) => d.id === dealId ? updated : d));
      if (selectedDeal?.id === dealId) {
        setSelectedDeal(updated);
        loadActivities(dealId);
      }
    }
  }, [deals, selectedDeal]);

  const loadActivities = async (dealId: string) => {
    try {
      const res = await fetch(`/api/deals?deal_id=${dealId}&activities=true`);
      if (res.ok) {
        const data = await res.json();
        setActivities(Array.isArray(data) ? data : []);
      }
    } catch { setActivities([]); }
  };

  const openDeal = (deal: Deal) => {
    setSelectedDeal(deal);
    loadActivities(deal.id);
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    setDraggedDeal(dealId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dealId);
  };
  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stageId);
  };
  const handleDragLeave = () => setDragOverStage(null);
  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData("text/plain") || draggedDeal;
    if (dealId) moveDeal(dealId, stageId);
    setDraggedDeal(null);
    setDragOverStage(null);
  };
  const handleDragEnd = () => { setDraggedDeal(null); setDragOverStage(null); };

  const totalValue = deals.filter((d) => d.stage !== "lost").reduce((s, d) => s + (d.value || 0), 0);
  const wonValue = deals.filter((d) => d.stage === "won").reduce((s, d) => s + (d.value || 0), 0);

  // Deal forecasting — weighted pipeline based on stage probability
  const STAGE_PROBABILITY: Record<string, number> = {
    lead: 0.05, contacted: 0.10, qualified: 0.25, proposal: 0.50, negotiation: 0.75, won: 1.0, lost: 0,
  };
  const weightedForecast = deals.filter((d) => d.stage !== "won" && d.stage !== "lost").reduce(
    (sum, d) => sum + (d.value || 0) * (STAGE_PROBABILITY[d.stage] || 0), 0
  );
  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost").length;

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e2e8f0]">Sales Pipeline</h1>
            <p className="text-sm text-[#8b949e] mt-1">
              Pipeline: ${totalValue.toLocaleString()} &middot; Won: ${wonValue.toLocaleString()} &middot; {deals.length} deals
            </p>
            {openDeals > 0 && (
              <p className="text-xs text-emerald-400 mt-0.5">
                Weighted forecast: ${Math.round(weightedForecast).toLocaleString()} from {openDeals} open deals
              </p>
            )}
          </div>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ New Deal</button>
        </div>

        {/* Kanban Board */}
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const stageDeals = deals.filter((d) => d.stage === stage.id);
            const stageValue = stageDeals.reduce((s, d) => s + (d.value || 0), 0);
            const isOver = dragOverStage === stage.id;
            return (
              <div
                key={stage.id}
                className={`min-w-[220px] flex-1 transition-all ${isOver ? "ring-2 ring-indigo-500/50 rounded-lg" : ""}`}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-xs font-bold text-[#c9d1d9] uppercase tracking-wide">{stage.label}</span>
                  </div>
                  <span className="text-[10px] text-[#484f58]">{stageDeals.length} &middot; ${stageValue.toLocaleString()}</span>
                </div>
                <div className="space-y-2 min-h-[60px]">
                  {stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, deal.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => openDeal(deal)}
                      className={`bg-[#161b22] border border-[#30363d] rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-[#484f58] transition-all ${
                        draggedDeal === deal.id ? "opacity-40 scale-95" : ""
                      }`}
                    >
                      <h3 className="text-sm font-medium text-[#e2e8f0] mb-1 truncate">{deal.title}</h3>
                      {deal.contact_name && <div className="text-[10px] text-blue-400 truncate">{deal.contact_name}</div>}
                      {deal.value > 0 && <div className="text-xs font-bold" style={{ color: stage.color }}>${deal.value.toLocaleString()}</div>}
                      {deal.expected_close && <div className="text-[10px] text-[#484f58] mt-1">Close: {deal.expected_close}</div>}
                      {deal.notes && <div className="text-[10px] text-[#484f58] mt-1 truncate">{deal.notes}</div>}
                    </div>
                  ))}
                  {stageDeals.length === 0 && (
                    <div className={`border border-dashed rounded-lg p-4 text-center text-[10px] text-[#484f58] transition-colors ${isOver ? "border-indigo-500/50 bg-indigo-500/5" : "border-[#30363d]"}`}>
                      {isOver ? "Drop here" : "No deals"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Deal Detail Slideout */}
        {selectedDeal && (
          <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedDeal(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative w-full max-w-lg bg-[#0d1117] border-l border-[#30363d] h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-[#e2e8f0]">{selectedDeal.title}</h2>
                    {selectedDeal.value > 0 && (
                      <p className="text-lg font-bold text-emerald-400 mt-1">${selectedDeal.value.toLocaleString()}</p>
                    )}
                  </div>
                  <button onClick={() => setSelectedDeal(null)} className="text-[#484f58] hover:text-[#e2e8f0] text-xl">&times;</button>
                </div>

                {/* Stage Buttons */}
                <div className="mb-6">
                  <label className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide mb-2 block">Stage</label>
                  <div className="flex flex-wrap gap-1.5">
                    {STAGES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => moveDeal(selectedDeal.id, s.id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          selectedDeal.stage === s.id
                            ? "text-white shadow-sm"
                            : "text-[#8b949e] bg-[#161b22] border border-[#30363d] hover:border-[#484f58]"
                        }`}
                        style={selectedDeal.stage === s.id ? { backgroundColor: s.color } : undefined}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-4 mb-6">
                  {selectedDeal.expected_close && (
                    <div>
                      <label className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide">Expected Close</label>
                      <p className="text-sm text-[#e2e8f0] mt-1">{selectedDeal.expected_close}</p>
                    </div>
                  )}
                  {selectedDeal.notes && (
                    <div>
                      <label className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide">Notes</label>
                      <p className="text-sm text-[#c9d1d9] mt-1 whitespace-pre-wrap">{selectedDeal.notes}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide">Created</label>
                    <p className="text-sm text-[#8b949e] mt-1">{new Date(selectedDeal.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Activity Timeline */}
                <div>
                  <h3 className="text-sm font-bold text-[#e2e8f0] mb-3 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    Activity Timeline
                  </h3>
                  {activities.length === 0 ? (
                    <p className="text-xs text-[#484f58]">No activity yet</p>
                  ) : (
                    <div className="space-y-3">
                      {activities.map((act) => (
                        <div key={act.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`w-2 h-2 rounded-full mt-1.5 ${act.type === "stage_change" ? "bg-indigo-400" : "bg-[#484f58]"}`} />
                            <div className="w-px flex-1 bg-[#30363d]" />
                          </div>
                          <div className="pb-3">
                            <p className="text-xs text-[#c9d1d9]">{act.description}</p>
                            <p className="text-[10px] text-[#484f58] mt-0.5">{timeAgo(act.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Deal Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-[#e2e8f0] mb-4">New Deal</h2>
              <div className="space-y-3">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Deal title" className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e2e8f0] placeholder-[#484f58]" />
                <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="Value ($)" className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e2e8f0] placeholder-[#484f58]" />
                <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e2e8f0]">
                  {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })} className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e2e8f0]">
                  <option value="">No linked contact</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} {c.email ? `(${c.email})` : ""}</option>)}
                </select>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes (optional)" rows={3} className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e2e8f0] placeholder-[#484f58] resize-none" />
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={createDeal} className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">Create</button>
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[#30363d] text-[#8b949e] text-sm rounded-lg hover:bg-[#21262d]">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
