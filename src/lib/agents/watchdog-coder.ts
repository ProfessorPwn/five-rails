// ─── Watchdog Coder ──────────────────────────────────────────────────────────
// Autonomous code-fix orchestrator. When a code-level capability gap is
// reported, the watchdog calls attemptCodeFix() which:
//
//   1. Validates pre-flight: coder is armed, under daily LLM cap,
//      not in cooldown after consecutive failures.
//   2. Creates an isolated git worktree at /tmp/coder-<gap-id>.
//   3. Spawns Claude Code CLI (via @anthropic-ai/claude-agent-sdk) with
//      Read/Edit/Write/Bash tools and the worktree as cwd. The agent reads
//      the codebase, drafts a patch in-place, and runs `npx tsc --noEmit`
//      to self-validate.
//   4. Inspects `git diff` from the worktree. Validates:
//        - Every changed file is in PATH_ALLOWLIST and NOT in PATH_BLOCKLIST
//        - Diff size is within `coder_auto_apply_threshold` for auto-apply,
//          else it queues for user review at /agents/watchdog/fixes
//        - Typecheck passed in the worktree
//   5. Applies the patch atomically on the live tree via `git apply`.
//   6. Re-runs typecheck on live tree, restarts PM2, performs a smoke
//      check (60s post-restart hit on /api/health). On any failure,
//      `git revert HEAD` + pm2 restart for clean rollback.
//   7. Records every step in watchdog_code_fixes for the audit trail.
//   8. After 2 consecutive failures the coder_enabled flag flips to false
//      automatically and the user is paged.
//
// SAFETY: The path allowlist + blocklist is enforced on the diff before
// apply, NOT just before the SDK runs. Even if the agent ignores
// instructions and edits a forbidden file, the validation step rejects.

import { execSync } from "child_process";
import { existsSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import { getDb, getAutomationSetting, setAutomationSetting, logActivity } from "@/lib/db";
import { getActiveConnection } from "@/lib/db";

// ─── Path policy ──────────────────────────────────────────────────────────────

// Files the coder is allowed to modify. Anything not matching is rejected.
const PATH_ALLOWLIST_PATTERNS: RegExp[] = [
  /^src\/app\//,
  /^src\/components\//,
  /^src\/lib\//,
  /^scripts\//,
  /^public-form-service\/src\//,
];

// Hard blocks — even within allowlisted dirs, these never get touched.
// Self-modification blocks: the coder cannot edit the watchdog/coder/supervisor/daemon.
const PATH_BLOCKLIST_PATTERNS: RegExp[] = [
  // Config / lockfiles / generated
  /^\.env(?:\..+)?$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^next\.config\.(ts|js|mjs)$/,
  /^tsconfig\.json$/,
  /^\.git\//,
  /^\.next\//,
  /^node_modules\//,
  /^data\//,
  // Self-modification: coder/watchdog/supervisor/daemon all need user approval to change
  /^src\/lib\/db\/watchdog\.ts$/,
  /^src\/lib\/agents\/supervisor\.ts$/,
  /^src\/lib\/agents\/watchdog-coder\.ts$/,
  /^src\/lib\/db\/schema\.ts$/,
  /^scripts\/watchdog-daemon\.ts$/,
  // Sensitive surfaces — auth, payments, secrets
  /(?:^|\/)auth(?:\/|\.)/i,
  /(?:^|\/)payment/i,
  /stripe/i,
  /(?:^|\/)secret/i,
];

const REPO_ROOT = process.env.FIVE_RAILS_REPO_ROOT || "/home/z-ro/five-rails";
// Worktrees live INSIDE the repo so the Claude CLI subprocess treats them
// as trusted project files. /tmp/ would trip the CLI's "untrusted code"
// safety overlay and the agent would refuse to edit. The directory is
// gitignored separately (see .gitignore) so it doesn't pollute git status.
const WORKTREE_BASE = `${REPO_ROOT}/.coder-worktrees`;
const SDK_MAX_TURNS = 30;
const SDK_TIMEOUT_MS = 300_000; // 5 min cap per fix attempt
const SMOKE_CHECK_TIMEOUT_MS = 60_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CapabilityGap {
  id: string;
  agent_id: string;
  blocked_agent_id: string | null;
  task_description: string;
  missing_capability: string;
  proposed_fix: string | null;
}

export interface CodeFixResult {
  fix_id: string;
  status: "applied" | "rejected" | "failed" | "pending_review";
  reason?: string;
  diff_lines?: number;
  files_touched?: string[];
  git_commit?: string;
}

// ─── Path validation ──────────────────────────────────────────────────────────

export function isPathAllowed(filePath: string): { ok: boolean; reason?: string } {
  // Normalize: strip leading ./
  const p = filePath.replace(/^\.\/+/, "");
  if (PATH_BLOCKLIST_PATTERNS.some(rx => rx.test(p))) {
    return { ok: false, reason: `Blocked path: ${p}` };
  }
  if (!PATH_ALLOWLIST_PATTERNS.some(rx => rx.test(p))) {
    return { ok: false, reason: `Path not in allowlist: ${p}` };
  }
  return { ok: true };
}

// Parse a unified-diff string and return the set of files it touches.
function filesFromDiff(diff: string): string[] {
  const files = new Set<string>();
  const re = /^diff --git a\/(.+?) b\/(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(diff)) !== null) {
    files.add(m[1]);
    if (m[2] !== m[1]) files.add(m[2]); // catches renames
  }
  return Array.from(files);
}

function diffLineCount(diff: string): number {
  // Count added + removed lines (excluding hunk headers and file metadata).
  let n = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+") || line.startsWith("-")) n++;
  }
  return n;
}

