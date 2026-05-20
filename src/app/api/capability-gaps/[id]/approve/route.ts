import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

type RouteContext = { params: Promise<{ id: string }> };

// Allow-list: only these command patterns can be auto-run.
// Everything else requires manual execution by the user.
function isSafeCommand(cmd: string): boolean {
  const trimmed = cmd.trim();
  // npm install <package>[@version] — no flags that could exfiltrate or execute arbitrary scripts
  if (/^npm install [@a-zA-Z0-9][-a-zA-Z0-9_./@]*(\s+[@a-zA-Z0-9][-a-zA-Z0-9_./@]*)*$/.test(trimmed)) return true;
  // npm install --save-dev <package>
  if (/^npm install --save-dev [@a-zA-Z0-9][-a-zA-Z0-9_./@]*(\s+[@a-zA-Z0-9][-a-zA-Z0-9_./@]*)*$/.test(trimmed)) return true;
  return false;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const gap = getDb().prepare("SELECT * FROM capability_gaps WHERE id = ?").get(id) as {
      id: string; install_command: string | null; missing_capability: string; agent_id: string; status: string;
    } | undefined;

    if (!gap) return NextResponse.json({ error: "Gap not found" }, { status: 404 });
    if (gap.status !== "pending") return NextResponse.json({ error: `Gap already ${gap.status}` }, { status: 400 });

    if (!gap.install_command) {
      // No auto-installable command — just mark as approved for manual handling
      getDb().prepare("UPDATE capability_gaps SET status = 'approved', resolved_at = datetime('now') WHERE id = ?").run(id);
      logActivity({ action: "capability_gap_approved_manual", details: `Approved manually: ${gap.missing_capability}` });
      return NextResponse.json({ approved: true, auto_installed: false, note: "No install command — manual action required" });
    }

    if (!isSafeCommand(gap.install_command)) {
      return NextResponse.json({
        error: "Install command not on allow-list",
        command: gap.install_command,
        note: "Only `npm install <package>` and `npm install --save-dev <package>` can be auto-run. Install manually and then reject or resolve this gap.",
      }, { status: 403 });
    }

    // Run the install
    try {
      const { stdout, stderr } = await execAsync(gap.install_command, {
        cwd: process.cwd(),
        timeout: 180_000,
        env: { ...process.env, PATH: `${process.env.HOME}/.nvm/versions/node/v22.22.0/bin:${process.env.PATH || ""}` },
      });
      getDb().prepare("UPDATE capability_gaps SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?").run(id);
      logActivity({
        action: "capability_gap_resolved",
        details: `Installed ${gap.missing_capability} via: ${gap.install_command}`,
      });
      return NextResponse.json({
        approved: true,
        auto_installed: true,
        command: gap.install_command,
        stdout: stdout.slice(-1000),
        stderr: stderr.slice(-500),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      return NextResponse.json({ error: "Install failed", details: msg.slice(0, 500) }, { status: 500 });
    }
  } catch (error) {
    console.error("POST /api/capability-gaps/[id]/approve error:", error);
    return NextResponse.json({ error: "Approve failed" }, { status: 500 });
  }
}
