# Tank and enemy AI: what Shawn decided (13 Nov 2026)

Status: stages 1, 2 and 3 BUILT (beta 0.28). Waiting on Shawn's eyes. See docs/WORKLOG.md for what is where. This replaces the decision logic in `src/battle/battle.js`. The missile / HKOI / Trophy
outcome engine (`src/engine.js`) is not rewritten: the AI decides who does what, when and from where, and hands each engagement to
the engine. Every number below marked (A) is my assumption and is open to challenge.

Why: Shawn watched 0.24 and said the tank "has no idea what it is doing", the target order is poor, neither side repositions with
purpose, and both take far too long to fire. Measured on the old logic (`node tests/battle/pace.js`, 72 battles of 6 minutes):
2 to 4 engagements per battle, about 7 of 16 missiles ever fired, fewer than one enemy team destroyed per battle.

## How HKOI works (from Shawn's summary "How HKOI Works: As Built in the Simulator")
- HKOI does not hit the missile. A 30 mm M230LF station fires obscurant rounds that pass the incoming missile head-on; proximity fuzes
  burst and build a cloud behind the missile, on the line back to the launcher. A beam rider that loses 99% of its beam goes blind and
  in most cases misses or hits the ground short. Four rounds are not enough: about 11 for a Kornet (4-round burst, then up to 8 more).
- Outer layer HKOI (400 to 2,500 m; best meeting range 900 m for Kornet; below about 700 m the chance falls under 30%), inner layer Trophy
  (last tens of metres; 3 shots a side, 6 in all, 0.6 s between shots).
- Obscurant only for missiles that need a line to the launcher (beam riders, radio command). Drones, laser-homing and heat-seeking
  missiles get proximity HE. RPGs and tank rounds get nothing from HKOI: RPGs are Trophy's.
- Defeat chance per engagement in the model: Kornet 61%, radio-command 28%, fast helicopter missile 7%.
- Limits that matter to tactics: rear blind arc 155 to 205 degrees behind the turret; mount turns 90 deg/s and borrows the main turret
  (40 deg/s) on swings over 15 degrees; 150 obscurant + 150 HE rounds; 2% jam chance per burst; radar needs a sight line.
- HKOI is fitted BESIDE the commander's CROWS, not in place of it. HKOI never fires at ground targets.

## Shawn's decisions
### Shape of the rebuild
1. Three missions, chosen on the setup screen: Advance to an objective, Hold a battle position, Hunt the ambush.
2. Delivered in stages, a playable build after each: (1) enemy teams decide and fire on their own, (2) tank mission, weapons and
   target order, (3) repositioning for both sides.
3. Every unit shows its intent: a status line for the tank, each weapon's target and why, each enemy team's intent in the spectator
   team menu, and every decision in the log with its reason.
4. Real drill times stay; all artificial waiting goes (no committee, no patience timers). Every time used is listed below.

### The tank
5. Weapons work independently and at the same time, each with its own target:
   - HKOI: missiles and drones only. Has first call on the main turret, always and immediately.
   - Main gun (gunner). May fire on the move with reduced accuracy. Fires at a last-known position only if seen there within about
     20 s (A). No rounds wasted on teams known to be out of ammunition.
   - Coax: follows the main gun.
   - Commander's CROWS .50: independent; this is the gun that turns to suppress a team while HKOI and the main gun are busy.
   - Loader's M240: the loader comes up when a located team is within 800 m and there is no near threat; inside 600 m he comes up
     even when it is dangerous. While he is on the M240 the main gun cannot be reloaded, and the commander weighs that.
6. Target order, most dangerous first: (1) a team guiding a missile at the tank now, (2) a team that can see the tank and is about to
   fire, (3) a located team reloading, (4) teams moving or out of sight. Nearest breaks ties. Weapon matched to range.
7. Counter-fire: machine guns suppress a launcher while its missile is in flight, which makes the gunner's aim shake and raises the
   chance of a miss. Skilled crews are shaken less. Tiers below. Results must show whether a missile was beaten by HKOI, Trophy,
   cover or counter-fire, so HKOI's share stays honest.
