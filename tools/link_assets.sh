#!/bin/bash
# For a helper's git worktree: make the shared (untracked) assets and the library cache of the main checkout visible here.
# Usage, from the worktree root:  bash tools/link_assets.sh     (safe to run again after new assets are added to the main checkout)
set -e; MAIN=/home/user/HKOI-sim; HERE="$(cd "$(dirname "$0")/.." && pwd)"; [ "$HERE" = "$MAIN" ] && { echo "this is the main checkout: nothing to do"; exit 0; }
mkdir -p "$HERE/assets"; cp -rsn "$MAIN/assets/." "$HERE/assets/"; ln -sfn "$MAIN/.cache" "$HERE/.cache"
git -C "$HERE" config user.email noreply@anthropic.com; git -C "$HERE" config user.name Claude
echo "assets linked ($(find "$HERE/assets" -type l | wc -l) files), cache linked"
