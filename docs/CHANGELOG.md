# HKOI Mission Simulator v7 (Pax Kinetics)

`hkoi-mission-sim.html` is the interactive simulator: one file, open in any browser.
It is `ui.html` (interface) with `engine.js` (mission engine) pasted into its second script tag.
The JavaScript engine is the reference model; the older Python package in `../hkoi_sim/` predates it.

Tests (Node 18+), run from this folder:
```
node tests/invariants.js   # 7,200 random raids across random setups: 25 logic/physics rules + replay determinism
node tests/final.js        # headline survival by design and scenario (1,500 raids each)
node tests/audit.js        # per threat type: detection, HKOI engagement, APS, hits
```

## What changed in v5 (2026-11-11)
- Inputs aligned with the HKOI spec sheet: M230LF 30x113 mm, 805 m/s, lock-break at OD 2.0 (1% transmission),
  flake/fibre fill at the literature value 0.85 m2/g, APS with 6 interceptors, belt of 80 obscurant + 40 HE.
- Finding: with those inputs a 4-round burst of ~40 g rounds never reaches OD 2.0 on the beam once placement scatter
  and cloud spreading are included (cut rate 0%). Two fixes work: a fill with ~2 m2/g at 1.06 um (fine carbon), or
  longer bursts. Recommended setup: near-IR fill, 6-round burst.
- New: unguided RPGs (HKOI holds fire, APS handles), fire-and-forget IR missiles (HE only), Stryker-class host with no APS,
  wind-dependent cloud spreading, cost and interceptor-savings metrics, margins of error.
- New tabs: Overview (3D replay, value tiles, how it works), What matters (tornado sensitivity + chamber-test pass line),
  Assumptions (every input with its basis, known limits, what to test first, how the model was checked).

## Headline (3 launches, open, clear, halted; 1,500 raids)
No protection 12% | APS only 63% | spec round 4x flake 76% (cloud never cuts; gain is HE and APS cueing) |
8x flake 80% | 4x near-IR 88% | 6x near-IR 91% | 120 g x4 flake 91%
Scenarios with the recommended setup: RPG bait x5 84% (APS only 51%) | IR fire-and-forget 83% (62%) |
Stryker, no APS 50% (12% unprotected) | six drones 85% | six launches in 3 s 73% | city, APS held 44%

## What changed in v6 (2026-11-11)
- 3D replay rebuilt: vehicle with a slewing HKOI mount, tracers, muzzle flash, laser beam that visibly stops at the cloud,
  slow motion and callouts at each beam cut and kill, terrain and weather, timeline scrubber, live threat status chips,
  three cameras (orbit, overhead, ride the missile) and full screen.
- Raid wall: one square per simulated raid, switchable between your setup, APS alone and no protection (same enemy
  launches in every view). Click a square to replay that raid.
- Compare tab: round shoot-off (all five round designs in the current fight) above the raid-size study.
- What matters tab: engagement envelope (single-missile defeat rate by launch range for Kornet, Vikhr, SACLOS, HKOI alone).
- Copy-summary button, animated headline, keyboard control of replays (space, left/right arrows), results first on phones.
- Engine: `enemy.range_band` study hook. Envelope finding: Kornet 0% inside 600 m, about 75% beyond 0.9 km; Vikhr 37-51%;
  radio-command SACLOS about 31% (limited by late detection and the 60% tracker-break assumption).

## What changed in v7 (2026-11-11)
- Kornet-class launches never start closer than `enemy.kornet_min_m` (default 2,000 m; slider under Enemy tactics).
- Post-cut diagnosis (`node tests/kdiag.js`): of Kornets HKOI fires at, 94% are cut; the cut lands about 500 m out because the
  cloud needs 2-3 stacked puffs (0.74 s after the first round passes). What a blind missile does next is an assumption:
  lift kept 50-100% (old default) 74% miss | 0-100% (new default) 81% | holds course 80% | free fall, spec sheet 91%.
  The old default happened to be the worst case: its sag put blind missiles right onto the hull.
- New option "Falls freely, no lift (as in the spec sheet)"; "holds its last course" is no longer labelled worst case.
- Adaptive burst (`fc.sustain`, up to `fc.sustain_max` extra rounds): the gun keeps feeding the cloud while the radar shows the
  missile could still recover and no other threat needs the gun. Helps far meet distances (defeat chance at 1.3-1.5 km
  0.45 -> 0.70); at the optimum 600-700 m the burst already spans the rest of the flight, so it changes little.
- The meet-distance optimiser now includes follow-up bursts and a small ammunition charge.
- Tested and rejected: a far-then-near layered doctrine. It used 3x the rounds for no gain, because placement scatter at
  1.5-2 km (2 mrad dispersion) puts most puffs off the beam.

## v8: crew confidence, stress and evasive drill

- New `crew` config block. A few seconds before each threat arrives the crew judges how sure they are it will miss (what fire control shows, scaled by their trust in HKOI, plus the APS, minus pressure from other threats, with noise by experience). Below the threshold the driver moves; well below it, smoke is fired.
- Moving beats a blind missile (it flies at where the vehicle was) but not a guided one, and a moving vehicle degrades HKOI's aim. Smoke hides the vehicle from gunners but also blinds the crew and HKOI's camera.
- New outcomes: `hkoi_evade` (cut by HKOI, dodged by the driver) and `crew_smoke`. New metrics: `crew_peak`, `crew_calm/alert/stressed/panic`, `crew_evade`, `crew_smoke`, `crew_steady`, `crew_blind_s`.
- Interface: crew status in the 3D replay and the 2D replay, stress row on the timeline, "The crew under fire" card, a crew-stress colour mode on the raid wall, and a crew drill shoot-off in Compare.
- Reference run (2,000 raids, 6-round near-IR): HKOI+APS 92.6% (crew moved 59%, panic 13%), APS alone 63.3% (95%, 57%), no protection 33.0% (100%, 67%). With the crew model off: 92.7 / 63.3 / 12.9.
- The crew model is illustrative and not based on crew trials. `tests/crewstudy.js` reproduces the numbers.

## v9: realistic 3D replay and fluid interface

- The 3D replay is rebuilt: sculpted terrain with distant hills, sky with moving cloud, sun and soft shadows, weather (haze, rain, dust, fog), woodland and city scenery, a detailed tank or wheeled vehicle with the HKOI gun on its weapon station, modelled missiles, helicopters and launch teams.
- Effects are particle based and are pure functions of time, so scrubbing works: billowing obscurant clouds (dark for carbon fill, pale for flake), exhaust trails, tracer streaks, muzzle flash and smoke, airbursts, APS intercepts, ground impacts, a burning vehicle, track dust and the smoke-grenade screen. Bloom, vignette and film grain are applied after rendering.
- Cameras: Director (cuts to a side-on shot for each beam cut and a close shot for hits and intercepts, in slow motion), Free look (drag), Overhead, Chase the missile, Enemy sight.
- "Labels and beams" switch hides everything that is invisible in reality (lasers, radar lines, range rings, tags).
- Watch a mission now uses the same 3D player, with event stepping, speed control, a draggable threat timeline and the event log.
- Interface motion: tab transitions, animated bars and curves, animated explainer, styled sliders. Honors reduced-motion settings.
- Rendering quality steps down automatically on slow devices. Without WebGL a flat plan view is shown instead.
- The engine and all numbers are unchanged from v8.

