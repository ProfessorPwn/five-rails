#!/usr/bin/env -S npx tsx
// ─── Watchdog Daemon ────────────────────────────────────────────────────────
// Runs continuously server-side via PM2. Polls the watchdog scan endpoint
// on the configured interval. Reads the app port from .port file.
//
// Usage:   npx tsx scripts/watchdog-daemon.ts
// PM2:     pm2 start ecosystem.config.cjs --only five-rails-watchdog

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PROJECT_DIR = join(__dirname, "..");
const PORT_FILE = join(PROJECT_DIR, ".port");
const DB_PATH = join(PROJECT_DIR, "data", "fiverails.db");

// ── Config ──────────────────────────────────────────────────────────────────

const MIN_INTERVAL_S = 15;
const MAX_INTERVAL_S = 600;
const DEFAULT_INTERVAL_S = 60;
const STARTUP_DELAY_S = 10; // wait for Next.js to boot
const HEALTH_CHECK_INTERVAL_S = 300; // check app health every 5 min

// ── Helpers ─────────────────────────────────────────────────────────────────

function getPort(): number {
  try {
    if (existsSync(PORT_FILE)) {
      const port = parseInt(readFileSync(PORT_FILE, "utf8").trim());
      if (port > 0 && port < 65536) return port;
    }
  } catch { /* fall through */ }
  return 3000;
}

function getBaseUrl(): string {
  return `http://127.0.0.1:${getPort()}`;
}

function log(level: string, msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] [watchdog-daemon] [${level}] ${msg}`);
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000); // 2 min timeout
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, data: { error: msg } };
  }
}

// ── Scan Config (from DB via API) ───────────────────────────────────────────

async function getScanConfig(): Promise<{ enabled: boolean; intervalS: number }> {
  const { ok, data } = await fetchJson(`${getBaseUrl()}/api/agents/watchdog/scan`);
  if (ok) {
    const enabled = data.auto_scan_enabled !== false;
    const intervalS = Math.max(MIN_INTERVAL_S, Math.min(MAX_INTERVAL_S, Number(data.scan_interval_seconds) || DEFAULT_INTERVAL_S));
    return { enabled, intervalS };
  }
  return { enabled: true, intervalS: DEFAULT_INTERVAL_S };
}

// ── Run Scan ────────────────────────────────────────────────────────────────

async function runScan(): Promise<void> {
  const baseUrl = getBaseUrl();
  const { ok, data } = await fetchJson(`${baseUrl}/api/agents/watchdog/scan?type=scheduled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (ok) {
    const scanLog = data.scan_log as Record<string, unknown> | undefined;
    const found = scanLog?.issues_found ?? data.incidents ? (data.incidents as unknown[]).length : 0;
    const fixed = data.auto_fixed ? (data.auto_fixed as unknown[]).length : 0;
    const durationMs = scanLog?.duration_ms ?? "?";
    log("INFO", `Scan complete: ${found} issues found, ${fixed} auto-fixed (${durationMs}ms)`);
  } else {
    log("ERROR", `Scan failed: ${data.error || `HTTP ${data.status || "?"}`}`);
  }
}

// ── Agent Supervisor Scan ───────────────────────────────────────────────────

async function runSupervisorScan(): Promise<void> {
  const baseUrl = getBaseUrl();
  const { ok, data } = await fetchJson(`${baseUrl}/api/agents/supervisor/scan`, { method: "POST" });
  if (ok) {
    const stalled = Number(data.stalled_count || 0);
    if (stalled > 0) {
      log("WARN", `Supervisor: ${stalled} stalled handoffs detected, user notified`);
    }
  } else {
    log("WARN", `Supervisor scan failed: ${data.error || "unknown"}`);
  }
}

// ── Automation Heartbeat ────────────────────────────────────────────────────
// Replaces the client-side AutomationScheduler. Running server-side means:
//   1. Only one heartbeat fires, not one per open browser tab
//   2. It runs whether anyone has the app open or not
//   3. It respects the concurrency guard in /api/automation/process

