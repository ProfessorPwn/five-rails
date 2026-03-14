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

  // Execution state
  const [execSkill, setExecSkill] = useState<Skill | null>(null);
  const [execInput, setExecInput] = useState("");
  const [execProject, setExecProject] = useState("");
  const [execResult, setExecResult] = useState("");
  const [execRunning, setExecRunning] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/skills").then((r) => r.json()).catch(() => []),
      fetch("/api/projects").then((r) => r.json()).catch(() => []),
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

  // Group skills by rail
  const grouped = skills.reduce<Record<string, Skill[]>>((acc, skill) => {
    const rail = skill.rail || "general";
    if (!acc[rail]) acc[rail] = [];
    acc[rail].push(skill);
    return acc;
  }, {});

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
          {skills.length} skill{skills.length !== 1 ? "s" : ""} across {Object.keys(grouped).length} rail{Object.keys(grouped).length !== 1 ? "s" : ""}
        </p>
      </div>

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
                          {skill.sub_agents.split(",").map((agent) => (
                            <Badge key={agent.trim()} variant="default">
                              {agent.trim()}
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
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