## v10: 3D flight physics, live sandbox, crew station

- New physics core (engine.js `engageObscurant`): from the moment HKOI fires, each guided missile is flown in 3D every 20 ms with a second-order steering autopilot (2.5 rad/s, damping 0.7, 0.12 s lag, 15 g limit) and gravity. The beam is lost when the obscurant column between the missile's tail and the launcher, integrated through the true 3D positions of the drifting, spreading puffs (`columnTau`), passes the lock margin. Blind missiles keep their velocity and fly on under gravity, trim and lift, and reacquire only if the beam clears while they are within the beam field. A second missile on the same beam is flown through the same cloud. Trajectories are kept for display.
- Adaptive bursts are now decided at each firing moment from what the radar sees, not from a forecast.
- Engine hooks for hand-placed raids: `cfg.enemy.fixed`, `cfg.vehicle.hull_deg`, `cfg.env.wind_dir_deg`, `cfg.enemy.no_dismounts`.
- Live sandbox tab (first tab): place launchers on a true-scale map, launch, watch in real time at 1:1 scale. Cameras: Commander, Gun camera, Chase missile, Enemy gunner, Overhead, Free look, plus a gun-camera inset. Any change re-fights the raid with the same dice.
- Crew station: threat-warning and radar scope, fire-control list with solutions and countdowns, magazines and APS rounds, crew stress, event log. Shows only what the crew knows.
- Reference run, 2,000 raids, recommended round: HKOI+APS 90.3% (v9 92.6%), APS alone 63.3%, no protection 33.0%. Beam-cut rate 88% (v9 91%). Missiles that reacquire the beam: 0.65 per raid (v9 0.14). Spec-sheet 4-round burst now cuts 27% of engaged missiles (v9 3%).

## v11: crew evasion and panic, inside the turret, maximum graphics

- Crew engine rewrite: the driver steers in 2D (turns the hull square to the threat, left or right, forward or reverse, weighing every missile still in the air; weaves; 30°/s turns; 4.5 m/s reverse). Stress builds from warnings, multiple inbound missiles, near misses, freezes and hits. Panic lowers trust in the warner, adds aim noise and delay, raises smoke use, and can make the driver flee down the threat axis or freeze (veteran 12%, trained 30%, green 45% of panics). New `rec.radio` intercom lines (Commander, Gunner, Loader, Driver) whose wording follows stress; `HK.crewPos(c, t)` gives position, heading and speed.
- 2,000-raid study, recommended round: survival HKOI+APS 89.5%, APS 62.2%, none 31.0%. Crews reaching panic: 29% with HKOI+APS, 69% APS only, 81% unprotected.
- Sandbox: "Inside the turret" camera from the commander's seat. Gunner and loader (Microsoft Rocketbox avatars, MIT) react: heads snap to the threat clock, trembling, flinches at hits. The HKOI panel shows the live scope, fire-control list, intercom and driver's orders; the gun-camera screen and vision blocks show the real outside world. Combat lighting, warning lamp, breathing and shake scale with stress; sparks and smoke when hit.
- Panic emphasis: red vignette and colour drain with stress, pulsing at panic; blinking MISSILE WARNING with clock bearing; hit flash; intercom subtitles; synthesised sound (warner, engine, gun, blasts delayed by distance at 343 m/s, APS, heartbeat that speeds up with stress); optional spoken intercom.
- Graphics: detailed true-scale tank (tracks, road wheels that turn, ERA, cupola, APS, HKOI station), image-based lighting from a Poly Haven HDRI (CC0), ray-marched volumetric obscurant clouds built from the engine's own puffs and extinction coefficient, wind-swayed grass, the vehicle drives its real path. Quality switch: Low, High, Maximum.
- Turret interior follows an Abrams-type layout: commander right rear with sight extension, control handle and HKOI display; gunner forward and below at the primary sight with control handles and computer panel; loader left of the breech; breech with recoil guards, coaxial machine gun, sliding blast door to the ammunition bustle, radios, fire bottles, quilted spall liner, diamond-plate basket floor.
- Asset files live in `assets/` next to the page (avatars as glTF JSON, sky as PNG panorama, because artifacts do not serve .glb or .hdr).

## v12: Abrams model, recorded crew voices and screams, knock-out sequence

- Exterior: M1A2 SEPv2 with Trophy (Sketchfab, open licence per Shawn; author credit pending). Extra hull and decal objects removed, simplified and quantised to about 11 MB (`assets/m1/`). Loads on High and Maximum quality; Low and phones keep the built-in model.
- Crew voices: 425 intercom lines pre-recorded with Kokoro TTS (Apache-2.0), four voices (Commander, Gunner, Loader, Driver), with stress-level variants (faster, higher, compressed and clipped when panicking), intercom bandpass, squelch clicks and hiss. Lines for missiles 7-10 are subtitles only.
- Screams, pain cries and grunts: 0 A.D. by Wildfire Games (CC-BY-SA 3.0). Killing hit: cries and overlapping screams; survivable hit: grunt and cry; APS bang close by: grunt. Panic breathing on the hot mic.
- Knock-out: blow-out panels launch, ammunition vents in flame jets, hull fire and secondary pops, paint scorches, gun droops, stowage burns. Crew bail out on the side away from the threat, jump down, run and go prone; the gunner limps. Inside-the-turret view cuts outside after 3.4 s. Captions stop at the kill.
- Rejected: the "with interior" Abrams file. Its turret mesh is named "Abrams_BF3" (ripped from Battlefield 3) and its textures include a watermarked VectorStock preview and Panther KF51 maps from another model.

## v13: turret traverse, evasive FPV drones, interior detail

- Engine: `gun.turret_assist_dps` (40): on slews over 15 deg the hull turret traverses with HKOI's weapon station, so the rates add (90 + 40 deg/s, 0.1 s spin-up). `enemy.drone_jink_g` (1.2 g, x1.6 on follow-up bursts): the unpredictable part of a drone's jink during the rounds' flight moves it off the proximity burst, scaling HE kill probability by R^2/(R^2 + d^2) with R = fuze radius + 3 m.
- 3,000-raid study, recommended round (HKOI+APS survival): default mix 90.2 (neither) / 90.2 (turret only) / 89.9 (jink only) / 89.9 (both); drone-heavy 96.4 / 96.4 / 95.1 / 95.1; five missiles in 4 s 79.4 / 79.6 / 79.2 / 79.7. Slew is rarely the bottleneck. Invariants pass.
- Sandbox: the turret traverses toward the engaged threat on both models (Abrams model split into hull and turret); the vision blocks follow the turret. FPV drones cruise, weave, jink once fired on, and dive onto the turret roof.
- Interior: commander's control panel (CITV, FLIR, LRF, GPSE, HKOI ARM, APS, LWR); CITV white-hot thermal screen; HKOI status display (mode, OBS/HE rounds left, mount bearing, turret offset); gunner's yoke with palm grips and triggers; turret network box; carbine rack; hydraulic reservoir; first-aid kit; HKOI quick-reference card; water bottles; brighter Abrams-white paint.

