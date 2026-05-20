#!/bin/bash
# Scrape ideabrowser.com using gstack headless browser
# Outputs JSON with the Idea of the Day extracted
# Called by: daily-ideabrowser-sync.sh

export PATH="$HOME/.bun/bin:$PATH"
B="$HOME/.claude/skills/gstack/browse/dist/browse"

if [ ! -x "$B" ]; then
  echo '{"error":"gstack browse binary not found"}' >&2
  exit 1
fi

# IMPORTANT: $B goto / wait / screenshot all write status messages
# ("Navigated to ...", "Page loaded", "Screenshot saved: ...") to STDOUT, not
# stderr. The Node consumer JSON.parse()s this script's stdout, so any leaked
# status line breaks the sync. Suppress both streams on every non-output call;
# only the final `echo` should reach stdout.

# Navigate and extract
$B goto https://ideabrowser.com >/dev/null 2>&1
$B wait --load >/dev/null 2>&1 || true

# Get page text — this one IS the data extraction, so we only silence stderr
TEXT=$($B text 2>/dev/null)

if [ -z "$TEXT" ]; then
  echo '{"error":"empty page text"}'
  exit 1
fi

# Save to temp file for the Node parser
echo "$TEXT" > /tmp/ideabrowser-scraped.txt

# Take screenshot for reference (best-effort, fully silenced)
DATE=$(date +%Y-%m-%d)
$B screenshot "/tmp/ideabrowser-daily-${DATE}.png" >/dev/null 2>&1 || true

echo '{"success":true,"text_file":"/tmp/ideabrowser-scraped.txt","date":"'"$DATE"'"}'
