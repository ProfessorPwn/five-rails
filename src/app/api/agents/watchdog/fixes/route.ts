import { NextRequest, NextResponse } from "next/server";
import { getDb, getAutomationSetting, setAutomationSetting } from "@/lib/db";
import { applyPendingFix, rejectPendingFix, revertAppliedFix, attemptCodeFix } from "@/lib/agents/watchdog-coder";

interface FixRow {
  id: string;
  gap_id: string | null;
  status: "pending" | "applied" | "rejected" | "rolled_back" | "failed";
  mode: "auto" | "review";
  title: string;
  gap_text: string | null;
  proposed_fix_text: string | null;
  llm_reasoning: string | null;
  files_touched: string;
  diff: string;
  diff_lines: number;
  typecheck_ok: number;
  smoke_ok: number | null;
  git_commit: string | null;
  error: string | null;
  created_at: string;
  applied_at: string | null;
  rolled_back_at: string | null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status"); // pending | applied | failed | all
  const limit = Math.min(200, Number(url.searchParams.get("limit") || 50));

  let rows: FixRow[];
  if (status && status !== "all") {
    rows = getDb().prepare(
      `SELECT * FROM watchdog_code_fixes WHERE status = ? ORDER BY created_at DESC LIMIT ?`
    ).all(status, limit) as FixRow[];
  } else {
    rows = getDb().prepare(
      `SELECT * FROM watchdog_code_fixes ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as FixRow[];
  }

  const fixes = rows.map(r => ({
    id: r.id,
    gap_id: r.gap_id,
    status: r.status,
    mode: r.mode,
    title: r.title,
    gap_text: r.gap_text,
    proposed_fix_text: r.proposed_fix_text,
    llm_reasoning: r.llm_reasoning,
    files_touched: safeParseArray(r.files_touched),
    diff: r.diff,
    diff_lines: r.diff_lines,
    typecheck_ok: !!r.typecheck_ok,
    smoke_ok: r.smoke_ok === null ? null : !!r.smoke_ok,
    git_commit: r.git_commit,
    error: r.error,
    created_at: r.created_at,
    applied_at: r.applied_at,
    rolled_back_at: r.rolled_back_at,
  }));

  // Header data: coder enabled flag + recent stats
  const enabled = getAutomationSetting("coder_enabled") === "true";
  const threshold = Number(getAutomationSetting("coder_auto_apply_threshold") || "30");
  const dailyCap = Number(getAutomationSetting("coder_daily_call_cap") || "20");
  const consecutiveFailures = Number(getAutomationSetting("coder_consecutive_failures") || "0");

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = (getDb().prepare(
    "SELECT COUNT(*) as c FROM watchdog_code_fixes WHERE date(created_at) = ?"
  ).get(today) as { c: number }).c;

  const counts = (getDb().prepare(
    `SELECT
      sum(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
      sum(CASE WHEN status='applied' THEN 1 ELSE 0 END) as applied,
      sum(CASE WHEN status='rolled_back' THEN 1 ELSE 0 END) as rolled_back,
      sum(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
      sum(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected
     FROM watchdog_code_fixes`
  ).get() as { pending: number; applied: number; rolled_back: number; failed: number; rejected: number });

  return NextResponse.json({
    fixes,
    settings: { enabled, threshold, daily_cap: dailyCap, today_count: todayCount, consecutive_failures: consecutiveFailures },
    counts,
  });
}

export async function POST(request: NextRequest) {
  let body: { action?: string; fix_id?: string; gap_id?: string; enabled?: boolean; threshold?: number; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  switch (body.action) {
    case "apply": {
      if (!body.fix_id) return NextResponse.json({ error: "fix_id required" }, { status: 400 });
      const r = await applyPendingFix(body.fix_id);
      return NextResponse.json(r);
    }
    case "reject": {
      if (!body.fix_id) return NextResponse.json({ error: "fix_id required" }, { status: 400 });
      rejectPendingFix(body.fix_id, body.note);
      return NextResponse.json({ ok: true });
    }
    case "revert": {
      if (!body.fix_id) return NextResponse.json({ error: "fix_id required" }, { status: 400 });
      const r = await revertAppliedFix(body.fix_id);
      return NextResponse.json(r);
    }
    case "trigger": {
      if (!body.gap_id) return NextResponse.json({ error: "gap_id required" }, { status: 400 });
      const r = await attemptCodeFix(body.gap_id);
      return NextResponse.json(r);
    }
    case "set_enabled": {
      if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled (bool) required" }, { status: 400 });
      setAutomationSetting("coder_enabled", body.enabled ? "true" : "false");
      // When manually re-enabling, clear the consecutive-failure counter so
      // the next attempt isn't pre-blocked.
      if (body.enabled) setAutomationSetting("coder_consecutive_failures", "0");
      return NextResponse.json({ ok: true, enabled: body.enabled });
    }
    case "set_threshold": {
      if (typeof body.threshold !== "number" || body.threshold < 1 || body.threshold > 500) {
        return NextResponse.json({ error: "threshold must be a number 1..500" }, { status: 400 });
      }
      setAutomationSetting("coder_auto_apply_threshold", String(body.threshold));
      return NextResponse.json({ ok: true, threshold: body.threshold });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

function safeParseArray(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}
