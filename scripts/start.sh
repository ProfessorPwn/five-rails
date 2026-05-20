#!/usr/bin/env bash
# Auto-detect an open port starting from 3000
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

PORT=3000
while lsof -ti:$PORT >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ $PORT -gt 3100 ]; then
    echo "ERROR: No open port found between 3000-3100"
    exit 1
  fi
done

echo "Starting Five Rails on port $PORT"
echo "$PORT" > "$PROJECT_DIR/.port"

# Clear stale Turbopack dev locks if no process is holding them. These persist
# after a dev-server crash and block restart with "Unable to acquire lock".
for LOCK in "$PROJECT_DIR/.next/lock" "$PROJECT_DIR/.next/dev/lock"; do
  if [ -f "$LOCK" ] && ! lsof "$LOCK" >/dev/null 2>&1; then
    echo "Removing stale lock: $LOCK"
    rm -f "$LOCK"
  fi
done

exec npx next dev --turbopack -p $PORT