8. Finding the enemy: gunner and commander scan sectors with thermal sights. Chance to find a hidden team depends on range, cover,
   weather and movement. Launches and movers are spotted as before.
9. On a missile warning the commander decides: if cover hiding the whole hull is reachable before impact, go; otherwise hold still,
   square up, give HKOI a long clean engagement and face the side with Trophy shots left.
10. Facing: turret parked toward the main threat so HKOI's blind arc points away; hull angled so new threats meet the side that still
    has Trophy; thickest armour toward the worst threat when these conflict.
11. Choosing a position: hull-down, roof clear for radar and guns, 800 to 1,000 m of open ground toward the enemy where the map allows,
    and no cover within about 300 m that an RPG team could use.
12. Running low: under about a third of obscurant, or one Trophy side empty, he stops crossing open ground and fights only from full
    cover with the good side out. HKOI empty or Trophy down to one shot: he breaks contact; the mission ends as "withdrawn".
13. Advance: bounds of 150 to 400 m between covered positions by the most hidden route at up to about 30 km/h, halting 20 to 40 s to
    scan; shorter bounds and longer halts when contact is likely. Ambushed on the move: nearest hull cover, fight until the threat is
    destroyed, suppressed or out of sight, then go on.
14. Hunt: manoeuvre by covered routes to a position with a clear shot at the most dangerous located team, as close as the weapons need
    but never within 300 m of ground that could hide an RPG team; destroy or drive it off, then the next.
15. Hold: a primary hull-down position and two alternates 50 to 200 m apart with covered routes between; shift after being fired on,
    after several rounds from one spot, or when a located team cannot be seen from here. He does not leave the area.

### The enemy
16. Ambush on signal, then at will. The leader opens fire at the best moment (tank in the open, in range of as many teams as possible,
    showing its side), or at once if the tank spots a team or is about to reach cover. Longest wait after the first clean shot: 20 s
    green, 45 s trained, 90 s expert. After the opening every team fights on its own.
17. Shoot and scoot only with a reason: rounds landing near, belief it was seen (turret or guns turning its way), lost sight of the
    tank, or two shots from one spot. Otherwise reload and fire again. Experts judge it well; green crews move too late or too early.
18. RPG teams stalk the tank through cover for a flank or rear shot inside 300 m, and go to ground if spotted or fired on.
19. FPV pilots by skill: novices fly straight in; trained pilots come in low behind trees and buildings and jink; experts come from
    behind the turret (the blind arc) or arrive while HKOI is busy with a missile.
20. Knowledge: a radio net. Any team or drone that sees the tank reports it; others get the position a few seconds late and tens of
    metres off, and it goes stale. Teams act on what they believe, and can be wrong.
