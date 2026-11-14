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
