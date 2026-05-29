#!/usr/bin/env bash
# Render a composite ad HTML to a PNG at its exact authored size (full page).
# Layer B is authored at full resolution (e.g. 1080x1920), so a full-page
# screenshot at that window size needs no element cropping or scaling.
#
# Usage: scripts/screenshot.sh ad.html out/ad.png [WIDTHxHEIGHT]
set -euo pipefail

HTML="${1:?usage: screenshot.sh <ad.html> <out.png> [WxH]}"
OUT="${2:?usage: screenshot.sh <ad.html> <out.png> [WxH]}"
SIZE="${3:-1080x1920}"
HTML_ABS="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"
mkdir -p "$(dirname "$OUT")"

# Find a Chrome/Chromium binary across platforms.
CHROME=""
for c in google-chrome google-chrome-stable chromium chromium-browser \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
  if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then CHROME="$c"; break; fi
done

if [ -n "$CHROME" ]; then
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size="${SIZE/x/,}" --default-background-color=00000000 \
    --screenshot="$OUT" "file://$HTML_ABS"
  echo "✓ $OUT ($SIZE) via Chrome headless"
elif command -v npx >/dev/null 2>&1; then
  # Fallback: Playwright (installs on first run)
  npx -y playwright screenshot --viewport-size="${SIZE/x/,}" \
    "file://$HTML_ABS" "$OUT"
  echo "✓ $OUT ($SIZE) via Playwright"
else
  echo "No Chrome/Chromium or npx found. Install Chrome, or use the gstack /browse skill:" >&2
  echo "  browse viewport ${SIZE/x/x} ; browse goto file://$HTML_ABS ; browse screenshot $OUT --selector .ad" >&2
  exit 1
fi
