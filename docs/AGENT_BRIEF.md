# Brief for helper agents (read fully before touching anything)

Project: HKOI Battlefield beta, a browser 3D tank-defence simulator (three.js r170 ES modules). Owner: Shawn. Repo root: this directory.
Read `docs/WORKLOG.md` (last ~15 entries) and skim `docs/OVERHAUL_SPEC.md`.

## Layout
- `src/app/main.js` (app shell, frame loop, HUD, cameras wiring), `src/app/index.tpl.html` (markup + CSS), `src/app/mapview.js`
- `src/render/` scene3d.js, cameras.js (CAMERA_MODES + Cameras.update), units.js (TankView, TeamView, PropView, loadGLTF, poses), volleyview.js, fx.js, env.js, terrain.js, scenery.js
- `src/battle/battle.js` (time-stepped battle layer, UMD), `src/world/world.js`, `src/engine.js` (legacy resolver: do not edit), `src/audio/sound.js`
- Lines in these files are LONG (dense one-liners). Read with `cut -c1-400` or grep; never dump whole files or bbox lists to the terminal.

## Build and test (mandatory before you report)
```
SP=/tmp/claude-0/-home-claude/52ca1d94-90f7-56a7-90e4-a7185ec49a80/scratchpad
HK_ASSETS=$SP/sim/assets python3 tools/build_beta.py local $SP/t170/package      # builds ./build/beta
node tests/battle/battle.test.js | tail -1                                        # must print BATTLE TESTS PASS
```
Browser tests run headless Chrome with software GL (about 1 frame per second: be patient, use small viewports, long timeouts).
They MUST run against a local server that applies the hosting page's restriction (no data:/blob: fetches), started IN THE SAME shell
command as the test because background servers die between commands. Use YOUR OWN port (given in your task) to avoid clashing:
```
PORT=<your port>; sed "s/8765/$PORT/g" tools/serve_csp.sh > /tmp/serve_$PORT.sh; chmod +x /tmp/serve_$PORT.sh   # once
/tmp/serve_$PORT.sh $SP/t170/package $PORT >/dev/null && export BASE=http://localhost:$PORT/index.html && \
  W=320 H=180 LOOPS=9 timeout 900 python3 tests/beta/click.py $SP/beta/agent_click.png "speed=2&gfx=min&spectator=1" 2>&1 | grep -v "GPU stall\|404" | tail -3 && \
  timeout 600 python3 tests/beta/drag.py "gfx=min" 2>&1 | grep -v 404 | tail -2
```
(`serve_csp.sh` copies `tools/` relative paths: run it from the repo root of YOUR worktree; if the sed copy breaks its ROOT detection, copy the script into your worktree's tools/ under another name instead.)
click.py must show simulated time `t` advancing past a volley with `errors []`; drag.py must show the camera position changing.
Screenshots: `tests/beta/shot.py <out.png> "<hash params>"` with env PRE (JSON list of JS run once), VIEWS (JSON list of JS, one screenshot each),
W, H, SETTLE, BASE. `window.__beta` exposes scene, battle, cams, tank, teams(), props, near(dist,height,brg), view(...), setPlaying, runTo(t), playFor(sec), advance(sec).
Do not pass JS starting with the word `function` to PRE/VIEWS (Playwright treats it as a function to call): assign to window instead.
LOOK at your screenshots with the Read tool and iterate until the result is right.

## Hard rules
- Models are loaded ONLY through `loadGLTF` / `loadModel` in units.js (the host blocks data:/blob: fetches). Published model files are `.json` (see tools/glb2json.py), textures `.webp`.
- Third-party assets live outside git (`assets/` is ignored; working copies in `$SP/sim/assets`). Never `git add -f` an asset.
- The frame loop must never throw; keep per-frame work small (no allocations in hot loops where avoidable, no per-frame raycasts over big meshes).
- Simulated time: `battle.t` steps at 0.1 s; drawing happens between steps (main.js `advance`, `tNow`, `shown`). Anything animated must use frame dt and work at 30 to 240 fps.
- Plain words in UI text and comments (the owner is not a programmer); metric units; no em dashes.
- Do NOT publish anything, do NOT push, do NOT touch the `main` branch of the primary checkout. Work only in your worktree and COMMIT there
  (git user is already configured; end commit messages with the two lines below).
- Stay inside your task's files/sections as listed; if you must touch a shared file, keep the edit small and say so in your report.

Commit trailer (required):
```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YYLVNHY7Zg2uTTfmHARCVH
```

## Report back (final message)
What you built, which files/functions changed, test output lines (battle test, click, drag), paths of 1 to 3 screenshots that show the result
(absolute paths under $SP/beta/), anything unfinished or uncertain, and the commit hash on your worktree branch.
