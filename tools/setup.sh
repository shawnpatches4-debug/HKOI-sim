#!/bin/bash
# One-time setup in a fresh workspace: fetch the 3D library the sim is built on and the model converters, then build and self-check.
# Usage (from the repository root):  bash tools/setup.sh
set -e; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"; mkdir -p .cache && cd .cache
if [ ! -d package ]; then npm pack three@0.170.0 >/dev/null && tar xzf three-0.170.0.tgz && rm three-0.170.0.tgz; fi     # -> .cache/package (three r170)
if [ ! -d conv/node_modules ]; then mkdir -p conv && cd conv && npm init -y >/dev/null && npm install fbx2gltf @gltf-transform/cli >/dev/null 2>&1 && chmod +x node_modules/fbx2gltf/bin/Linux/FBX2glTF && cd ..; fi
pip install --break-system-packages -q trimesh pillow numpy playwright 2>/dev/null || pip install -q trimesh pillow numpy playwright
cd "$ROOT"
if [ ! -f assets/m1v3/m1v3_meta.json ]; then echo "NOTE: assets/ is empty. Unzip the assets bundle (hkoi-assets.zip, from Shawn) into ./assets before building, or every model shows as a plain box."; fi
bash tools/dev.sh build && node tests/battle/battle.test.js | tail -1 && node tests/world/world.test.js | tail -1
echo "Setup done. 'bash tools/dev.sh check' runs the browser checks; 'bash tools/dev.sh pub' makes the publishable build."
