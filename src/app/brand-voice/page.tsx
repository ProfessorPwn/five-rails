"use client";

import { useEffect, useState, useCallback } from "react";

interface BrandVoice {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  tone_keywords: string;
  sample_content: string;
  rules: string;
  is_default: number;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
}

export default function BrandVoicePage() {
  const [voices, setVoices] = useState<BrandVoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // Editor state
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [toneKeywords, setToneKeywords] = useState<string[]>([]);
  const [toneInput, setToneInput] = useState("");
  const [sampleContent, setSampleContent] = useState("");
  const [rules, setRules] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Test voice state
  const [testPrompt, setTestPrompt] = useState("Write a short social media post about our product.");
  const [testOutput, setTestOutput] = useState("");
  const [testing, setTesting] = useState(false);

  const fetchVoices = useCallback(async () => {
    try {
      const res = await fetch("/api/brand-voice");
      if (res.ok) setVoices(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : data.projects || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    Promise.all([fetchVoices(), fetchProjects()]).finally(() => setLoading(false));
  }, [fetchVoices, fetchProjects]);

  const parseTone = (v: BrandVoice): string[] => {
    try { return JSON.parse(v.tone_keywords || "[]"); } catch { return []; }
  };

  const parseRules = (v: BrandVoice): string[] => {
    try { return JSON.parse(v.rules || "[]"); } catch { return []; }
  };

  const openEditor = (voice?: BrandVoice) => {
    if (voice) {
      setEditId(voice.id);
      setName(voice.name);
      setDescription(voice.description || "");
      setToneKeywords(parseTone(voice));
      const sc = (() => {
        try {
          const parsed = JSON.parse(voice.sample_content || "[]");
          return Array.isArray(parsed) ? parsed.join("\n\n---\n\n") : String(parsed);
        } catch { return voice.sample_content || ""; }
      })();
      setSampleContent(sc);
      const r = parseRules(voice);
      setRules(r.join("\n"));
      setProjectId(voice.project_id || "");
      setIsDefault(voice.is_default === 1);
    } else {
      setEditId(null);
      setName("");
      setDescription("");
      setToneKeywords([]);
      setSampleContent("");
      setRules("");
      setProjectId("");
      setIsDefault(false);
    }
    setTestOutput("");
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const rulesArray = rules.split("\n").map((r) => r.trim()).filter(Boolean);
    const sampleArray = sampleContent.split("\n---\n").map((s) => s.trim()).filter(Boolean);

    const payload = {
      name: name.trim(),
      description: description.trim(),
      tone_keywords: toneKeywords,
      sample_content: sampleArray,
      rules: rulesArray,
      project_id: projectId || null,
      is_default: isDefault,
    };

    try {
      const url = editId ? `/api/brand-voice/${editId}` : "/api/brand-voice";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await fetchVoices();
        const saved = await res.json();
        setSelectedId(saved.id);
        setShowEditor(false);
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!editId) return;
    if (!confirm("Delete this brand voice?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/brand-voice/${editId}`, { method: "DELETE" });
      if (res.ok) {
        await fetchVoices();
        setSelectedId(null);
        setShowEditor(false);
      }
    } catch { /* ignore */ }
    setDeleting(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestOutput("");
    try {
      const rulesArray = rules.split("\n").map((r) => r.trim()).filter(Boolean);
      const sampleArray = sampleContent.split("\n---\n").map((s) => s.trim()).filter(Boolean);

      const payload = editId
        ? { voice_id: editId, test_prompt: testPrompt }
        : {
            inline_voice: {
              name: name.trim(),
              description: description.trim(),
              tone_keywords: toneKeywords,
              sample_content: sampleArray,
              rules: rulesArray,
            },
            test_prompt: testPrompt,
          };

      const res = await fetch("/api/brand-voice/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setTestOutput(data.output || "No output generated.");
      } else {
        const err = await res.json();
        setTestOutput(`Error: ${err.error || "Failed to test voice"}`);
      }
    } catch {
      setTestOutput("Error: Failed to connect to LLM.");
    }
    setTesting(false);
  };

  const addToneKeyword = () => {
    const kw = toneInput.trim();
    if (kw && !toneKeywords.includes(kw)) {
      setToneKeywords([...toneKeywords, kw]);
    }
    setToneInput("");
  };

  const removeToneKeyword = (kw: string) => {
    setToneKeywords(toneKeywords.filter((k) => k !== kw));
  };

  const selectedVoice = voices.find((v) => v.id === selectedId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#64748b]">Loading Brand Voices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Brand Voice</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Define how your brand sounds. Voice is injected into all AI skill executions.
          </p>
        </div>
        <button
          onClick={() => openEditor()}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Create Voice
        </button>
      </div>

      {/* Voice Grid */}
      {voices.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-[#1e293b] rounded-xl">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="mx-auto mb-4 text-[#475569]">
            <path d="M24 8c-8.8 0-16 7.2-16 16s7.2 16 16 16 16-7.2 16-16S32.8 8 24 8z" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20v8M24 18v12M28 22v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <h3 className="text-[#94a3b8] font-medium mb-1">No brand voices yet</h3>
          <p className="text-sm text-[#64748b] mb-4">Create your first voice to make AI outputs sound like you.</p>
          <button
            onClick={() => openEditor()}
            className="px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-sm hover:bg-amber-500/20 transition-colors"
          >
            Create Your First Voice
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {voices.map((voice) => {
            const tone = parseTone(voice);
            const isSelected = selectedId === voice.id;
            const projectName = voice.project_id
              ? projects.find((p) => p.id === voice.project_id)?.name
              : null;

            return (
              <button
                key={voice.id}
                onClick={() => setSelectedId(isSelected ? null : voice.id)}
                className={`text-left p-5 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? "bg-[#0d1117] border-amber-500/50 shadow-lg shadow-amber-500/5"
                    : "bg-[#0d1117] border-[#1e293b]/50 hover:border-[#334155]"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#e2e8f0] flex items-center gap-2">
                    {voice.name}
                    {voice.is_default === 1 && (
                      <span className="text-amber-400" title="Default voice">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                          <path d="M7 1l1.8 3.6L13 5.3l-3 2.9.7 4.1L7 10.5 3.3 12.3l.7-4.1-3-2.9 4.2-.7L7 1z" />
                        </svg>
                      </span>
                    )}
                  </h3>
                  {projectName && (
                    <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full">
                      {projectName}
                    </span>
                  )}
                </div>

                {voice.description && (
                  <p className="text-xs text-[#64748b] mb-3 line-clamp-2">{voice.description}</p>
                )}

                {tone.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tone.slice(0, 5).map((kw) => (
                      <span
                        key={kw}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400"
                      >
                        {kw}
                      </span>
                    ))}
                    {tone.length > 5 && (
                      <span className="text-[10px] text-[#64748b]">+{tone.length - 5}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Voice Detail */}
      {selectedVoice && !showEditor && (
        <div className="bg-[#0d1117] border border-[#1e293b]/50 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#e2e8f0] flex items-center gap-2">
              {selectedVoice.name}
              {selectedVoice.is_default === 1 && (
                <span className="text-amber-400">
                  <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M7 1l1.8 3.6L13 5.3l-3 2.9.7 4.1L7 10.5 3.3 12.3l.7-4.1-3-2.9 4.2-.7L7 1z" />
                  </svg>
                </span>
              )}
            </h2>
            <button
              onClick={() => openEditor(selectedVoice)}
              className="px-3 py-1.5 text-xs bg-[#1e293b] text-[#94a3b8] rounded-lg hover:text-[#e2e8f0] transition-colors"
            >
              Edit Voice
            </button>
          </div>

          {selectedVoice.description && (
            <p className="text-sm text-[#94a3b8] mb-4">{selectedVoice.description}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tone */}
            <div>
              <h4 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-2">Tone Keywords</h4>
              <div className="flex flex-wrap gap-1.5">
                {parseTone(selectedVoice).map((kw) => (
                  <span key={kw} className="text-xs px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400">
                    {kw}
                  </span>
                ))}
                {parseTone(selectedVoice).length === 0 && (
                  <span className="text-xs text-[#475569]">No tone keywords set</span>
                )}
              </div>
            </div>

            {/* Rules */}
            <div>
              <h4 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-2">Writing Rules</h4>
              <ul className="space-y-1">
                {parseRules(selectedVoice).map((r, i) => (
                  <li key={i} className="text-xs text-[#94a3b8] flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">-</span>
                    {r}
                  </li>
                ))}
                {parseRules(selectedVoice).length === 0 && (
                  <span className="text-xs text-[#475569]">No rules set</span>
                )}
              </ul>
            </div>
          </div>

          {/* Project assignment */}
          {selectedVoice.project_id && (
            <div className="mt-4 pt-4 border-t border-[#1e293b]/50">
              <span className="text-xs text-[#64748b]">Assigned to: </span>
              <span className="text-xs text-purple-400">
                {projects.find((p) => p.id === selectedVoice.project_id)?.name || selectedVoice.project_id}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditor(false)}>
          <div
            className="bg-[#0d1117] rounded-2xl border border-[#1e293b] max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[#1e293b]/50">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#e2e8f0]">
                  {editId ? "Edit Brand Voice" : "Create Brand Voice"}
                </h2>
                <button onClick={() => setShowEditor(false)} className="text-[#64748b] hover:text-[#e2e8f0] text-xl">&times;</button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Bold & Direct, Friendly Expert, Enterprise Professional"
                  className="w-full px-3 py-2.5 bg-[#0a0c14] border border-[#1e293b] rounded-lg text-sm text-[#e2e8f0] placeholder:text-[#475569] focus:outline-none focus:border-amber-500/50"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this voice in 1-2 sentences..."
                  rows={2}
                  className="w-full px-3 py-2.5 bg-[#0a0c14] border border-[#1e293b] rounded-lg text-sm text-[#e2e8f0] placeholder:text-[#475569] focus:outline-none focus:border-amber-500/50 resize-none"
                />
              </div>

              {/* Tone Keywords */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1.5">Tone Keywords</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {toneKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400"
                    >
                      {kw}
                      <button onClick={() => removeToneKeyword(kw)} className="hover:text-blue-200 ml-0.5">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={toneInput}
                    onChange={(e) => setToneInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addToneKeyword(); } }}
                    placeholder="Type a keyword and press Enter..."
                    className="flex-1 px-3 py-2 bg-[#0a0c14] border border-[#1e293b] rounded-lg text-sm text-[#e2e8f0] placeholder:text-[#475569] focus:outline-none focus:border-amber-500/50"
                  />
                  <button
                    onClick={addToneKeyword}
                    className="px-3 py-2 bg-[#1e293b] text-[#94a3b8] rounded-lg text-sm hover:text-[#e2e8f0] transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Sample Content */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1.5">
                  Sample Content <span className="text-[#475569] font-normal">(separate samples with ---)</span>
                </label>
                <textarea
                  value={sampleContent}
                  onChange={(e) => setSampleContent(e.target.value)}
                  placeholder="Paste example text written in this voice..."
                  rows={4}
                  className="w-full px-3 py-2.5 bg-[#0a0c14] border border-[#1e293b] rounded-lg text-sm text-[#e2e8f0] placeholder:text-[#475569] focus:outline-none focus:border-amber-500/50 resize-none font-mono"
                />
              </div>

              {/* Rules */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1.5">
                  Writing Rules <span className="text-[#475569] font-normal">(one per line)</span>
                </label>
                <textarea
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder={"Use short sentences under 20 words\nNever use corporate jargon\nAlways include a call to action\nWrite at a 6th grade reading level"}
                  rows={4}
                  className="w-full px-3 py-2.5 bg-[#0a0c14] border border-[#1e293b] rounded-lg text-sm text-[#e2e8f0] placeholder:text-[#475569] focus:outline-none focus:border-amber-500/50 resize-none"
                />
              </div>

              {/* Project Assignment & Default Toggle */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#94a3b8] mb-1.5">Assign to Project</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0a0c14] border border-[#1e293b] rounded-lg text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="">Default (all projects)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#94a3b8] mb-1.5">Default Voice</label>
                  <button
                    onClick={() => setIsDefault(!isDefault)}
                    className={`w-full px-3 py-2.5 rounded-lg text-sm border transition-colors ${
                      isDefault
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                        : "bg-[#0a0c14] border-[#1e293b] text-[#64748b]"
                    }`}
                  >
                    {isDefault ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                          <path d="M7 1l1.8 3.6L13 5.3l-3 2.9.7 4.1L7 10.5 3.3 12.3l.7-4.1-3-2.9 4.2-.7L7 1z" />
                        </svg>
                        Default Voice
                      </span>
                    ) : (
                      "Set as Default"
                    )}
                  </button>
                </div>
              </div>

              {/* Test Voice */}
              <div className="border border-[#1e293b]/50 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Test Voice</h4>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    placeholder="Enter a test prompt..."
                    className="flex-1 px-3 py-2 bg-[#0a0c14] border border-[#1e293b] rounded-lg text-sm text-[#e2e8f0] placeholder:text-[#475569] focus:outline-none focus:border-amber-500/50"
                  />
                  <button
                    onClick={handleTest}
                    disabled={testing || !name.trim()}
                    className="px-4 py-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg text-sm hover:bg-purple-500/20 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {testing ? (
                      <>
                        <div className="w-3 h-3 border border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3 2v10l9-5L3 2z" fill="currentColor" />
                        </svg>
                        Test
                      </>
                    )}
                  </button>
                </div>
                {testOutput && (
                  <div className="bg-[#0a0c14] border border-[#1e293b]/50 rounded-lg p-4 font-mono text-sm text-[#94a3b8] whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {testOutput}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-[#1e293b]/50 flex items-center justify-between">
              <div>
                {editId && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Delete Voice"}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowEditor(false)}
                  className="px-4 py-2 text-sm text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : editId ? "Update Voice" : "Create Voice"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