## v14-v15: real turret, urgent crew, sights, x-ray, enemies, command mode, review

- Turret: Abrams model split by triangle into hull, turret and gun; turret turns about its ring; the commander slews it onto each warning at 40 deg/s; HKOI's mount slews on top.
- Crew: react on the warning (drill); Abrams-class driving (pivot 45 deg/s, 12 m/s forward, 8 m/s reverse); gunner calls "driver, steady" while HKOI fires and the driver eases to 4 m/s. Finding: evasive driving does not raise survival with HKOI fitted (88.8 vs 89.9 with the old calmer crew, 3,000 raids); HKOI prefers a steady platform. Kept for realism.
- Voices: stressed and panicked lines re-recorded with Chatterbox (Resemble AI, MIT), voice-matched to each crewman; contact reports assembled from shouted fragments. Calm lines remain Kokoro.
- Sights: gunner's primary sight, commander's CITV (drag to slew), HKOI EO/IR sight with track box; 3x/10x/25x; thermal white-hot/black-hot from a simple apparent-temperature model; rangefinder, azimuth, rounds. Keys Z/X zoom, T thermal, B polarity.
- Damage and x-ray (dmg.js): hit zone from attack direction and turret angle; open-source armour and penetration estimates; jet and 35 deg spall cone through internal components and crew; never contradicts the engine's kill verdict. X-ray view with ghosted hull and colour-coded components.
- Visible enemies: two-man Kornet teams (kneeling gunner at the tripod, assistant, spare tubes, scrape) with backblast; drone operators with kit.
- Command mode: player orders (A/D/W/S/Q/X driver, G smoke, H HKOI weapons hold) replace the AI crew; each order re-fights the rest of the raid with the same dice. Engine: `cfg.player = { on, orders: [{t, kind}], hold: [[t0, t1|null]] }`.
- World and sound: day, dusk, night (thermals needed at night); stereo-panned launches and blasts; turbine whine.
- Post-battle review: outcome tiles, threat range chart with bursts, cuts and hits, crew stress, ammunition, per-threat data sheet, damage reports linking to x-ray.

## v16: fire-control lead, platoon, 300-round magazine, new turret interior and crew

- **Moving beam and lead.** The missile's guidance beam now follows the tank as it moves. Without lead, HKOI's clouds landed where the beam *was*, and the cut rate fell to about 27%. The fire computer now leads the beam: it uses the planned drive path for 1.2 s ahead, then extrapolates the measured velocity, and offsets the first round by 0.3 of the fuze radius.
  - Results over 3,000 raids, HKOI with APS:

    | Version | Survival | Beams cut |
    |---|---|---|
    | v15 fixed beam | 88.8% | 80.1% |
    | No lead | 79.9% | 26.7% |
    | Velocity lead | 87.5% | 73.9% |
    | Steering lead (the default) | 89.1% | 75.3% |
  - For comparison: APS alone 64.0%, no protection 33.8%.
- **Misses vs hits.** Missiles that skim the roof equipment now count as hits. Clean misses play a pass-by sound and then a distant impact.
- **Why not 99.6%.** The earlier 99.6% was not found in these files; the old dual-sensor study gives 94.7%. Once a beam is cut, only about 1% of missiles still drift into the tank, which agrees with the earlier sims. The mission sim also counts everything else that can go wrong.
  - Best case (one Kornet, tank parked, perfect warning, no jams): about 77% of missiles miss.
  - The losses: relock after the cloud thins about 12%, no time about 7%, cloud too thin about 1.5%, drift into the tank about 1%.
  - Relock is the biggest single assumption.
- **Magazine.** 300 rounds, split 150 obscurant and 150 HE, as a design choice.
  - Single tank against drones: 10 drones, 91% survive; 20 drones, 65%; 40 drones, 11%; 80 drones, 0%.
  - Beyond about 17 kills in one fast wave, the limits are rate of fire, radar tracks and having one gun.
- **Platoon mode.** 4 tanks in a wedge or line, spacing 50–400 m. Threats are spread round-robin across the tanks, and each tank runs its own fight. There's a platoon camera and a per-tank review table.
  - Shared fire control between tanks is not modelled yet.
  - New presets:
    - Overkill 80-drone wave
    - Platoon 16 Kornets over 90 s
    - Platoon 80 drones over 3 min
- **Turret interior rebuilt.** Laid out from photos of a real Abrams interior and published cutaway diagrams:
  - cream interior, recoil guard, bustle ammunition behind the blast door, and the driver in the hull;
  - views from the commander's seat and the loader's side, plus a cutaway from above;
  - an animated crew whose movement speeds up with stress, who look toward the threat, flinch on hits, brace, and bail out.
- **Voices.** Re-rendered with Chatterbox from LibriVox public-domain readers, at three stress levels. Turn-taking is fluid but hectic: calm voices wait for the channel, stressed voices overlap, and panicked voices step on each other. Engine noise ducks under speech, and there's platoon net chatter.
- **Mission editor.** Drone posts can fire up to 10 each. With more than 12 threats in flight, only the 10 nearest are labelled.

## v17: enemy gunner jitter, tank duel, crew behaviour by phase, new views, shared platoon fire

- **Enemy gunner jitter** (`enemy.gunner_jitter_mrad`, default 3 as chosen by the designer; slider in the mission editor). The aim line wanders: half slow drift (0.3-3 Hz), half hand tremor (8-12 Hz); the missile follows through its own guidance lag. Applies to beam-riding, radio-command and laser-homing missiles.
  - Survival, none / Trophy / HKOI + Trophy: 0 mrad 35 / 64 / 89%; 0.3 mrad 34 / 66 / 89%; 1 mrad 52 / 79 / 96%; 3 mrad 86 / 95 / 99%.
  - At 3 mrad most missiles miss on their own, and HKOI's cut rate falls to about a third because the missile wanders outside the 5 m fuze radius. Real aim-line error on a mounted launcher is probably nearer 0.1-0.5 mrad: open question for the designer's data.