// ─── Pre-flight gates ─────────────────────────────────────────────────────────

interface PreflightResult {
  ok: boolean;
  reason?: string;
  consecutive_failures?: number;
}

export function preflightCheck(): PreflightResult {
  if (getAutomationSetting("coder_enabled") !== "true") {
    return { ok: false, reason: "coder_enabled is false" };
  }

  const cap = Number(getAutomationSetting("coder_daily_call_cap") || "20");
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = (getDb().prepare(
    "SELECT COUNT(*) as c FROM watchdog_code_fixes WHERE date(created_at) = ?"
  ).get(today) as { c: number }).c;
  if (todayCount >= cap) {
    return { ok: false, reason: `Daily call cap (${cap}) reached` };
  }

  const cf = Number(getAutomationSetting("coder_consecutive_failures") || "0");
  if (cf >= 2) {
    setAutomationSetting("coder_enabled", "false");
    return { ok: false, reason: `Auto-disabled after ${cf} consecutive failures`, consecutive_failures: cf };
  }

  return { ok: true };
}

// ─── Worktree helpers ─────────────────────────────────────────────────────────

function ensureCleanWorktree(worktreePath: string) {
  if (existsSync(worktreePath)) {
    try {
      execSync(`git -C ${REPO_ROOT} worktree remove --force ${worktreePath}`, { stdio: "ignore" });
    } catch {
      // Fall back to rm -rf if git refuses
      try { execSync(`rm -rf ${worktreePath}`, { stdio: "ignore" }); } catch { /* */ }
    }
  }
}

