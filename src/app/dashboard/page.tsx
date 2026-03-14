"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { useRouter } from "next/navigation";

interface RailData {
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  count: number;
  label: string;
}

interface Project {
  id: string;
  name: string;
  niche: string;
  score: number;
  status: string;
  created_at: string;
}

interface Activity {
  id: string;
  action: string;
  details: string;
  project_id?: string;
  rail?: string;
  skill_used?: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [content, setContent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()).catch(() => []),
      fetch("/api/activity").then((r) => r.json()).catch(() => []),
      fetch("/api/skills").then((r) => r.json()).catch(() => []),
      fetch("/api/insights").then((r) => r.json()).catch(() => []),
      fetch("/api/outbound").then((r) => r.json()).catch(() => []),
      fetch("/api/content").then((r) => r.json()).catch(() => []),
    ]).then(([proj, act, sk, ins, cont, ctn]) => {
      setProjects(Array.isArray(proj) ? proj : []);
      setActivity(Array.isArray(act) ? act : []);
      setSkills(Array.isArray(sk) ? sk : []);
      setInsights(Array.isArray(ins) ? ins : []);
      setContacts(Array.isArray(cont) ? cont : []);
      setContent(Array.isArray(ctn) ? ctn : []);
      setLoading(false);
    });
  }, []);

  const rails: RailData[] = [
    {
      name: "Agent Harness",
      description: "Your AI workers",
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="5" y="5" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="11" r="1.5" fill="currentColor" />
          <circle cx="18" cy="11" r="1.5" fill="currentColor" />
          <path d="M10 17c0 0 2 2 4 2s4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M14 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
      count: skills.length,
      label: "active skills",
    },
    {
      name: "Search Layer",
      description: "Real-time intelligence",
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          <circle cx="14" cy="14" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
          <circle cx="14" cy="14" r="2" fill="currentColor" />
          <path d="M14 4v3M14 21v3M4 14h3M21 14h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </svg>
      ),
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      count: insights.length,
      label: "insights",
    },
    {
      name: "Ops Brain",
      description: "Business state & canon",
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <ellipse cx="14" cy="10" rx="9" ry="4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 10v4c0 2.2 4 4 9 4s9-1.8 9-4v-4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 14v4c0 2.2 4 4 9 4s9-1.8 9-4v-4" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
      count: projects.reduce((acc, p) => acc + (p.status === "active" ? 1 : 0), 0),
      label: "active tasks",
    },
    {
      name: "Outbound Spine",
      description: "Pipeline & deals",
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M6 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M15 9l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 8v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
          <circle cx="22" cy="14" r="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
      color: "text-violet-400",
      bgColor: "bg-violet-500/10",
      borderColor: "border-violet-500/20",
      count: contacts.length,
      label: "contacts",
    },
    {
      name: "Audience Rail",
      description: "Content & distribution",
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M6 18V10l8-5 8 5v8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M6 18l8 5 8-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="14" cy="14" r="3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
      color: "text-rose-400",
      bgColor: "bg-rose-500/10",
      borderColor: "border-rose-500/20",
      count: content.length,
      label: "content pieces",
    },
  ];

  const nextActions = [
    {
      title: "Set up your first LLM connection",
      description: "Connect an Ollama or OpenAI-compatible model to power your skills.",
      link: "/connections",
    },
    {
      title: "Create a project",
      description: "Start with a business idea and let the rails build around it.",
      link: "/projects",
    },
    {
      title: "Run market research",
      description: "Use the Browse skill to find pain points and opportunities.",
      link: "/browse",
    },
    {
      title: "Deploy an outbound sequence",
      description: "Add contacts and start an automated outreach campaign.",
      link: "/outbound",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#e2e8f0]">Dashboard</h1>
        <p className="text-sm text-[#94a3b8] mt-1">
          Five Rails overview — your AI-powered business incubator
        </p>
      </div>

      {/* Five Rails */}
      <div className="grid grid-cols-5 gap-4">
        {rails.map((rail) => (
          <Card key={rail.name} className={`${rail.borderColor} border`} hover>
            <div className={`${rail.color} mb-3`}>{rail.icon}</div>
            <h3 className="text-sm font-semibold text-[#e2e8f0] mb-1">{rail.name}</h3>
            <p className="text-xs text-[#64748b] mb-3">{rail.description}</p>
            <div className="flex items-center gap-2">
              <span className={`text-xl font-bold ${rail.color}`}>{rail.count}</span>
              <span className="text-xs text-[#64748b]">{rail.label}</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${rail.count > 0 ? "bg-emerald-400" : "bg-[#64748b]"}`} />
              <span className="text-[10px] text-[#64748b]">{rail.count > 0 ? "Active" : "Idle"}</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="col-span-2">
          <h2 className="text-lg font-semibold text-[#e2e8f0] mb-4">Recent Activity</h2>
          <Card hover={false} className="divide-y divide-[#1e293b]">
            {activity.length === 0 ? (
              <div className="py-8 text-center text-[#64748b] text-sm">
                No activity yet. Create a project to get started.
              </div>
            ) : (
              activity.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-amber-500/60 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#e2e8f0] truncate">{item.details}</p>
                    <p className="text-[10px] text-[#64748b] mt-0.5">
                      {formatActivityType(item.action)}
                    </p>
                  </div>
                  <span className="text-[10px] text-[#64748b] shrink-0">
                    {formatDate(item.created_at)}
                  </span>
                </div>
              ))
            )}
          </Card>
        </div>

        {/* Active Projects */}
        <div>
          <h2 className="text-lg font-semibold text-[#e2e8f0] mb-4">Active Projects</h2>
          <div className="space-y-3">
            {projects.length === 0 ? (
              <Card hover={false}>
                <div className="py-4 text-center text-[#64748b] text-sm">
                  No projects yet
                </div>
              </Card>
            ) : (
              projects.slice(0, 4).map((project) => (
                <Card
                  key={project.id}
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-[#e2e8f0]">{project.name}</h3>
                      <p className="text-xs text-[#64748b] mt-0.5">{project.niche || "No niche"}</p>
                    </div>
                    {project.score > 0 && (
                      <Badge variant={project.score >= 70 ? "success" : project.score >= 40 ? "warning" : "default"}>
                        {project.score}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2">
                    <Badge variant={project.status === "active" ? "success" : "default"}>
                      {project.status || "draft"}
                    </Badge>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* What's Next */}
      <div>
        <h2 className="text-lg font-semibold text-[#e2e8f0] mb-4">What&apos;s Next</h2>
        <div className="grid grid-cols-2 gap-4">
          {nextActions.map((action) => (
            <Card
              key={action.title}
              onClick={() => router.push(action.link)}
              className="group"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-amber-500 opacity-60 group-hover:opacity-100 transition-opacity">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#e2e8f0] group-hover:text-amber-400 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-xs text-[#64748b] mt-1">{action.description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatActivityType(type: string): string {
  if (!type) return "";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
