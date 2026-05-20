"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Textarea, Select } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

interface Skill {
  id: string;
  name: string;
  description: string;
  rail: string;
  sub_agents?: string;
  prompt_template?: string;
}

interface Project {
  id: string;
  name: string;
}

const railMeta: Record<string, { label: string; badge: "amber" | "blue" | "emerald" | "violet" | "rose" }> = {
  agent_harness: { label: "Agent Harness", badge: "amber" },
  search: { label: "Search Layer", badge: "blue" },
  ops_brain: { label: "Ops Brain", badge: "emerald" },
  outbound: { label: "Outbound Spine", badge: "violet" },
  audience: { label: "Audience Rail", badge: "rose" },
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterRail, setFilterRail] = useState("all");

  // Execution state
  const [execSkill, setExecSkill] = useState<Skill | null>(null);
  const [execInput, setExecInput] = useState("");
  const [execProject, setExecProject] = useState("");
  const [execResult, setExecResult] = useState("");
  const [execRunning, setExecRunning] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedContentId, setSavedContentId] = useState<string | null>(null);
  const [publishingFromSkill, setPublishingFromSkill] = useState(false);
  const [publishPlatform, setPublishPlatform] = useState("Twitter");

  useEffect(() => {
    Promise.all([
      fetch("/api/skills").then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/projects").then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([sk, proj]) => {
      setSkills(Array.isArray(sk) ? sk : []);
      setProjects(Array.isArray(proj) ? proj : []);
      setLoading(false);
    });
  }, []);

  const handleExecute = async () => {
    if (!execSkill || !execInput.trim()) return;
    setExecRunning(true);
    setExecResult("");
    try {
      const res = await fetch(`/api/skills/${execSkill.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: execProject || undefined,
          input: execInput,
        }),
      });
      const data = await res.json();
      setExecResult(data.output || data.error || JSON.stringify(data, null, 2));
    } catch {
      setExecResult("Execution failed. Check your connections.");
    } finally {
      setExecRunning(false);
    }
  };

  const filteredSkills = skills.filter((s) => {
    if (filterRail !== "all" && s.rail !== filterRail) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.name?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group skills by rail
  const grouped = filteredSkills.reduce<Record<string, Skill[]>>((acc, skill) => {
    const rail = skill.rail || "general";
    if (!acc[rail]) acc[rail] = [];
    acc[rail].push(skill);
    return acc;
  }, {});

  const allRails = [...new Set(skills.map((s) => s.rail || "general"))];

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
      <div>
        <h1 className="text-2xl font-bold text-[#e2e8f0]">Skills</h1>
        <p className="text-sm text-[#94a3b8] mt-1">
          {filteredSkills.length} skill{filteredSkills.length !== 1 ? "s" : ""} across {Object.keys(grouped).length} rail{Object.keys(grouped).length !== 1 ? "s" : ""}
          {filteredSkills.length !== skills.length && ` (${skills.length} total)`}
        </p>
      </div>

      {/* Filters */}
      {skills.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#64748b] focus:outline-none focus:border-amber-500"
            />
          </div>
          <select
            value={filterRail}
            onChange={(e) => setFilterRail(e.target.value)}
            className="bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">All Rails</option>
            {allRails.map((rail) => (
              <option key={rail} value={rail}>
                {(railMeta[rail]?.label) || rail.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      )}

      {skills.length === 0 ? (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M12 24l8-16h8l8 16-8 16h-8L12 24z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          }
          title="No skills configured"
          description="Skills are AI-powered tools that automate business tasks across your five rails."
        />
      ) : (
        Object.entries(grouped).map(([rail, railSkills]) => {
          const meta = railMeta[rail] || { label: rail.replace(/_/g, " "), badge: "default" as const };
          return (
            <div key={rail}>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant={meta.badge}>{meta.label}</Badge>
                <span className="text-xs text-[#64748b]">
                  {railSkills.length} skill{railSkills.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                {railSkills.map((skill) => (
                  <Card key={skill.id}>
                    <h3 className="text-sm font-semibold text-[#e2e8f0] mb-1">{skill.name}</h3>
                    {skill.description && (
                      <p className="text-xs text-[#64748b] mb-3 line-clamp-2">{skill.description}</p>
                    )}
                    {skill.sub_agents && (
                      <div className="mb-3">
                        <span className="text-[10px] text-[#94a3b8] uppercase tracking-wider">Sub-agents</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {((() => {
                            try { return JSON.parse(skill.sub_agents); } catch { return []; }
                          })() as string[]).map((agent) => (
                            <Badge key={agent} variant="default">
                              {agent.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        setExecSkill(skill);
                        setExecInput("");
                        setExecResult("");
                        setExecProject("");
                      }}
                    >
                      Execute
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Execution Modal */}
      <Modal
        open={!!execSkill}
        onClose={() => setExecSkill(null)}
        title={execSkill ? `Execute: ${execSkill.name}` : "Execute Skill"}
        wide
      >
        <div className="space-y-4">
          {execSkill?.description && (
            <p className="text-sm text-[#94a3b8]">{execSkill.description}</p>
          )}

          {projects.length > 0 && (
            <Select
              label="Project (optional)"
              value={execProject}
              onChange={(e) => setExecProject(e.target.value)}
              options={[
                { value: "", label: "No project" },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          )}

          <Textarea
            label="Input"
            placeholder="Describe what you want this skill to do..."
            value={execInput}
            onChange={(e) => setExecInput(e.target.value)}
            rows={4}
          />

          <div className="flex justify-end">
            <Button onClick={handleExecute} disabled={execRunning || !execInput.trim()}>
              {execRunning ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                  Running...
                </>
              ) : (
                "Execute"
              )}
            </Button>
          </div>

          {execResult && (
            <div className="bg-[#0f1118] border border-[#1e293b] rounded-lg p-4 max-h-80 overflow-y-auto">
              <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-2">Result</div>
              <pre className="text-sm text-[#e2e8f0] whitespace-pre-wrap font-mono">{execResult}</pre>
              <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-[#1e293b]">
                {saveError && (
                  <div className="text-xs text-red-400">{saveError}</div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      setSaveError("");
                      try {
                        const res = await fetch("/api/insights", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            title: `${execSkill?.name}${execProject ? "" : " (no project)"}`,
                            description: execResult,
                            source: execSkill?.name,
                            category: "analysis",
                            project_id: execProject || undefined,
                          }),
                        });
                        if (res.ok) {
                          setExecSkill(null);
                        } else {
                          setSaveError("Failed to save insight");
                        }
                      } catch {
                        setSaveError("Failed to save insight");
                      }
                    }}
                  >
                    Save as Insight
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      setSaveError("");
                      try {
                        const res = await fetch("/api/content", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            type: "post",
                            title: `${execSkill?.name}${execProject ? "" : " (no project)"}`,
                            content: execResult,
                            platform: publishPlatform,
                            project_id: execProject || undefined,
                          }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setSavedContentId(data.id);
                        } else {
                          setSaveError("Failed to save content");
                        }
                      } catch {
                        setSaveError("Failed to save content");
                      }
                    }}
                  >
                    Save as Content
                  </Button>
                  {!savedContentId && (
                    <select
                      value={publishPlatform}
                      onChange={(e) => setPublishPlatform(e.target.value)}
                      className="bg-[#0f1118] border border-[#1e293b] rounded px-2 py-1 text-[10px] text-[#e2e8f0] focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="Twitter">Twitter / X</option>
                      <option value="LinkedIn">LinkedIn</option>
                      <option value="Facebook">Facebook</option>
                      <option value="Instagram">Instagram</option>
                      <option value="TikTok">TikTok</option>
                      <option value="YouTube">YouTube</option>
                      <option value="Email">Email</option>
                      <option value="Blog">Blog</option>
                    </select>
                  )
                  }
                  {savedContentId && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        setPublishingFromSkill(true);
                        setSaveError("");
                        try {
                          const res = await fetch(`/api/content/${savedContentId}/publish`, { method: "POST" });
                          const data = await res.json();
                          if (res.ok) {
                            setSaveError("");
                            setExecSkill(null);
                            setSavedContentId(null);
                          } else {
                            setSaveError(data.error || "Publishing failed");
                          }
                        } catch {
                          setSaveError("Network error while publishing");
                        } finally {
                          setPublishingFromSkill(false);
                        }
                      }}
                      disabled={publishingFromSkill}
                    >
                      {publishingFromSkill ? "Publishing..." : `Publish to ${publishPlatform}`}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