- **Combined arms** (`duel`): an enemy tank fights the vehicle with its main gun while the raid comes in. Lay time, reload and hit chance worsen with every inbound missile the crew is tracking. Enemy rounds are threats nothing can intercept. The main turret cannot assist HKOI's slew during the duel. 400 raids: adding a tank at 1.8 km takes survival from about 99% to about 80%; the duel is won about 82% of the time.
- **Crew behaviour by phase**: calm, alert, stressed, panic, shock, bail-out; each role cycles role-specific actions per phase (pose, gaze, label). Follows the posture rules: thresholds 30 / 56 / 81, 0.4-0.8 s blends, crew stay at their stations in panic, 1-2 s visible freezes. Bones driven: Spine, Spine1, Neck, Head, L/R Clavicle, UpperArm, Forearm, Thigh, Calf. A live readout lists what each crewman is doing.
- **Views**: driver's seat with three working periscopes and a driver's display; look-through commander's vision blocks; commander's tactical display (hull-up threat plot, time to impact, HKOI / Trophy / main gun / platoon status).
- **Platoon shared fire control** (`HK.platoonShare`): a tank with a free HKOI gun and HE left shoots at a threat about to hit a neighbour within 600 m. 40 drones over 2 min: tanks left 3.50 to 3.73, all four survive 57% to 73%. 80 drones over 3 min: 2.00 to 2.03 (everyone is saturated). Also reports how long a neighbour's obscurant cloud blocked each tank's sight lines.
- **Review additions**: radar exposure (time transmitting, chance of being located, expected follow-up strike), size-weight-power estimate (about 490 kg with 300 rounds of 30 x 113 mm), and a sensitivity table (payload per round and the recovery range matter most; cloud spreading rate matters least).
- Correction: 300 rounds of 30 x 113 mm weigh about 115 kg, not the 250-300 kg stated earlier.

### v17.1 fixes
- Commander's view: the roof now has real hatch openings; his head sits up in the cupola at eight working vision blocks, and drops below the roof when you look down to see the crew.
- Hit boxes: the vehicle now presents its length (7.9 m) to flank shots instead of its width from every angle. Missiles that miss through gunner jitter are drawn where they actually go (wide, over, or into the ground short), not straight through the tank.
- Drone engagement range checked: opening fire at 800 m is the best of 800 / 1000 / 1200 / 1500 m (survival against 20 drones in 60 s: 58 / 44 / 46 / 37%) because jinking drones dodge longer shots. The log now says when HKOI is tracking and holding fire. Missiles are engaged as soon as the radar track allows (tracked at about 2.5 km, first cloud at about 1.3 km).
- All 21 duel voice lines are in.

## v18 (first block: models, crew, optics, sound)

- **Optics rebuilt.** The outside is rendered as two 120-degree views either side of the turret axis; every device shows its true slice of it by bearing, width and height: eight unity-power vision blocks round the cupola, the loader's periscope, the driver's three periscopes. Views vibrate with speed and gun fire, the glass carries a dirt film, and blocks facing a hit crack.
- **First person.** The commander sits up in the cupola at his vision blocks and drops below the roof when you look down. In the driver's seat you see your own arms and gloved hands closed round the T-bar, which follows them as he steers.
- **Crew.** Jaws move when a crewman speaks (bone MJaw), with small head and shoulder movement scaled by stress; fingers close on controls (Finger1-4 chains); the gunner's handles and the driver's T-bar sit in the hands. The loader's drill is visible: the blast door slides, a round leaves the rack (which empties as the main gun fires) and travels in his hands to the breech. Intercom lamps light at whichever station is talking.
- **Interior detail.** Stencils, weld seams and stiffeners, anti-slip floor plate, breech ring and operating handle, auxiliary sight, ammunition-select panel, switch rows, intercom boxes, master-caution lamps that flash faster in a panic, the driver's side consoles, pedals and gear selector.
- **Outside.** A rebuilt T-72B3-style enemy tank (camouflage, reactive-armour tiles, skirts, fuel drums, snorkel); craters that stay where rounds struck; the engine deck no longer turns with the turret.
- **Sight effects.** The sight picture softens and trembles with stress, carries lens dirt, shows rain on the glass, and the view drains of colour for a moment after a hit or near miss.
- **Sound.** Voice pitch and pace track stress continuously; panic lines are overdriven and boxy; short acknowledgements are sometimes swallowed or mumbled in a panic; "Driver, steady" is not called by a panicking gunner; an inbound tone closes up with time to impact; track clatter follows speed; a distinct 30 mm chain-gun sound; outside sounds are muffled when buttoned up; the platoon net drops out in a panic; your own station's voice is slightly louder.
- **New voice lines (44).** System status (Trophy side empty, HE and obscurant at fifty, HE out, gun jammed and cleared, sabot loaded), "Tank, front", the after-action crew report, and the order to move when the radar has been up too long.
- Not checked by ear or at full graphics quality: see the hand-over notes in the conversation.
- Added the gunner's seat (sight eyepieces, HKOI camera repeater, panels) and a head-out-of-the-hatch view for the commander (keys 6 and 7).

### v18c: credibility block
- **Assumptions tab.** Every input now carries a confidence rating (High / Medium / Low) with a one-line reason, next to its source tag. New rows: enemy gunner jitter, vehicle target size, airburst HE against drones, radar tracks, tank duel, platoon shared fire.
- **Stress test.** One button re-runs the same raids with each of 16 critical assumptions made 30% worse, then all at once, ranked by effect, with a noise threshold. Default setup at 3 mrad jitter: as configured 97.3%; worst single assumptions are Trophy kill chance (-2.6 pts), cloud spreading (-1.5), a steadier enemy gunner (-1.4), faster re-lock (-1.3); everything at once 85.1%.
- **Measured data.** Paste CSV lines (parameter, value, source) to replace assumed cloud, laser-warner, fuze, dispersion and jitter values. The run is labelled, the table shows the source, and unknown parameter names are rejected.
- **Checks on every batch.** Nine rules run on a 40-raid sample after each run (one outcome per threat, no shot before a radar track, magazines respected, Trophy magazine respected, hit accounting, a cut needs a cloud, event times in range, replay determinism, probabilities valid) and show pass or fail.
- **Reproduce this result.** Seed, raid count, results with margins of error and every non-default setting, as copyable text.
- **Known limits** updated: gunner jitter caveat, platoon and duel scope, what is not modelled, sound and graphics are illustration only.
- **Sandbox review.** "Why the hits got through" lists the chain of failures for each hit in plain words, with the most common cause; "Export this raid" gives CSV (per-threat timings, totals, event log) or JSON (seed, mission, settings), with a copy button.
- Already present before v18 and left as they were: margin of error on the headline, baseline comparison (your setup, APS alone, no protection, same launches), sensitivity studies.

### v18d: interface block
- **Compare setups on one raid** (post-battle review): the same launches and dice under no protection, Trophy only, HKOI only and HKOI + Trophy, side by side, with cells that differ from your setup outlined.
- **Threat progress pips**: five dots on each threat row (detected, radar track, HKOI fires, cloud or airburst, result); skipped steps show dotted.
- **Briefing** before each preset, with a Start button (Enter).
- **Keyboard list**: the "Keys ?" button or the ? key.
- **Undo** for the enemy layout (button or Ctrl+Z), 40 steps.
- **Mission notes**: a note and the dice seed are saved with each mission and shown in the load list.
- **Tooltips** on the mission-editor settings.
- **Colour-blind-safe palette** toggle (Okabe-Ito colours; blue for good, vermilion for bad), remembered in the browser.
- Enemy gunner jitter: the designer confirmed 3 mrad is for a mounted launcher. Confidence raised to Medium; the notes now ask for the source to be cited and a lower value to be run alongside.

