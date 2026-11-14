#!/bin/bash
# Interior checks without a browser: builds the interior in node and runs its per-frame code through a scripted minute of battle at
# 30, 60, 144 and 240 frames a second (door, recoil, hatch, HKOI state, warning must come out the same; no exceptions, no bad numbers).
# Use, from the repository root:  bash tests/interior/run.sh      (needs the 3D library in .cache/package: tools/setup.sh)
set -e; ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
mkdir -p "$D/node_modules"; ln -s "$ROOT/.cache/package" "$D/node_modules/three"
cp -r "$ROOT/src/render" "$D/render"; cp -r "$ROOT/src/app" "$D/app"; cp "$ROOT/tests/interior/interior.test.mjs" "$D/t.mjs"
cd "$D" && node t.mjs
