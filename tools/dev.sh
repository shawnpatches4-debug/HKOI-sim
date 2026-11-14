#!/bin/bash
# Everyday commands, from the repository root:
#   bash tools/dev.sh build     local build in build/beta (uses ./assets and .cache/package)
#   bash tools/dev.sh check     build, then run the browser checks under the hosting page's restrictions (server + tests in one go)
#   bash tools/dev.sh pub       publishable build in build/beta_pub (3D library from the jsDelivr CDN) with ./assets copied in
#   bash tools/dev.sh sound [out folder]   the sound checks: crew lines against whole battles (node), then the real page (tests/beta/sound.py)
#   bash tools/dev.sh shot <out.png> "<hash params>"   one screenshot through the restricted server (PRE/VIEWS/W/H/SETTLE env as in tests/beta/shot.py)
set -e; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"; PKG="$ROOT/.cache/package"; PORT="${PORT:-8765}"; OUT="${OUT:-/tmp}"
build() { HK_ASSETS="$ROOT/assets" python3 tools/build_beta.py local "$PKG" | tail -1; }
serve() { pkill -f "http.server $PORT" 2>/dev/null || true; bash tools/serve_csp.sh "$PKG" "$PORT" >/dev/null; export BASE="http://localhost:$PORT/index.html"; }
case "$1" in
  build) build ;;
  check) build; node tests/battle/battle.test.js | tail -1; serve
         W=320 H=180 LOOPS=9  timeout 1200 python3 tests/beta/click.py "$OUT/click2.png" "speed=2&gfx=min&spectator=1" 2>&1 | grep -v "GPU stall\|404" | tail -3
         W=320 H=180 LOOPS=14 timeout 1200 python3 tests/beta/click.py "$OUT/click4.png" "speed=4&gfx=low" 2>&1 | grep -v "GPU stall\|404" | tail -3
         timeout 900 python3 tests/beta/drag.py "gfx=min" 2>&1 | grep -v 404 | tail -2 ;;
  pub)   python3 tools/build_beta.py cdn | tail -1; mkdir -p build/beta_pub/assets; cp -r assets/. build/beta_pub/assets/; echo "publishable build: build/beta_pub (open index.html through any static web server)" ;;
  sound) build; node tests/audio/crewtalk.test.mjs | tail -1; serve; timeout 1500 python3 tests/beta/sound.py "${2:-$OUT}" 2>&1 | grep -v "GPU stall" | tail -60 ;;
  shot)  serve; python3 tests/beta/shot.py "$2" "$3" 2>&1 | grep -v 404 | tail -2 ;;
  *) sed -n 2,8p "$0" ;;
esac