## v19 (2026-11-12): carry-over, thinking enemy, friendly vehicles, drone fixes
- **Carry-over (campaign.js):** "Fight the next raid with this tank" keeps ammunition, Trophy rounds per side, system damage (11 systems: ok / damaged / destroyed), crew wounds, fatigue and resting stress. Damage maps to engine settings (e.g. damaged HKOI mount: half slew, 1.5x dispersion, 3x jams). Live vehicle status panel. Six raids, 3 mrad jitter, 200 runs: alive after raid 6 = 26% none / 57% Trophy / 86% HKOI + Trophy.
- **Thinking enemy (tactics.js):** enemy commander with beliefs (counts of happened / did not) about beam cuts, APS, drone losses; draws from each belief, scores every attack it still has weapons for, fires the best. Tactics: probe, paired launch (0.5 s gap), simultaneous salvo, late lasing (2.5 s; 18% hasty-miss penalty is an assumption), drones, drones from behind, strip-the-APS-then-strike, combined, close rocket assault; breaks contact when nothing is likely to work. Forces: section / platoon / company. Skills: scripted / adaptive / expert.
- **Friendly vehicles:** thinking-enemy scenarios ask how many friendly vehicles (0-3 more). Hulls fan across the threat axis so masked rear arcs do not coincide; survivors re-fan after each wave. Neighbours now also put obscurant on a beam aimed at another vehicle (pEst x 0.75), sector owner first. Enemy concentrates on the weakest-looking vehicle.
- **Engine changes:** rear dead zone can be unmasked by swinging the turret (time cost; not during a duel) - ASSUMPTION TO CONFIRM; radar stays on after first contact within a fight; `late`, `tac`, `pair_gap` on fixed launches; `duel.max_shots_own`; `aps.mag_L/R`, `crew.fatigue`, `crew.stress0`.
- **Drone logic fixes:** no longer gives up after 4 bursts (was idle 20+ s while the drone flew in); lets the drone close ~120 m between bursts; re-engages after a jam; radar track channels freed once a drone has been dealt with. Single drone from 2 km, no Trophy: leak 10.5% -> 2.3%.
- **Results (adaptive platoon-size enemy, share of vehicles surviving, 150 fights):** 1 vehicle 0 / 5 / 52%; 2 vehicles 9 / 28 / 76%; 4 vehicles 38 / 63 / 89% (none / Trophy / HKOI + Trophy). Mutual support adds ~4-6 points; the rest is dilution of enemy fire.
- Tests: invariants (7,200 missions) pass; tfinal presets pass; tcarry, tadp (1 and 3 vehicles) pass with no page errors.

## v20 (2026-11-12): interface redo
- Three modes in the header: **Fight a raid** (sandbox), **Run the numbers** (batch study with its settings and result tabs), **Reference** (assumptions, glossary).
- Fight a raid: one toolbar (scenario, protection, friendly vehicles, enemy commander, dice); the 3D scene fills the width and most of the height; one status panel on the right (crew, ammunition, vehicle summary on top; Threats / Enemy and friends tabs; recent events). Playback and after-raid actions on one row, cameras on the next, display and sound options in one popover.
- Everything else is behind five tabs under the scene: Place the enemy, Mission conditions, Round and settings (the former left column, now three columns), Save and share, After-action review.
- Mission conditions only shows dials that apply (enemy-tank and platoon dials hide when unused). Vehicle status collapses to one line when nothing is damaged.
- Implemented as ui2.js + ui2.css, which only move existing elements; every control keeps its id. "Switch to the classic layout" in the footer restores the v19 layout.
- A wave aimed at another vehicle switches to the platoon camera automatically.

## v21 (2026-11-12): ground contact, pause-and-inspect, platoon view
- **Ground contact:** every flight height is now measured above the ground under the missile (terrain-following transform), so nothing flies through a rise; a missile that meets the ground detonates (fireball and crater) instead of a dust puff.
- **Friendly vehicles' incoming missiles** follow the engine's 3D flight path (cut missiles sag or drift) instead of a straight line.
- **Platoon camera** sits low behind the group and looks toward where the attack is coming from, so a wave aimed at another vehicle is visible (was a near-empty top-down view).
- **Pause and inspect (button or I):** for one threat: status, range, time to impact, guidance state, cloud optical depth on the beam against the blocking threshold, missile height against its aim line; a chart of optical depth over time and a view down the beam with the cloud drawn against it. Engine now records `tau_s` and `phys` per obscurant burst.
- Note for interpretation: at 3 mrad gunner jitter only ~3% of Kornets in the ambush scenario are actually cut (the beam wanders several metres, so the cloud rarely blocks it); ~81% miss on their own. At 0.3 mrad about 16% are cut. A missile that flies on straight after a cloud blooms was not cut.

## v22 (2026-11-12): crew by role
- New **Crew** tab. Each of commander, gunner, loader, driver has its own stress curve (`rec.crew.lines`, `HK.crewStress(c, t, role)`), with dials for reaction to danger (gain), recovery speed and, for commander and driver, tendency to freeze. Global dials: fatigue, resting stress.
- **Commander's task queue:** orders and judgements are serial (`crew.queue`, on by default; `rec.crew.tasks`). A threat arriving while he is busy gets a late decision or none (`cdr_busy` tag). A panicking commander can freeze 1-2 s before deciding.
- Role effects: commander's stress drives judgement, delay and smoke; driver's stress drives stall/flee; gunner and loader gains scale duel lay time, hit chance under load and reload.
- Measured (six Kornets in 7.5 s, 0.3 mrad jitter, 400 raids): queue on 68% survive vs off 76%; standard 3-missile raid unchanged within noise (96.9% at 3 mrad, 78-79% at 0.3 mrad).
- Counter-intuitive but real in the model: a rattled commander survives more often than a calm one in the saturation raid (71% vs 54%) because panic triggers the smoke grenades, and smoke works. The lever is the smoke doctrine setting.
- Fix: a jam on the first burst followed by a successful re-engagement now records the firing time (invariant `sever_without_fire`).

