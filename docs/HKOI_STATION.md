# Where the HKOI weapon station stands, and why (15 Nov 2026)

Plain summary: the station moved from the middle of the roof (0.40 m from the loader's hatch) to the **left rear corner of the
turret roof**, on a 0.5 m welded pedestal, and was rebuilt to the real gun's size. In its new place no solid part of it touches
anything on the roof, a standing loader, a standing commander, either hatch lid anywhere in its travel, the loader's machine gun or
the commander's .50 anywhere in theirs, at any bearing and any elevation. The check that proves it runs with the other interior
checks (`bash tests/interior/run.sh`, part 3) and fails if a later change brings a clash back.

It is NOT "beside the CROWS", which is how Shawn described his design. Nothing fits there without a clash (numbers below). If he
wants it there anyway it is one line (`at` in `src/render/station.js`); the check then lists what it hits.

## The numbers (turret frame: x to the tank's left, z forward, y up from the turret's turning point; metres)

| | Old | New |
| --- | --- | --- |
| Axis on the roof (x, z) | 0.55, -0.95 | **1.22, -1.50** |
| Stands on | roof plate and the edge of an ammunition blow-out panel | roof plate over the left bustle wall, 0.13 m clear of the blow-out panels |
| Pedestal | a 7 cm ring | 0.50 m welded column, flange 0.62 m across, four gussets, twelve bolts |
| Trunnion height | about 1.34 | 1.60 (1.02 m above the roof plate; 0.21 m above the commander's shield panels) |
| Highest point | about 2.0 (its sensor mast) | about 1.85 (the feed chute; 0.46 m above the commander's shield panels, which were the highest thing before) |
| Gun | drawn 3.3 m long | 2.18 m (M230LF data sheet), 0.35 m behind the trunnion, 1.83 m in front |
| Body turning circle | 0.89 m radius | 0.445 m radius |
| Ammunition box | 0.42 x 0.46 x 0.90 m | 0.20 x 0.50 x 0.36 m: 36 litres, ASSUMED about 85 linked rounds |
| Distance to the loader's hatch centre | 0.40 | 0.99 |
| Distance to the commander's hatch centre | 1.22 | 2.08 |

Measured clashes of the OLD place with the new, smaller station (so the place itself, not the old shapes, was the fault): body
0.59 m deep into the standing loader / his lid / his gun, 0.13 m into roof fittings, the flange on a blow-out panel, the body 0.42 m
in over the panels.

## What was tried (`node tests/interior/station_clear.mjs search`, run through `tests/interior/run.sh`'s folder or with `SRC=src`)

Every place on a 5 cm grid over the whole roof, pedestals 0.1 to 0.9 m: 36,855 combinations. A place counts only if the flange is on
flat roof plate (not a hatch, not a blow-out panel) and the turning body clears everything by 3 cm. 374 pass, in three regions:

| Region | Best place, pedestal | Level fire, hatches shut | With crew heads out | What it costs |
| --- | --- | --- | --- | --- |
| **Left rear corner (chosen)** | (1.22, -1.50), 0.5 m | all round, except 10 degrees behind each rear aerial | commander up: right front 45 to 70 degrees needs +5.5; loader up: nothing | nothing taken from any other sight or weapon; station sheltered behind the turret from the front |
| Front left corner ("beside" the roof guns) | (0.95, 1.15), 0.5 m | all round | commander up: rear right 125 to 145 needs +8 | stands 0.65 m in front of the commander's independent viewer (a blind arc of about 44 degrees to its front left) and squarely in the loader's M240 arc (about 28 degrees straight ahead): both estimated from the geometry, not by the check; on the turret's front, exposed |
| Rear centre / right rear | (-0.7, -2.55), 0.4 m | 10 degrees masked | 80 degrees masked | over the bustle rack and the wind sensor; right rear also clashes with the commander's lid as it swings aside |
| Between the hatches (old place), beside the commander's .50 (0.10, 0.45) | none passes | | | body through the loader / his gun (0.6 to 0.9 m deep) and the .50's travel (1.4 m) |

A pedestal lower than 0.5 m in the chosen place leaves the right front (the commander's cupola and shield panels) masked at level
(0.3 m: 45 to 70 degrees needs +4); 0.5 m is the lowest that fires level over everything on the roof with the hatches shut.

## Masked zones in the chosen place (where the station cannot fire because of its own tank)

Bearings are clockwise from the turret's front. "Lowest elevation" is the lowest the gun may point at that bearing (a 10 cm margin
round the line of fire). The limits are in `src/render/station.js` (`FLOOR`, every 5 degrees) and the station on the model obeys
them: it lifts its gun over its own tank as it traverses (`TankView.aimStation`).

- Hatches shut: level (0 degrees) everywhere except bearings 100 to 110 (the right rear aerial, a thin whip: +13) and 160 to 175
  (its own-side aerial, 0.65 m away: +42).
- Below level: -10 is reached over 280 degrees of bearing; over the turret itself (bearings 0 to 75) the limit is -2.5 to -9.
- Loader standing behind his M240: no further limit (his head top is 0.24 m under the bore line; his lid, upright, 0.25 m).
- Commander head and shoulders out: bearings 45 to 70 need +5.5 or more.
- Two weapons crossing: if the commander's .50 is raised and swung left-rear, or the loader's M240 raised above +10, the two guns'
  travels overlap the HKOI barrel's below +14.5 (bearings 0 to 80) and +27 (bearings 290 to 355): a mutual no-go, as on every vehicle with two roof weapons. Not drawn.

**Not modelled in the battle.** The referee (`src/engine.js`) does not know these zones: a missile coming in over the two aerials or,
with the commander's head out, low over the right front is still engaged in the numbers while the gun on the model is held at its
limit. Honest effect if it were modelled: small (25 degrees of 360 behind the turret, and 25 degrees only while the commander is
head-out). It is listed for the battle's owner.

## Assumptions
- M230LF: 2.18 m overall, 0.26 m wide, 0.29 m high (data sheet); the 0.85 m receiver / 1.33 m barrel split is read off photographs.
- Traverse all round, elevation -10 to +65 degrees (the limits the model has always used). Rates unchanged (90 and 60 degrees a second).
- A standing loader fits inside 0.42 m of his hatch centre, head top 1.36 (his eye is 0.2 m above his gun's bore); a head-out
  commander inside 0.40 m of the cupola centre, head top 1.64. From the interior's own dimensions (`interior_build.js`).
- Commander's .50: turns all round its mount at (-0.73, 0.50), -20 to +60 degrees. Loader's M240: 110 degrees each way, -10 to +35.
- Everything on the roof is taken as solid from its top down to the roof (it can only overstate a clash).
- The hull is not in the survey: a -10 degree line from the trunnion is still 0.6 m above the hull top at the hull's ends.
- `tests/interior/roof_survey.json` is a height field measured from the supplied turret model (2.5 cm cells, whole centimetres).
  It is numbers derived from the model, not the model; say so if that should not be in a public repository and it can be made on the fly instead.
