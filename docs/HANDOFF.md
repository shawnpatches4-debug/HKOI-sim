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

## State after the Claude Code session of 13 Nov (beta 0.24, published, not yet confirmed by Shawn)
Priorities 1 to 5 are all in the code and on the beta page: enemy AI and stride (0.21), enemy sight reticles to true scale + team menu + close-up camera (src/app/enemyviews.js, cameras.js), tank animation (recovered from the live page, see WORKLOG), and a rebuild of enemy weapon handling that Shawn asked for mid-session.
Waiting on Shawn's eyes: all of the above. Known gaps are listed in the last WORKLOG entry.
BEFORE PUBLISHING, ALWAYS compare the live page with git (Artifact read + file list): the page has been ahead of the repository once already.
AI REBUILD: all three stages are in the code; latest published build is beta 0.30 (animation and crew voice pack merged; fixes after his 0.28 feedback: see the last WORKLOG entry). Shawn has not yet judged 0.30. No helper branches are waiting to be merged. Two helper jobs may have left branches to merge: enemy crew animation and the crew voice pack.
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
