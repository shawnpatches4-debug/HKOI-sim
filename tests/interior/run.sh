#!/bin/bash
# Interior checks without a browser.
#   1. overlap.test.mjs: no solid part passes through another or comes too close to a seat's eye (the "clean interior" check)
#   2. interior.test.mjs: builds the interior and runs its per-frame code through a scripted minute of battle at 30, 60, 144 and
#      240 frames a second (door, recoil, hatch, HKOI state, warning must come out the same; no exceptions, no bad numbers)
#   3. station_clear.mjs: the HKOI weapon station on the roof touches nothing at any bearing or elevation
# Use, from the repository root:  bash tests/interior/run.sh [overlap|frames|station]     (needs the 3D library in .cache/package: tools/setup.sh)
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
mkdir -p "$D/node_modules"; ln -s "$ROOT/.cache/package" "$D/node_modules/three"
cp -r "$ROOT/src/render" "$D/render"; cp -r "$ROOT/src/app" "$D/app"; cp "$ROOT"/tests/interior/*.mjs "$ROOT"/tests/interior/roof_survey.json "$D/"
cd "$D"; rc=0; export HK_ASSETS="${HK_ASSETS:-$ROOT/assets}"
if [ "$1" != "frames" ]; then node overlap.test.mjs || rc=1; fi
if [ "$1" != "overlap" ]; then node interior.test.mjs || rc=1; fi
if [ -z "$1" ] || [ "$1" = "inside" ]; then HK_ROOT="$ROOT" node inside.test.mjs || rc=1; fi   # what goes wrong inside and the crew's wounds: causes, agreement with the damage report, real battles (see the file's head)
if [ -z "$1" ] || [ "$1" = "station" ]; then node station_clear.mjs > station.log; r=$?; tail -3 station.log; [ $r = 0 ] || rc=1; fi   # where the HKOI weapon station stands on the roof: clear of everything (see the file's head)
exit $rc
