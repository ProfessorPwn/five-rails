"use client";

import { useState, useEffect } from "react";

interface Affiliate {
  id: string;
  name: string;
  email: string;
  referral_code: string;
  commission_rate: number;
  commission_type: string;
  total_referrals: number;
  total_earned: number;
  total_paid: number;
  status: string;
  created_at: string;
}

export default function AffiliatesPage() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", commission_rate: "20" });

  useEffect(() => {
    fetch("/api/affiliates")
      .then((r) => r.json())
      .then((d) => setAffiliates(d.affiliates || []))
      .finally(() => setLoading(false));
  }, []);

  const createAffiliate = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    const res = await fetch("/api/affiliates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, email: form.email, commission_rate: parseFloat(form.commission_rate) / 100 }),
    });
    if (res.ok) {
      const a = await res.json();
      setAffiliates((prev) => [a, ...prev]);
      setShowCreate(false);
      setForm({ name: "", email: "", commission_rate: "20" });
    }
  };

  const totalEarned = affiliates.reduce((s, a) => s + a.total_earned, 0);
  const totalReferrals = affiliates.reduce((s, a) => s + a.total_referrals, 0);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e2e8f0]">Affiliate Program</h1>
            <p className="text-sm text-[#8b949e] mt-1">
              {affiliates.length} affiliates &middot; {totalReferrals} referrals &middot; ${totalEarned.toLocaleString()} earned
            </p>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ Add Affiliate</button>
        </div>

        {affiliates.length === 0 ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center">
            <p className="text-[#8b949e] mb-2">No affiliates yet.</p>
            <button onClick={() => setShowCreate(true)} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">Add your first affiliate &rarr;</button>
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[#8b949e] border-b border-[#30363d]">
                  <th className="text-left px-5 py-3">Name</th>
                  <th className="text-left px-4 py-3">Code</th>
                  <th className="text-right px-4 py-3">Rate</th>
                  <th className="text-right px-4 py-3">Referrals</th>
                  <th className="text-right px-4 py-3">Earned</th>
                  <th className="text-right px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {affiliates.map((a) => (
                  <tr key={a.id} className="border-b border-[#21262d] last:border-0">
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-[#e2e8f0]">{a.name}</div>
                      <div className="text-[10px] text-[#484f58]">{a.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-indigo-400">{a.referral_code}</td>
                    <td className="px-4 py-3 text-sm text-right text-[#c9d1d9]">{(a.commission_rate * 100).toFixed(0)}%</td>
                    <td className="px-4 py-3 text-sm text-right text-[#c9d1d9]">{a.total_referrals}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-emerald-400">${a.total_earned.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.status === "active" ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>{a.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-[#e2e8f0] mb-4">Add Affiliate</h2>
              <div className="space-y-3">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e2e8f0]" />
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e2e8f0]" />
                <input type="number" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} placeholder="Commission %" className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e2e8f0]" />
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={createAffiliate} className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">Create</button>
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[#30363d] text-[#8b949e] text-sm rounded-lg hover:bg-[#21262d]">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