## v23 (2026-11-12): simulation depth
- **Gradual seeker dimming** (`obs.partial`, on): as the cloud takes the beam toward the lock threshold, guidance noise grows as exp(tau - tau_need) x `obs.dim_noise_ms2` (default half of max lateral acceleration; assumption). Effect on survival: none measurable.
- **Turret inertia** (`gun.slew_acc_dps2` 400, assumption): short slews now take longer than rate alone implies. **Stabiliser upset** (`gun.stab_upset_mrad` 2, assumption): pointing error added for 1.2 s after the driver starts a move and 0.8 s after the main gun fires; HE bursts in that window lose 20% kill chance.
- **Enemy jamming** (`enemy.jam_radar`, `enemy.dazzle`): jamming halves radar pick-up range and makes tracks 2.5x less accurate; dazzling blinds the HKOI camera. **Drone jammer on the vehicle** (`ew.drone_jammer`, off by default; assumed 60% against radio FPV, fibre immune).
- Measured (4,000 raids, standard 3-missile raid, 0.3 mrad jitter): cut rate 30.3% (v22) -> 27.7% with inertia -> 24.9% with stabiliser upset -> 19.6% radar jammed -> 11.4% jammed and dazzled. Survival stays 77-79% throughout because Trophy catches what HKOI no longer cuts. At 3 mrad survival stays 97%.
- 20-drone raid (half fibre): leak 12.9% -> 8.8% with the drone jammer.
- Not done: neighbour smoke changing outcomes. The platoon is fought as separate per-vehicle fights patched together afterwards; doing this honestly needs the vehicles on one shared timeline.

## v24 (2026-11-12): rounds drawn where they went
- Display fix: HKOI rounds that did not burst were drawn along the missile's original launch line. Once the vehicle moves, its beam (and the missile riding it) shifts sideways by tens of metres, so those rounds appeared to fly nowhere near the missile. They are now drawn passing the target's actual position at that moment, offset by the engine's recorded miss distance. Rounds that burst were already correct. Missed airburst rounds at drones get a visible miss offset. Engine results unchanged.

## v25 (2026-11-12): What if, vision-block fix
- **What if tab:** fights the raid on screen 300 times (60 whole fights against a thinking enemy) as set up, then again with one change per row: without HKOI, without Trophy, steady or shaky enemy gunner, green or veteran crew, smoke at first warning, enemy jamming and dazzling, drone jammer, missile launch warner. Shows survival, 95% Wilson range, no-hit rate (or share of the group surviving), and whether the difference from "as set up" is outside the noise. Pauses playback while it runs.
- **Fix:** inside the turret, the Vision blocks view drew its black mask over the view-switch buttons, so they could not be seen. Buttons now sit above the mask.

## v26 (2026-11-12): scenario list rebuilt, vision ports, stress-driven panic voices
- **Scenarios rebuilt from scratch:** 22 in seven groups (Start here, Missiles, Drones, Close fight, Combined arms, Platoon, Thinking enemy). Every scenario resets the mission conditions and sets its own (gunner jitter, terrain, jamming, drone jammer, platoon, duel). Scenarios marked "expert gunners" use 0.5 mrad so protection visibly matters; the rest keep the 3 mrad default. Drone scenarios start at 1.3-1.7 km instead of 2-3.5 km. Removed: 80-drone "overkill" (0% for every setup). Audit of 200 fights each (none / Trophy / HKOI + Trophy), e.g. expert ambush 40 / 71 / 88%, saturation 17 / 55 / 65%, twelve drones 49 / 59 / 87%, forty drones 7 / 9 / 29%, town ambush 47 / 80 / 92%.
- **Vision ports:** periscope and vision-block cameras now clip the vehicle's own roof fittings (near plane 3.4 m), so the CROWS mount no longer fills the blocks. Per-frame random shake replaced with a small smooth sway.
- **Interior and crew refresh:** pale grey-green paint, lower ambient light, stronger dome lamps; crew uniforms tinted toward coverall olive, dark helmets, knife and pistol hidden. This is a tint, not new models.
- **Stress-driven panic voices:** 36 new generated lines (9 per crewman: hit, panic, wounded) in assets/voice_panic.mp3, indexed under `p` in voice_index.json. `SND.panicCue(who, tag, stress)` fires from each crewman's own stress curve: on crossing into panic, periodically while above 86, on a hit while stressed, and on being wounded (followed by a pain cry).
- **Rejected asset:** SOID_MOD_PTSD_v8 (War Thunder sound mod supplied by the user). Speech recognition of its 435 English clips shows infantry squad call-outs repackaged from a commercial shooter, not original recordings. Not used.
- Browser check: 18 of 22 scenarios played to the end with no errors before the test timed out; the remaining four (platoon vs drones, three thinking-enemy) use code paths covered by earlier tests but were not re-run on this build.

## v27 (2026-11-12): why cut missiles keep coming; cut-behaviour dial in the sandbox
- Investigated "cut missiles still hit most of the time". Engine result, expert ambush (0.5 mrad), HKOI + Trophy, 1,609 cut missiles: 40% fly into the ground, 30% pass wide (median miss 7 m, a third inside 6 m), 26% are still on course and are shot by Trophy at the vehicle, 4% hit. So about 30% of cut missiles still arrive, and roughly half look on screen as if they do.
- Causes: (1) the cut comes late, about 375 m and 1.5 s from impact, because the cloud only reaches blocking density once the whole 6-round burst (1.5 s at 200 rpm) has stacked; (2) a blind beam rider keeps the lead it had on a steadily moving target (computed miss about 2 m at that range); (3) the cloud thins or blows off the beam and about 18% of cut missiles get their beam back.
- Fire control already meets at the best range it can: defeat chance per missile peaks at 0.46 near 900 m and collapses beyond 1,000 m because the cloud does not last. More sustain rounds, an earlier warning (MAWS) and an always-on radar do not move the cut range. The growth round (120 g x 4) does: beams cut 17% -> 84%, cut range 373 -> 550 m, HKOI-only survival 46% -> 59%.
- Changing the missile's assumed behaviour after the cut (free fall / hold course) barely changes survival once the crew moves; the remaining hits are mostly re-locks.
- **Regression fixed:** v23's gradual seeker dimming is now off by default (`obs.partial`). Its noise magnitude was a guess and it made cuts about 70 m later (304 m vs 373 m) and cost about 2 points of HKOI-only survival. v23's note that it had no measurable effect was wrong.
- **New dial** in Mission conditions: "A missile whose beam is cut" (default drift, free fall per spec sheet, hold course, self-destruct), wired to `loss_behavior`.

## v28 (2026-11-12): sound mix cleaned up
- **Intercom is one voice at a time.** A line waits for the channel (warnings up to 2.4 s, ordinary lines 1.3 s, short acknowledgements 0.6 s) or is dropped; nobody is talked over or cut off. The earlier "stepping on each other in panic" behaviour is removed.
- **Voices have their own bus.** Previously one compressor carried everything, so every explosion pumped the voices down. Effects now go through their own compressor and dip to 42% while someone is speaking; a final limiter catches peaks.
- **Less clutter:** panic blurts only when the intercom is free, at most one every 4.5 s and never the same man twice within 6 s; at most two crew react to a hit, one after the other; explosion sounds thinned to one per three rounds and no more than one small boom per 0.22 s; inbound-threat pips slowed (max 5 per second, was 14), quieter, sine instead of square; heartbeat and breathing quieter and silent while someone speaks.
- Check: 35 voice clips scheduled over a saturation raid, 0 overlapping pairs, no errors. Not listened to (no audio in the test environment).

