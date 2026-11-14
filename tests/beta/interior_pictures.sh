#!/bin/bash
# The whole interior picture set and the real-frame-loop checks, in one go, behind the machine-wide browser lock.
# Use, from the repository root:   PORT=8774 OUT=<folder> bash tests/beta/interior_pictures.sh [jobs...]
#   jobs (default: day night loop looprt): day = every picture at 1280x720 high in daylight (seats in five directions, every cupola port,
#   hatch positions, every periscope, driver, cutaways, consoles close up, live states); night = the seat/port/periscope set at night;
#   loop = every inside view through the real frame loop for 30 simulated seconds at minimum graphics; looprt = the same, shorter, at
#   medium graphics (so the small outside views are drawn); hits / hitsnight = the crew at rest, a penetrating hit from every seat at the moment, 2 s and 20 s after, a stopped hit, wounded, downed and panicked crewmen; cuts = the cutaway from every side.
# LOOK at every picture afterwards: nothing here judges them.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"; PORT="${PORT:-8774}"; OUT="${OUT:-/tmp/interior_pictures}"; mkdir -p "$OUT"
if [ "$1" != "--locked" ]; then HK_ASSETS="$ROOT/assets" python3 tools/build_beta.py local "$ROOT/.cache/package" | tail -1; exec bash tools/browser.sh bash "$0" --locked "$@"; fi
shift; [ $# -eq 0 ] && set -- day night loop looprt
pkill -f "http.server $PORT" 2>/dev/null; bash tools/serve_csp.sh "$ROOT/.cache/package" "$PORT" >/dev/null; export BASE="http://localhost:$PORT/index.html"
for j in "$@"; do echo "== $j"; case "$j" in
  day)    W=1280 H=720 timeout 3600 python3 tests/beta/interior_shots.py "$OUT" day "gfx=high&speed=1&force=heavy" everything ;;
  night)  W=1280 H=720 timeout 2400 python3 tests/beta/interior_shots.py "$OUT" night "gfx=high&speed=1&cond=night" full ;;
  loop)   timeout 1500 python3 tests/beta/interior_loop.py "$OUT/loop.png" "gfx=min&speed=4&force=heavy" ;;
  looprt) SIM_S=12 timeout 900 python3 tests/beta/interior_loop.py "$OUT/looprt.png" "gfx=medium&speed=4&force=heavy" ;;
  hits)   W=1280 H=720 timeout 3000 python3 tests/beta/interior_shots.py "$OUT" day "gfx=high&speed=1&force=heavy" hits ;;
  hitsnight) W=1280 H=720 timeout 1500 python3 tests/beta/interior_shots.py "$OUT" night "gfx=high&speed=1&cond=night" hitsnight ;;
  cuts)   W=1280 H=720 timeout 1800 python3 tests/beta/interior_shots.py "$OUT" day "gfx=high&speed=1&mission=advance" cuts ;;
esac 2>&1 | grep -v "GPU stall\|404"; done
pkill -f "http.server $PORT" 2>/dev/null; echo "pictures in $OUT"
