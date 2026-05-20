"use client";

import { useState, useEffect } from "react";

interface Campaign {
  id: string;
  platform: string;
  name: string;
  objective: string;
  budget_daily: number | null;
  budget_total: number | null;
  targeting: string | null;
  ad_copy: string | null;
  status: string;
  platform_campaign_id: string | null;
  created_at: string;
}

export default function AdsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [launchResult, setLaunchResult] = useState<{ message?: string; deep_link?: string; error?: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  // Form state
  const [form, setForm] = useState({
    platform: "facebook" as "facebook" | "google" | "tiktok",
    name: "",
    objective: "traffic",
    budget_daily: "",
    niche: "",
    ad_copy: "",
  });

  useEffect(() => {
    fetch("/api/ads").then((r) => r.json()).then(setCampaigns).finally(() => setLoading(false));
  }, []);

  const generateAdCopy = async () => {
    if (!form.niche.trim()) return;
    setGenerating(true);
    try {
      // Use the Ad Copy Generator skill
      const skillsRes = await fetch("/api/skills");
      const skills = await skillsRes.json();
      const adSkill = skills.find((s: { id: string }) => s.id === "skill-ad-copy-generator");
      if (!adSkill) { setGenerating(false); return; }

      const res = await fetch(`/api/skills/${adSkill.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: `Create ad campaigns for: ${form.niche}. Platform focus: ${form.platform}. Objective: ${form.objective}.` }),
      });
      if (res.ok) {
        const data = await res.json();
        setForm((f) => ({ ...f, ad_copy: data.result || data.output || "" }));
      }
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const createCampaign = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: form.platform,
          name: form.name,
          objective: form.objective,
          budget_daily: form.budget_daily ? parseFloat(form.budget_daily) : undefined,
          ad_copy: form.ad_copy,
        }),
      });
      if (res.ok) {
        const c = await res.json();
        setCampaigns((prev) => [c, ...prev]);
        setShowCreate(false);
        setForm({ platform: "facebook", name: "", objective: "traffic", budget_daily: "", niche: "", ad_copy: "" });
      }
    } catch { /* ignore */ }
    setCreating(false);
  };

  const launchCampaign = async (id: string) => {
    setLaunching(id);
    setLaunchResult(null);
    try {
      const res = await fetch(`/api/ads/${id}/launch`, { method: "POST" });
      const data = await res.json();
      setLaunchResult(data);
      // Refresh campaigns
      const updated = await fetch("/api/ads");
      setCampaigns(await updated.json());
    } catch (err) {
      setLaunchResult({ error: err instanceof Error ? err.message : "Launch failed" });
    }
    setLaunching(null);
  };

  if (loading) return <div className="min-h-screen bg-transparent flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#e2e8f0]">Ad Campaigns</h1>
            <p className="text-sm text-[#8b949e] mt-1">Create and launch ad campaigns across Facebook, Google, and TikTok</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + New Campaign
          </button>
        </div>

        {/* Launch result */}
        {launchResult && (
          <div className={`mb-6 p-4 rounded-xl border ${launchResult.error ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
            <p className={`text-sm ${launchResult.error ? "text-red-700" : "text-emerald-700"}`}>
              {launchResult.message || launchResult.error}
            </p>
            {launchResult.deep_link && (
              <a href={launchResult.deep_link} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                Open in Ads Manager &rarr;
              </a>
            )}
          </div>
        )}

        {/* Campaign list */}
        {campaigns.length === 0 && !showCreate ? (
          <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-12 text-center">
            <p className="text-[#8b949e] mb-2">No ad campaigns yet.</p>
            <button onClick={() => setShowCreate(true)} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
              Create your first campaign &rarr;
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div key={c.id} className="bg-[#161b22] rounded-xl border border-[#30363d] p-5 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-sm font-bold text-[#e2e8f0]">{c.name}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium capitalize">{c.platform}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      c.status === "submitted" || c.status === "active" ? "bg-emerald-50 text-emerald-700" :
                      c.status === "ready" ? "bg-amber-50 text-amber-700" :
                      "bg-gray-100 text-[#8b949e]"
                    }`}>{c.status}</span>
                  </div>
                  <div className="text-xs text-[#484f58]">
                    {c.objective} {c.budget_daily ? `- $${c.budget_daily}/day` : ""} - {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </div>
                {(c.status === "draft" || c.status === "ready") && (
                  <button
                    onClick={() => launchCampaign(c.id)}
                    disabled={launching === c.id}
                    className="px-4 py-2 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50"
                  >
                    {launching === c.id ? "Launching..." : c.platform === "facebook" ? "Launch on Facebook" : "Get Launch Spec"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create Campaign Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
            <div className="bg-[#161b22] rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-[#e2e8f0]">Create Ad Campaign</h2>
                  <button onClick={() => setShowCreate(false)} className="text-[#484f58] hover:text-[#8b949e] text-xl">&times;</button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-[#c9d1d9] mb-1 block">Platform</label>
                    <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as "facebook" | "google" | "tiktok" })} className="w-full px-3 py-2 border border-[#30363d] rounded-lg text-sm">
                      <option value="facebook">Facebook / Instagram</option>
                      <option value="google">Google Ads</option>
                      <option value="tiktok">TikTok Ads</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-[#c9d1d9] mb-1 block">Campaign Name</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Spring Launch Campaign" className="w-full px-3 py-2 border border-[#30363d] rounded-lg text-sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-[#c9d1d9] mb-1 block">Objective</label>
                      <select value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} className="w-full px-3 py-2 border border-[#30363d] rounded-lg text-sm">
                        <option value="awareness">Awareness</option>
                        <option value="traffic">Traffic</option>
                        <option value="engagement">Engagement</option>
                        <option value="leads">Leads</option>
                        <option value="conversions">Conversions</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#c9d1d9] mb-1 block">Daily Budget ($)</label>
                      <input type="number" value={form.budget_daily} onChange={(e) => setForm({ ...form, budget_daily: e.target.value })} placeholder="50" className="w-full px-3 py-2 border border-[#30363d] rounded-lg text-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-[#c9d1d9] mb-1 block">Business Niche (for AI ad copy)</label>
                    <div className="flex gap-2">
                      <input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="e.g., AI SaaS for solopreneurs" className="flex-1 px-3 py-2 border border-[#30363d] rounded-lg text-sm" />
                      <button onClick={generateAdCopy} disabled={generating || !form.niche.trim()} className="px-3 py-2 bg-orange-600 text-white text-xs rounded-lg hover:bg-orange-700 disabled:opacity-50 whitespace-nowrap">
                        {generating ? "Generating..." : "Generate Ad Copy"}
                      </button>
                    </div>
                  </div>

                  {form.ad_copy && (
                    <div>
                      <label className="text-xs font-medium text-[#c9d1d9] mb-1 block">Ad Copy (generated)</label>
                      <textarea value={form.ad_copy} onChange={(e) => setForm({ ...form, ad_copy: e.target.value })} rows={8} className="w-full px-3 py-2 border border-[#30363d] rounded-lg text-sm font-mono" />
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={createCampaign} disabled={creating || !form.name.trim()} className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                    {creating ? "Creating..." : "Create Campaign"}
                  </button>
                  <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[#30363d] text-[#8b949e] text-sm rounded-lg hover:bg-transparent">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
