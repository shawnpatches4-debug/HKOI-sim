# STATE AT 18:05 UTC 14 Nov 2026: 0.90 PUBLISHED
0.90 is on Shawn's "HKOI Battlefield Beta" page (artifact version 32), built from be974de. Nobody has confirmed it on his machine yet.
Open, waiting for Shawn: where the HKOI station goes (right beside the CROWS / rear bustle / keep and block the loader's hatch); the questions in the 13:35 entry below. Known faults are listed in the last WORKLOG entry.
# STATE AT 13:35 UTC 14 Nov 2026 (read this first)
Shawn is asleep. His orders in force: ONE full release, NO publish before it; progress pictures welcome; free rein; honest numbers.
Branch claude/loving-newton-czylil (pushed) holds EVERYTHING except the sound third pass (branch worktree-agent-afd3cb6297e3a4e79, asked for status 13:32; before merging: `git ls-tree -r --name-only <branch> | grep -c '^\.cache$'` must print 0).
The last WORKLOG entry (13:35) lists what was merged, the open interior faults (the lead owns the interior now) and the honest enemy figures.
Release steps left: merge sound; fix what the page tests show (tests/beta/shell.py, pages.py, replay.py, director.py, sound.py, cdrview.py, fpvfeed.py, vehicles.py; one headless browser at a time through tools/run_test.sh, a page load takes about 4 minutes in software); look at pictures of the loader up on his gun from outside (scratchpad int/e6); rerun node tests/motion/harness.mjs check on a quiet machine; final bash tools/dev.sh check; Notion R&D Log entry; compare the live page's file list; bash tools/dev.sh pub; publish to the "HKOI Battlefield Beta" artifact. The original crew models in assets/crew ARE used in the seats and the face panel now: they must be published (the CLAUDE.md line "except assets/crew" is out of date; the new assets/veh files too).
Unverified by anyone: sound (never heard), motion at real frame rates, performance on a real graphics card.
Open questions for Shawn (all kept at current behaviour until he answers): UAZ hard-top; enemy tank paint; turret throw height; BMP-2M tubes; X-ray blood strength; fog-of-war launch shot; commander view allowed with fog of war on; veterans' timed arrival and whether experts do it; rocket teams in plain view; stand-off raid 6 s spread; three Abrams endings (he said no for now).

# Hand-off: where the project stands (13 Nov 2026, about 15:15 CT)

## What exists on `main`
Beta 0.20 is what Shawn last tested from the hosted page; `main` is ahead of it (0.21 work, not yet shown to him):
- Generated 8x8 km battlefields (farmland, desert, town edge, forest), eight weather/light conditions, graphics levels with automatic resolution scaling.
- Battle layer: enemy teams (Kornet, Konkurs, RPG, laser designator, FPV crews) with skill levels, volleys resolved by the legacy engine, fog of war and a spectator mode.
- Tank: M1A2 SEPv3 TUSK with Trophy (supplied model, separate turret), finish by theatre, HKOI weapon station (M230LF on the turret roof) that slews and fires, main-gun return fire on located sites, machine guns on located teams within 914 m, hull-down position search after each volley.
- Enemy: supplied Kornet, soldier (posed and, new, walking/running), FPV drone, RPG-7; parked BMP-2M and UAZ behind teams.
  NEW on main, unpublished: smarter displacement (`_displace` in battle.js: scored site choice, covered routes, spotted on the move, going to ground) and stride animation (`TeamView.update`, `stridePose` in units.js).
- Views: orbit, chase, commander, gunner sight, overhead, enemy sight, missile; topographic map with viewshed and vehicle placement.
- Sound: synthesised effects (30 mm, explosions, Trophy, launches, drones, turbine, weather, machine guns, 120 mm) and recorded crew/enemy voices. NOBODY HAS CONFIRMED BY EAR that any of it sounds right.

## RELEASE BUILD IN PROGRESS (started 14 Nov 2026, after Shawn's verdict on 0.32)
Shawn: "this sim kinda sucks in the current state ... use as many tokens and spend as much time as you want building a finalized product.
No more micro patches. You know what I want to see, now deliver." So: ONE release, published when it holds together, not a stream of
small builds. The requirement list is docs/OVERHAUL_SPEC.md; the old simulator's lessons are docs/LESSONS_FROM_V40.md.
Do NOT publish intermediate builds. Commit and push at every checkpoint as always.

How it is being built: the lead session integrates and owns the simulation core (src/battle/*); helper sessions each own one part in
their own git worktree (brief: docs/AGENT_BRIEF.md; `bash tools/link_assets.sh` in a worktree; every browser run behind
`bash tools/browser.sh ...` so only one headless Chrome runs at a time: two at once crashed the machine twice).

WAVE 1 (running; branches are the worktrees listed by `git worktree list`):
- Graphics: terrain material, vegetation, ground cover, sky and clouds, buildings, cinematic finish (terrain.js, scenery.js, env.js, scene3d.js). Port 8772.
- Effects: the HKOI engagement made readable (tracers, blooms, highlighted cloud, guidance line that is cut), missiles and drones (incl. drones flying in), Trophy, explosions, marks (fx.js, volleyview.js). Port 8773.
- Interior: the old page's turret and hull interior and the four crew seats plus cutaway, ported from src/cab*.js to an ES module, WITHOUT crew figures (parked; proposal pictures only). Port 8774.
- Lead: battles in waves with lulls (multi-minute), pacing and balance, the "run the numbers" engine (four setups on the same battles).
- Sound (added 14 Nov, Shawn: "push the sound, make the crews sound human, the old ones were quite robotic"): human recordings only for the tank crew (the pack), no machine speech, intercom processing and queue, lines driven by battle.events, a proper mixer with an inside state; effects stay synthesised behind a slot manifest until his packs arrive. Port 8775.
- Animation (added 14 Nov, Shawn: "buttery smooth"): flow, feet on real ground, the listed faults, life at the weapon, reload and pack-up shown. Port 8776. Told Shawn the real jump needs motion-capture clips (Mixamo) for the same skeleton: he may send some.
- Lead, done so far: waves with lulls (opt.waves; setup "Battle length"), stalemate rule, src/battle/study.js (run the numbers engine; tests/battle/study.js), src/battle/ladder.js (ten rungs + debrief score; tests/battle/ladder.js), battle.events (structured event list for director, captions, voices, debrief).
SHAWN'S TIME BOX: "work non stop for 16 hours and I'll give feedback" (said about 02:15 UTC 14 Nov). HELD by him: support calls (artillery, wingman).
LEAD, 14 Nov 03:10 UTC: run-the-numbers is now Monte Carlo on raids (study.js raid*, pages.js, tests/battle/raids.js; results and limits in the last WORKLOG entry: HKOI added to Trophy helps in all 21 scenarios; HKOI alone does nothing against wire-guided launchers because its radar waits for a warning). Debrief lists every hit from the old damage model src/dmg.js (already loaded by the page: USE IT for the X-ray, do not write a second armour model). NEITHER HAS BEEN SEEN IN THE PAGE.
BLOCKED: an orphaned test server (pid 12617, `http.server 8776`) holds /tmp/hkoi_browser.lock, so no browser test can run for anyone. Cause fixed (`flock -o` in tools/browser.sh and run_test.sh; helpers' worktrees need the same word). Stopping the orphan was refused by the permission system for the lead and two helpers: wait for Shawn's "yes, stop it"; do not work around it. When it clears: `bash tools/dev.sh build; PORT=8799 bash tools/run_test.sh tests/beta/pages.py`, look at the pictures, send them to Shawn.
WAVE 2 (after wave 1 is merged): film director with captions, slow motion and replays from another angle; title screen over a live
battle, clean HUD, simple and engineer modes (this helper will own src/app/main.js and index.tpl.html); armour and damage model with
X-ray of the hit; run-the-numbers page, debrief with score, ladder of ten raids; (sound moved into wave 1, see above).
THEN: merge everything, full check on every mission, force, terrain and condition, performance figures, ONE publish, Notion entry.
If a helper's branch exists and is not merged, review its report (it is in the session transcript only: if lost, read the branch's
commits and its sheets under the scratchpad) and merge it by hand.

## State after the Claude Code session of 13 Nov (beta 0.24, published, not yet confirmed by Shawn)
Priorities 1 to 5 are all in the code and on the beta page: enemy AI and stride (0.21), enemy sight reticles to true scale + team menu + close-up camera (src/app/enemyviews.js, cameras.js), tank animation (recovered from the live page, see WORKLOG), and a rebuild of enemy weapon handling that Shawn asked for mid-session.
Waiting on Shawn's eyes: all of the above. Known gaps are listed in the last WORKLOG entry.
BEFORE PUBLISHING, ALWAYS compare the live page with git (Artifact read + file list): the page has been ahead of the repository once already.
AI REBUILD: all three stages are in the code; latest published build is beta 0.32 (0.31: replay system and HKOI findings; 0.32: sensor views and thermal) (animation and crew voice pack merged; fixes after his 0.28 feedback: see the last WORKLOG entry). Shawn has not yet judged 0.30. No helper branches are waiting to be merged. Two helper jobs may have left branches to merge: enemy crew animation and the crew voice pack.
NEW TOP PRIORITY (Shawn, after playing 0.24): rebuild the tank and enemy AI from the ground up. All his decisions are in docs/AI_SPEC.md (agreed by questions, not yet built; three stages, a playable build after each). Read it before touching battle.js. Baseline numbers: node tests/battle/pace.js.
After that, his earlier list: Trophy firing from its turret modules; main gun elevation; roof guns swinging; weapon-station detail; more parked vehicles; T-72B3 unit; and so on (below).

## Shawn's current priority order (his words, 14:50 CT)
1. Enemy AI: better repositioning and hiding (done on main, needs his eyes).
2. Enemy movement animation (done on main, rough: launcher carry and RPG carry need a look).
3. Enemy sight: real reticle + unit menu.  4. New camera: enemy troops up close + unit menu.  5. Tank animation: roadwheels, suspension, tracks.
Then, from the list he was commenting on: Trophy firing from its turret modules; main gun elevation (cut the barrel out of the turret mesh); roof guns swinging;
weapon-station detail pass; more parked vehicles (BMP-3M, Khrizantema-S, MT-LB simplified; fix the BMP-2M's near-black paint); T-72B3 as a real enemy unit
(expect worse results for the tank: say so); spotter drone; machine-gun suppression breaking the guidance of a missile in flight; remove the remaining ~31 ms
hitch when a volley is resolved; thermal channel for the gunner's sight; credits for supplied models.
Parked by him: crew figures. Later: catastrophic kills, film director, ladder of ten raids + score, debrief, armour model + X-ray, interior, long battles.

## Open questions for Shawn
- Where did each supplied model and sound pack come from (for credits, and to decide what may live in a public repository)?
- Default tank variant: TUSK + Trophy (current) or TUSK II + Trophy?
- Is the weapon station where he wants it (left rear of the turret roof)?
- How does the sound come across, the 30 mm above all?

## Supplied source models not yet used (ask him to re-upload if needed; originals are not in git)
BMP-3M ERA, Khrizantema-S, MT-LB (317k triangles), T-72B3 / T-90 / T-80U "lineup" OBJs, Ural-4320 (.blend only), a sci-fi machine gun (.dae), a crewman body + CVC helmet (parked).

## How he has been testing
A private hosted web page updated from the chat he worked in ("the beta link"). The legacy v40 simulator lives on a different page and must not be replaced until he approves the new one.
