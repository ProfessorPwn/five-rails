"use client";

import { useState, useEffect, useCallback } from "react";

interface Agent {
  id: string;
  name: string;
  department: string;
  schedule: string;
  is_active: number;
}

interface DbInfo {
  db_size_bytes: number;
  db_size_mb: string;
  table_counts: Record<string, number>;
}

interface TelegramBotConfig {
  agent_id: string;
  connected: boolean;
  bot_username?: string;
  chat_id?: string;
}

const AUTOMATION_TOGGLES = [
  { key: "auto_publish_scheduled", label: "Auto-publish scheduled posts", desc: "Automatically publish content when its scheduled time arrives" },
  { key: "auto_retry_payments", label: "Auto-retry failed payments", desc: "Automatically retry failed subscription payments" },
  { key: "auto_create_followup_tasks", label: "Auto-create follow-up tasks", desc: "Create follow-up tasks when deal stage changes" },
  { key: "auto_generate_plan", label: "Auto-generate action plan", desc: "Generate an action plan when a new project is created" },
  { key: "auto_welcome_sequence", label: "Auto-enroll welcome sequence", desc: "Enroll new contacts in the welcome email sequence" },
  { key: "auto_generate_blueprint", label: "Auto-generate blueprint", desc: "Generate a business blueprint on project creation" },
  { key: "auto_schedule_content", label: "Auto-schedule content", desc: "Automatically schedule content at optimal times" },
  { key: "auto_analytics_recommendations", label: "Auto-analytics recommendations", desc: "Generate recommendations from analytics data" },
  { key: "auto_send_newsletter", label: "Auto-send newsletters", desc: "Automatically send newsletters when ready" },
  { key: "auto_execute_blueprint", label: "Auto-execute blueprint", desc: "Automatically execute blueprint steps" },
];

const NOTIFICATION_TOGGLES = [
  { key: "notify_on_agent_complete", label: "Agent completes work", desc: "Get notified when an agent finishes a task" },
  { key: "notify_on_agent_blocked", label: "Agent is blocked", desc: "Get notified when an agent encounters a blocker" },
  { key: "notify_on_deal_won", label: "Deal reaches won stage", desc: "Get notified when a deal is marked as won" },
];

