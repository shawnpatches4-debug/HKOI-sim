# Brief for helper sessions (read all of it before touching anything)

Project: "HKOI Battlefield", a browser 3D simulator (three.js r170, ES modules, no bundler) of an M1A2 SEPv3 defended by a 30 mm weapon
station (HKOI: it blinds guided missiles with an obscurant cloud) and Trophy, against missile teams and drones. Owner: Shawn (not a
programmer). He has asked for ONE finished release instead of small patches; you are building one part of it in your own git worktree.

Read first: `CLAUDE.md` (standing rules, hard-won lessons, map of the code), then `docs/OVERHAUL_SPEC.md` (everything he asked for).
Skim the last three entries of `docs/WORKLOG.md`. If your task touches the AI, also `docs/AI_SPEC.md`.

## Setup in your worktree
```
bash tools/link_assets.sh        # links the shared models, textures, sounds and the library cache into this worktree, sets the git user
```
New asset files you create go into `/home/user/HKOI-sim/assets/` (the real folder) under NEW names, then run `bash tools/link_assets.sh`
again. Never overwrite or delete an existing asset. Assets never go into git (`assets/` is ignored; never `git add -f`).

## Build and test
Use the port given in your task (never 8765) and ALWAYS put browser runs behind the machine-wide lock, so only one headless Chrome runs
at a time (two at once have crashed this machine):
```
PORT=<port> bash tools/dev.sh build                                   # no browser: no lock needed
node tests/battle/battle.test.js | tail -1                            # must print BATTLE TESTS PASS
PORT=<port> OUT=<scratch dir> bash tools/browser.sh bash tools/dev.sh check     # full check, about 5 minutes: run it at checkpoints, not after every edit
PORT=<port> OUT=<dir> W=1280 H=720 SETTLE=6000 PRE='[...]' VIEWS='[...]' bash tools/browser.sh bash tools/dev.sh shot <out.png> "gfx=high&speed=1"
```
`dev.sh shot` does NOT build first. PRE is a JSON list of JS run once; VIEWS a JSON list of JS, one screenshot each (`<out>_0.png`, ...).
`window.__beta` exposes scene, battle, cams, tank, teams(), props, view(e, n, dist, height, lookE, lookN), setPlaying(), runTo(t),
playFor(sec), advance(sec), prof(). Hash parameters: gfx=min|low|medium|high, speed, spectator=1, force=light|ambush|standoff|drones|heavy,
skill, mission=hold|advance|hunt, biome=farmland|desert|town|forest, cond=day|dawn|dusk|overcast|rain|fog|snow|night, map, seed, perf=1.
Headless Chrome here is software-rendered, about 2 frames a second: small viewports while iterating, long timeouts, and judge motion by
SEQUENCES of stills, never by one still. Anything tied to time must give the same result at 30, 60, 144 and 240 fps: prove it by stepping
with fixed dt, not by watching. Shawn plays on an RTX 4070 Super; the quality levels (QUALITY in scene3d.js) are the safety valve: heavy
new work must scale down or switch off at `low` and `min`. Report draw calls and triangles before and after (`__beta.scene.stats()`).
Playwright quirks: a string that evaluates to a function gets CALLED (wrap assignments in `void (...)`); eval-based `wait_for_function`
polling is blocked by the page's security rules (poll with `page.evaluate` in a loop); pass the three.js folder to `tools/serve_csp.sh`
as an ABSOLUTE path. LOOK at your screenshots with the Read tool and iterate until the result is right: you are the only eyes.

## Hard rules
- The hosting page blocks `data:` and `blob:` FETCHES. Models load only through `loadGLTF` / `loadModel` in `src/render/units.js`;
  textures as ordinary image files or generated in code (canvas / DataTexture). Test through the restricted server (what `dev.sh` does).
- The frame loop must never throw (it is wrapped; keep it so). No allocations in per-frame hot paths where avoidable.
- `src/engine.js` is the source of truth for missile / HKOI / Trophy outcomes: do not edit it.
- Stay inside the files your task gives you. If you must touch a shared file (above all `src/app/main.js` and `src/app/index.tpl.html`),
  keep the edit to a few lines and list every one in your report: several sessions are working at once and the lead merges by hand.
- New code goes in readable multi-line form in its own module where that makes sense. No `//` comments inside dense one-line
  statements (use `/* */`). Plain words in comments and in anything shown on screen; metric units; no em dashes in on-screen text.
- Honest results: never fake a look with something that misrepresents what the simulation did. State assumptions.
- Do not print whole dense source files or long dumps to the terminal (`cut -c1-400`, grep, head).
- Commit early and often on your worktree branch (a machine restart has already cost one helper its uncommitted work). Do not push,
  do not publish, do not touch `/home/user/HKOI-sim` itself except to add new asset files. Commit trailer:
```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YYLVNDduDP8T6sjAD1nGLH
```

## Report back (your final message)
Blunt, with verified separated from assumed: what you built; what still looks or works wrong; numbers (draw calls, triangles, frame cost
where relevant); files and functions changed, with the exact lines added to shared files; new asset files (absolute paths); absolute
paths of 3 to 6 screenshots that show the result; test output lines; open questions for the owner; branch name and final commit hash.
