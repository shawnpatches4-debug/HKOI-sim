#!/bin/bash
# copy build sources from the working build directory into the repository
S=${1:-/tmp/claude-0/-home-claude/52ca1d94-90f7-56a7-90e4-a7185ec49a80/scratchpad/sim}
R=$(cd "$(dirname "$0")/.." && pwd)
for f in patch15.py ui10.html css10.css css14.css sbx14.html sbx_ui14.js snd14.js sbx3d14.js cab_head.js cab2.js cab.js engine.js campaign.js tactics.js dmg.js ui2.js ui2.css vehhd.js vehm1.js split_m1.js vol.js cine10a.js cine10b.js cine10c.js cred.html cred.js; do cp "$S/$f" "$R/src/" 2>/dev/null; done
cp "$S"/src2/*.js "$R/src/" 2>/dev/null
cp "$S"/invariants.js "$S"/t*.py "$S"/t*.js "$R/tests/" 2>/dev/null
cp /home/claude/hkoi_full/web/README.md "$R/docs/CHANGELOG.md" 2>/dev/null
cp /home/claude/hkoi_full/web/OVERHAUL_SPEC.md "$R/docs/" 2>/dev/null
echo synced