const SCHEDULE_PRESETS = [
  { label: "Daily 8am", cron: "0 8 * * *" },
  { label: "Daily 9am", cron: "0 9 * * *" },
  { label: "Daily 10am", cron: "0 10 * * *" },
  { label: "Weekdays 8am", cron: "0 8 * * 1-5" },
  { label: "Mondays 7am", cron: "0 7 * * 1" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Custom", cron: "" },
];

function getCronLabel(cron: string): string {
  const preset = SCHEDULE_PRESETS.find((p) => p.cron === cron);
  if (preset) return preset.label;
  return "Custom";
}

const DEPT_COLORS: Record<string, string> = {
  marketing: "text-blue-400",
  sales: "text-emerald-400",
  product: "text-violet-400",
  research: "text-amber-400",
  executive: "text-red-400",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("automation");
  const [agentSchedules, setAgentSchedules] = useState<Record<string, { preset: string; cron: string }>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [tgBots, setTgBots] = useState<TelegramBotConfig[]>([]);
  const [tgTokens, setTgTokens] = useState<Record<string, string>>({});
  const [tgConnecting, setTgConnecting] = useState<string | null>(null);
  const [tgDisconnecting, setTgDisconnecting] = useState<string | null>(null);
  const [tgShowTokens, setTgShowTokens] = useState<Record<string, boolean>>({});
  const [tgExpanded, setTgExpanded] = useState<string | null>(null);
  const [tgPolling, setTgPolling] = useState(false);
  const [tgPollStatus, setTgPollStatus] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = useCallback(async () => {
    try {
      const [settingsRes, agentsRes] = await Promise.all([
        fetch("/api/automation/settings"),
        fetch("/api/agents"),
      ]);
      const settingsData = await settingsRes.json();
      const agentsData = await agentsRes.json();
      setSettings(settingsData);
      setAgents(agentsData);

      // Initialize agent schedules
      const schedules: Record<string, { preset: string; cron: string }> = {};
      for (const agent of agentsData) {
        schedules[agent.id] = {
          preset: getCronLabel(agent.schedule),
          cron: agent.schedule,
        };
      }
      setAgentSchedules(schedules);
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDbInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/export");
      const data = await res.json();
      setDbInfo({
        db_size_bytes: data.db_size_bytes,
        db_size_mb: data.db_size_mb,
        table_counts: data.table_counts,
      });
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (activeSection === "data") fetchDbInfo();
  }, [activeSection, fetchDbInfo]);

  const toggleSetting = async (key: string) => {
    const newValue = settings[key] === "true" ? "false" : "true";
    setSaving(key);
    try {
      await fetch("/api/automation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: newValue }),
      });
      setSettings((prev) => ({ ...prev, [key]: newValue }));
      showToast(`${key.replace(/_/g, " ")} ${newValue === "true" ? "enabled" : "disabled"}`);
    } catch {
      showToast("Failed to update setting");
    } finally {
      setSaving(null);
    }
  };

  const updateInterval = async (value: string) => {
    const num = parseInt(value);
    if (isNaN(num) || num < 1) return;
    setSaving("automation_interval_minutes");
    try {
      await fetch("/api/automation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "automation_interval_minutes", value: String(num) }),
      });
      setSettings((prev) => ({ ...prev, automation_interval_minutes: String(num) }));
      showToast(`Heartbeat interval set to ${num} minutes`);
    } catch {
      showToast("Failed to update interval");
    } finally {
      setSaving(null);
    }
  };

  const updateNotifyChannel = async (value: string) => {
    setSaving("notify_channel");
    try {
      await fetch("/api/automation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "notify_channel", value }),
      });
      setSettings((prev) => ({ ...prev, notify_channel: value }));
      showToast(`Notification channel set to ${value}`);
    } catch {
      showToast("Failed to update channel");
    } finally {
      setSaving(null);
    }
  };

  const updateAgentSchedule = async (agentId: string, cron: string) => {
    setSaving(agentId);
    try {
      await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: cron }),
      });
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, schedule: cron } : a))
      );
      showToast(`Schedule updated for agent`);
    } catch {
      showToast("Failed to update schedule");
    } finally {
      setSaving(null);
    }
  };

  const handlePresetChange = (agentId: string, presetLabel: string) => {
    const preset = SCHEDULE_PRESETS.find((p) => p.label === presetLabel);
    if (!preset) return;
    setAgentSchedules((prev) => ({
      ...prev,
      [agentId]: { preset: presetLabel, cron: preset.cron || prev[agentId]?.cron || "" },
    }));
    if (preset.cron) {
      updateAgentSchedule(agentId, preset.cron);
    }
  };

  const handleCustomCron = (agentId: string, cron: string) => {
    setAgentSchedules((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], cron },
    }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/settings/export");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fiverails-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Data exported successfully");
    } catch {
      showToast("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const fetchTelegramBots = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/telegram/setup");
      const data = await res.json();
      setTgBots(data.bots || []);
      setTgPolling(data.polling || false);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    if (activeSection === "telegram") fetchTelegramBots();
  }, [activeSection, fetchTelegramBots]);

  // Polling interval — runs every 5s when polling is enabled
  useEffect(() => {
    if (!tgPolling) return;
    const doPoll = async () => {
      try {
        const res = await fetch("/api/agents/telegram/poll", { method: "POST" });
        const data = await res.json();
        if (data.processed > 0) {
          setTgPollStatus(`Processed ${data.processed} message${data.processed > 1 ? "s" : ""}`);
          setTimeout(() => setTgPollStatus(null), 3000);
        }
      } catch { /* silent */ }
    };
    doPoll(); // immediate first poll
    const interval = setInterval(doPoll, 5000);
    return () => clearInterval(interval);
  }, [tgPolling]);

  const togglePolling = async () => {
    const newValue = !tgPolling;
    try {
      await fetch("/api/agents/telegram/setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ polling: newValue }),
      });
      setTgPolling(newValue);
      showToast(newValue ? "Polling started" : "Polling stopped");
    } catch {
      showToast("Failed to toggle polling");
    }
  };

  const connectTelegramBot = async (agentId: string) => {
    const token = tgTokens[agentId]?.trim();
    if (!token) { showToast("Enter a bot token"); return; }
    setTgConnecting(agentId);
    try {
      const res = await fetch("/api/agents/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: token, agent_id: agentId }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Connection failed"); return; }
      showToast(data.message || "Connected!");
      setTgTokens((prev) => ({ ...prev, [agentId]: "" }));
      setTgExpanded(null);
      fetchTelegramBots();
    } catch {
      showToast("Connection failed");
    } finally {
      setTgConnecting(null);
    }
  };

  const disconnectTelegramBot = async (agentId: string) => {
    setTgDisconnecting(agentId);
    try {
      await fetch(`/api/agents/telegram/setup?agent_id=${agentId}`, { method: "DELETE" });
      showToast("Bot disconnected");
      fetchTelegramBots();
    } catch {
      showToast("Failed to disconnect");
    } finally {
      setTgDisconnecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  const sections = [
    { id: "automation", label: "Automation Toggles", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
    { id: "agents", label: "Agent Schedules", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" },
    { id: "telegram", label: "Telegram", icon: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" },
    { id: "notifications", label: "Notifications", icon: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" },
    { id: "data", label: "Data", icon: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600/90 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg backdrop-blur-sm animate-in fade-in duration-200">
          {toast}
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[#e2e8f0]">Settings</h1>
        <p className="text-sm text-[#64748b] mt-1">Configure automation, agents, notifications, and manage your data</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-[#0d0f17] p-1 rounded-lg border border-[#1e293b]/50">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
              activeSection === s.id
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-white/5"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={s.icon} />
            </svg>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>

      {/* ── Section 1: Automation Toggles ── */}
      {activeSection === "automation" && (
        <div className="space-y-4">
          <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-[#e2e8f0] mb-1">Automation Toggles</h2>
            <p className="text-sm text-[#64748b] mb-6">Control which automations run on the heartbeat cycle</p>
            <div className="space-y-4">
              {AUTOMATION_TOGGLES.map((toggle) => {
                const isOn = settings[toggle.key] === "true";
                return (
                  <div key={toggle.key} className="flex items-center justify-between py-2 border-b border-[#1e293b]/50 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-[#e2e8f0]">{toggle.label}</div>
                      <div className="text-xs text-[#64748b] mt-0.5">{toggle.desc}</div>
                    </div>
                    <button
                      onClick={() => toggleSetting(toggle.key)}
                      disabled={saving === toggle.key}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        isOn ? "bg-amber-500" : "bg-[#374151]"
                      } ${saving === toggle.key ? "opacity-50" : ""}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                          isOn ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Heartbeat interval */}
          <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-[#e2e8f0] mb-1">Heartbeat Interval</h2>
            <p className="text-sm text-[#64748b] mb-4">How often the automation engine checks for work (in minutes)</p>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min={1}
                max={1440}
                value={settings.automation_interval_minutes || "15"}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    automation_interval_minutes: e.target.value,
                  }))
                }
                onBlur={(e) => updateInterval(e.target.value)}
                className="w-24 bg-[#0a0c14] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-amber-500 focus:outline-none"
              />
              <span className="text-sm text-[#64748b]">minutes</span>
              {saving === "automation_interval_minutes" && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-500" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Section 2: Agent Schedules ── */}
      {activeSection === "agents" && (
        <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-[#e2e8f0] mb-1">Agent Schedules</h2>
          <p className="text-sm text-[#64748b] mb-6">Configure when each agent runs autonomously</p>
          <div className="space-y-6">
            {agents.map((agent) => {
              const schedule = agentSchedules[agent.id];
              const isCustom = schedule?.preset === "Custom";
              return (
                <div key={agent.id} className="p-4 bg-[#0d0f17] rounded-lg border border-[#1e293b]/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`text-sm font-semibold ${DEPT_COLORS[agent.department] || "text-[#e2e8f0]"}`}>
                        {agent.name}
                      </div>
                      <span className="text-xs text-[#64748b] bg-[#1e293b]/50 px-2 py-0.5 rounded">
                        {agent.department}
                      </span>
                    </div>
                    <span className="text-xs text-[#64748b] font-mono">{agent.schedule}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={schedule?.preset || "Custom"}
                      onChange={(e) => handlePresetChange(agent.id, e.target.value)}
                      disabled={saving === agent.id}
                      className="bg-[#0a0c14] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-amber-500 focus:outline-none"
                    >
                      {SCHEDULE_PRESETS.map((p) => (
                        <option key={p.label} value={p.label}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    {isCustom && (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          placeholder="Cron expression (e.g. 0 9 * * *)"
                          value={schedule?.cron || ""}
                          onChange={(e) => handleCustomCron(agent.id, e.target.value)}
                          className="flex-1 bg-[#0a0c14] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] font-mono focus:border-amber-500 focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            if (schedule?.cron) updateAgentSchedule(agent.id, schedule.cron);
                          }}
                          disabled={saving === agent.id}
                          className="px-3 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-sm hover:bg-amber-500/20 transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    )}
                    {saving === agent.id && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section: Telegram ── */}
      {activeSection === "telegram" && (
        <div className="space-y-4">
          {/* Polling control + setup instructions */}
          <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-[#e2e8f0]">Telegram Bots</h2>
              {tgPollStatus && (
                <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                  {tgPollStatus}
                </span>
              )}
            </div>
            <p className="text-sm text-[#64748b] mb-5">
              Each agent gets its own Telegram bot. Create bots via <span className="text-[#e2e8f0] font-medium">@BotFather</span> and add the token below.
            </p>

            {/* Polling toggle */}
            <div className="flex items-center justify-between py-3 px-4 bg-[#0d0f17] rounded-lg border border-[#1e293b]/50 mb-4">
              <div>
                <div className="text-sm font-medium text-[#e2e8f0]">Polling</div>
                <div className="text-xs text-[#64748b] mt-0.5">
                  {tgPolling
                    ? "Checking for messages every 5 seconds"
                    : "Turn on to start receiving Telegram messages"
                  }
                </div>
              </div>
              <button
                onClick={togglePolling}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  tgPolling ? "bg-emerald-500" : "bg-[#374151]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    tgPolling ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Setup guide */}
            <div className="bg-[#0d0f17] rounded-lg p-4 border border-[#1e293b]/50">
              <div className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-2">How to create a bot</div>
              <ol className="space-y-1.5 text-sm text-[#94a3b8]">
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">1.</span>
                  Open Telegram, search <span className="text-[#e2e8f0] font-medium">@BotFather</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">2.</span>
                  Send <span className="font-mono text-[#e2e8f0] bg-[#1e293b] px-1.5 py-0.5 rounded text-xs">/newbot</span>, name it after the agent (e.g. &quot;FiveRails Hormozi&quot;)
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">3.</span>
                  Copy the token and paste it into the agent card below
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">4.</span>
                  Send any message to the bot in Telegram, then click Connect
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">5.</span>
                  Turn on <span className="text-[#e2e8f0] font-medium">Polling</span> above to start receiving messages
                </li>
              </ol>
            </div>
          </div>

          {/* Per-agent bot cards */}
          <div className="space-y-3">
            {agents.map((agent) => {
              const botConfig = tgBots.find((b) => b.agent_id === agent.id);
              const isConnected = botConfig?.connected;
              const isExpanded = tgExpanded === agent.id;
              const deptColor = DEPT_COLORS[agent.department] || "text-[#e2e8f0]";

              return (
                <div key={agent.id} className="bg-[#141822] border border-[#1e293b] rounded-xl overflow-hidden">
                  {/* Agent header row */}
                  <div
                    className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => setTgExpanded(isExpanded ? null : agent.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-[#374151]"}`} />
                      <div>
                        <span className={`text-sm font-semibold ${deptColor}`}>{agent.name}</span>
                        <span className="text-xs text-[#64748b] ml-2">{agent.department}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isConnected && (
                        <span className="text-xs text-[#94a3b8] font-mono">@{botConfig.bot_username}</span>
                      )}
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className={`text-[#64748b] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-[#1e293b]/50 pt-4">
                      {isConnected ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="bg-[#0d0f17] rounded-lg p-3 border border-[#1e293b]/50">
                              <div className="text-xs text-[#64748b]">Bot Username</div>
                              <div className="text-sm font-semibold text-[#e2e8f0] mt-1">@{botConfig.bot_username}</div>
                            </div>
                            <div className="bg-[#0d0f17] rounded-lg p-3 border border-[#1e293b]/50">
                              <div className="text-xs text-[#64748b]">Chat ID</div>
                              <div className="text-sm font-mono text-[#e2e8f0] mt-1">{botConfig.chat_id || "Auto-detected on first message"}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => disconnectTelegramBot(agent.id)}
                            disabled={tgDisconnecting === agent.id}
                            className="text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                          >
                            {tgDisconnecting === agent.id ? "Disconnecting..." : "Disconnect Bot"}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Bot Token for {agent.name}</label>
                            <div className="relative">
                              <input
                                type={tgShowTokens[agent.id] ? "text" : "password"}
                                value={tgTokens[agent.id] || ""}
                                onChange={(e) => setTgTokens((prev) => ({ ...prev, [agent.id]: e.target.value }))}
                                placeholder="Paste token from @BotFather"
                                className="w-full bg-[#0a0c14] border border-[#1e293b] rounded-lg px-3 py-2.5 text-sm text-[#e2e8f0] font-mono focus:border-amber-500 focus:outline-none pr-16"
                              />
                              <button
                                type="button"
                                onClick={() => setTgShowTokens((prev) => ({ ...prev, [agent.id]: !prev[agent.id] }))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#64748b] hover:text-[#94a3b8] px-2 py-1"
                              >
                                {tgShowTokens[agent.id] ? "Hide" : "Show"}
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => connectTelegramBot(agent.id)}
                            disabled={tgConnecting === agent.id || !tgTokens[agent.id]?.trim()}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-[#0a0c14] rounded-lg text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {tgConnecting === agent.id ? (
                              <>
                                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-[#0a0c14]" />
                                Connecting...
                              </>
                            ) : (
                              "Connect"
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 3: Notification Preferences ── */}
      {activeSection === "notifications" && (
        <div className="space-y-4">
          <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-[#e2e8f0] mb-1">Notification Triggers</h2>
            <p className="text-sm text-[#64748b] mb-6">Choose which events create in-app notifications</p>
            <div className="space-y-4">
              {NOTIFICATION_TOGGLES.map((toggle) => {
                const isOn = settings[toggle.key] !== "false" && settings[toggle.key] !== undefined;
                return (
                  <div key={toggle.key} className="flex items-center justify-between py-2 border-b border-[#1e293b]/50 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-[#e2e8f0]">{toggle.label}</div>
                      <div className="text-xs text-[#64748b] mt-0.5">{toggle.desc}</div>
                    </div>
                    <button
                      onClick={() => toggleSetting(toggle.key)}
                      disabled={saving === toggle.key}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        isOn ? "bg-amber-500" : "bg-[#374151]"
                      } ${saving === toggle.key ? "opacity-50" : ""}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                          isOn ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-[#e2e8f0] mb-1">Notification Channel</h2>
            <p className="text-sm text-[#64748b] mb-4">Where to deliver external notifications (in addition to in-app)</p>
            <select
              value={settings.notify_channel || "none"}
              onChange={(e) => updateNotifyChannel(e.target.value)}
              disabled={saving === "notify_channel"}
              className="bg-[#0a0c14] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-amber-500 focus:outline-none"
            >
              <option value="none">None (in-app only)</option>
              <option value="telegram">Telegram</option>
              <option value="slack">Slack</option>
              <option value="both">Both (Telegram + Slack)</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Section 4: Data Management ── */}
      {activeSection === "data" && (
        <div className="space-y-4">
          <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-[#e2e8f0] mb-1">Export Data</h2>
            <p className="text-sm text-[#64748b] mb-4">Download all your data as a JSON file</p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-sm font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-400" />
                  Exporting...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2v8m0 0l3-3m-3 3L5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Export All Data (JSON)
                </>
              )}
            </button>
          </div>

          {dbInfo && (
            <div className="bg-[#141822] border border-[#1e293b] rounded-xl p-6">
              <h2 className="text-lg font-semibold text-[#e2e8f0] mb-1">Database Info</h2>
              <p className="text-sm text-[#64748b] mb-4">Overview of your Five Rails database</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                <div className="bg-[#0d0f17] rounded-lg p-3 border border-[#1e293b]/50">
                  <div className="text-xs text-[#64748b]">Database Size</div>
                  <div className="text-lg font-bold text-[#e2e8f0] mt-1">{dbInfo.db_size_mb} MB</div>
                </div>
                <div className="bg-[#0d0f17] rounded-lg p-3 border border-[#1e293b]/50">
                  <div className="text-xs text-[#64748b]">Total Tables</div>
                  <div className="text-lg font-bold text-[#e2e8f0] mt-1">{Object.keys(dbInfo.table_counts).length}</div>
                </div>
                <div className="bg-[#0d0f17] rounded-lg p-3 border border-[#1e293b]/50">
                  <div className="text-xs text-[#64748b]">Total Rows</div>
                  <div className="text-lg font-bold text-[#e2e8f0] mt-1">
                    {Object.values(dbInfo.table_counts).reduce((a, b) => a + b, 0).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2 text-xs text-[#64748b] font-semibold px-2 py-1 border-b border-[#1e293b]/50 sticky top-0 bg-[#141822]">
                  <span>Table</span>
                  <span className="text-right">Rows</span>
                </div>
                {Object.entries(dbInfo.table_counts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([table, count]) => (
                    <div key={table} className="grid grid-cols-2 gap-2 text-sm px-2 py-1.5 rounded hover:bg-white/5">
                      <span className="text-[#94a3b8] font-mono text-xs">{table}</span>
                      <span className="text-right text-[#e2e8f0]">{count.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
