# What the old simulator did well, and what the new one must learn from it

Shawn sent the old "HKOI Mission Simulator" (v40, one 950 KB page; the same file as `build/hkoi-mission-sim-v40.html`) on 14 Nov 2026 and
said: "learn from this because it was a good sim but the foundation wasn't big enough to support the scale of what I actually wanted."
This is what Claude took from it. Read this before planning large work on the Battlefield build.

## 1. The old simulator was an evidence machine. The new one is only a fight to watch.
The old page could answer "does HKOI work, and why?":
- Run 200 to 5,000 raids and get survival with its uncertainty.
- Compare the four setups on the same raids: HKOI + APS, APS only, HKOI only, none.
- The kill chain per 100 threats, "why the hits got through", how every threat ended.
- Every key input with its basis and confidence; "what if an assumption is 30% worse"; which assumptions move the answer.
- Checks on each batch, and "reproduce this result" with a code.
The Battlefield build has none of this. That is why, on 14 Nov, Claude could not say with authority why the obscurant was stopping only
1 to 3% of missiles. `tests/battle/pace.js` is the only seed of it. THE NEW SIM NEEDS THE SAME PAGE: run many battles without drawing
them, the four setups on the same battles, kill chain, assumptions. The battle layer is deterministic and a battle takes well under a
second in node, so this is cheap to build.

## 2. The old simulator chose the engagement; the new one lets the map choose it, and the map chooses badly for HKOI.
Old defaults (still in `HK.defaultConfig()`): 3 threats per raid over a 6 second window; Kornet launched from no closer than 2,000 m;
mix 55% Kornet, 20% helicopter missile, 10% radio-command, 5% laser-homing, 10% drone.
New battles: 5 to 10 teams wherever the ground gives a sight line (some at 200 to 800 m), opening together.
Measured on beta 0.30 (Kornet only, 90 launches, hold mission):

| Kornet launched from | HKOI fired at it | Stopped by HKOI | Trophy | Enemy gunner missed on his own | Hit |
|---|---|---|---|---|---|
| under 700 m | 0% | 0% | 67% | 0% | 33% |
| 700 to 1,200 m | 71% | 0% | 86% | 7% | 7% |
| 1,200 to 2,000 m | 88% | 10% | 38% | 48% | 5% |
| over 2,000 m | 100% | 3% | 20% | 77% | 0% |

Two things stand out. Close launches give HKOI no time (its own table says under 30% inside 700 m). And at long range most missiles
are already going to miss because of the enemy gunner's assumed 3 mrad of aim wander (6 m at 2 km), so HKOI fires at them but gets no
credit and could not have changed the outcome. Shawn's own summary flags that 3 mrad figure as flattering every setup. The old page had a
side-by-side for 0.3 mrad and 3 mrad. Not yet explained: why HKOI stops so few of the missiles that WERE on target beyond 1,200 m
(about 1 in 5 here against 6 in 10 in the fire-control table); several arriving at once is the first suspect.

## 3. Where the old foundation ran out, and where the new one already shows the same crack.
Old: one file, three script blocks, three.js r128, every feature bolted onto one raid (seats, cutaway, X-ray, director, editor, platoon,
campaign). It could not grow into a continuous battle on real ground.
New: modules, tests, written decisions, a real world and a battle layer. That part is right. But the heart is still the old engine,
which resolves ONE RAID AT A TIME, start to finish, in one call. Everything hard in the new AI comes from wrapping a continuous fight
around that: only one engagement may run at once, a drone's flight blocked all other fire, counter-fire has to be decided in advance,
the tank's path is fixed when the first missile is launched. Each was patched. The patches will keep coming until the engine can be
advanced in time with threats added at any moment.

## 4. What this means for the plan
1. Build the "run the numbers" page for the Battlefield build first (four setups, kill chain, assumptions). It tells us what is true.
2. Use it to settle the obscurant question (launch ranges, how many arrive at once, the 3 mrad gunner).
3. Decide with Shawn whether to turn the engine into one that advances in time. That is the big foundation job. If it is done, the old
   engine stays as the referee: the new one must give the same results on old-style raids before it replaces anything.
4. The old page's features he valued are the feature list for later: crew seats and cutaway, X-ray of the hit, post-battle review,
   the next raid with the same tank, mission editor with share codes, platoon of four, enemy tank, thermal views, director.
