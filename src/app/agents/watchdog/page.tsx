"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface WatchdogStats {
  total_incidents: number;
  open_incidents: number;
  critical_open: number;
  auto_fixed_count: number;
  escalated_count: number;
  incidents_today: number;
  active_channels: number;
  active_rules: number;
  last_scan_at: string | null;
}

interface Incident {
  id: string;
  source_channel_id: string | null;
  source_message: string | null;
  category: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  root_cause: string | null;
  action_taken: string | null;
  verification: string | null;
  assigned_to: string | null;
  related_agent_id: string | null;
  auto_fixed: number;
  escalated_to: string | null;
  detected_at: string;
  resolved_at: string | null;
  channel_name: string | null;
  agent_name: string | null;
}

interface Channel {
  id: string;
  name: string;
  channel_type: string;
  config: string;
  is_active: number;
  last_checked_at: string | null;
  check_interval_seconds: number;
}

interface Rule {
  id: string;
  name: string;
  description: string | null;
  rule_type: string;
  pattern: string | null;
  severity: string;
  auto_fix_enabled: number;
  is_active: number;
  trigger_count: number;
  last_triggered_at: string | null;
}

interface ScanLog {
  id: string;
  scan_type: string;
  channels_scanned: number;
  issues_found: number;
  issues_auto_fixed: number;
  issues_escalated: number;
  duration_ms: number;
  created_at: string;
}

interface AutoScanConfig {
  enabled: boolean;
  interval_seconds: number;
}

interface DashboardData {
  stats: WatchdogStats;
  incidents: Incident[];
  channels: Channel[];
  rules: Rule[];
  scan_logs: ScanLog[];
  auto_scan: AutoScanConfig;
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  critical: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", dot: "bg-red-500" },
  high: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-500" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", dot: "bg-amber-500" },
  low: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30", dot: "bg-blue-400" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  detected: { bg: "bg-red-500/10", text: "text-red-400" },
  investigating: { bg: "bg-amber-500/10", text: "text-amber-400" },
  fix_applied: { bg: "bg-blue-500/10", text: "text-blue-400" },
  verified: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  escalated: { bg: "bg-purple-500/10", text: "text-purple-400" },
  dismissed: { bg: "bg-gray-500/10", text: "text-gray-400" },
};

const CATEGORY_LABELS: Record<string, string> = {
  explicit_complaint: "Complaint",
  bug_report: "Bug Report",
  broken_feature: "Broken Feature",
  agent_claim_mismatch: "Claim Mismatch",
  silent_failure: "Silent Failure",
  performance_degradation: "Performance",
  security_alert: "Security",
};