## v29 (2026-11-12): panic layer, honest crew reports, damage that bites inside the raid
- **Panic is back without the cut-offs.** A second "hot mic" layer lets a crewman blurt underneath whoever is on the intercom (quieter, off to one side, filtered) and never stops the main line. In panic a blurt comes about every 1.5-3 s, faster when a threat is within 5 s; stressed crew add short urging shouts; up to three crew react to a hit about half a second apart. Panic set grown from 36 to 84 generated lines (tags: hit, panic, wound, report, urge). Heartbeat and breathing raised part of the way back.
- **Crew reports match crew state.** The radio log is filtered against the damage model: a dead crewman says nothing after his death; a wounded one reports "hit" instead of "good"; the commander's "Good work" becomes "We're hit! Report!" if anyone is hurt; the driver does not report "still running" with the engine or tracks hit.
- **Destroyed modules stop working inside the same raid.** After a raid is fought, the damage model lists what each non-killing hit broke; if the HKOI mount, the HKOI radar, or the engine/tracks went down part-way through, the rest of the raid is fought again without them (`cfg.dmg`, `CAMP.fightOnce`, up to 4 passes). HKOI destroyed: nothing more is engaged (`hkoi_down`); damaged: three times the jam rate. Radar destroyed: no new tracks (`radar_down`); damaged: tracks 1 s late. Engine or tracks destroyed: the vehicle stops; damaged: turns at half rate. Used by the sandbox, platoon, thinking-enemy waves, What if and multi-raid runs. Not yet applied: laser warner, sights, stabiliser, turret drive, main gun within the same raid (they still carry over to the next raid), and the "Run the numbers" batch study.
- To make that possible each threat now has its own random stream, so one threat's fate cannot reshuffle another's dice. Every result shifts slightly (same statistics, different draws). Saturation raid, 0.5 mrad, 1,500 raids: 182 had in-raid system damage (radar 129, HKOI mount 65, mobility 59); survival 63.1% with damage ignored vs 62.7% applied.
- The user's sound mod is still not used (see v26).

## v30 (2026-11-12): the owner's sound pack is in
- **SOID PTSD v8 sound pack** (War Thunder crew-voice mod, US-English bank) added at the owner's direction; he states it is an open-source pack. The zip carries no licence file and the pack's page was not found, so the licence is **not independently confirmed**; the footer says so. Reverses the v26 decision, which rested on an inference (the lines are infantry call-outs) rather than on evidence of where the recordings came from.
- 113 of 435 clips used (193 s, assets/voice_mod.mp3, index under `m`): hit reactions, panic, wounded, screams, and hand-picked loading / loaded / fire / target destroyed / contact calls for commander, gunner and loader. Chosen by speech-recognition transcript: left out are lines that only make sense for infantry (patrols, HQ, "bring it in", artillery), the strongest profanity, and off-tone takes. No driver voice in the pack; the driver stays generated.
- Use: the panic layer takes the pack's line 80% of the time when it has one for that crewman and moment, otherwise the generated one; wounded crew at high stress follow with a pack scream; a kill adds three pack screams; a few scripted calls (loader "Up", commander "Fire", gunner "Target" / "Identified") use a pack take 70% of the time. Subtitles keep the scripted wording.
- New switch in Display and sound: "Sound pack voices" (on by default). Off returns to generated voices only.

## v31 (2026-11-12): a knocked-out tank stops
- From the killing hit on, a vehicle no longer fires HKOI bursts, Trophy or the main gun, and no longer moves (`rec.kill_t`; bursts, rounds, APS shots, duel shots and the driving path after that moment are removed or frozen in the engine record). Applies to your tank and to platoon and friendly vehicles. Missiles already in the air still arrive at the wreck.
- Checked on saturation raids killed part-way through: 0 bursts, 0 rounds and 0 speed after the kill. Invariants and the standard scenarios pass.
- Not modelled: a crew bailing out of a vehicle that is still alive (for example immobilised and burning). Today "bail-out" only happens with a kill.

## v32 (2026-11-12): jitter sanity check, damage called out on screen
- **Sanity check on gunner jitter** is now the first line of "What this run tells you": the share of launches that hit with no protection at the current jitter, against the 80-90% usually credited to Kornet-class missiles, flagged when below 45% at 1.5 mrad or more. Measured in this engine (3,000 raids, standard mix, crew reacting): 0 mrad 71% hit, 0.5 mrad 67%, 1 mrad 52%, 1.5 mrad 39%, 2 mrad 30%, 3 mrad 20%. The 3 mrad default is unchanged.
- **Mid-raid damage is announced** in the event log and caption: "HKOI mount destroyed by the hit: HKOI is out of action for the rest of the raid", and likewise for the radar and for engine or tracks.
- Re-tested on this build: thinking-enemy section (alone), platoon (2 friendly), company (1 friendly) for three waves each, no errors.

## v33: a cut is permanent (cloud-thinning re-lock removed)
- At the designer's direction the re-lock mechanic is off by default (`drift.relock: false`): once the beam is cut the missile never gets it back.
- Mission conditions has a switch, "Cut missile can re-lock as the cloud thins", to restore the old behaviour.
- Measured, expert ambush, 0.5 mrad, 1,500 raids: cut missiles still on target 30% -> 6%; Trophy shots per raid 2.47 -> 2.34; survival 89% -> 90%; lookup defeat chance at the 900 m meet 0.46 -> 0.61. At 3 mrad: 8% -> 1%, survival 98% both.
- Remaining ~6% are true drift hits (missile coasts on its last heading into a target that kept its course).
- Caveat: a cloud that never thins is the optimistic assumption. HKOI-only survival did not improve in this sample (45% -> 40%, within noise).
- Checks: invariants pass (7,200 missions), browser regression on 4 presets clean.

## v34: graphics load status in the footer
- Detailed tank, crew and sky are separate files that load after the page; a failure used to fall back silently to basic shapes.
- Footer now reports: loading, loaded, or which part failed and the likely reason (saved copy of the page, blocked 3D library, WebGL/hardware acceleration off, slow connection).
- Checked: served copy reports "detailed models loaded"; a lone saved copy reports the failure. No engine change.

## v35: enemy side, batch 1 (from beta feedback)
- Enemy view: unit menu (previous / list / next) to sit behind any launcher or ride any drone; weapon-appropriate sight overlays (optical mil reticle with stadia curve for Kornet/Konkurs/designator, RPG grid, TV gate for helicopter and IR), Russian/English status lines, gunner tremor on the sight picture. Reticles are representative, not reproductions.
- FPV camera view: wide lens, roll with the airframe, analog look, OSD (signal, battery, speed, altitude, distance), static that grows as the link weakens or near the vehicle jammer, signal loss at the end; fibre version is clean with cable-remaining readout.
- FPV models rebuilt in metres (drawn 2.2x for visibility): 10-inch X quad, top battery, tilted camera, PG-7 type warhead with contact whiskers; fibre variant with spool and trailing cable.
- FPV flight: S-turns 12-18 m wide (was ~1.5 m), stick twitch, altitude changes, banking, terminal hook round the tank (bearing swings, range unchanged so engine timing holds), expert low transit / hard breaks / feints / pop-up dive.
- Engine: `enemy.drone_skill` novice/trained/expert (jink x0.4 / x1 / x1.7; expert 25% chance a burst is wasted on a feint) and `enemy.drone_evasion` switch. Assumed figures. Trained = previous behaviour, baseline unchanged.
- Measured, 600 raids each: bursts per drone 1.4 (novice), 1.6 (trained), 2.1-2.3 (expert); drones through 2-3% -> 6-8% for expert; ten-drone raid with no hits 81% -> 55% (with Trophy).
- Not modelled: low flight does not delay radar detection; hook and dive do not change Trophy's chance.
- Sound pack check: the pack's "ru" bank contains the same 435 English clips as the en_us bank (all audio byte-identical; language detection English 20/20). Russian enemy calls are being synthesised instead (v36).
- Checks: invariants pass, 4-scenario browser regression clean, enemy view screenshots for Kornet and FPV.