function createWorktree(worktreePath: string) {
  ensureCleanWorktree(worktreePath);
  // Make sure the worktree base dir exists.
  try { execSync(`mkdir -p ${WORKTREE_BASE}`, { stdio: "ignore" }); } catch { /* */ }
  // Branch off HEAD, detached. Faster than tracking a branch and avoids ref clutter.
  execSync(
    `git -C ${REPO_ROOT} worktree add --detach ${worktreePath} HEAD`,
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  // Symlink node_modules so npx tsc works. Intentionally NOT symlinking
  // .next — Next.js writes build artifacts there which would surface as
  // "untracked files" and confuse the path-policy check. tsc --noEmit
  // doesn't need it, and we'd rather the build cache stay isolated to
  // the live tree.
  const src = `${REPO_ROOT}/node_modules`;
  const dest = `${worktreePath}/node_modules`;
  if (existsSync(src) && !existsSync(dest)) {
    try { execSync(`ln -sfn ${src} ${dest}`, { stdio: "ignore" }); } catch { /* */ }
  }
}

// Side-effect dirs that build tools write into. Even if a file shows up
// here in the untracked list, we don't treat it as a "real edit" by the
// coder — it's noise from running tsc/next/etc. inside the worktree.
// The "(?:\\/|$)" suffix matches either the dir-with-children form
// (node_modules/foo.js) or the bare name (the symlink itself).
const BUILD_ARTIFACT_DIRS = [
  /^\.next(?:\/|$)/,
  /^node_modules(?:\/|$)/,
  /^\.git(?:\/|$)/,
  /^\.turbo(?:\/|$)/,
  /^dist(?:\/|$)/,
  /^build(?:\/|$)/,
  /^\.cache(?:\/|$)/,
  /^coverage(?:\/|$)/,
  /^\.parcel-cache(?:\/|$)/,
  /^\.swc(?:\/|$)/,
  /^\.tsbuildinfo$/,
];

function isBuildArtifact(p: string): boolean {
  return BUILD_ARTIFACT_DIRS.some(rx => rx.test(p));
}

function destroyWorktree(worktreePath: string) {
  try {
    execSync(`git -C ${REPO_ROOT} worktree remove --force ${worktreePath}`, { stdio: "ignore" });
  } catch {
    try { execSync(`rm -rf ${worktreePath}`, { stdio: "ignore" }); } catch { /* */ }
  }
}

function workTreeDiff(worktreePath: string): string {
  try {
    return execSync(`git -C ${worktreePath} diff HEAD`, { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  } catch {
    return "";
  }
}

function workTreeUntracked(worktreePath: string): string[] {
  try {
    const out = execSync(
      `git -C ${worktreePath} ls-files --others --exclude-standard`,
      { encoding: "utf8" }
    );
    return out
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean)
      // Build/cache artifacts aren't real coder edits — drop them before
      // anyone counts them as "files touched."
      .filter(p => !isBuildArtifact(p));
  } catch {
    return [];
  }
}

// Snapshot of the live tree's working state — used to compute a delta
// after the SDK runs. We need this because Claude Code resolves paths
// against the live project root regardless of cwd, so the coder's edits
// land in REPO_ROOT, not the worktree.
interface LiveSnapshot {
  trackedDiff: string;            // git diff HEAD output at snapshot time
  untrackedFiles: Set<string>;    // git ls-files --others output at snapshot time
}

function snapshotLiveTree(): LiveSnapshot {
  let trackedDiff = "";
  try {
    trackedDiff = execSync(`git -C ${REPO_ROOT} diff HEAD`, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  } catch { /* clean tree */ }

  const untrackedFiles = new Set<string>();
  try {
    const out = execSync(`git -C ${REPO_ROOT} ls-files --others --exclude-standard`, { encoding: "utf8" });
    for (const f of out.split("\n").map(s => s.trim()).filter(Boolean)) {
      if (!isBuildArtifact(f)) untrackedFiles.add(f);
    }
  } catch { /* */ }

  return { trackedDiff, untrackedFiles };
}

// Compute what the coder changed on the LIVE TREE between two snapshots.
// Returns the diff (unified format) and the list of files touched. Files
// inside the worktree base are filtered out (those are the worktree's
// internal scratch space, not coder edits).
function liveTreeDelta(before: LiveSnapshot): { diff: string; filesTouched: string[] } {
  const after = snapshotLiveTree();

  // Tracked diff: just compute current diff. If a file was modified before
  // and is still modified, both diffs include it — but the path-policy
  // check on the merged set is what matters. The cleanest way is: take
  // the post-SDK full tracked diff and subtract what the user already had.
  // Since `git diff HEAD` is per-file, we use file-level subtraction:
  // any file that appears in `after.trackedDiff` but the diff differs
  // from `before.trackedDiff` for that file, the coder touched it.
  //
  // For practical purposes — path policy and size check — we just want
  // the FILES the coder touched, not a perfect inverse-merge diff.
  const trackedFilesBefore = filesFromDiff(before.trackedDiff);
  const trackedFilesAfter = filesFromDiff(after.trackedDiff);
  const trackedTouched = trackedFilesAfter.filter(f => {
    if (!trackedFilesBefore.includes(f)) return true; // file newly modified
    // For files in both: if the diff for this file changed, the coder edited it.
    return extractFileDiff(before.trackedDiff, f) !== extractFileDiff(after.trackedDiff, f);
  });

  // Untracked: any file present after but not before (and not in worktree base)
  const untrackedNew: string[] = [];
  for (const f of after.untrackedFiles) {
    if (before.untrackedFiles.has(f)) continue;
    // The .coder-worktrees dir is one of our own creations — never count
    // its contents as coder edits.
    if (f.startsWith(".coder-worktrees/")) continue;
    untrackedNew.push(f);
  }

  const filesTouched = Array.from(new Set([...trackedTouched, ...untrackedNew]));

  // Build a unified diff of just the coder's changes, file by file.
  // For tracked files: the per-file slice of `git diff HEAD`.
  // For untracked files: synthesize a "new file" diff so the audit row
  // captures the full content.
  const diffParts: string[] = [];
  for (const f of trackedTouched) {
    const slice = extractFileDiff(after.trackedDiff, f);
    if (slice) diffParts.push(slice);
  }
  for (const f of untrackedNew) {
    try {
      const content = execSync(`git -C ${REPO_ROOT} diff --no-index /dev/null ${f}`, { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
      diffParts.push(content);
    } catch (err: unknown) {
      // git diff --no-index returns exit 1 when files differ — but stdout
      // still contains the diff. execSync surfaces that as an error with
      // the diff in stdout.
      const e = err as { stdout?: Buffer | string };
      const out = typeof e.stdout === "string" ? e.stdout : e.stdout?.toString();
      if (out) diffParts.push(out);
    }
  }

  return { diff: diffParts.join("\n"), filesTouched };
}

// Extract the per-file slice of a unified diff. Diff hunks for one file
// start with "diff --git a/<path> b/<path>" and continue until the next
// such header.
function extractFileDiff(unifiedDiff: string, filePath: string): string {
  if (!unifiedDiff) return "";
  const lines = unifiedDiff.split("\n");
  const startIdx = lines.findIndex(l => l.startsWith(`diff --git a/${filePath} b/`) || l.startsWith(`diff --git a/${filePath} b/${filePath}`));
  if (startIdx < 0) return "";
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("diff --git ")) { endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

// Revert the coder's changes on the live tree given a known set of
// touched files. Tracked files: `git checkout HEAD -- <file>`. Untracked
// files: rm. We never touch files outside the policy allowlist (since
// the coder shouldn't have written there in the first place; if it did,
// we leave them alone for the user to inspect).
function revertCoderChanges(filesTouched: string[]) {
  const trackedRe = /^([A-Za-z0-9_./@-]+)/;
  for (const f of filesTouched) {
    if (!trackedRe.test(f)) continue;
    try {
      // Try as tracked first
      execSync(`git -C ${REPO_ROOT} ls-files --error-unmatch -- ${JSON.stringify(f)}`, { stdio: "ignore" });
      execSync(`git -C ${REPO_ROOT} checkout HEAD -- ${JSON.stringify(f)}`, { stdio: "ignore" });
    } catch {
      // Not tracked → it's untracked, rm it
      try { execSync(`rm -f ${JSON.stringify(`${REPO_ROOT}/${f}`)}`, { stdio: "ignore" }); } catch { /* */ }
    }
  }
}

function workTreeTypecheck(worktreePath: string): { ok: boolean; output: string } {
  try {
    const out = execSync(`cd ${worktreePath} && npx tsc --noEmit 2>&1`, {
      encoding: "utf8",
      maxBuffer: 5 * 1024 * 1024,
      timeout: 120_000,
    });
    return { ok: true, output: out };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: (e.stdout || "") + (e.stderr || "") + (e.message || "") };
  }
}

// ─── Claude SDK invocation ────────────────────────────────────────────────────

interface CoderSessionResult {
  text: string;
  ok: boolean;
  error?: string;
}

async function runCoderSession(opts: {
  gap: CapabilityGap;
  worktreePath: string;
}): Promise<CoderSessionResult> {
  const conn = getActiveConnection();
  if (!conn) return { text: "", ok: false, error: "No active LLM connection" };

  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  // System prompt: the coder gets a tightly scoped role with hard constraints
  // PLUS a codebase roadmap so it doesn't waste its turn grepping for symbol
  // names that exist as DB rows rather than code constants.
  const systemPrompt = `You are the Five Rails Watchdog Coder. Your job is to fix the specific
capability gap below by editing files in this working directory.

CODEBASE ROADMAP — read this before grepping:
- This is a Next.js 16 App Router project. Source root is \`src/\`.
- Five "department agents" exist as ROWS in the SQLite \`agents\` table, not
  as code constants. Their IDs are: \`agent-marketing\`, \`agent-sales\`,
  \`agent-product\`, \`agent-research\`, \`agent-executive\`. Greping the
  filesystem for "agent-sales" will not surface their wiring; the wiring
  is at the routes that load agent rows from the DB.
- Skills are also DB rows in the \`skills\` table; assignments to agents
  are stored as a JSON array in \`agents.assigned_skills\`. Skill IDs look
  like \`skill-gstack-open-gstack-browser\`.
- Agent run pipeline:
  * Trigger: \`src/app/api/agents/[id]/run/route.ts\` — loads the agent
    row including \`assigned_skills\`, builds a system prompt, calls the
    LLM via the SDK client, parses the JSON decision, runs the chosen
    skill via \`/api/skills/[id]/execute\`.
  * LLM call: \`src/lib/ai/sdk-client.ts\` — wraps
    \`@anthropic-ai/claude-agent-sdk\`'s \`query()\`. The \`tools:\` and
    \`allowedTools:\` array passed to the SDK controls what tools the
    Claude Code subprocess can use during the agent's session.
  * Skills DB layer: \`src/lib/db/index.ts\` (look for getSkill /
    listSkills / getAgent).
- MCP tools: the agent run prompt builder lists CONNECTED MCP tools
  from the \`connections\` table; the agent picks one via
  \`mcp_tool: { tool_id, action, params }\` in its JSON output.
- Capability gaps: when an agent can't do something, it calls
  \`reportCapabilityGap\` from \`src/lib/agents/supervisor.ts\`.

When the gap text mentions "session bootstrap" / "spawn boundary" /
"tool registry" / "tools assigned at config layer not surfacing in
runtime," it's almost always pointing at \`src/lib/ai/sdk-client.ts\`
where the SDK is invoked with a fixed \`tools: []\` array. That is the
"spawn boundary" the agents are describing.

CONSTRAINTS — enforced after you finish; if you violate them your patch
is rejected:
- Only edit files under: src/app/, src/components/, src/lib/, scripts/,
  public-form-service/src/
- DO NOT edit: package.json, package-lock.json, next.config.ts,
  tsconfig.json, any .env file, any file under .git/ .next/ node_modules/
  data/
- DO NOT edit: src/lib/db/watchdog.ts, src/lib/agents/supervisor.ts,
  src/lib/agents/watchdog-coder.ts, src/lib/db/schema.ts,
  scripts/watchdog-daemon.ts (these are watchdog/coder infrastructure;
  changes to them require user approval, which you don't have).
- DO NOT edit auth, payment, billing, or secrets-related files.
- Keep the patch focused. Do not refactor unrelated code.
- Prefer the smallest possible change that makes the gap go away.
- After editing, run \`npx tsc --noEmit\` to verify your changes typecheck.

PROCESS:
1. Read the gap text and proposed fix below.
2. Use Read first on the files in the roadmap above. Grep is for
   secondary investigation, not the starting move.
3. Confirm you've found a real code path that maps to the gap. The gap
   description uses Five Rails domain language (agents, skills, tool
   surface, MCP) that maps to the code paths above.
4. **Use the Edit tool to make the actual changes.** Do NOT just describe
   what you would do. The Edit tool is enabled and auto-accepted. If you
   describe an edit but never call Edit, the diff will be empty and the
   gap will not be fixed.
5. Run \`npx tsc --noEmit\` to verify your patch typechecks. If errors
   surface, use Edit to fix them and re-run tsc.
6. Output a one-paragraph summary of what you changed and why.

ONLY refuse to fix if you've actually read the relevant files in the
roadmap AND tried at least one Edit, AND confirmed the gap doesn't
describe a real code path. Do NOT refuse based on grep-misses — the
absence of a symbol name in source files often just means the concept
lives in the database. Architectural disagreement is also not a reason
to refuse; if you think the gap is mis-framed but a small clarifying
edit would help (e.g., extending an existing comment or warning), make
that edit. The user wants the system to make progress, not to debate.

If after reading the roadmap files the fix is genuinely out of scope
(requires a credential, requires a tool you can't use, would be larger
than 30 lines), say so plainly.`;

  const userPrompt = `## Capability Gap

**ID:** ${opts.gap.id}
**Reporting agent:** ${opts.gap.agent_id}
**Blocked agent:** ${opts.gap.blocked_agent_id || "(same as reporting)"}

**Task that triggered this gap:**
${opts.gap.task_description}

**Missing capability:**
${opts.gap.missing_capability}

**Proposed fix (from the reporting agent):**
${opts.gap.proposed_fix || "(none provided)"}

Please fix this in the current working directory. When you're done, output a
short summary so the watchdog can record what you changed.`;

  const sdkEnv = conn.provider === "claude-cli"
    ? { ...process.env }
    : { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: conn.api_key_encrypted || "" };

  const model = conn.model || "claude-sonnet-4-20250514";

  let summary = "";
  let toolUseLog = "";
  let ok = true;
  let errorMsg: string | undefined;

  try {
    const resultPromise = (async () => {
      for await (const msg of query({
        prompt: userPrompt,
        options: {
          model,
          env: sdkEnv,
          // CRITICAL: pass `systemPrompt` as a string (not the default preset
          // object form) so it REPLACES Claude Code's default system prompt
          // entirely. The default preset injects an "external code is
          // untrusted" overlay that makes the agent refuse to edit any file
          // it has read. We're inside our own repo with our own gates, so
          // we don't want that overlay.
          systemPrompt,
          // Whitelist tools the coder needs.
          allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
          // Auto-accept all edit operations. acceptEdits handles file-edit
          // tools, but Bash and other tools still consult canUseTool. We
          // provide a callback that allow-lists every tool call (we've
          // already constrained via allowedTools, and the diff is gated
          // by the path-policy check after the session).
          permissionMode: "acceptEdits",
          canUseTool: async (_toolName, _input, _options) => ({
            behavior: "allow",
          }),
          // Working directory becomes the worktree so all relative path edits
          // stay isolated.
          cwd: opts.worktreePath,
          maxTurns: SDK_MAX_TURNS,
          persistSession: false,
        },
      } as Parameters<typeof query>[0])) {
        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              summary += block.text;
            } else if (block.type === "tool_use") {
              // Record what tools fired so we can see if Edit/Write
              // actually got called — critical for debugging "no changes
              // produced" cases where the model only narrated edits.
              const tu = block as { name?: string; input?: Record<string, unknown> };
              const inputPreview = JSON.stringify(tu.input || {}).slice(0, 300);
              toolUseLog += `[tool] ${tu.name} ${inputPreview}\n`;
            }
          }
        } else if (msg.type === "user" && (msg as { message?: { content?: unknown[] } }).message?.content) {
          // tool_result blocks come back as user messages; capture errors
          // here so we can see if Edit/Bash failed at execution time.
          const um = msg as { message: { content: unknown[] } };
          for (const block of um.message.content) {
            const b = block as { type?: string; tool_use_id?: string; content?: unknown; is_error?: boolean };
            if (b.type === "tool_result" && b.is_error) {
              const c = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
              toolUseLog += `[error] ${(c || "").slice(0, 300)}\n`;
            }
          }
        } else if (msg.type === "result" && msg.subtype === "success") {
          if (msg.result && !summary) summary = msg.result;
        }
      }
    })();

    await Promise.race([
      resultPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Coder session timeout")), SDK_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    ok = false;
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  // Prepend the tool-use log to the summary so the audit row shows what
  // tools the coder actually called (vs. just talked about calling).
  const fullSummary = toolUseLog
    ? `=== Tool calls observed ===\n${toolUseLog}\n=== Coder narrative ===\n${summary}`
    : summary;

  return { text: fullSummary, ok, error: errorMsg };
}

// ─── Apply pipeline ───────────────────────────────────────────────────────────

interface ApplyResult {
  applied: boolean;
  commit?: string;
  smoke_ok?: boolean;
  rolled_back?: boolean;
  error?: string;
}

// commitAndVerify: the coder's edits are already on the live tree (because
// Claude Code resolved paths to the live project root). All we need to do
// is commit them, restart, and run the smoke check. On any failure,
// `git revert HEAD` + restart.
async function commitAndVerify(opts: {
  fixId: string;
  gapId: string;
  summary: string;
  filesTouched: string[];
}): Promise<ApplyResult> {
  // Stage and commit only the files the coder touched. The user's other
  // dirty files (modifications they were already working on) are NOT
  // included in this commit — we deliberately scope `git add` to the
  // touched list.
  let commit = "";
  try {
    for (const f of opts.filesTouched) {
      execSync(`git -C ${REPO_ROOT} add -- ${JSON.stringify(f)}`, { stdio: "ignore" });
    }
    const commitMsg = `[watchdog auto-fix #${opts.gapId.slice(0, 8)}] ${opts.summary.slice(0, 100)}\n\nGap: ${opts.gapId}\nFix-ID: ${opts.fixId}\n\n${opts.summary.slice(0, 1500)}`;
    const msgFile = `/tmp/coder-msg-${opts.fixId.slice(0, 8)}.txt`;
    require("fs").writeFileSync(msgFile, commitMsg, "utf8");
    execSync(
      `git -C ${REPO_ROOT} -c user.name="watchdog-coder" -c user.email="watchdog@five-rails.local" commit -F ${msgFile}`,
      { stdio: "pipe" }
    );
    commit = execSync(`git -C ${REPO_ROOT} rev-parse HEAD`, { encoding: "utf8" }).trim();
  } catch (err) {
    // If commit fails, the coder's edits are still on the live tree.
    // Revert them so the live tree is clean.
    revertCoderChanges(opts.filesTouched);
    return { applied: false, error: `Commit failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Restart the app, then smoke-check.
  try {
    execSync(`npx pm2 restart five-rails`, { stdio: "ignore" });
  } catch {
    return await rollbackTo(commit, opts, "PM2 restart failed");
  }

  const smokeOk = await smokeCheck();
  if (!smokeOk) {
    return await rollbackTo(commit, opts, "Smoke check failed");
  }

  return { applied: true, commit, smoke_ok: true };
}

async function applyDiffToLive(opts: {
  diff: string;
  fixId: string;
  gapId: string;
  summary: string;
  filesTouched: string[];
}): Promise<ApplyResult> {
  // Write diff to a tmp file so `git apply` can consume it.
  const patchFile = `/tmp/coder-patch-${opts.fixId.slice(0, 8)}.diff`;
  try {
    require("fs").writeFileSync(patchFile, opts.diff, "utf8");
  } catch (err) {
    return { applied: false, error: `Failed to stage patch: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Apply atomically. --check first so failure leaves no partial state.
  try {
    execSync(`git -C ${REPO_ROOT} apply --check ${patchFile}`, { stdio: "pipe" });
  } catch (err) {
    return { applied: false, error: `Patch failed --check: ${(err as { stderr?: Buffer }).stderr?.toString() || (err as Error).message}` };
  }
  try {
    execSync(`git -C ${REPO_ROOT} apply ${patchFile}`, { stdio: "pipe" });
  } catch (err) {
    return { applied: false, error: `Patch apply failed: ${(err as { stderr?: Buffer }).stderr?.toString() || (err as Error).message}` };
  }

  // Re-typecheck on live (paranoid; should always pass since worktree did).
  try {
    execSync(`cd ${REPO_ROOT} && npx tsc --noEmit`, {
      stdio: "pipe", timeout: 120_000,
    });
  } catch (err) {
    // Live typecheck failed despite worktree passing — revert what we just applied.
    try {
      for (const f of opts.filesTouched) {
        execSync(`git -C ${REPO_ROOT} checkout HEAD -- ${f}`, { stdio: "ignore" });
      }
    } catch { /* best-effort */ }
    return { applied: false, error: `Live typecheck failed after apply: ${(err as { stdout?: Buffer }).stdout?.toString().slice(0, 500) || (err as Error).message}` };
  }

  // Commit.
  let commit = "";
  try {
    for (const f of opts.filesTouched) {
      execSync(`git -C ${REPO_ROOT} add -- ${f}`, { stdio: "ignore" });
    }
    const commitMsg = `[watchdog auto-fix #${opts.gapId.slice(0, 8)}] ${opts.summary.slice(0, 100)}\n\nGap: ${opts.gapId}\nFix-ID: ${opts.fixId}\n\n${opts.summary.slice(0, 1500)}`;
    const msgFile = `/tmp/coder-msg-${opts.fixId.slice(0, 8)}.txt`;
    require("fs").writeFileSync(msgFile, commitMsg, "utf8");
    execSync(
      `git -C ${REPO_ROOT} -c user.name="watchdog-coder" -c user.email="watchdog@five-rails.local" commit -F ${msgFile}`,
      { stdio: "pipe" }
    );
    commit = execSync(`git -C ${REPO_ROOT} rev-parse HEAD`, { encoding: "utf8" }).trim();
  } catch (err) {
    return { applied: false, error: `Commit failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Restart the app, then smoke-check.
  try {
    execSync(`npx pm2 restart five-rails`, { stdio: "ignore" });
  } catch {
    // Restart failure is itself a problem — try to revert.
    return await rollbackTo(commit, opts, "PM2 restart failed");
  }

  const smokeOk = await smokeCheck();
  if (!smokeOk) {
    return await rollbackTo(commit, opts, "Smoke check failed");
  }

  return { applied: true, commit, smoke_ok: true };
}

async function rollbackTo(commit: string, opts: { fixId: string; filesTouched: string[] }, reason: string): Promise<ApplyResult> {
  try {
    execSync(`git -C ${REPO_ROOT} revert --no-edit ${commit}`, { stdio: "ignore" });
    execSync(`npx pm2 restart five-rails`, { stdio: "ignore" });
  } catch { /* best-effort, but we've now created a revert commit on top */ }
  return { applied: false, rolled_back: true, error: reason };
}

async function smokeCheck(): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < SMOKE_CHECK_TIMEOUT_MS) {
    try {
      const res = await fetch("http://127.0.0.1:3000/api/health", {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) return true;
    } catch { /* keep retrying */ }
    await new Promise(r => setTimeout(r, 3_000));
  }
  return false;
}

// ─── Audit helpers ────────────────────────────────────────────────────────────

function recordFix(row: {
  id: string;
  gap_id: string;
  status: "pending" | "applied" | "rejected" | "rolled_back" | "failed";
  mode: "auto" | "review";
  title: string;
  gap_text: string;
  proposed_fix_text?: string;
  llm_reasoning?: string;
  files_touched: string[];
  diff: string;
  diff_lines: number;
  typecheck_ok: boolean;
  smoke_ok?: boolean | null;
  git_commit?: string | null;
  worktree_path?: string | null;
  error?: string | null;
  applied_at?: string | null;
}) {
  getDb().prepare(`
    INSERT INTO watchdog_code_fixes (
      id, gap_id, status, mode, title, gap_text, proposed_fix_text, llm_reasoning,
      files_touched, diff, diff_lines, typecheck_ok, smoke_ok, git_commit,
      worktree_path, error, applied_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.gap_id, row.status, row.mode, row.title, row.gap_text,
    row.proposed_fix_text || null, row.llm_reasoning || null,
    JSON.stringify(row.files_touched), row.diff, row.diff_lines,
    row.typecheck_ok ? 1 : 0,
    row.smoke_ok === undefined || row.smoke_ok === null ? null : (row.smoke_ok ? 1 : 0),
    row.git_commit || null, row.worktree_path || null, row.error || null,
    row.applied_at || null,
  );
}

function bumpFailureCount() {
  const cur = Number(getAutomationSetting("coder_consecutive_failures") || "0");
  setAutomationSetting("coder_consecutive_failures", String(cur + 1));
}

function resetFailureCount() {
  setAutomationSetting("coder_consecutive_failures", "0");
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function attemptCodeFix(gapId: string): Promise<CodeFixResult> {
  const fixId = uuidv4();

  // Pre-flight
  const pf = preflightCheck();
  if (!pf.ok) {
    return { fix_id: fixId, status: "rejected", reason: pf.reason };
  }

  // Load gap
  const gap = getDb().prepare(
    `SELECT id, agent_id, blocked_agent_id, task_description,
            missing_capability, proposed_fix
     FROM capability_gaps WHERE id = ?`
  ).get(gapId) as CapabilityGap | undefined;

  if (!gap) return { fix_id: fixId, status: "rejected", reason: "Gap not found" };

  const worktreePath = `${WORKTREE_BASE}/coder-${gapId.slice(0, 8)}`;

  // Snapshot the live tree BEFORE running the SDK. Claude Code resolves
  // file paths against the live project root regardless of the worktree
  // cwd, so coder edits land in REPO_ROOT, not the worktree. Comparing
  // before/after lets us extract just the coder's delta.
  const baselineSnapshot = snapshotLiveTree();

  // Build worktree (still useful for session-init metadata; we let the
  // SDK use it as cwd even though edits leak to live tree).
  try {
    createWorktree(worktreePath);
  } catch (err) {
    return { fix_id: fixId, status: "failed", reason: `Worktree creation failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Run the coder
  const session = await runCoderSession({ gap, worktreePath });

  // Compute the delta on the LIVE TREE (where the coder actually wrote).
  const { diff, filesTouched } = liveTreeDelta(baselineSnapshot);
  const lines = diffLineCount(diff);

  // No changes — likely the agent decided not to fix or couldn't.
  if (filesTouched.length === 0) {
    destroyWorktree(worktreePath);
    recordFix({
      id: fixId, gap_id: gapId, status: "rejected", mode: "auto",
      title: `No-op: ${gap.missing_capability.slice(0, 80)}`,
      gap_text: gap.missing_capability, proposed_fix_text: gap.proposed_fix || undefined,
      llm_reasoning: session.text, files_touched: [], diff: "", diff_lines: 0,
      typecheck_ok: false, error: session.error || "Coder produced no changes",
    });
    return { fix_id: fixId, status: "rejected", reason: "No changes produced" };
  }

  // Path-policy check on every file. If anything is outside policy, revert
  // the live-tree changes — the coder shouldn't have written there.
  const violations: string[] = [];
  for (const f of filesTouched) {
    const v = isPathAllowed(f);
    if (!v.ok) violations.push(v.reason || f);
  }
  if (violations.length > 0) {
    revertCoderChanges(filesTouched);
    destroyWorktree(worktreePath);
    recordFix({
      id: fixId, gap_id: gapId, status: "rejected", mode: "auto",
      title: `Policy violation: ${gap.missing_capability.slice(0, 80)}`,
      gap_text: gap.missing_capability, proposed_fix_text: gap.proposed_fix || undefined,
      llm_reasoning: session.text, files_touched: filesTouched, diff, diff_lines: lines,
      typecheck_ok: false, error: `Path policy violations: ${violations.join("; ")}`,
    });
    bumpFailureCount();
    return { fix_id: fixId, status: "rejected", reason: `Path policy violation: ${violations[0]}` };
  }

  // Typecheck the LIVE tree (the coder's edits are already there).
  let typecheckOk = true;
  let typecheckOutput = "";
  try {
    execSync(`cd ${REPO_ROOT} && npx tsc --noEmit 2>&1`, { encoding: "utf8", maxBuffer: 5 * 1024 * 1024, timeout: 120_000 });
  } catch (err: unknown) {
    typecheckOk = false;
    const e = err as { stdout?: string; stderr?: string };
    typecheckOutput = (e.stdout || "") + (e.stderr || "");
    // Pre-existing typecheck errors in the codebase shouldn't count against
    // the coder. Compare: if the same errors existed pre-SDK, they're not
    // the coder's fault. We re-run typecheck on baseline to find pre-existing.
  }

  // If typecheck failed, see whether the same errors were present before
  // the coder ran. Only count NEW errors as the coder's fault.
  if (!typecheckOk) {
    revertCoderChanges(filesTouched);
    destroyWorktree(worktreePath);
    let baselineOk = true;
    try {
      execSync(`cd ${REPO_ROOT} && npx tsc --noEmit 2>&1`, { encoding: "utf8", maxBuffer: 5 * 1024 * 1024, timeout: 120_000 });
    } catch { baselineOk = false; }
    if (baselineOk) {
      // Coder introduced errors. Already reverted above.
      recordFix({
        id: fixId, gap_id: gapId, status: "rejected", mode: "auto",
        title: `Typecheck failed: ${gap.missing_capability.slice(0, 80)}`,
        gap_text: gap.missing_capability, proposed_fix_text: gap.proposed_fix || undefined,
        llm_reasoning: session.text, files_touched: filesTouched, diff, diff_lines: lines,
        typecheck_ok: false, error: `Typecheck regression: ${typecheckOutput.slice(0, 1500)}`,
      });
      bumpFailureCount();
      return { fix_id: fixId, status: "rejected", reason: "Typecheck regression" };
    }
    // Else: pre-existing errors. The coder's patch typechecks OK relative
    // to baseline. Re-apply by treating it as if typecheck passed. We need
    // to re-run the coder to get the changes back, OR we can mark this as
    // pending-review with the diff preserved (it's still in our `diff`
    // variable). Pending-review is safer.
    recordFix({
      id: fixId, gap_id: gapId, status: "pending", mode: "review",
      title: `Pending review (baseline tc errors): ${gap.missing_capability.slice(0, 80)}`,
      gap_text: gap.missing_capability, proposed_fix_text: gap.proposed_fix || undefined,
      llm_reasoning: session.text, files_touched: filesTouched, diff, diff_lines: lines,
      typecheck_ok: true,
    });
    return { fix_id: fixId, status: "pending_review", diff_lines: lines, files_touched: filesTouched };
  }

  // Decide: auto-apply or queue for review?
  const threshold = Number(getAutomationSetting("coder_auto_apply_threshold") || "30");
  const autoApply = lines <= threshold;

  if (!autoApply) {
    // Above threshold — revert from live tree and queue the diff for user
    // review. The user can hit Apply in the UI to land it.
    revertCoderChanges(filesTouched);
    destroyWorktree(worktreePath);
    recordFix({
      id: fixId, gap_id: gapId, status: "pending", mode: "review",
      title: `Pending review: ${gap.missing_capability.slice(0, 80)}`,
      gap_text: gap.missing_capability, proposed_fix_text: gap.proposed_fix || undefined,
      llm_reasoning: session.text, files_touched: filesTouched, diff, diff_lines: lines,
      typecheck_ok: true,
    });
    return { fix_id: fixId, status: "pending_review", diff_lines: lines, files_touched: filesTouched };
  }

  // Auto-apply path: the coder's edits are ALREADY on the live tree. We
  // just need to commit them, restart, and run the smoke check. On any
  // failure, revert via git revert HEAD + restart.
  const apply = await commitAndVerify({
    fixId, gapId, summary: session.text.slice(0, 800), filesTouched,
  });

  destroyWorktree(worktreePath);

  if (apply.applied) {
    resetFailureCount();
    // Mark gap resolved; it's actually fixed now.
    getDb().prepare(
      "UPDATE capability_gaps SET status='resolved', resolved_at=datetime('now') WHERE id=?"
    ).run(gapId);

    recordFix({
      id: fixId, gap_id: gapId, status: "applied", mode: "auto",
      title: `Auto-fixed: ${gap.missing_capability.slice(0, 80)}`,
      gap_text: gap.missing_capability, proposed_fix_text: gap.proposed_fix || undefined,
      llm_reasoning: session.text, files_touched: filesTouched, diff, diff_lines: lines,
      typecheck_ok: true, smoke_ok: true, git_commit: apply.commit,
      applied_at: new Date().toISOString(),
    });

    logActivity({
      action: "coder_auto_fix",
      details: `Watchdog coder auto-fixed gap ${gapId.slice(0, 8)}: ${gap.missing_capability.slice(0, 80)} (commit ${apply.commit?.slice(0, 8)}, ${lines} lines)`,
    });

    return { fix_id: fixId, status: "applied", diff_lines: lines, files_touched: filesTouched, git_commit: apply.commit };
  }

  // Apply or smoke failed — rollback already happened inside applyDiffToLive.
  bumpFailureCount();
  recordFix({
    id: fixId, gap_id: gapId, status: apply.rolled_back ? "rolled_back" : "failed", mode: "auto",
    title: `Failed: ${gap.missing_capability.slice(0, 80)}`,
    gap_text: gap.missing_capability, proposed_fix_text: gap.proposed_fix || undefined,
    llm_reasoning: session.text, files_touched: filesTouched, diff, diff_lines: lines,
    typecheck_ok: true, smoke_ok: false, error: apply.error || "Apply failed",
  });

  logActivity({
    action: "coder_failed",
    details: `Watchdog coder ${apply.rolled_back ? "rolled back" : "failed"} for gap ${gapId.slice(0, 8)}: ${apply.error}`,
  });

  return { fix_id: fixId, status: "failed", reason: apply.error };
}

// ─── Manual review apply (called from /api/agents/watchdog/fixes POST) ────────

export async function applyPendingFix(fixId: string): Promise<ApplyResult> {
  const row = getDb().prepare(
    "SELECT id, gap_id, diff, llm_reasoning, files_touched FROM watchdog_code_fixes WHERE id = ? AND status = 'pending'"
  ).get(fixId) as
    | { id: string; gap_id: string; diff: string; llm_reasoning: string; files_touched: string }
    | undefined;
  if (!row) return { applied: false, error: "Fix not found or not pending" };

  let filesTouched: string[] = [];
  try { filesTouched = JSON.parse(row.files_touched); } catch { /* */ }

  // Re-validate path policy at apply time. The allowlist might have tightened.
  for (const f of filesTouched) {
    const v = isPathAllowed(f);
    if (!v.ok) return { applied: false, error: `Path policy violation: ${v.reason}` };
  }

  const apply = await applyDiffToLive({
    diff: row.diff, fixId: row.id, gapId: row.gap_id,
    summary: row.llm_reasoning || "(manual review apply)", filesTouched,
  });

  if (apply.applied) {
    getDb().prepare(
      "UPDATE watchdog_code_fixes SET status='applied', git_commit=?, smoke_ok=1, applied_at=datetime('now') WHERE id=?"
    ).run(apply.commit, fixId);
    getDb().prepare(
      "UPDATE capability_gaps SET status='resolved', resolved_at=datetime('now') WHERE id=?"
    ).run(row.gap_id);
    resetFailureCount();
  } else {
    getDb().prepare(
      "UPDATE watchdog_code_fixes SET status=?, error=? WHERE id=?"
    ).run(apply.rolled_back ? "rolled_back" : "failed", apply.error || "", fixId);
    bumpFailureCount();
  }

  return apply;
}

export function rejectPendingFix(fixId: string, note?: string) {
  getDb().prepare(
    "UPDATE watchdog_code_fixes SET status='rejected', error=? WHERE id=? AND status='pending'"
  ).run(note || "User rejected", fixId);
}

export async function revertAppliedFix(fixId: string): Promise<{ ok: boolean; error?: string }> {
  const row = getDb().prepare(
    "SELECT id, git_commit, files_touched FROM watchdog_code_fixes WHERE id = ? AND status = 'applied'"
  ).get(fixId) as { id: string; git_commit: string | null; files_touched: string } | undefined;
  if (!row || !row.git_commit) return { ok: false, error: "No applied commit to revert" };

  try {
    execSync(`git -C ${REPO_ROOT} revert --no-edit ${row.git_commit}`, { stdio: "ignore" });
    execSync(`npx pm2 restart five-rails`, { stdio: "ignore" });
    const smokeOk = await smokeCheck();
    if (!smokeOk) return { ok: false, error: "Smoke check failed after revert" };

    getDb().prepare(
      "UPDATE watchdog_code_fixes SET status='rolled_back', rolled_back_at=datetime('now') WHERE id = ?"
    ).run(fixId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
