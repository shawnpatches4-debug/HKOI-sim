# Work log (newest last). Read this first after any restart.

## 13 Nov 2026
- Green light given 05:06 CT. Live artifact stays on v40: https://claude.ai/artifact/UwuqtLMXFF6QTTkU7jNjXg (do not publish the overhaul there). Beta link: not created yet.
- Build dir: /tmp/claude-0/-home-claude/52ca1d94-90f7-56a7-90e4-a7185ec49a80/scratchpad/sim (python3 patch15.py; cab.js = cat cab_head.js cab2.js). Sync sources to this repo at each checkpoint (tools/sync.sh).
- GitHub push refused until Shawn installs the Claude GitHub App on the repo; retry `git push` at each checkpoint. Repo is public: no third-party assets in it.
- Phase 1 (audit) started: taudit2.py over all presets and cameras.
- Library decision: old scene stays on three r128. New renderer will be written fresh as ES modules on a current three (old scene's colour/tone-mapping pipeline does not port cleanly; tried r159 with shims: loads, but too dark, XR-target trick blacks out the MSAA target). mk159.py in the build dir is the abandoned experiment.
- src/world/world.js: battlefield model done (first pass). Generation for 4 biomes, los(), flightClear(), defilade(), viewshed(), ambushSites(), coverFrom(), path(). tests/world/world.test.js passes. tools/dumpworld.js + tools/mapimg.py render planning maps.
- NEXT: (a) read audit log taudit2.log in the build dir and fix findings; (b) engine integration of the world (threat positions as e/n, LOS gating of launch/guidance/detection, terrain strikes, flat-ground mode kept); (c) new renderer module.

### ARCHITECTURE DECISION (13 Nov, after reading engine.js)
The legacy engine (`runMission`, one 660-line function) is not time-stepped: threats are (R, brg, t0) flying straight in, resolved in passes (detect -> plan gun schedule -> engage -> Trophy -> hits). It cannot host terrain, positions or per-actor AI directly. So:
- **Keep legacy as the resolver.** It stays untouched for flat-ground scenarios and statistics, and is called by the new layer to resolve each volley (HKOI fire control, cloud physics, Trophy, crew stress/voices, damage).
- **New `battle` layer (src/battle/)**: time-stepped (dt 0.1 s), deterministic. Owns the World, unit positions, sight lines, enemy AI, tank driver AI, movement, return fire, support. Enemy fires in volleys; each volley -> `enemy.fixed` launches for legacy (R, brg at launch; t0), with carry-over of ammo, Trophy charges, damage and crew state between volleys (reuse campaign.js `CAMP`).
- **Hooks to add to legacy (small):** `fixed[].vis` = earliest time the tank's sensors have a sight line to that missile (terrain masking) -> cue/track no earlier than this; `cfg.ext.path` = tank path [[t, x, n, heading, v], ...] supplied by the battle layer's driver AI (same format as crew.path), replacing the legacy evade path; AI driver orders go through the existing `cfg.player` order interface where possible.
- **Battle layer overrides** a legacy outcome when terrain says so: guidance sight line broken (tank reached cover) -> missile lost; flight path crosses ridge/building/trees -> strikes terrain.
- **Causality rule:** legacy plans with all threats of a volley known. A launch that would join a volley already in flight is accepted only if re-resolving does not change any event already in the past; otherwise it waits for the volley to finish. Deterministic.
- **Renderer:** new ES-module renderer draws World + units + the legacy `rec` of the current volley, anchored at true positions.
- engine.js hooks added (invariants pass): `fixed[].los_clear` (sensor sight line opens at this range), `fixed[].mask` (missile loses guidance to terrain, falls short; tag terrain_mask, metric by_terrain), `fixed[].uid`, `cfg.ext.path` (external vehicle path, 0.1 s samples, starts at t=-3).
- src/battle/battle.js v0 done: Battle class (world, tank, enemy teams with primary + alternate sites, commander that assembles volleys by skill/patience/exposure, two-pass volley resolution through HK.runMission with CAMP carry-over, driver cover plan, terrain masks, shoot and scoot, friction). tests/battle/battle.test.js passes; ~1 s per 6-minute battle in node.
- KNOWN GAPS in battle v0: legacy crew still voices its own driver orders while the path is external (silence when EXT); no return fire, drones use legacy only (no spotter logic beyond _spotted), no infantry, no support, tank does not pick hull-down positions proactively, log needs sorting by time.
- Audit (taudit2.py) got slow/stuck after 3 presets clean; rerun when the machine is idle.