21. The enemy adapts by skill. Green: never. Trained: fires in pairs from one side. Expert: also times a drone or RPG with a missile
    and goes for flank and rear shots. Results name the tactic used. (This lowers HKOI's results; that is accepted.)
22. Morale: a team with no rounds pulls back. The force breaks contact when about half its teams are destroyed or spent (experts hold
    longer, green crews break sooner). The battle ends when the mission is done or the enemy has gone.

### Settled in the last round
23. Suppression tiers below: approved as written.
24. Main gun load: a real 42 rounds, mixed. A set number are multi-purpose rounds suited to teams; the rest are anti-armour and kept
    for enemy tanks later. Split to be stated when built (A: 18 multi-purpose, 24 anti-armour).
25. The loader can become a casualty while up on the M240 (enemy fire or fragments on the tank, or Trophy firing on his side), with
    stated odds. Loader down: no M240 and a much slower main gun.
26. Four enemy crew levels on the setup screen: Green, Trained, Expert, Veteran.

## Suppression tiers (designed by Claude, approved by Shawn) (A)
Suppression level of a team at any moment:
- None.
- Light: rounds passing within about 15 m, or fire at the wrong spot nearby.
- Heavy: accurate bursts on the position (.50 inside 900 m, coax or M240 inside 600 m), or a main-gun round within 25 m.
- Pinned: heavy for more than about 5 s, or a main-gun near miss inside 10 m. The team cannot aim, fire or guide.

Effect on a gunner guiding a missile (multiplies his aim wander; the engine's default is 3 mrad), and his chance each second of
ducking and losing the missile altogether:

| Crew | Light | Heavy | Ducks under heavy (per second) | Time to recover after fire lifts |
|---|---|---|---|---|
| Green | x2.0 | x4.0 | 35% | 20 s |
| Trained | x1.5 | x3.0 | 20% | 12 s |
| Expert | x1.2 | x2.0 | 8% | 6 s |
| Veteran (new tier) | x1.1 | x1.5 | 3% | 3 s |

A team not guiding is simply delayed: it cannot acquire or fire while heavily suppressed, and each burst has a chance to knock it out
(as today: falls with range, lower from a moving tank).

## Times used (A unless noted)
| Action | Time |
|---|---|
| Missile team acquires and fires once it has a clear view | Kornet, Konkurs 5 s; RPG 2.5 s; designator 8 s; FPV crew 3 s (existing values), times 1.5 green, 1.0 trained, 0.8 expert |
| Reload | Kornet 22 s, Konkurs 26 s, RPG 9 s, FPV launch 14 to 18 s, designator 45 s (existing values) |
| Set up after a move | Kornet 35 s, Konkurs 40 s, RPG 6 s (existing); 60% of that on a prepared alternate position |
| Pack up before a move | Kornet, Konkurs 15 s; RPG 2 s |
| Main gun: lay and fire on a located target | 4 s + 1.3 s per km (existing), 6 s reload |
| CROWS .50 onto a new target | 1.5 s + slew at 60 deg/s |
| Loader up and firing | 4 s to come up, 2 s to drop |
| Tank reaction to a warning | 1.6 s plus fatigue (existing) |

## Honest limits and open points
- The engine resolves one engagement at a time, and HKOI's "busy with one threat while another arrives" only exists inside one engine
  run. So independent launches are gathered into rolling engagements: when a team fires, every team that will have its shot within the
  next few seconds joins that same engine run with its own launch time. A team that becomes ready while missiles are already in the
  air fires in the next run, which starts the moment the current one ends. This is close to "at will" but not identical to it.
- Suppression during flight needs the engine to accept a steadiness value per missile; today it has one value for all
  (`gunner_jitter_mrad`). That is a small, careful addition to the engine's inputs, not a change to how it decides outcomes. To be
  checked against the old build's results before and after.
- Expect HKOI and tank survival numbers to get WORSE with a faster, adapting enemy. Each stage reports the pace table before and after.

## Enemy logic, second pass (14 Nov 2026): the commander's judgement and the teams' own

Shawn: "improve the AI enemy logic and improve the commanders intuition". He was surprised that the first commander made no
measurable difference. Code: `src/battle/enemycdr.js` (commander and the teams' own judgement), `src/battle/enemyveh.js`
(vehicles). Every figure marked (A) is Claude's assumption. Nothing was tuned to a result; the tables are in docs/WORKLOG.md.

### Why the first commander changed nothing (measured, `node tests/battle/cdr_diag.js`, 200 battles a row, paired seeds)
- The first shot fell 3 s into a hold battle (15 s on an advance): every team fired as soon as it was laid. His first real order
  took effect at 28 s (median; 256 s on an advance), in only 36 to 50% of battles, about one order a battle.
- He held launchers for 0.2 to 1.0 launcher-seconds a battle: in effect never.
- After the opening the teams fed missiles in singly (advance: 6.9 engagements of 1.21 launchers each), which HKOI and Trophy
  pick off one at a time. Nothing he did changed how the shots were grouped.

### What the commander now decides (only from his teams' reports, the sound of the gun, and what his teams see happen)
1. **The opening.** He holds the whole ambush until every missile launcher that has the tank in sight is laid, from two
   bearings 40 degrees apart when his ground offers that. He lets go at once if a team comes under fire or is lost (the ambush is
   blown), and in any case after 40 / 60 / 75 s (trained / expert / veteran) (A).
2. **Salvo fire.** After the opening, missile launchers fire by salvo, not singly: three ready, or two after half his wait, or
   whoever is ready when the wait runs out (25 / 40 / 45 s) (A). Rocket teams and tank guns are not held.
   Between the first and the second salvo the missile teams that fired stay and reload where they are (60 s at most) instead of
   scooting after one shot, unless they are shot at: Trophy has eight rounds and the first salvo uses most of them (A).
3. **Arrival together (expert and veteran only).** Launches are timed so the missiles arrive together, by the ranges he believes,
   to within his crews' timing error (1 / 0.5 s) (A). A trained commander does not try it: measured with a 2 s error it did the
   enemy no good (the near launchers' wait warns the tank, and the arrivals are still too ragged to beat Trophy's 0.6 s between
   shots); his launchers fire together on the signal. A drone arriving with the salvo is given 1.5 s lead so Trophy and the airburst rounds are
   spent on it first (A); with a drone due inside his wait, the salvo waits for it.
4. **Counting Trophy.** His teams see Trophy fire. He counts its shots by quarter of the compass; after four toward one quarter he
   takes that side to be empty and lets a launcher there fire at once. He can be wrong (the tank turns): a fifth shot from that
   side resets his count (A).
5. **Where the tank is going.** Real movement (250 m or more over his last reports, still going the same way) is extended to where
   the tank will be in about four minutes, the time a team needs to move and set up: along a road if one runs its way within 200 m,
   toward a village or town if one lies within 30 degrees and 3 km ahead (the obvious objective on the map), otherwise straight on
   (A). He never reads the tank's real objective. A shuffle between fighting positions counts as staying.
6. **Belief that spreads.** His uncertainty grows from the report's own error by 1.5 m for every second since (2 to 8 m/s if he
   thinks the tank is moving), to 1,200 m at most (A).
7. **Ambush ahead, not chase.** A team that covers neither where the tank is nor where he expects it is sent to ground that looks
   onto the place ahead (by truck if it has one). A team that still has the tank in its sights is left alone.
8. **Dominated ground.** Where a team has just been destroyed, a team lying within 150 m is ordered out (A).
9. **Rocket teams wait.** They stay hidden until the tank's reported or expected path comes within 450 m of them (A). They are no
   longer sent across the open to "fix" the tank.
10. **Armour from the flank.** Tanks in reserve are committed to a hull-down position about 80 degrees round from the middle of
    his firing teams (the way the M1 has been made to face), on whichever side they already stand (A).
11. **The next wave.** He tells the next group to come in from the side where Trophy has been seen to run dry, or else from behind
    the way the tank now faces (A).
12. **Drones scout.** A drone inside 2.5 km passes the tank's position every 5 s, good to about 15 m (A).
A green commander does 5, 6, 7 and 12 only: no fire control. He is still fooled: reports are late and wrong by crew level, reports stop
when the reporting team is dead, pinned or moving, and everything stops when he is killed or his radio goes.

### What every team now does by itself (no commander needed; green crews do none of it; `enemyAI: 'classic'` switches it off)
- A team whose missile HKOI blinded does not fire alone again while another launcher can fire with it: it waits up to
  15 / 25 / 30 s (trained / expert / veteran) (A).
- When a team is destroyed, a team lying within 150 m of it moves (trained crews half the time, expert and veteran always) (A).
- A rocket team does not start a stalk from beyond 350 m unless half the way (veteran: 60%) is in cover: it lies in wait (A).
- Expert and veteran crews firing together time their launches so the missiles arrive together, to within 1.5 / 1 s (A): the far
  launcher fires first. (Before, they launched together and the missiles arrived spread out by range.) Trained and green crews do not.
- Unchanged: choice of firing position, the Kornet band of 2 to 5 km, shoot-and-scoot odds by crew level, suppression, morale.

## Tank crew stress: how a hit frightens the crew (14 Nov 2026, after Shawn's report)
Shawn's report: a Konkurs went through the hull side (front) into a fuel cell and started a fire; the veteran crew stayed "steady".
Measured (`node tests/battle/crew_hit.js green trained veteran`, seed 26, the same hit): the old jolt was 0.20 for any hit + 0.15
for a hole = 0.35, times the veteran gain 0.55 and the seat and leadership factors (about 0.8 to 1.0): +0.17 to +0.19. From his resting
0.17 the commander reached 0.34 (the "strained" line is 0.35) and was back to 0.21 ten seconds later. There was no fire in the model.

What a hit does now (src/battle/crew.js; every figure is an assumption by Claude, none from trials or from Shawn) (A):
| Event | Rise for a trained man (before seat and leadership factors) | Scaled by |
|---|---|---|
| Any hit, armour held or not (the jolt) | 0.20 | gain: green 1.4, trained 1.0, expert 0.75, veteran 0.55 |
| Trophy fires (a warhead defeated a few metres away) | 0.08 (was 0.04); a loader up in his hatch 0.10 | gain |
| The hit gets through the armour | +0.30 for all four (was 0.15) | shock: green 1.2, trained 1.0, expert 0.9, veteran 0.8 |
| ... for a man near the hole | up to +0.20 more: all of it within 1 m of the entry point, none beyond 3.5 m (seat positions of the damage model) | shock |
| ... and it starts a fire inside (fuel cell, hull rack, engine or transmission, bustle ammunition) | +0.25 more for all four | shock |
| The man himself wounded / a crewmate wounded / a crewmate killed or out of action | 0.30 / 0.15 / 0.30 (were 0.25 / 0.12 / 0.20) | shock |
Why a separate "shock" scale: experience damps the routine fright of a fight (warnings, near misses, Trophy) a great deal, but much
less the fright of a jet through the hull or a fire inside, which few men have lived through. Veterans still feel less and calm down
fastest (calm-down time 14 s against 28 s trained and 45 s green, unchanged), and still freeze least (6% of the times they reach
"panicked", unchanged).
A fire inside burns until the extinguishers have put it out and the crew believes it: 8 s for the hull (fuel cell, hull rack), 20 s
for the engine compartment (the driver pulls the second shot), 15 s for the bustle ammunition. While it burns nobody's stress can fall
below 0.62 (just over the "shaken" line 0.60) and the resting level is 0.25 higher, so EVERY crew level is at least shaken until the
fire is out (or the crew bails out). The log says "Fire inside: ..." and "Fire out."; `crewState().fire` gives { where, since, until }.
Nothing else changed: the state lines, the effects of each state, freezing, stalls, flinching, buttoning up and bailing out are as
before. With `crewStress: false` the battle is exactly the battle from before the model (tests/battle/crew.js part 1).

Measured, the same hit (Konkurs, hull side front, fuel cell, fire; nobody wounded), stress of commander / gunner / loader / driver:
| Crew | Before the hit | 1 s after | 10 s after | 40 s after | Before this change, 1 s after |
|---|---|---|---|---|---|
| Veteran | 0.23 0.23 0.30 0.26 (steady) | 0.77 0.82 0.93 0.89 (shaken, shaken, panicked, panicked) | 0.60 0.66 0.76 0.73 (shaken) | about 0.19 (steady) | 0.34 0.34 0.47 0.38 (steady, steady, strained, strained) |
| Green | already 0.88 to 1.00 (panicked) | 1.00 all four | 0.96 | 0.60 to 0.67 (shaken) | 1.00 all four |
A hole without a fire (an RPG through the hull rear, nobody hurt), veteran: 0.18 before, 0.55 to 0.70 one second after (strained,
the loader shaken), back to steady after about 30 s. A hit the armour held (turret front), veteran: +0.07 to +0.08 (a jolt).

## Friendly support, the bomber drone and what kills an Abrams (15 Nov 2026)

Shawn's plan (docs/OVERHAUL_SPEC.md): "Artillery, wingman tank, friendly drone, rare air support", "call for support", "platoon
fight", the bomber drone first among new enemy weapons, and "full catastrophic kills". Code: `src/battle/support.js` (wingman,
artillery, scout drone, bomber drone), `src/battle/fate.js` (endings), drawing in `src/render/support.js`. Every figure is Claude's
assumption (A) unless it is copied from the engine; nothing was tuned to a result. Measured tables: docs/WORKLOG.md, 15 Nov.

**Off by default.** A battle gets support only with `support: { wingman, artillery, scout }` in its options (the setup screen's
three switches, or one of the forces "Platoon in the defence", "Section attack", "With fire support"); bomber drones only with a
`bomber` crew in the enemy force; a crippled crew acts on its losses only with `fate: true` (the page sets it). Without these every
stored battle is unchanged: `node tests/battle/support_off.js` (32 battles against a file written from the code before this work).
Air support was NOT built.

### The wingman
- A second M1 with its own magazines, Trophy, HKOI (setup choice: both, Trophy only, HKOI only, neither), damage state and ending.
  Its crew uses the same drills as the player's (tankai.js is run with the battle looking at the wingman; the file is not edited).
  It has no stress model and picks no hull-down positions of its own: it keeps station 150 m off the player's right rear.
- The enemy's volleys at it are resolved by the engine like the player's: one raid on one vehicle with the wingman's own state.
- A team chooses its tank when it fires: the only one it has a shot at; if both, the one showing more of itself; if equal, the
  nearer one 60% of the time. Enemy vehicles' guns and missiles and FPV drones still go for the player's tank only.
- Mutual cover is the engine's own `HK.platoonShare` ('neighbour_obs', 'neighbour_he'): when an engagement would end in a hit, the
  other tank's HKOI, within 600 m, with rounds and not busy, may take that threat. The smoke of one tank blinding the other is not
  carried between two separate engagements.
- The battle still ends when the player's tank is lost.

### Artillery, scout drone, bomber drone: figures
| What | Figure | Why |
| --- | --- | --- |
| Wingman station | 150 m from the player, right rear first, on ground a tank can stand on | a tank section's usual spacing in the defence is 100 to 200 m |
| Wingman moves | when it is more than 80 m off station, by the map's route finder, at up to 8 m/s | judgement |
| TARGET: which tank a team fires at | the only one it has a shot at; if both, the one showing more of itself (not hull-down beats hull-down); if equal, the nearer one 60% of the time | judgement: gunners take the better target |
| Mutual cover reach | 600 m, the engine's default | HK.platoonShare |
| Artillery | 3 missions a battle; one at a time; 90 s from the call to the first round (45 s for a repeat within 200 m of the last mission); 12 rounds of 155 mm HE in two volleys 10 s apart | a direct-support battery answering a priority call; Shawn: "artillery (minutes)" |
| Where the rounds land | aim point off by 15 m (1 sigma) from the reported place; each round a further 30 m (1 sigma) | laser-ranged target location; 155 mm dispersion at mid range |
| Scout drone correcting | with the scout alive and able to see the target, the second volley's aim point error is 5 m | Shawn: "friendly drone overhead (finds sites, corrects fire)" |
| Effect on a team (men lying in position) | knocked out 80% within 10 m of a round, 35% within 25 m, 10% within 40 m; pinned for 30 s within 100 m; survivors within 100 m move when the mission ends | 155 mm HE against prone troops: judgement |
| Effect on vehicles | light truck: destroyed 70% within 15 m, 25% within 30 m. BMP-2: mobility kill 40% within 6 m. Tanks: mobility kill 25% within 3 m | fragments do not harm armour; a near-direct hit breaks tracks |
| Check fire | a mission the commander called himself is stopped, and not used up, if before the guns fire (25 s before the first round lands) his crew sees that the target has moved more than 60 m, gone or been knocked out | time of flight of a 155 mm round at mid range; judgement |
| Danger close | no mission within 600 m of a friendly tank; a mission is stopped (and not used up) if a friendly tank comes within 600 m of its target before the guns fire | the usual danger-close distance for artillery |
| The AI's call | a located team that is not moving, located at least 3 s, at least 600 m from both tanks, and that the tank cannot deal with itself (no line of sight; or no multi-purpose rounds left; or beyond 1,500 m while the gunner is laying on another target); most dangerous first; not twice on the same place within 2 minutes | judgement |
| Scout drone | flies circles round the player at 20 m/s and 150 m up, 800 m out widening to 2,400 m and back; sees 800 m (slant) | a small quadcopter or fixed-wing scout |
| Scout finds a team | 6% a second in the open, x0.5 in scrub or crops, x0.25 under trees, x3 if moving, x2 if setting up, x the weather factor of the tank's thermal scan; vehicles 20% a second | judgement |
| Scout lost | 0.08% a second to jamming, link loss or a crash (about one in three over a 7 minute battle); +0.2% a second while within 600 m of an enemy team that is not pinned (small arms) | judgement |
| Bomber drone | heavy multirotor: 16 m/s, 90 m up, radio-linked, 2 shaped-charge bombs a sortie, 3 sorties and 2 drones a crew, 75 s to rearm, settles 4 s over the target, drops one bomb every 3 s | open-source descriptions of heavy "bomber" multirotors |
| Bomb hits the tank | green 20%, trained 35%, expert 50%, veteran 55% on a halted tank; x0.3 on a moving one | judgement; reports vary widely |
| What a bomb hit does | the engine's FPV figures: 15% knocks the tank out (HK.THREATS.fpv.kill); the plate, penetration and parts come from DMG.report as a top attack of the FPV class (400 mm) | the bombs are the same class of warhead |
| HKOI against the bomber | the engine's own drone rules (docs/HKOI_SPEC.md 3.11), copied: first burst to meet at 800 m, the next after it has closed 120 m, at most 4 bursts, never under 100 m or above 60 degrees, not in the rear blind arc, 2% jam; kill = 0.70 x 144 / (144 + dj^2) with dj from the pilot's jink (novice x0.4, trained x1, expert x1.7 and a 25% feint), x1.6 on follow-up bursts | src/engine.js resolveHE. A heavy multirotor probably jinks less than an FPV: this may understate HKOI |
| HKOI busy | it does not fire at a bomber while an engagement with missiles is running | the engine cannot interleave them; missiles come first |
| Trophy against bombs | nothing: a bomb falling from straight above at about 40 m/s is taken to be outside what Trophy engages | honest unknown; said plainly |
| Machine guns against the bomber | not modelled | |

`battle.callFire({ e, n, kind: 'he' })` is the hook for an order system; it obeys the same rules as the commander's own calls.

**The bomber drone is resolved in the battle layer, outside the referee.** The engine has no threat that hovers and drops. HKOI's
fire at it uses the engine's own airburst formula and parameters; a bomb that hits is given the engine's FPV kill chance and the
damage model's top-attack report. Trophy is taken to do nothing against a falling bomb. Each of these is listed above.

### What kills an Abrams (`battle.tank.fate`)
Read from the damage model's report of each hit (src/dmg.js), never from a new die where the report already decides:
- knocked out (the crew bails out), ammunition fire vented through the blow-out panels (bustle ammunition in the jet, blast door
  shut), catastrophic (hull rack in the jet, or the bustle hit while the loader has the door open: no survivors);
- alive but crippled: mobility kill (engine or transmission in the jet: it fights from where it stands), firepower kill (main gun
  breech in the jet, or the bustle ammunition burned out on a hit the engine says it survives: it breaks contact and withdraws);
  both together: the crew leaves the vehicle.

| What | Figure | Why |
| --- | --- | --- |
| Blast door open | only while the loader is drawing a round: from 1 s to 3 s into a 6 s (14 s without a loader) load, and never when the gun is loaded, the loader is up on his M240 or down | the door of the bustle rack is knee-switch operated and shut except while a round is pulled; taken from the loader's state in tankai.js, not from a die |
| Hull rack struck on a surviving hit | recorded as damaged, no explosion | the engine has said the vehicle survives; the model does not overrule it |
| Bustle ammunition burning through the panels | 12 s | judgement |
| Fire on a knocked-out vehicle | engine fire 90 s, fuel fire 60 s, otherwise 20 s of smoke | judgement; drawing only |
| Catastrophic fire | 120 s | judgement; drawing only |
| Bailing out | the first man starts 3 s after the hit, the next every 1.5 s (commander, loader, gunner, driver), each takes 4 s, a wounded man 8 s | judgement |
| A tank that can neither move nor fire | the crew leaves it 20 s after the second loss, if no engagement is running | judgement |
| A firepower-killed tank that can still move | breaks contact at once and withdraws to its start line at 9 m/s (the same drill tankai.js uses when its protection runs out) | task statement |
| Turret drive, sights, stabiliser destroyed | NOT a firepower kill here (the crew fights on in degraded mode) | judgement |
