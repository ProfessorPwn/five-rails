import { NextRequest, NextResponse } from "next/server";
import { runWatchdogScan, logActivity, getWatchdogAutoScanEnabled, getWatchdogScanInterval, setWatchdogAutoScanEnabled, setWatchdogScanInterval } from "@/lib/db";

// POST /api/agents/watchdog/scan — Trigger a watchdog scan (manual or scheduled)
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const scanType = (url.searchParams.get("type") || "manual") as "manual" | "scheduled" | "triggered";

    const result = await runWatchdogScan(scanType);

    logActivity({
      action: "watchdog_scan",
      details: `[${scanType}] Scanned ${result.scan_log.channels_scanned} channels: ${result.scan_log.issues_found} found, ${result.auto_fixed.length} auto-fixed in ${result.scan_log.duration_ms}ms`,
      skill_used: "watchdog",
    });

    return NextResponse.json({
      scan_log: result.scan_log,
      incidents: result.incidents,
      auto_fixed: result.auto_fixed,
      message: `Scan complete: ${result.incidents.length} issues found, ${result.auto_fixed.length} auto-fixed`,
    });
  } catch (error) {
    console.error("POST /api/agents/watchdog/scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}

// GET /api/agents/watchdog/scan — Get auto-scan config
export async function GET() {
  try {
    return NextResponse.json({
      auto_scan_enabled: getWatchdogAutoScanEnabled(),
      scan_interval_seconds: getWatchdogScanInterval(),
    });
  } catch (error) {
    console.error("GET /api/agents/watchdog/scan error:", error);
    return NextResponse.json({ error: "Failed to get scan config" }, { status: 500 });
  }
}

// PATCH /api/agents/watchdog/scan — Update auto-scan config
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.auto_scan_enabled !== undefined) {
      setWatchdogAutoScanEnabled(!!body.auto_scan_enabled);
    }
    if (body.scan_interval_seconds !== undefined) {
      const interval = Math.max(10, Math.min(600, parseInt(body.scan_interval_seconds)));
      setWatchdogScanInterval(interval);
    }

    return NextResponse.json({
      auto_scan_enabled: getWatchdogAutoScanEnabled(),
      scan_interval_seconds: getWatchdogScanInterval(),
    });
  } catch (error) {
    console.error("PATCH /api/agents/watchdog/scan error:", error);
    return NextResponse.json({ error: "Failed to update scan config" }, { status: 500 });
  }
}
