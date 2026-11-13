# Work log (newest last). Read this first after any restart.

## 13 Nov 2026
- Green light given 05:06 CT. Live artifact stays on v40: https://claude.ai/artifact/UwuqtLMXFF6QTTkU7jNjXg (do not publish the overhaul there). Beta link: not created yet.
- Build dir: /tmp/claude-0/-home-claude/52ca1d94-90f7-56a7-90e4-a7185ec49a80/scratchpad/sim (python3 patch15.py; cab.js = cat cab_head.js cab2.js). Sync sources to this repo at each checkpoint (tools/sync.sh).
- GitHub push refused until Shawn installs the Claude GitHub App on the repo; retry `git push` at each checkpoint. Repo is public: no third-party assets in it.
- Phase 1 (audit) started: taudit2.py over all presets and cameras.
- Library decision: old scene stays on three r128. New renderer will be written fresh as ES modules on a current three (old scene's colour/tone-mapping pipeline does not port cleanly; tried r159 with shims: loads, but too dark, XR-target trick blacks out the MSAA target). mk159.py in the build dir is the abandoned experiment.
- src/world/world.js: battlefield model done (first pass). Generation for 4 biomes, los(), flightClear(), defilade(), viewshed(), ambushSites(), coverFrom(), path(). tests/world/world.test.js passes. tools/dumpworld.js + tools/mapimg.py render planning maps.
- NEXT: (a) read audit log taudit2.log in the build dir and fix findings; (b) engine integration of the world (threat positions as e/n, LOS gating of launch/guidance/detection, terrain strikes, flat-ground mode kept); (c) new renderer module.
