#!/bin/bash
# Daily IdeaBrowser Idea of the Day sync
# 1. Scrapes ideabrowser.com via gstack headless browser
# 2. Posts extracted text to Five Rails API for parsing, validation, and agent assignment

APP_DIR="/home/z-ro/five-rails"
LOG="$APP_DIR/logs/ideabrowser-sync.log"
mkdir -p "$APP_DIR/logs"

# Source nvm + bun
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="$HOME/.bun/bin:$PATH"
export CONTAINER=1  # Tells gstack to launch Chromium with --no-sandbox (AppArmor blocks userns)

echo "[$(date -Is)] Starting IdeaBrowser sync (gstack scraper)..." >> "$LOG"

# ── Find the Five Rails server ──
PORT=""
if [ -f "$APP_DIR/.port" ]; then
  PORT=$(cat "$APP_DIR/.port")
  HEALTH=$(curl -s "http://localhost:$PORT/api/health" --connect-timeout 3 --max-time 5 2>/dev/null)
  if ! echo "$HEALTH" | grep -q "fiverails.db"; then
    PORT=""
  fi
fi

if [ -z "$PORT" ]; then
  for p in $(seq 3000 3100); do
    HEALTH=$(curl -s "http://localhost:$p/api/health" --connect-timeout 2 --max-time 3 2>/dev/null)
    if echo "$HEALTH" | grep -q "fiverails.db"; then
      PORT=$p
      break
    fi
  done
fi

# Start server if not running
if [ -z "$PORT" ]; then
  echo "[$(date -Is)] Five Rails not running — starting via PM2..." >> "$LOG"
  cd "$APP_DIR"
  pm2 start ecosystem.config.cjs 2>&1 >> "$LOG"
  for i in $(seq 1 20); do
    sleep 3
    if [ -f "$APP_DIR/.port" ]; then
      PORT=$(cat "$APP_DIR/.port")
      HEALTH=$(curl -s "http://localhost:$PORT/api/health" --connect-timeout 2 --max-time 3 2>/dev/null)
      if echo "$HEALTH" | grep -q "fiverails.db"; then
        echo "[$(date -Is)] Server ready on port $PORT" >> "$LOG"
        break
      fi
    fi
  done
fi

if [ -z "$PORT" ]; then
  echo "[$(date -Is)] ERROR: Five Rails failed to start" >> "$LOG"
  exit 1
fi

echo "[$(date -Is)] Five Rails on port $PORT" >> "$LOG"

# ── Step 1: Scrape ideabrowser.com with gstack ──
B="$HOME/.claude/skills/gstack/browse/dist/browse"

if [ ! -x "$B" ]; then
  echo "[$(date -Is)] ERROR: gstack browse binary not found at $B" >> "$LOG"
  # Fallback: just call the API without scraped text (it will try inline)
  RESULT=$(curl -s -X POST "http://localhost:$PORT/api/automation/sync-ideabrowser" \
    --connect-timeout 10 --max-time 300 2>&1)
  echo "[$(date -Is)] Fallback result: $RESULT" >> "$LOG"
  exit 0
fi

echo "[$(date -Is)] Scraping ideabrowser.com..." >> "$LOG"
$B goto https://ideabrowser.com >> "$LOG" 2>&1
$B wait --load >> "$LOG" 2>&1 || true

PAGE_TEXT=$($B text 2>/dev/null)
TEXT_LEN=${#PAGE_TEXT}
echo "[$(date -Is)] Scraped $TEXT_LEN chars" >> "$LOG"

# Take screenshot for reference
DATE=$(date +%Y-%m-%d)
$B screenshot "/tmp/ideabrowser-daily-${DATE}.png" >> "$LOG" 2>&1 || true

if [ "$TEXT_LEN" -lt 100 ]; then
  echo "[$(date -Is)] ERROR: Scraped text too short ($TEXT_LEN chars)" >> "$LOG"
  exit 1
fi

# ── Step 2: POST scraped text to the sync API ──
# Save text to temp file to avoid shell escaping issues with JSON
echo "$PAGE_TEXT" > /tmp/ideabrowser-scraped.txt

# Build JSON payload with the page text
PAYLOAD=$(python3 -c "
import json, sys
with open('/tmp/ideabrowser-scraped.txt', 'r') as f:
    text = f.read()
print(json.dumps({'page_text': text}))
" 2>/dev/null)

if [ -z "$PAYLOAD" ]; then
  echo "[$(date -Is)] ERROR: Failed to build JSON payload" >> "$LOG"
  exit 1
fi

RESULT=$(curl -s -X POST "http://localhost:$PORT/api/automation/sync-ideabrowser" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --connect-timeout 10 --max-time 300 2>&1)

echo "[$(date -Is)] Result: $RESULT" >> "$LOG"
