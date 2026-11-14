#!/bin/bash
# Run one browser test file against the current local build, behind the machine-wide browser lock, on a port of its own.
# Usage:  PORT=8799 bash tools/run_test.sh tests/beta/pages.py [args...]      (build first with `bash tools/dev.sh build`)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"; PORT="${PORT:-8799}"; T="$1"; shift
exec flock /tmp/hkoi_browser.lock bash -c 'P="$1"; R="$2"; T="$3"; shift 3; cd "$R"; pkill -f "http[.]server $P" 2>/dev/null; bash tools/serve_csp.sh "$R/.cache/package" "$P" >/dev/null; BASE="http://localhost:$P/index.html" timeout 1800 python3 "$T" "$@"; rc=$?; pkill -f "http[.]server $P" 2>/dev/null; exit $rc' _ "$PORT" "$ROOT" "$T" "$@"
