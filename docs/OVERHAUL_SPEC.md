# Overhaul spec (Shawn's answers, 13 Nov 2026). "Keep all mechanics, make everything far better."
Audience: Shawn + beta testers. Hardware: good gaming PC. Updates: every 10 min with pictures. Honesty: apply realistic changes even if worse for HKOI, and report how numbers moved. HKOI figures: use my assumptions, list them.
Priorities: looks, realism, ease of use, demo mode: all four. Worst pain points: graphics look basic; sound messy/thin.

## Sound
- Inside turret: heavily muffled (engine, intercom, breathing; blasts are dull thuds).
- Crew voices: sound pack first (SOID), synthesised only to fill gaps. Uncensored.
- HKOI 30 mm gun is the star of the mix (loud, tight, mechanical, cases, feed).
- Wants: weight and distance (deep blasts, delay by range, ringing ears), cleaner voices (one line at a time, radio processing, fewer repeats), ambient world (engine, tracks, wind, rain, distant battle, creaks). No music requested.

## Graphics
- Style: cinematic (colour grade, dramatic lighting, flare, depth of field, grain).
- Detail everywhere: explosions/fire/smoke, terrain/vegetation, the tank (suspension, recoil, dirt, visible damage, HKOI mount), enemy positions (dug-in teams, nets, vehicles, backblast).
- Settings: Eastern European farmland, desert, town/city edge, forest and hills.
- Conditions: night with thermal, dawn/dusk, rain/fog/mud, snow/winter.
- Thermal: realistic imager (grain, bloom, smoke partly blocks, HKOI cloud visible).
- Hits from outside: full catastrophic kills with a detailed, realistic armour approach (inspiration: War Thunder, GHPC).

## Armour / damage
- Full penetration view AND full plate-by-plate model using public estimates, labelled as estimates. Tank: M1A2 SEPv3 with Trophy. X-ray replay after each hit.

## Camera
- Film director: automatic cuts between best angles. Slow motion on key moments, replay from another angle after a kill/hit, on-screen captions (what happened and why). No split screen.

## Crew cameras
- Real 3D heads filmed inside the turret. Drop the drawn faces once that works.

## New content
- Enemy weapons: hovering bomber drone dropping grenades (first). (Top-attack, loitering, artillery, mines NOT selected.)
- Enemy infantry on the move; support vehicles; wrecks and battlefield clutter. (Friendly dismounts NOT selected.)

## Play
- Command the tank (keep/improve orders). Scoring and challenges: a ladder of single raids, judged on survival/crew and commander decisions. Debrief: timeline of orders vs AI choice vs best choice.
- No manual gunner, no play-as-enemy.

## UI
- Two modes: simple play mode and engineer mode. Keep the thinking enemy. Classic layout and Run-the-numbers batch: not asked to drop, keep.

## Phase order
1 audit/fix, 2 sound, 3 worlds+conditions, 4 effects+tank+enemy positions+catastrophic kills, 5 armour model + X-ray, 6 film director, 7 3D crew cams, 8 bomber drone + infantry + vehicles + clutter, 9 realism leftovers, 10 ladder + debrief, 11 two-mode UI + demo mode.

## Second round of answers
- Cloud: physically plausible but highlighted (subtle outline/tint so it is always visible and you can see whether the beam passes through).
- Enemy: shoot and scoot; coordinated timing; mistakes and friction (misfires, late launches, nerves, drone crashes); reacts to HKOI within the raid.
- Return fire: main gun on located launch sites; coax and commander's MG with tracers; call for support (artillery or wingman).
- Seats fully built: commander, gunner, loader, driver.
- Ladder: top rungs near impossible (show where HKOI and Trophy run out).
- Raid length: both short raids (ladder) and multi-minute battles (own scenarios).
- After action: threat-by-threat story; replay with free camera; shareable one-page summary. (Trophy-saved side-by-side not picked here but is the point of HKOI: keep in summary.)
- Inspiration: GHPC sights and fire control (reticle, lasing, ballistic computer, thermal noise); War Thunder hit camera (X-ray shell path, fragments, modules, crew); War Thunder damage readout (module list).
- Tank model note: the 3D model on hand is an M1A2 SEPv2 with Trophy; Shawn asked for SEPv3. Armour estimates should be SEPv3 public estimates; say that the visual model is v2.

