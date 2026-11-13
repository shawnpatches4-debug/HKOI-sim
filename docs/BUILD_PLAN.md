# HKOI Simulator Overhaul: Build Plan

Prepared 13 November 2026 from your answers. Estimated 120 to 170 working hours, two to four weeks on the calendar.

## Ground rules

- **All current mechanics stay.** The fight logic you have shaped is kept and improved, not replaced.
- **Double-check everything.** Tests after every change, all scenarios checked before every publish, a saved snapshot at every checkpoint so any phase can be rolled back.
- **No laggy mess.** A performance budget is tracked at each checkpoint. You run a one-click benchmark and send me the frame rate.
- **Separate beta link.** Your current version (v40) stays untouched until you approve the replacement.
- **Honest numbers.** Anything that makes the sim more realistic goes in, even if it is worse for HKOI, and I report how the results moved.
- **Updates every 10 minutes with pictures** while I work.

## What gets built, in order

### 1. Bug sweep
Run all 22 scenarios through every camera looking for errors. Confirm the features I built but never saw working. Fix what turns up.

### 2. Graphics library upgrade
Move the sim from its 2021 3D library to a recent one. Groundwork for better lighting and effects. Done first so nothing new is built on the old base.

### 3. Battlefield foundation
The biggest single piece. Today the world is flat and every threat is just a range and a bearing.

- A real 8 by 8 km map with heights, generated from a seed.
- Hills and buildings block sight for launchers, guidance beams, and HKOI's own radar and camera.
- Trees and crops hide teams and drones. Missiles that cross a ridge or building are lost.
- Fog of war: you see only what sensors and crew have found.
- A map screen: contours, where to place the tank, shading that shows where an enemy could have a shot, enemy placement in engineer mode, and a default so you can just press play.
- A flat-ground mode stays so today's scenarios and statistics still reproduce.

### 4. Four worlds, four conditions
- **Worlds:** Eastern European farmland, desert, evacuated town edge, forest and hills.
- **Conditions:** night with a realistic thermal imager, dawn and dusk, rain with fog and mud, snow.
- Cinematic look: colour grade, dramatic lighting, grain.

### 5. Sound engine
- Heavily muffled inside the hull: engine, intercom, breathing, blasts as dull thuds.
- The 30 mm gun as the star of the mix.
- Deep blasts with delay by distance, ringing ears after a hit.
- One clean voice line at a time. Your sound pack first, uncensored.
- Ambient world: engine, tracks, wind, rain, distant battle, hull creaks.

### 6. Effects and the tank
- Explosions, fire, smoke with real volume.
- The obscurant cloud: physically plausible, with a subtle highlight so it is always visible.
- Tank finish that matches the setting. Suspension, recoil, dirt, visible damage.
- HKOI as a remote weapon station on the turret roof with its own sensor ball.
- Dug-in enemy positions with nets, backblast and dust.
- Catastrophic kills. Craters, scorch marks, track ruts, dust trails, damaged trees and buildings.

### 7. Armour model and hit camera
- Plate-by-plate M1A2 SEPv3 using public estimates, labelled as estimates.
- X-ray replay of each hit: the path through the vehicle, fragments, modules and crew struck.
- Module damage readout.

### 8. Film director
- Automatic cuts between the best angles.
- Slow motion on key moments, a replay from another angle after a kill or hit.
- Captions saying what happened and why.
- Enemy gunner and drone views kept as a toggle-on spectator mode.

### 9. Four full seats
- Commander, gunner, loader and driver, each with as many working controls as possible.
- Gunner's sight where you watch the AI lase, range, lead and fire, with thermal noise.
- Crew cameras filmed from the real 3D heads. The drawn faces go once this works.

### 10. Smarter everyone (AI overhaul)
For the crew, HKOI's fire control, launch teams, drone pilots, spotters, wingmen and support:

- Each sees only what it could see, and remembers where things were last seen.
- Decisions are weighed several times a second, then held, so nobody dithers.
- Smooth movement with real turning and acceleration limits.
- Coordination by radio, with delay. Mistakes come from stress and pressure.
- Every decision records its reason for captions and the debrief.

### 11. The enemy
- Chosen ambush sites, moving between prepared positions, waiting for the tank to expose itself.
- Shoot and scoot, coordinated timing, misfires and nerves, reacting to HKOI within the raid.
- Spotter drones over the hill. Hovering bomber drones dropping grenades.
- Infantry on the move. Losses shown plainly.

### 12. The tank fights back
- Uses the ground: hull-down positions, the berm drill, heading for cover on a warning, covered routes.
- Main gun on located launch sites, coax and commander's machine gun.
- Support: wingman tank, friendly drone overhead, artillery minutes away, a rare air strike.
- Support vehicles, wrecks and battlefield clutter.

### 13. Long battles
- The tank moving along a route.
- Several waves with lulls.
- A full platoon fight.
- Short raids remain for the ladder.

### 14. Ladder and debrief
- Ten raids, all open, top rungs near impossible.
- Score out of 100 for survival, crew and your decisions.
- Debrief: a timeline of your orders against the AI's choice and the best choice.
- Threat-by-threat story, free-camera replay, a shareable one-page summary.

### 15. Title screen and two modes
- Title screen over a live battle: Play, Ladder, Engineer mode.
- Play mode kept simple. Engineer mode with every dial.
- Metric, military terms.

## What stays as it is
- The engagement maths: missiles, HKOI fire control and cloud, Trophy, drones, jammer.
- Crew stress, roles, casualties.
- The thinking enemy, operator skill, the statistics batch, the classic layout.
- Your scenarios and settings.

## Limits you should know
- **Look:** a large step up, but built mostly from code in a browser. It will not match War Thunder or GHPC.
- **Tank model:** the 3D model is an SEPv2. Armour figures will be SEPv3 public estimates.
- **Seat interiors:** functional more than beautiful unless a licensed interior model turns up.
- **Crew heads:** I have not checked the models' faces close up. I will show you before removing the drawn ones.
- **I cannot see motion or hear sound.** You are my eyes, ears and frame-rate meter at each checkpoint.
- **Size:** I expect to simplify a few items along the way. I will say what and why when it happens.

## What I need from you
- Install the Claude GitHub App on `HKOI-sim` so backups can be pushed, and make the repository private when you can.
- Run the benchmark and listen to the audio at each checkpoint.
- Drop files into Google Drive when I send links to assets I cannot download directly.
