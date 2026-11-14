#!/bin/bash
# Take the standing picture set (tests/beta/lookset.py) through the restricted server, behind the machine-wide browser lock.
# Usage: PORT=<port> bash tools/look.sh <out dir> [gfx] [scene names...]     (does not build first)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"; export PORT="${PORT:-8765}"; export ROOT
if [ "$1" != "--locked" ]; then exec flock -o /tmp/hkoi_browser.lock bash "$0" --locked "$@"; fi
shift
pkill -f "http.server $PORT" 2>/dev/null || true
bash tools/serve_csp.sh "$ROOT/.cache/package" "$PORT" >/dev/null
export BASE="http://localhost:$PORT/index.html"
python3 tests/beta/lookset.py "$@" 2>&1 | grep --line-buffered -v "GPU stall"
pkill -f "http.server $PORT" 2>/dev/null || true
