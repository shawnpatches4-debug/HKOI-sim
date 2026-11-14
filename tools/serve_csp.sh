#!/bin/bash
# Serve the local build the way the hosting page does: over http, with a rule that the page may only read its own files
# (no data: or blob: fetches). Use: tools/serve_csp.sh <three package dir> [port]; then tests take BASE=http://localhost:<port>/index.html
set -e; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; PKG="$1"; PORT="${2:-8765}"; D="$ROOT/build/beta_http"
rm -rf "$D"; mkdir -p "$D"; for f in "$ROOT"/build/beta/*; do ln -s "$f" "$D/$(basename "$f")"; done; rm "$D/index.html"; ln -s "$PKG" "$D/three"
python3 - "$ROOT/build/beta/index.html" "$D/index.html" <<'P'
import sys, re
s = open(sys.argv[1]).read()
s = re.sub(r'file://[^"]*?/package/', '/three/', s)
csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:\">"
icon = '<link rel="icon" href="data:,">'   # the hosting page has its own icon; without this line every local test logs a 404 for /favicon.ico
s = s.replace('<head>', '<head>\n' + csp + '\n' + icon, 1); open(sys.argv[2], 'w').write(s)
P
cd "$D"; (python3 -m http.server "$PORT" >/dev/null 2>&1 &) ; sleep 1; echo "serving $D on $PORT"
