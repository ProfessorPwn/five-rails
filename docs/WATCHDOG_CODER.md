# Watchdog Coder

Autonomous code-fix system. When agents report capability gaps that look like
code bugs, the watchdog spawns Claude CLI in an isolated git worktree with
file-edit tools. Patches that pass validation are auto-applied with a git
commit; larger patches queue for your review at [/agents/watchdog/fixes](../src/app/agents/watchdog/fixes/page.tsx).

## State today

- **Default: OFF.** The coder is disarmed unless you flip the kill switch.
- **Auto-apply threshold:** ≤ 30 lines (configurable).
- **Daily call cap:** 20 fix attempts per day (configurable).
- **Auto-disable:** flips back to OFF after 2 consecutive failures.

## Arming the coder

**Via UI** (recommended): visit [/agents/watchdog/fixes](../src/app/agents/watchdog/fixes/page.tsx),
click **Arm coder**, confirm the dialog.

**Via SQL** (emergency / scripted):
```bash
sqlite3 /home/z-ro/five-rails/data/fiverails.db \
  "UPDATE automation_settings SET value='true' WHERE key='coder_enabled';
   UPDATE automation_settings SET value='0' WHERE key='coder_consecutive_failures';"
```

## Emergency stop

If the coder is misbehaving:

```bash
# 1. Kill the switch
sqlite3 /home/z-ro/five-rails/data/fiverails.db \
  "UPDATE automation_settings SET value='false' WHERE key='coder_enabled';"

# 2. Stop any in-flight session (if a Claude SDK subprocess is hung)
pkill -f "claude-agent-sdk" || true

# 3. If the coder corrupted the live tree, find and revert the last auto-fix commit:
cd /home/z-ro/five-rails
git log --oneline --grep="\[watchdog auto-fix\]" | head -5
git revert <commit-hash>
npx pm2 restart five-rails
```

## What the coder can and cannot touch

**Allowlist** (anything inside these dirs is editable):
- `src/app/`
- `src/components/`
- `src/lib/`
- `scripts/`
- `public-form-service/src/`

**Hard blocklist** (never editable, regardless of allowlist):
- `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`
- Any `.env*` file
- `.git/`, `.next/`, `node_modules/`, `data/`
- **Self-modification block:** `src/lib/db/watchdog.ts`, `src/lib/agents/supervisor.ts`,
  `src/lib/agents/watchdog-coder.ts`, `src/lib/db/schema.ts`,
  `scripts/watchdog-daemon.ts`. Changes to these queue for your manual review.
- **Sensitive surfaces:** any path matching `auth`, `payment`, `stripe`, `secret`
  (case-insensitive).

The blocklist is enforced **on the diff, not on the prompt** — even if the
LLM ignores instructions and edits a forbidden file, the validation step
rejects the patch before apply.

## Pipeline

When a code-level capability gap is created, [`reportCapabilityGap`](../src/lib/agents/supervisor.ts) fires off `attemptCodeFix(gapId)`:

1. **Pre-flight** — coder armed? under daily cap? not in failure cooldown?
2. **Worktree** — `git worktree add --detach /tmp/coder-<id> HEAD`. Symlinks
   `node_modules` and `.next` so typecheck and tooling work.
3. **Claude CLI session** — `query()` with `cwd=worktree`,
   `allowedTools=[Read, Edit, Write, Bash, Glob, Grep]`, `maxTurns=30`,
   timeout 5 min. The agent reads files, drafts a patch, runs
   `npx tsc --noEmit` to self-validate.
4. **Diff inspection** — `git diff HEAD` in the worktree.
5. **Path-policy gate** — every touched file must pass `isPathAllowed`.
   Violations → reject + audit row, no apply.
6. **Worktree typecheck** — `npx tsc --noEmit` in the worktree (paranoid,
   in case the agent forgot to run it).
7. **Decision** — diff size ≤ threshold → auto-apply; else → queue at
   `/agents/watchdog/fixes` for your review.
8. **Apply** — `git apply` on live tree, re-typecheck, commit with
   `[watchdog auto-fix #<gap-id>]` prefix, `pm2 restart`, smoke-check
   `/api/health` for 60s. Anything fails → `git revert HEAD` + `pm2 restart`.
9. **Audit** — every step recorded in `watchdog_code_fixes`. Gap marked
   `resolved` only on confirmed apply.

## Inspecting fixes

**UI:** [/agents/watchdog/fixes](../src/app/agents/watchdog/fixes/page.tsx)

**Git log:**
```bash
git log --oneline --grep="\[watchdog auto-fix\]"
```

**SQL:**
```bash
sqlite3 /home/z-ro/five-rails/data/fiverails.db \
  "SELECT id, status, mode, title, diff_lines, git_commit, created_at
   FROM watchdog_code_fixes ORDER BY created_at DESC LIMIT 20;"
```

## Reverting an applied fix

**Via UI:** open the fix, click **Revert**. Runs `git revert <commit>` and
restarts pm2 with smoke check.

**Via shell:**
```bash
git revert <commit-hash>
npx pm2 restart five-rails
```

## Tuning

| Setting | Default | Range |
|---|---|---|
| `coder_enabled` | `false` | `true` / `false` |
| `coder_auto_apply_threshold` | 30 | 1–500 lines |
| `coder_daily_call_cap` | 20 | any int |

Update via the UI inputs at the top of `/agents/watchdog/fixes` or via SQL:
```sql
UPDATE automation_settings SET value='50' WHERE key='coder_auto_apply_threshold';
```

## Failure modes (designed for)

| Scenario | Behavior |
|---|---|
| Coder produces a patch that doesn't typecheck | Worktree validation fails → reject, audit row, bump consecutive-failure counter |
| Coder edits a blocklisted file | Path-policy gate rejects, audit row, bump failure counter |
| Patch applies fine but live typecheck regresses | `git checkout HEAD -- <files>` rollback, audit row, bump failure counter |
| Patch applies, app fails to start | `git revert HEAD` + pm2 restart, audit row, bump failure counter |
| 2 consecutive failures | `coder_enabled` flips to `false` automatically; user paged via activity log |
| Daily cap reached | New attempts return `rejected` with reason; resets at midnight |
| Coder session hangs | 5-minute timeout aborts the SDK call |

## What it cannot do (by design)

- Edit `package.json` or run `npm install` (use the existing `npm-install` allow-list strategy)
- Modify auth, payment, or watchdog/supervisor/daemon code
- Apply patches > 30 lines without your review
- Try the same gap twice (one apply attempt per gap)
- Run during a failure cooldown (must be manually re-armed after 2 fails)

These limits are intentional. They're the difference between "watchdog as
coder" and "agent with root."