## v36: fixes from first look at v35
- FPV camera shake: stick-twitch (0.35 m at ~7 rad/s) was driving the roll estimate; twitch cut ~80%, roll and heading low-pass filtered, camera roll scaled to 55% of airframe roll.
- Enemy audio (enemy view only): 18 synthesised Russian calls (spot, launch, tracking, hit, kill, miss, target lost, missile shot down, drone launch / attack / lost / hit), launch blast at the launcher, FPV motor buzz. Generated with Chatterbox Multilingual; 15 of 33 takes were rejected by automatic transcription check. Not checked by ear.
- "Drone pilots" selector under the 3D view whenever the raid has drones (same setting as the one in Mission conditions).
- Anti-drone airburst: new `rnd.he_drone_radius_m` = 12 (was fuze radius + 3 = 8). Anti-missile obscurant fuze unchanged. Effect (600 raids): bursts per drone 1.6 -> 1.5 trained, 2.1-2.3 -> 2.0 expert; expert drones through 6% -> 5%; ten-drone expert raid with no hits 55% -> 62%. 12 m is generous for a 30 mm airburst against a small quad.

## v37: drone view target, real Russian voices, crew muted in enemy view
- Drone camera now keeps the tank in frame (look direction blends 60-97% toward the tank as range closes), lens narrowed to 62 deg vertical, dashed bracket on the tank. Cause of "invisible tank": camera followed the flight path, which with weave and hook pointed away from the tank; and at 100 deg+ the tank was ~7 px at 400 m.
- Russian enemy calls now come from the owner-supplied Russian crew voice pack (1,230 clips; 168 of 186 sampled detected as Russian, rest too short to classify). 51 clips used: target calls, fire, left/right corrections, hit, target destroyed, drone ready / launched. Synthesised calls removed. Licence not independently confirmed; file layout matches the game's stock crew voice set.
- Tank crew voices, screams, radio net and warning tone are silent in the enemy view.
- A call plays when switching to a unit already in flight; voice list is cache-busted.
- Audio trigger verified by counting scheduled clips in a headless run (with the synthesised set); not checked by ear.

## v38: Patch A, crew (from beta feedback)
- Crew cameras: four face tiles (CDR/GNR/LDR/DRV) drawn in 2D, driven by each man's stress and casualty state: calm, tense, afraid, panic, wounded (grimace, blood), no response (dead), out of vehicle. Eyes widen and dart, brows lift, mouth opens, sweat, breathing and tremor scale with stress; feed jolts on a hit. Switch: "Crew cameras".
- Per-crewman casualties in the turret: the dead slump at their stations and stay there; uniforms darken with blood and spatter is placed round them; the wounded hunch and clutch the wound and are slower.
- First person: blood spatter on the view when another crewman is wounded or killed; if the man whose eyes you are using is killed, flash then fade to black, then cut outside after 5 s.
- Bail-out: dead stay inside; wounded come out of the hatch slower; an unhurt crewman waits by the track for each wounded man and they move off together at the wounded man's pace.
- Drone hit: FPV camera rides into the tank, feed breaks into static over 0.7 s after impact.
- Seen in screenshots: face window in four states, bail-out figures on the hull, blood overlay. Not yet seen: slumped dead inside the turret, first-person blackout, the helper pairing in motion.

## v39: drone impact, acted crew faces, first-person escape
- Drone "hit" that crashed into the ground: the drone flew to the tank's position at launch, so once the tank moved the impact point was empty ground. Drones now converge on the tank's actual position over the last 400 m (visual correction; engine timing unchanged). Verified from the drone camera (tank dead ahead at 12 m) and from outside (drone at the tank).
- Crew cameras rewritten: larger tiles, four distinct men, soft-shaded and lit, low-light camera treatment with grain, live pulse trace and BPM. Acted reactions: glance at the speaker, flinch on near miss, thrown and screaming on a hit, hyperventilating in panic, scream then gritted teeth when wounded (swollen eye, running blood, tears), slow drop when killed, shouting on bail-out, relief when the raid ends. Still 2D drawings, not photoreal.
- First-person escape: when the tank is killed and you are inside and alive, the view follows your own eyes onto the turret roof, off the side, running clear (helping a wounded man if you are his helper), then prone looking back at the tank, with captions for each stage.
- Turret blood: verified with a forced casualty (slumped dead, darkened uniform, spatter, blood on the view); spatter count and size doubled.
- Seen in screenshots: drone impact both views, faces (afraid, wounded, dead, bailing out), escape at the jump stage. Not seen: run and prone stages, helper pairing, relief face.

## v40: Patch B, threat display and turret interior (from beta feedback)
- Threat display rebuilt as a hull-up scope with symbols and track numbers only (fold-out symbol key underneath). Shows only what the sensors have: bearing-only warning strobes coded L (laser), R (drone radio link), M (missile launch); radar tracks as hostile diamonds with missile/drone mark, velocity leader and track number; amber dashed when the beam is cut; launcher positions plotted by backtrack after one second of track and kept on the display.
- Coverage and engagement: Trophy radar ring, side sectors and charges left; HKOI blind arc that swings with the turret; yellow ring and line when HKOI is firing, rounds in flight, cloud bursts; white brackets when Trophy will take a track; Trophy firing flash; defeated (green cross) and hit (red ring) marks; radar jamming noise; status strip RDR / LWR / GUN / APS.
- Friendlies: wingmen as blue rectangles with a line to what each is firing at.
- Turret interior: four more displays (live threat scope, crew cameras, two systems pages with ammunition, Trophy charges, radar, damage and crew status); all displays black out and flicker with the lights.
- Near miss: shudder, light flicker, dust from the roof, hull slam and ringing bolts, scaled by closeness. Hit: hard jolt with camera roll, half-second blackout then two seconds of flicker, sparks from the struck side, dust burst.
- Checks: invariants pass; 4-scenario browser regression clean (includes platoon scenarios); screenshots of the scope at three moments and of the interior displays. Not seen: the interior at the moment of a hit or near miss, friendlies on the scope, jamming on the scope. Sound not checked by ear.
