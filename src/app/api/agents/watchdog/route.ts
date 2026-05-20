import { NextResponse } from "next/server";
import { getWatchdogStats, getWatchdogIncidents, getWatchdogChannels, getWatchdogRules, getWatchdogScanLogs, getWatchdogAutoScanEnabled, getWatchdogScanInterval } from "@/lib/db";

// GET /api/agents/watchdog — Full watchdog dashboard data
export async function GET() {
  try {
    const stats = getWatchdogStats();
    const incidents = getWatchdogIncidents({ limit: 50 });
    const channels = getWatchdogChannels();
    const rules = getWatchdogRules();
    const scanLogs = getWatchdogScanLogs(10);

    return NextResponse.json({
      stats,
      incidents,
      channels,
      rules,
      scan_logs: scanLogs,
      auto_scan: {
        enabled: getWatchdogAutoScanEnabled(),
        interval_seconds: getWatchdogScanInterval(),
      },
    });
  } catch (error) {
    console.error("GET /api/agents/watchdog error:", error);
    return NextResponse.json({ error: "Failed to fetch watchdog data" }, { status: 500 });
  }
}