async function runAutomationHeartbeat(): Promise<void> {
  const baseUrl = getBaseUrl();
  const { ok, data } = await fetchJson(`${baseUrl}/api/automation/process`, { method: "POST" });
  if (ok) {
    if (data.skipped) {
      // Another heartbeat in progress — normal, just note it
    } else {
      const results = data.results || {};
      const summary = Object.entries(results)
        .map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 60)}`)
        .join(", ");
      if (summary) log("INFO", `Heartbeat: ${summary.slice(0, 200)}`);
    }
  } else {
    log("WARN", `Heartbeat failed: ${data.error || "unknown"}`);
  }
}

// ── Vulnerability Scan ──────────────────────────────────────────────────────

async function runSecurityScan(): Promise<void> {
  const baseUrl = getBaseUrl();
  const { ok, data } = await fetchJson(`${baseUrl}/api/agents/watchdog/scan?type=scheduled&channel=security`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (ok) {
    const found = data.incidents ? (data.incidents as unknown[]).length : 0;
    log("INFO", `Security scan complete: ${found} vulnerabilities found`);
  } else {
    log("WARN", `Security scan skipped or failed: ${data.error || "unknown"}`);
  }
}

// ── Health Check ────────────────────────────────────────────────────────────

async function healthCheck(): Promise<boolean> {
  const { ok } = await fetchJson(`${getBaseUrl()}/api/health`);
  return ok;
}

// ── Main Loop ───────────────────────────────────────────────────────────────

async function main() {
  log("INFO", "Watchdog daemon starting...");
  log("INFO", `Project: ${PROJECT_DIR}`);
  log("INFO", `Waiting ${STARTUP_DELAY_S}s for Next.js to boot...`);

  await new Promise(r => setTimeout(r, STARTUP_DELAY_S * 1000));

  // Wait for app to be healthy
  let retries = 0;
  while (retries < 30) {
    const healthy = await healthCheck();
    if (healthy) {
      log("INFO", `App is healthy at ${getBaseUrl()}`);
      break;
    }
    retries++;
    log("WARN", `App not ready (attempt ${retries}/30), retrying in 5s...`);
    await new Promise(r => setTimeout(r, 5000));
  }

  if (retries >= 30) {
    log("ERROR", "App never became healthy. Exiting.");
    process.exit(1);
  }

  let scanCount = 0;
  let lastSecurityScan = 0;
  const SECURITY_SCAN_INTERVAL_S = 3600; // run security scan every hour

  // Main loop
  while (true) {
    try {
      const config = await getScanConfig();

      if (!config.enabled) {
        log("INFO", "Auto-scan disabled. Sleeping 30s before re-checking...");
        await new Promise(r => setTimeout(r, 30_000));
        continue;
      }

      // Run standard watchdog scan
      await runScan();
      scanCount++;

      // Run supervisor scan (agent handoff stall detection) every cycle
      await runSupervisorScan();

      // Run automation heartbeat every 5 cycles (~5 min at 60s interval).
      // Replaces the client-side AutomationScheduler — runs server-side only.
      if (scanCount % 5 === 0) {
        await runAutomationHeartbeat();
      }

      // Run security/vulnerability scan periodically (every hour)
      const now = Date.now();
      if (now - lastSecurityScan >= SECURITY_SCAN_INTERVAL_S * 1000) {
        await runSecurityScan();
        lastSecurityScan = now;
      }

      // Periodic health check
      if (scanCount % Math.ceil(HEALTH_CHECK_INTERVAL_S / config.intervalS) === 0) {
        const healthy = await healthCheck();
        if (!healthy) {
          log("WARN", "App health check failed — will retry next cycle");
        }
      }

      // Sleep until next scan
      await new Promise(r => setTimeout(r, config.intervalS * 1000));

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("ERROR", `Daemon error: ${msg}`);
      await new Promise(r => setTimeout(r, 30_000)); // back off on error
    }
  }
}

main().catch(err => {
  log("FATAL", `Unhandled error: ${err}`);
  process.exit(1);
});