## Third round of answers (before green light)
- Sound detail: inside heavily muffled; pack first; uncensored; gun is the star.
- Publishing: SEPARATE BETA LINK. Do not touch the live v40 artifact (https://claude.ai/artifact/UwuqtLMXFF6QTTkU7jNjXg) until Shawn says the overhaul replaces it.
- Licences: use both sound packs everywhere (private testers).
- Performance: best image, 30 fps fine. Load up to a minute OK, with a loading screen.
- Tank finish matches the setting (sand / green-muddy / whitewash). HKOI = remote weapon station on the turret roof in place of CROWS, 30 mm with its own sensor ball.
- Enemy losses shown plainly. Town: no civilians, evacuated.
- Seats: as many clickable controls as possible. Gunner sight: watch the AI gunner work (lase, range, lead, shot, fall, thermal noise). No manual firing.
- Return fire realistic (locate first, hits likely not certain, scooting teams may be gone).
- Support: artillery (minutes), wingman tank (seconds), friendly drone overhead (finds sites, corrects fire), attack helicopter/aircraft (rare, long battles).
- Ladder: about 10 rungs, all open, top rungs near impossible. Debrief: score out of 100 (survival, crew, decisions), timeline of orders vs AI vs best.
- Saving: per browser. Units: metric, military terms.
- Director pace: real time, slow-mo on key moments; replays; captions.
- Opening: title screen over a live battle scene (Play, Ladder, Engineer mode).
- Long battles: tank moving along a route; several waves with lulls; platoon fight.
- Nothing about HKOI to hide.
- STATUS: Shawn said do NOT start until he gives the green light. Waiting.

## Final rule (Shawn): double-check everything. Must not end as a laggy, unfixable mess.
- Git repo for the build with a commit at every checkpoint; any checkpoint can be restored.
- After every change: syntax check, engine invariants, browser regression; full 22-scenario audit before each publish.
- Performance budget tracked each checkpoint (draw calls, triangles, frame time vs v40 baseline); built-in FPS/benchmark overlay so Shawn can report real GPU numbers; quality presets as a safety valve.
- Code kept in separate modules, no more giant single-line files for new work.
- Assets: I may find my own from open libraries (credit in footer); no ripped commercial game assets fetched by me; user-supplied packs are his call. Workspace can only download from GitHub and package registries; other sources go via links -> Shawn's Google Drive -> Drive connector.
- Beta link only; live v40 untouched until he approves.

## Battlefield (terrain that matters)
- Line of sight: hills and buildings block sight (launchers, beams, HKOI radar and camera); hull-down positions; trees and crops hide teams and drones and can snag wires; missiles can hit terrain.
- Tank: AI driver seeks cover on a warning; berm drill (pop up, reverse back); route planning on covered routes; player picks the starting position and can order to named cover.
- Enemy: chosen ambush sites (clear shot, cover behind); moves between prepared positions on covered paths; waits for the tank to expose itself; spotter drones scout over the hill and guide fire/FPVs.
- Ground changes: craters and scorch marks; track marks, mud, dust trail; trees and buildings take damage. (Soft ground slowing the tank NOT selected.)
- Map: about 8 x 8 km, generated from a seed per setting (same seed = same ground).
- Setup: map screen with contours (place tank, facing, fallback cover); shading of where an enemy could have a shot (terrain analysis); place the enemy yourself in engineer mode; sensible default so you can just press play.
- Fog of war: only what the sensors and crew have. Unknown launchers hidden until detected or firing.
- ENGINE NOTE: this needs a real 2D world model (heightmap, positions, LOS ray casts) under the engine, which today is polar per threat. It will move the statistics; report how.
- Keep the enemy gunner / FPV views as a toggleable SPECTATOR mode (fog of war off while in it), separate from play mode.

## AI logic: "good but clunky", take it to the next level (all actors)
- Tank crew, driver, HKOI fire control, enemy teams, drone pilots, spotters, wingmen, support: decisions should look continuous and purposeful, not scripted switches.
- Shared approach: each actor has (1) perception limited by its own sensors and sight lines, with memory of last known positions; (2) a small set of goals scored every decision tick (utility), with commitment/hysteresis so it does not flip-flop; (3) smooth execution (path following, turn/accel limits, reaction delays that depend on stress and skill); (4) coordination by messages with delay (radio), not by shared global knowledge.
- Explainable: every decision records why (for captions, debrief, inspect panel).
- Deterministic from the seed, so replays and the consistency test still work.
