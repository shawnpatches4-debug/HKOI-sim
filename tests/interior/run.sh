#!/bin/bash
# Interior checks without a browser.
#   1. overlap.test.mjs: no solid part passes through another or comes too close to a seat's eye (the "clean interior" check)
#   2. interior.test.mjs: builds the interior and runs its per-frame code through a scripted minute of battle at 30, 60, 144 and
#      240 frames a second (door, recoil, hatch, HKOI state, warning must come out the same; no exceptions, no bad numbers)
# Use, from the repository root:  bash tests/interior/run.sh [overlap|frames]     (needs the 3D library in .cache/package: tools/setup.sh)
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
mkdir -p "$D/node_modules"; ln -s "$ROOT/.cache/package" "$D/node_modules/three"
cp -r "$ROOT/src/render" "$D/render"; cp -r "$ROOT/src/app" "$D/app"; cp "$ROOT"/tests/interior/*.mjs "$D/"
cd "$D"; rc=0; export HK_ASSETS="${HK_ASSETS:-$ROOT/assets}"
if [ "$1" != "frames" ]; then node overlap.test.mjs || rc=1; fi
if [ "$1" != "overlap" ]; then node interior.test.mjs || rc=1; fi
exit $rc