const CHANNEL_ICONS: Record<string, string> = {
  telegram: "T",
  slack: "S",
  discord: "D",
  agent_output: "A",
  error_monitor: "E",
  cron_log: "C",
  server_log: "L",
  uptime_check: "U",
  webhook: "W",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function WatchdogPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState<"kanban" | "incidents" | "channels" | "rules" | "scans">("kanban");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedIncident, setExpandedIncident] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newIncident, setNewIncident] = useState({ title: "", category: "bug_report", severity: "medium", description: "" });
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [scanInterval, setScanInterval] = useState(60);
  const [lastAutoScan, setLastAutoScan] = useState<string | null>(null);
  const [scanCountdown, setScanCountdown] = useState(0);

  const fetchData = useCallback(() => {
    fetch("/api/agents/watchdog").then(r => r.json()).then((d: DashboardData) => {
      setData(d);
      if (d.auto_scan) {
        setAutoScanEnabled(d.auto_scan.enabled);
        setScanInterval(d.auto_scan.interval_seconds);
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Auto-scan polling loop
  useEffect(() => {
    if (!autoScanEnabled) {
      setScanCountdown(0);
      return;
    }

    setScanCountdown(scanInterval);
    const countdownInterval = setInterval(() => {
      setScanCountdown(prev => {
        if (prev <= 1) {
          // Trigger scheduled scan
          fetch("/api/agents/watchdog/scan?type=scheduled", { method: "POST" })
            .then(r => r.json())
            .then(result => {
              setLastAutoScan(new Date().toISOString());
              fetchData();
              if (result.auto_fixed?.length > 0 || result.incidents?.some((i: Incident) => i.severity === "critical")) {
                // Data already refreshed via fetchData
              }
            })
            .catch(() => {});
          return scanInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [autoScanEnabled, scanInterval, fetchData]);

  const runScan = async () => {
    setScanning(true);
    try {
      await fetch("/api/agents/watchdog/scan", { method: "POST" });
      fetchData();
    } finally {
      setScanning(false);
    }
  };

  const toggleAutoScan = async () => {
    const newVal = !autoScanEnabled;
    setAutoScanEnabled(newVal);
    await fetch("/api/agents/watchdog/scan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_scan_enabled: newVal }),
    });
  };

  const updateScanInterval = async (seconds: number) => {
    setScanInterval(seconds);
    await fetch("/api/agents/watchdog/scan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scan_interval_seconds: seconds }),
    });
  };

  const updateIncidentStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      await fetch(`/api/agents/watchdog/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } finally {
      setUpdatingId(null);
    }
  };

  const updateIncidentDetails = async (id: string, updates: Record<string, string>) => {
    setUpdatingId(id);
    try {
      await fetch(`/api/agents/watchdog/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      fetchData();
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleChannel = async (id: string, isActive: number) => {
    await fetch("/api/agents/watchdog/channels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: isActive ? 0 : 1 }),
    });
    fetchData();
  };

  const toggleRule = async (id: string, isActive: number) => {
    await fetch("/api/agents/watchdog/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: isActive ? 0 : 1 }),
    });
    fetchData();
  };

  const createIncident = async () => {
    if (!newIncident.title) return;
    await fetch("/api/agents/watchdog/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newIncident),
    });
    setShowCreateModal(false);
    setNewIncident({ title: "", category: "bug_report", severity: "medium", description: "" });
    fetchData();
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  const { stats, incidents, channels, rules, scan_logs } = data;

  const filteredIncidents = incidents.filter(i => {
    if (filterSeverity !== "all" && i.severity !== filterSeverity) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/agents" className="text-[#8b949e] hover:text-[#e2e8f0] transition-colors">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 2L2 7v8l9 5 9-5V7L11 2z" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round"/><path d="M11 8v4" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/><circle cx="11" cy="15" r="1" fill="#ef4444"/></svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-[#e2e8f0]">Watchdog Agent</h1>
                  <p className="text-sm text-[#8b949e]">Autonomous monitoring & remediation</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[#30363d] text-[#e2e8f0] hover:bg-[#21262d] transition-colors"
            >
              Report Issue
            </button>
            <button
              onClick={runScan}
              disabled={scanning}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {scanning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v2M8 12v2M2 8h2M12 8h2M4.2 4.2l1.4 1.4M10.4 10.4l1.4 1.4M4.2 11.8l1.4-1.4M10.4 5.6l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Run Scan
                </>
              )}
            </button>
          </div>
        </div>

        {/* Auto-Scan Controls */}
        <div className="flex items-center gap-4 mb-6 bg-[#161b22] border border-[#30363d] rounded-xl px-5 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleAutoScan}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                autoScanEnabled ? "bg-red-600" : "bg-[#30363d]"
              }`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                autoScanEnabled ? "translate-x-5" : "translate-x-0.5"
              }`} />
            </button>
            <span className="text-sm font-medium text-[#e2e8f0]">Auto-Scan</span>
          </div>

          {autoScanEnabled && (
            <>
              <div className="h-4 w-px bg-[#30363d]" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8b949e]">Every</span>
                <select
                  value={scanInterval}
                  onChange={e => updateScanInterval(parseInt(e.target.value))}
                  className="bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1 text-xs text-[#e2e8f0]"
                >
                  <option value="15">15s</option>
                  <option value="30">30s</option>
                  <option value="60">1 min</option>
                  <option value="120">2 min</option>
                  <option value="300">5 min</option>
                  <option value="600">10 min</option>
                </select>
              </div>

              <div className="h-4 w-px bg-[#30363d]" />

              {/* Countdown + live indicator */}
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-400 font-mono font-medium">
                  Next scan in {scanCountdown}s
                </span>
              </div>

              {/* Progress bar showing countdown */}
              <div className="flex-1 max-w-[200px]">
                <div className="w-full bg-[#30363d] rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-red-500 transition-all duration-1000"
                    style={{ width: `${((scanInterval - scanCountdown) / scanInterval) * 100}%` }}
                  />
                </div>
              </div>

              {lastAutoScan && (
                <>
                  <div className="h-4 w-px bg-[#30363d]" />
                  <span className="text-[10px] text-[#484f58]">Last auto: {timeAgo(lastAutoScan)}</span>
                </>
              )}
            </>
          )}

          {!autoScanEnabled && (
            <span className="text-xs text-[#484f58]">Enable to continuously monitor all channels</span>
          )}
        </div>

        {/* Agent Status Bar */}
        <div className={`mb-6 rounded-xl border p-4 flex items-center gap-5 ${
          scanning
            ? "bg-amber-500/5 border-amber-500/30"
            : stats.critical_open > 0
              ? "bg-red-500/5 border-red-500/30"
              : stats.open_incidents > 0
                ? "bg-amber-500/5 border-amber-500/30"
                : autoScanEnabled
                  ? "bg-emerald-500/5 border-emerald-500/30"
                  : "bg-[#161b22] border-[#30363d]"
        }`}>
          {/* State indicator */}
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              scanning
                ? "bg-amber-500/20"
                : stats.critical_open > 0
                  ? "bg-red-500/20"
                  : stats.open_incidents > 0
                    ? "bg-amber-500/20"
                    : autoScanEnabled
                      ? "bg-emerald-500/20"
                      : "bg-[#21262d]"
            }`}>
              {scanning ? (
                <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke={
                    stats.critical_open > 0 ? "#ef4444" : stats.open_incidents > 0 ? "#f59e0b" : autoScanEnabled ? "#10b981" : "#484f58"
                  } strokeWidth="1.5" strokeLinejoin="round" />
                  {stats.open_incidents === 0 && autoScanEnabled ? (
                    <path d="M8 12l3 3 5-5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  ) : stats.open_incidents === 0 && !autoScanEnabled ? (
                    <path d="M9 9l6 6M15 9l-6 6" stroke="#484f58" strokeWidth="1.5" strokeLinecap="round" />
                  ) : (
                    <>
                      <path d="M12 9v4" stroke={stats.critical_open > 0 ? "#ef4444" : "#f59e0b"} strokeWidth="2" strokeLinecap="round" />
                      <circle cx="12" cy="16" r="1" fill={stats.critical_open > 0 ? "#ef4444" : "#f59e0b"} />
                    </>
                  )}
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${
                  scanning ? "text-amber-400"
                    : stats.critical_open > 0 ? "text-red-400"
                    : stats.open_incidents > 0 ? "text-amber-400"
                    : autoScanEnabled ? "text-emerald-400"
                    : "text-[#484f58]"
                }`}>
                  {scanning ? "SCANNING"
                    : stats.critical_open > 0 ? "ALERT"
                    : stats.open_incidents > 0 ? "MONITORING"
                    : autoScanEnabled ? "WATCHING"
                    : "IDLE"}
                </span>
                <div className={`w-2 h-2 rounded-full ${
                  scanning ? "bg-amber-400 animate-pulse"
                    : stats.critical_open > 0 ? "bg-red-500 animate-pulse"
                    : stats.open_incidents > 0 ? "bg-amber-400"
                    : autoScanEnabled ? "bg-emerald-500 animate-pulse"
                    : "bg-[#484f58]"
                }`} />
              </div>
              <p className="text-xs text-[#8b949e] mt-0.5">
                {scanning
                  ? "Actively scanning all channels for issues..."
                  : stats.critical_open > 0
                    ? `${stats.critical_open} critical issue${stats.critical_open > 1 ? "s" : ""} require immediate attention`
                    : stats.open_incidents > 0
                      ? `${stats.open_incidents} open issue${stats.open_incidents > 1 ? "s" : ""} being tracked`
                      : autoScanEnabled
                        ? `Watching ${stats.active_channels} channels — auto-scanning every ${scanInterval}s`
                        : "Auto-scan disabled — enable to start continuous monitoring"
                }
              </p>
            </div>
          </div>

          {/* State timeline */}
          <div className="ml-auto flex items-center gap-6 text-xs">
            <div>
              <div className="text-[#484f58] text-[10px] uppercase tracking-wider">Last Scan</div>
              <div className="text-[#e2e8f0] font-medium">{stats.last_scan_at ? timeAgo(stats.last_scan_at) : "Never"}</div>
            </div>
            <div>
              <div className="text-[#484f58] text-[10px] uppercase tracking-wider">Auto-Fixed</div>
              <div className="text-emerald-400 font-medium">{stats.auto_fixed_count}</div>
            </div>
            <div>
              <div className="text-[#484f58] text-[10px] uppercase tracking-wider">Escalated</div>
              <div className={`font-medium ${stats.escalated_count > 0 ? "text-purple-400" : "text-[#e2e8f0]"}`}>{stats.escalated_count}</div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <div className="text-[#8b949e] text-xs font-medium uppercase tracking-wider mb-1">Open Issues</div>
            <div className="text-3xl font-bold text-[#e2e8f0]">{stats.open_incidents}</div>
            {stats.critical_open > 0 && (
              <div className="text-xs text-red-400 mt-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {stats.critical_open} critical
              </div>
            )}
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <div className="text-[#8b949e] text-xs font-medium uppercase tracking-wider mb-1">Today</div>
            <div className="text-3xl font-bold text-[#e2e8f0]">{stats.incidents_today}</div>
            <div className="text-xs text-[#484f58] mt-1">{stats.total_incidents} total all time</div>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <div className="text-[#8b949e] text-xs font-medium uppercase tracking-wider mb-1">Active Channels</div>
            <div className="text-3xl font-bold text-[#e2e8f0]">{stats.active_channels}</div>
            <div className="text-xs text-[#484f58] mt-1">{stats.active_rules} rules active</div>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <div className="text-[#8b949e] text-xs font-medium uppercase tracking-wider mb-1">Auto-Fixed</div>
            <div className="text-3xl font-bold text-emerald-400">{stats.auto_fixed_count}</div>
            <div className="text-xs text-[#484f58] mt-1">{stats.escalated_count} escalated</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[#161b22] border border-[#30363d] rounded-lg p-1 w-fit">
          {(["kanban", "incidents", "channels", "rules", "scans"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
                tab === t ? "bg-red-500/20 text-red-400" : "text-[#8b949e] hover:text-[#e2e8f0]"
              }`}
            >
              {t === "kanban" && `Board (${incidents.length})`}
              {t === "incidents" && `Incidents (${stats.open_incidents})`}
              {t === "channels" && `Channels (${channels.length})`}
              {t === "rules" && `Rules (${rules.length})`}
              {t === "scans" && `Scan History`}
            </button>
          ))}
        </div>

        {/* Kanban Board Tab */}
        {tab === "kanban" && (() => {
          const columns: Array<{ key: string; label: string; color: string; icon: string }> = [
            { key: "detected", label: "Detected", color: "#ef4444", icon: "!" },
            { key: "investigating", label: "Investigating", color: "#f59e0b", icon: "?" },
            { key: "fix_applied", label: "Fix Applied", color: "#3b82f6", icon: "W" },
            { key: "verified", label: "Verified", color: "#10b981", icon: "V" },
            { key: "escalated", label: "Escalated", color: "#a855f7", icon: "E" },
            { key: "dismissed", label: "Dismissed", color: "#6b7280", icon: "D" },
          ];

          const board: Record<string, Incident[]> = {
            detected: [], investigating: [], fix_applied: [], verified: [], escalated: [], dismissed: [],
          };
          for (const inc of incidents) {
            if (board[inc.status]) board[inc.status].push(inc);
          }

          const moveIncident = (id: string, newStatus: string) => {
            updateIncidentStatus(id, newStatus);
          };

          return (
            <div>
              {/* Pipeline summary */}
              <div className="flex items-center gap-2 mb-4">
                {columns.map((col, i) => {
                  const count = board[col.key].length;
                  const critCount = board[col.key].filter(inc => inc.severity === "critical").length;
                  return (
                    <div key={col.key} className="flex items-center gap-2 flex-1">
                      <div className="flex items-center gap-1.5 flex-1">
                        <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: col.color + "33", color: col.color }}>
                          {count}
                        </div>
                        <span className="text-[10px] font-medium text-[#8b949e]">{col.label}</span>
                        {critCount > 0 && <span className="text-[9px] text-red-400 font-bold animate-pulse">{critCount} crit</span>}
                      </div>
                      {i < columns.length - 1 && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#30363d] flex-shrink-0">
                          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Kanban Columns */}
              <div className="grid grid-cols-6 gap-2">
                {columns.map(col => {
                  const colIncidents = board[col.key];
                  return (
                    <div key={col.key} className="min-h-[300px]">
                      {/* Column Header */}
                      <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                          <span className="text-[10px] font-bold text-[#e2e8f0]">{col.label}</span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 bg-[#30363d] text-[#8b949e] rounded-full">{colIncidents.length}</span>
                      </div>

                      {/* Incident Cards */}
                      <div className="space-y-2">
                        {colIncidents.map(inc => {
                          const sev = SEVERITY_COLORS[inc.severity] || SEVERITY_COLORS.medium;
                          return (
                            <div key={inc.id} className={`bg-[#161b22] border rounded-lg p-3 ${
                              inc.severity === "critical" ? "border-red-500/40 shadow-sm shadow-red-500/10" :
                              inc.severity === "high" ? "border-orange-500/30" :
                              "border-[#30363d]"
                            }`}>
                              {/* Severity + Category */}
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sev.dot} ${inc.status === "detected" && inc.severity === "critical" ? "animate-pulse" : ""}`} />
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${sev.bg} ${sev.text} font-medium uppercase`}>{inc.severity}</span>
                              </div>

                              {/* Title */}
                              <div className="text-[11px] font-semibold text-[#e2e8f0] mb-1 line-clamp-2">{inc.title}</div>

                              {/* Category */}
                              <div className="text-[9px] text-[#484f58] mb-2">{CATEGORY_LABELS[inc.category] || inc.category}</div>

                              {/* Agent badge */}
                              {inc.agent_name && (
                                <div className="flex items-center gap-1 mb-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                  <span className="text-[9px] font-medium text-indigo-400">{inc.agent_name}</span>
                                </div>
                              )}

                              {/* Channel */}
                              {inc.channel_name && (
                                <div className="flex items-center gap-1 mb-2">
                                  <span className="w-4 h-4 rounded bg-[#21262d] flex items-center justify-center text-[8px] text-[#8b949e]">
                                    {CHANNEL_ICONS[inc.source_channel_id?.replace("wch-", "") || ""] || "?"}
                                  </span>
                                  <span className="text-[9px] text-[#484f58]">{inc.channel_name}</span>
                                </div>
                              )}

                              {/* Root cause preview */}
                              {inc.root_cause && (
                                <div className="text-[8px] text-[#8b949e] mb-2 line-clamp-2 bg-[#0d1117] rounded p-1.5">
                                  {inc.root_cause}
                                </div>
                              )}

                              {/* Verification badge */}
                              {inc.verification && inc.status === "verified" && (
                                <div className="flex items-center gap-1 mb-2">
                                  <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  <span className="text-[8px] text-emerald-400">Verified fixed</span>
                                </div>
                              )}

                              {/* Auto-fixed badge */}
                              {inc.auto_fixed === 1 && (
                                <div className="flex items-center gap-1 mb-2">
                                  <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                  <span className="text-[8px] text-emerald-400">Auto-fixed</span>
                                </div>
                              )}

                              {/* Time */}
                              <div className="text-[8px] text-[#484f58] mb-2">
                                {timeAgo(inc.detected_at)}
                                {inc.resolved_at && <span className="ml-2 text-emerald-400/60">Resolved {timeAgo(inc.resolved_at)}</span>}
                              </div>

                              {/* Action buttons based on column */}
                              <div className="flex gap-1 flex-wrap">
                                {inc.status === "detected" && (
                                  <>
                                    <button onClick={() => moveIncident(inc.id, "investigating")} disabled={updatingId === inc.id} className="flex-1 py-1 text-[8px] font-medium bg-amber-600/20 text-amber-400 rounded hover:bg-amber-600/30 border border-amber-600/30 disabled:opacity-50">
                                      Investigate
                                    </button>
                                    <button onClick={() => moveIncident(inc.id, "dismissed")} disabled={updatingId === inc.id} className="py-1 px-2 text-[8px] font-medium border border-[#30363d] text-[#8b949e] rounded hover:bg-[#21262d] disabled:opacity-50">
                                      X
                                    </button>
                                  </>
                                )}
                                {inc.status === "investigating" && (
                                  <>
                                    <button onClick={() => moveIncident(inc.id, "fix_applied")} disabled={updatingId === inc.id} className="flex-1 py-1 text-[8px] font-medium bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30 border border-blue-600/30 disabled:opacity-50">
                                      Fix Applied
                                    </button>
                                    <button onClick={() => moveIncident(inc.id, "escalated")} disabled={updatingId === inc.id} className="py-1 px-2 text-[8px] font-medium bg-purple-600/20 text-purple-400 rounded hover:bg-purple-600/30 border border-purple-600/30 disabled:opacity-50">
                                      Escalate
                                    </button>
                                  </>
                                )}
                                {inc.status === "fix_applied" && (
                                  <button onClick={() => moveIncident(inc.id, "verified")} disabled={updatingId === inc.id} className="flex-1 py-1 text-[8px] font-medium bg-emerald-600/20 text-emerald-400 rounded hover:bg-emerald-600/30 border border-emerald-600/30 disabled:opacity-50">
                                    Verify
                                  </button>
                                )}
                                {inc.status === "escalated" && (
                                  <>
                                    <button onClick={() => moveIncident(inc.id, "investigating")} disabled={updatingId === inc.id} className="flex-1 py-1 text-[8px] font-medium bg-amber-600/20 text-amber-400 rounded hover:bg-amber-600/30 border border-amber-600/30 disabled:opacity-50">
                                      Re-investigate
                                    </button>
                                    <button onClick={() => moveIncident(inc.id, "verified")} disabled={updatingId === inc.id} className="py-1 px-2 text-[8px] font-medium bg-emerald-600/20 text-emerald-400 rounded hover:bg-emerald-600/30 border border-emerald-600/30 disabled:opacity-50">
                                      Resolve
                                    </button>
                                  </>
                                )}
                                {inc.status === "verified" && (
                                  <button onClick={() => moveIncident(inc.id, "dismissed")} disabled={updatingId === inc.id} className="flex-1 py-1 text-[8px] font-medium bg-gray-600/20 text-gray-400 rounded hover:bg-gray-600/30 border border-gray-600/30 disabled:opacity-50">
                                    Dismiss
                                  </button>
                                )}
                                {inc.status === "dismissed" && (
                                  <button onClick={() => moveIncident(inc.id, "detected")} disabled={updatingId === inc.id} className="flex-1 py-1 text-[8px] font-medium bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 border border-red-600/30 disabled:opacity-50">
                                    Reopen
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {colIncidents.length === 0 && (
                          <div className="bg-[#161b22]/50 border border-dashed border-[#30363d] rounded-lg p-4 text-center">
                            <span className="text-[9px] text-[#484f58]">No incidents</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Incidents Tab */}
        {tab === "incidents" && (
          <div>
            {/* Filters */}
            <div className="flex gap-3 mb-4">
              <select
                value={filterSeverity}
                onChange={e => setFilterSeverity(e.target.value)}
                className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e2e8f0]"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e2e8f0]"
              >
                <option value="all">All Statuses</option>
                <option value="detected">Detected</option>
                <option value="investigating">Investigating</option>
                <option value="fix_applied">Fix Applied</option>
                <option value="verified">Verified</option>
                <option value="escalated">Escalated</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>

            {filteredIncidents.length === 0 ? (
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center">
                <div className="text-4xl mb-3">&#128737;</div>
                <h3 className="text-lg font-semibold text-[#e2e8f0] mb-2">All Clear</h3>
                <p className="text-[#8b949e] text-sm">No incidents match your filters. Run a scan to check for new issues.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredIncidents.map(incident => {
                  const sev = SEVERITY_COLORS[incident.severity] || SEVERITY_COLORS.medium;
                  const stat = STATUS_COLORS[incident.status] || STATUS_COLORS.detected;
                  const isExpanded = expandedIncident === incident.id;

                  return (
                    <div
                      key={incident.id}
                      className={`bg-[#161b22] border rounded-xl overflow-hidden transition-all ${sev.border}`}
                    >
                      {/* Incident header */}
                      <button
                        onClick={() => setExpandedIncident(isExpanded ? null : incident.id)}
                        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[#1c2129] transition-colors"
                      >
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sev.dot} ${incident.status === 'detected' ? 'animate-pulse' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-[#e2e8f0] truncate">{incident.title}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className={`px-2 py-0.5 rounded-full ${sev.bg} ${sev.text} font-medium uppercase`}>
                              {incident.severity}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full ${stat.bg} ${stat.text} font-medium`}>
                              {incident.status.replace("_", " ")}
                            </span>
                            <span className="text-[#484f58]">
                              {CATEGORY_LABELS[incident.category] || incident.category}
                            </span>
                            {incident.channel_name && (
                              <span className="text-[#484f58] flex items-center gap-1">
                                <span className="w-4 h-4 rounded bg-[#21262d] flex items-center justify-center text-[10px] text-[#8b949e]">
                                  {CHANNEL_ICONS[incident.source_channel_id?.replace("wch-", "") || ""] || "?"}
                                </span>
                                {incident.channel_name}
                              </span>
                            )}
                            {incident.agent_name && (
                              <span className="text-[#484f58]">Agent: {incident.agent_name}</span>
                            )}
                            <span className="text-[#484f58] ml-auto flex-shrink-0">{timeAgo(incident.detected_at)}</span>
                          </div>
                        </div>
                        <svg
                          width="16" height="16" viewBox="0 0 16 16" fill="none"
                          className={`text-[#484f58] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        >
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-5 pb-5 border-t border-[#30363d]/50">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            {/* Description */}
                            <div>
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#64748b] mb-1 block">Description</label>
                              <div className="text-sm text-[#8b949e] whitespace-pre-wrap bg-[#0d1117] rounded-lg p-3 max-h-40 overflow-y-auto">
                                {incident.description || "No description"}
                              </div>
                            </div>

                            {/* Root Cause */}
                            <div>
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#64748b] mb-1 block">Root Cause</label>
                              {incident.root_cause ? (
                                <div className="text-sm text-[#8b949e] bg-[#0d1117] rounded-lg p-3">{incident.root_cause}</div>
                              ) : (
                                <textarea
                                  placeholder="Enter root cause analysis..."
                                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-sm text-[#e2e8f0] resize-none h-20"
                                  onBlur={e => {
                                    if (e.target.value) updateIncidentDetails(incident.id, { root_cause: e.target.value });
                                  }}
                                />
                              )}
                            </div>

                            {/* Action Taken */}
                            <div>
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#64748b] mb-1 block">Action Taken</label>
                              {incident.action_taken ? (
                                <div className="text-sm text-[#8b949e] bg-[#0d1117] rounded-lg p-3">{incident.action_taken}</div>
                              ) : (
                                <textarea
                                  placeholder="Describe the fix..."
                                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-sm text-[#e2e8f0] resize-none h-20"
                                  onBlur={e => {
                                    if (e.target.value) updateIncidentDetails(incident.id, { action_taken: e.target.value });
                                  }}
                                />
                              )}
                            </div>

                            {/* Verification */}
                            <div>
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#64748b] mb-1 block">Verification</label>
                              {incident.verification ? (
                                <div className="text-sm text-emerald-400 bg-[#0d1117] rounded-lg p-3">{incident.verification}</div>
                              ) : (
                                <textarea
                                  placeholder="Proof the fix worked..."
                                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-sm text-[#e2e8f0] resize-none h-20"
                                  onBlur={e => {
                                    if (e.target.value) updateIncidentDetails(incident.id, { verification: e.target.value });
                                  }}
                                />
                              )}
                            </div>
                          </div>

                          {/* Status Actions */}
                          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#30363d]/50">
                            <span className="text-xs text-[#484f58] mr-2">Update status:</span>
                            {incident.status === "detected" && (
                              <>
                                <button onClick={() => updateIncidentStatus(incident.id, "investigating")} disabled={updatingId === incident.id} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50">Investigate</button>
                                <button onClick={() => updateIncidentStatus(incident.id, "dismissed")} disabled={updatingId === incident.id} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors disabled:opacity-50">Dismiss</button>
                              </>
                            )}
                            {incident.status === "investigating" && (
                              <>
                                <button onClick={() => updateIncidentStatus(incident.id, "fix_applied")} disabled={updatingId === incident.id} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-50">Fix Applied</button>
                                <button onClick={() => updateIncidentStatus(incident.id, "escalated")} disabled={updatingId === incident.id} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50">Escalate</button>
                              </>
                            )}
                            {incident.status === "fix_applied" && (
                              <button onClick={() => updateIncidentStatus(incident.id, "verified")} disabled={updatingId === incident.id} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50">Verify Fixed</button>
                            )}
                            {incident.status === "escalated" && (
                              <>
                                <button onClick={() => updateIncidentStatus(incident.id, "investigating")} disabled={updatingId === incident.id} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50">Re-investigate</button>
                                <button onClick={() => updateIncidentStatus(incident.id, "verified")} disabled={updatingId === incident.id} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50">Mark Resolved</button>
                              </>
                            )}
                            <div className="ml-auto text-xs text-[#484f58]">
                              ID: {incident.id}
                              {incident.resolved_at && <span className="ml-3">Resolved: {timeAgo(incident.resolved_at)}</span>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Channels Tab */}
        {tab === "channels" && (
          <div className="space-y-3">
            {channels.map(ch => {
              const config = JSON.parse(ch.config || "{}");
              return (
                <div key={ch.id} className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                        ch.is_active ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-[#21262d] text-[#484f58] border border-[#30363d]"
                      }`}>
                        {CHANNEL_ICONS[ch.channel_type] || "?"}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[#e2e8f0]">{ch.name}</h3>
                        <div className="flex items-center gap-3 text-xs text-[#8b949e] mt-0.5">
                          <span className="capitalize">{ch.channel_type.replace("_", " ")}</span>
                          <span>Every {ch.check_interval_seconds}s</span>
                          {ch.last_checked_at && <span>Last check: {timeAgo(ch.last_checked_at)}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleChannel(ch.id, ch.is_active)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        ch.is_active ? "bg-emerald-600" : "bg-[#30363d]"
                      }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        ch.is_active ? "translate-x-6" : "translate-x-0.5"
                      }`} />
                    </button>
                  </div>
                  {Object.keys(config).length > 0 && (
                    <div className="mt-3 bg-[#0d1117] rounded-lg p-3 text-xs text-[#8b949e] font-mono">
                      {Object.entries(config).map(([k, v]) => (
                        <div key={k}><span className="text-[#484f58]">{k}:</span> {String(v)}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Rules Tab */}
        {tab === "rules" && (
          <div className="space-y-3">
            {rules.map(rule => {
              const sev = SEVERITY_COLORS[rule.severity] || SEVERITY_COLORS.medium;
              return (
                <div key={rule.id} className={`bg-[#161b22] border rounded-xl p-5 ${sev.border}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-[#e2e8f0]">{rule.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${sev.bg} ${sev.text}`}>{rule.severity}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase bg-[#21262d] text-[#8b949e] capitalize">{rule.rule_type.replace("_", " ")}</span>
                      </div>
                      <p className="text-xs text-[#8b949e]">{rule.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-[#484f58]">
                        <span>Triggered: {rule.trigger_count}x</span>
                        {rule.last_triggered_at && <span>Last: {timeAgo(rule.last_triggered_at)}</span>}
                        {rule.auto_fix_enabled ? (
                          <span className="text-emerald-400">Auto-fix ON</span>
                        ) : (
                          <span>Auto-fix OFF</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleRule(rule.id, rule.is_active)}
                      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                        rule.is_active ? "bg-red-600" : "bg-[#30363d]"
                      }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        rule.is_active ? "translate-x-6" : "translate-x-0.5"
                      }`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Scans Tab */}
        {tab === "scans" && (
          <div>
            {scan_logs.length === 0 ? (
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center">
                <p className="text-[#8b949e]">No scans yet. Click &quot;Run Scan&quot; to start monitoring.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {scan_logs.map(scan => (
                  <div key={scan.id} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      scan.issues_found > 0 ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"
                    }`}>
                      {scan.issues_found}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-[#e2e8f0] font-medium">
                        {scan.scan_type === "manual" ? "Manual Scan" : scan.scan_type === "scheduled" ? "Scheduled Scan" : "Triggered Scan"}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[#8b949e] mt-0.5">
                        <span>{scan.channels_scanned} channels scanned</span>
                        <span>{scan.issues_found} issues found</span>
                        {scan.issues_auto_fixed > 0 && <span className="text-emerald-400">{scan.issues_auto_fixed} auto-fixed</span>}
                        {scan.issues_escalated > 0 && <span className="text-purple-400">{scan.issues_escalated} escalated</span>}
                        <span>{scan.duration_ms}ms</span>
                      </div>
                    </div>
                    <div className="text-xs text-[#484f58]">{timeAgo(scan.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create Incident Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-[#e2e8f0] mb-4">Report Issue</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-[#8b949e] block mb-1">Title</label>
                  <input
                    type="text"
                    value={newIncident.title}
                    onChange={e => setNewIncident(p => ({ ...p, title: e.target.value }))}
                    placeholder="Brief description of the issue"
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e2e8f0]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-[#8b949e] block mb-1">Category</label>
                    <select
                      value={newIncident.category}
                      onChange={e => setNewIncident(p => ({ ...p, category: e.target.value }))}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e2e8f0]"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#8b949e] block mb-1">Severity</label>
                    <select
                      value={newIncident.severity}
                      onChange={e => setNewIncident(p => ({ ...p, severity: e.target.value }))}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e2e8f0]"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#8b949e] block mb-1">Description</label>
                  <textarea
                    value={newIncident.description}
                    onChange={e => setNewIncident(p => ({ ...p, description: e.target.value }))}
                    placeholder="Detailed description, steps to reproduce, etc."
                    rows={4}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] resize-none"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-[#30363d] text-[#8b949e] hover:text-[#e2e8f0] hover:bg-[#21262d] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createIncident}
                    disabled={!newIncident.title}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Create Incident
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
