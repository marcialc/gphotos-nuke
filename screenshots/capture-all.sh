#!/usr/bin/env bash
# Render each store screenshot at 1280×800 via Chrome headless.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

if [[ ! -x "$CHROME" ]]; then
  echo "Chrome not found at: $CHROME" >&2
  exit 1
fi

declare -a SHOTS=(
  "ready:photo-sweep-01-ready.png"
  "armed:photo-sweep-02-limit.png"
  "running:photo-sweep-03-running.png"
  "everything:photo-sweep-04-everything.png"
  "done:photo-sweep-05-done.png"
)

for entry in "${SHOTS[@]}"; do
  shot="${entry%%:*}"
  out="${entry##*:}"
  html=$(node "$DIR/render-page.mjs" "$shot")
  # virtual-time-budget lets the iframe load + settle styles apply before paint.
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size=1280,800 \
    --default-background-color=FFFFFFFF \
    --virtual-time-budget=3000 \
    --screenshot="$DIR/$out" \
    "file://$html"
  # Chrome sometimes writes at device-pixel ratio >1; force exact 1280×800.
  sips -z 800 1280 "$DIR/$out" >/dev/null
  echo "wrote $out"
done
