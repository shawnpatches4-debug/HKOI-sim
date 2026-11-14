# HKOI Battlefield: standing instructions

Owner: Shawn Patches (Pax Kinetics). This is his "Overtake-and-Bloom" (HKOI) mission simulator: an M1A2 SEPv3 defended by a 30 mm
weapon station (HKOI) and Trophy against missile teams and drones, in the browser (three.js r170, ES modules, no bundler).
He is not a programmer: explain in plain words, lead with what changed and what you could not verify.

## Start here
1. Read `docs/HANDOFF.md` (current state and next tasks), then the last ~20 entries of `docs/WORKLOG.md`, then skim `docs/OVERHAUL_SPEC.md` (everything he asked for), `docs/AI_SPEC.md` (his AI decisions) and `docs/LESSONS_FROM_V40.md` (what the old simulator teaches about this one).
2. `bash tools/setup.sh` once per fresh workspace. If `assets/` is empty, ask Shawn for `hkoi-assets.zip` and unzip it into `./assets` first.
3. `bash tools/dev.sh check` must pass before you call anything done.

## Rules he has set (do not relax these)
- **Double-check everything.** Commit at every checkpoint, run the tests after every change, keep modules clean. He does not want to come back to a laggy, unfixable mess.
- **Honest numbers.** If a realistic change is worse for HKOI, make it realistic and tell him. Never tune to hit a target. State your assumptions.
- **Updates about every 10 minutes while working, with pictures** (screenshots you took and looked at).
- **Keep all existing mechanics**; the legacy resolver in `src/engine.js` is the source of truth for missile/HKOI/Trophy outcomes. Do not edit it casually; `node invariants.js`-style checks lived in the old build.
- **Third-party assets stay out of git** while the repository is public (`assets/` is ignored). Never `git add -f` an asset. Sources of the supplied models are still unconfirmed: see `docs/ASSETS.md`.
- **Log every version to the Notion "R&D Log"** if a Notion connection is available (data source id `01785400-2dc2-43cd-a2ab-0a8b29a01c16`; properties Entry, Type, Module, Version, date:Date:start, Patent-relevant, Notes). If not available, say so and list what needs logging.
- His email address is private: never send it to an outside service.
- Crew figures are parked ("skip implementing crew for now"). Do not use the crewman model without showing him a picture first.
- Plain words, metric units, military terms where natural, no em dashes in UI text.

## Lessons paid for (each one froze or broke the beta for him)
- **Headless Chrome here is software-rendered, about 1 frame a second.** Anything tied to frame rate must be checked with `__beta.advance(dt)` at 30/60/144/240 fps, not by watching.
- **Run the real frame loop through a volley before publishing** (`tests/beta/click.py`); helpers like `runTo`/`playFor` skip frame-only code.
- **The page that hosts the beta blocks `data:` and `blob:` fetches.** Models must load only through `loadGLTF`/`loadModel` in `src/render/units.js` (reads the page's own `.json` file, unpacks in memory, pictures as image elements). `.glb` is not served there: repack with `tools/glb2json.py`. Always test through `tools/serve_csp.sh` (what `dev.sh check` does).
- **The frame loop must never throw.** It is wrapped in try/catch with an on-screen red bar; keep it that way.
- **The live beta page can be ahead of git.** A whole version (0.23) was published and never committed. Before publishing, read the page's file list and compare; commit before you publish, every time.
- Playwright: a string that evaluates to a function gets called (wrap in `void (...)`); pass the three.js folder to `serve_csp.sh` as an absolute path.
- A `//` comment in the middle of a dense one-line statement comments out the rest of the line. Use `/* */` inside lines.
- Background servers die between commands: start the test server in the same command as the tests.
- Do not print model bounding-box dumps or whole dense source files to the terminal; lines are very long. Use `cut -c1-400`, grep, small scripts.

## Map of the code
- `src/app/` main.js (shell, frame loop, HUD, map, sound wiring), index.tpl.html (markup + CSS), mapview.js, enemyviews.js (enemy sight reticles, team menu)
- `src/render/` scene3d.js (renderer, weather, quality levels), cameras.js, units.js (TankView incl. HKOI station, TeamView, PropView, model loading, poses), volleyview.js (missiles, tracers, Trophy, impacts), fx.js, env.js (weather, vehicle finish), terrain.js, scenery.js
- `src/battle/tankai.js` the tank crew: independent weapons, target order, thermal scanning, counter-fire, loader, missions and movement (decisions in `docs/AI_SPEC.md`)
- `src/battle/battle.js` time-stepped battle layer (enemy teams, tank behaviour, return fire, machine guns); each enemy volley is resolved by `HK.runMission` in `src/engine.js`
- `src/world/world.js` generated 8x8 km terrain, sight lines, routes; `src/audio/sound.js` synthesised effects + recorded voices
- `tools/` build_beta.py, dev.sh, setup.sh, serve_csp.sh, glb2json.py, lineup_split.py + vehicle_pack.py (cut a vehicle out of a multi-variant OBJ and pack hull/turret); `tools/audio/` (unpack a sound bank, transcribe, catalogue, build voice strips: see docs/ASSETS.md "Sound packs")
- `tests/` battle + world tests (node), `tests/beta/` shot.py, click.py, drag.py, sheet.py (pose sheet of an enemy team: states x angles), seq.py (animation sequences), enemyviews_loop.py, voicepack.py, replay.py (headless browser)
- `window.__beta` in the page exposes scene, battle, cams, tank, teams(), props, near(), view(), setPlaying(), runTo(), playFor(), advance(), prof()

## Showing Shawn a build
He tests on a gaming PC (RTX 4070 Super, 240 fps on Minimum). `bash tools/dev.sh pub` makes `build/beta_pub`: a static folder
(index.html fragment + js + assets) that loads three.js from jsDelivr. It is published to his private page "HKOI Battlefield Beta" with the Artifact tool (update that page in place: list his artifacts to find it;
send every file of build/beta_pub except assets/crew). Do not touch the legacy "HKOI Mission Simulator" page. Never tell him something works on his machine unless he has confirmed it.

## Commits
`git config user.email noreply@anthropic.com; git config user.name Claude`. Commit per checkpoint and push.
