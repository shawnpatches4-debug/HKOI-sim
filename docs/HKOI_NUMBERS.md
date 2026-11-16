# HKOI numbers: what they mean and how to measure them

Written 13 Nov 2026 for whoever works on this next (Claude Code included). Read this before quoting, "fixing" or
tuning any survival or cut-rate figure. Shawn's rule stands: **never tune to hit a target; if the realistic number is bad
for HKOI, report it and say why.**

## The one command

```
node tests/study/hkoi_only.js 1000
```

This is the reference measurement. It runs the standard raid of `HK.defaultConfig()` (3 launches in 6 s, mix 55% Kornet,
20% Vikhr, 10% radio SACLOS, 5% SAL, 10% FPV; open ground, clear weather, tank halted at the start, trained crew that
reacts) through the legacy resolver for four setups on the same seeds. Takes about a minute. If your figures differ from
the table below and you have not changed `src/engine.js` or the defaults, you are measuring something else: see
"Ways to get a wrong number".

## Reference results (engine as of commit 7a25f78, 1,000 raids, seed 1)

| Setup | Survive, gunner 3 mrad (default) | Survive, gunner 0.5 mrad (expert) |
| --- | --- | --- |
| No protection | 80.3% ±2.5 | 30.7% ±2.9 |
| Trophy only | 91.1% ±1.8 | 64.7% ±3.0 |
| **HKOI only** | **83.7% ±2.3** | **36.6% ±3.0** |
| HKOI + Trophy | 96.2% ±1.2 | 80.4% ±2.5 |

Beams cut, as a share of missiles engaged with obscurant: **1%** at 3 mrad, **7% to 9%** at 0.5 mrad.

HKOI only, 0.5 mrad, one change at a time (survive / beams cut):

| Change | Survive | Beams cut |
| --- | --- | --- |
| as configured (40 g round) | 36.6% | 7% |
| crew does not move the tank | 28.6% | 29% |
| 50 g round | 33.5% | 19% |
| 65 g round | 40.5% | 33% |
| 120 g round | 56.3% | 72% |
| re-lock allowed | 35.8% | 8% |

So **"HKOI only" being only a few points above "no protection" is what the model says today. It is not a bug in
your script.** Most of HKOI's measured value at present comes from HE against drones, from cueing Trophy
(`pk_cued` 0.9 against `pk_uncued` 0.8), and from saving Trophy rounds; the obscurant cut itself is rare with a 40 g round.

## Why the cut rate is low (measured, not guessed)

One Kornet from 2,000 m, 300 trials each (`enemy.fixed`, bearing 20):

| Condition | Beams cut |
| --- | --- |
| Tank still, gunner 0 mrad | 58% |
| Tank still, 1.5 mrad | 53% |
| Tank still, 3 mrad | 31% |
| Crew reacts (tank drives off), 0 mrad | 27% |
| Crew reacts, 3 mrad | 15% |
| Tank still, 3 mrad, 120 g | 98% |

1. **Cloud budget.** One 40 g round at 0.85 m2/g gives optical depth about 1.35 at the centre when it forms
   (`alpha*m/(2*pi*sigma0^2)`), against a threshold of 4.6 (`obs.tau_lock_margin`, 99% blocked). Four or more must stack
   on the beam line, and each thins by half in about a second.
2. **Enemy gunner wander** (`enemy.gunner_jitter_mrad`, default 3, chosen by Shawn). The beam swings about 3 m either
   side at the cloud; the cloud is 2 to 3 m across.
3. **The tank's own movement.** The crew drives off on the warning, which sweeps the beam sideways off the cloud. In
   72 battles no burst cut when the tank's sideways speed was above 8 m/s.
4. **Volleys.** With several threats the gun has little time for sustain rounds (2.4 per engagement in the standard raid
   against about 6 for a lone missile from 2 km).

The same 3 mrad wander also makes many missiles miss by themselves, which is why "No protection" survives 80% at the
default. Kornet-class hit rates are usually credited at 80 to 90%, so **compare setups at 0.5 mrad as well**; 3 mrad
flatters every setup.

## The fire control's own table is optimistic (known inconsistency, not yet fixed)

`HK.meetLookup(cfg)` builds the table the fire control plans with. It test-fires with the tank still and **no gunner
wander** (the trial threats have no `jit`). It reports Kornet best meet 900 m, defeat chance 0.61. In played raids the
cut rate is far lower. Do not quote `best_p` as HKOI's effectiveness. Fixing the table (so it includes wander and own
movement) is an open task that needs Shawn's go-ahead; it changes planning, and results will shift.

## Ways to get a wrong number

- **Survival is not "no hits".** `P_survive = 1 - killed`; each hit kills with the threat's `kill` chance (Kornet 0.5,
  FPV 0.15). `P_no_hits` is the share of raids with no hit at all. They differ by tens of points.
- **Cut rate is not survival and not defeat chance.** `f_cut / f_engaged_obs` counts beams cut per missile engaged with
  obscurant. A missile can be cut and still hit (drift), or never cut and miss (gunner wander, crew smoke, terrain).
- **HKOI only means `c.aps.enabled = false` with `c.hkoi_enabled = true`.** Setting `hkoi_enabled = false` and passing
  an old lookup, or leaving Trophy on, gives a different setup.
- **Rebuild the lookup after every settings change:** `lookup = cfg.hkoi_enabled ? HK.meetLookup(cfg) : {}`. A table built
  for another payload, burst or mix makes the fire control plan for the wrong round. The table is itself noisy (160
  trials per range, fixed seed 99), so the chosen meet range can jump between nearby settings and move survival by a few
  points: that is why 50 g scored below 40 g above (33.5 against 36.6, inside the margin).
- **Sample size.** Margin at 1,000 raids is about ±3 points. Differences smaller than that between two runs are noise.
  A single battle in the 3D game says nothing; 72 battles gave a cut rate of 10% per burst.
- **Same seeds for every setup** (`c.seed = 1`), or the comparison mixes luck with effect.
- **Old figures in docs/CHANGELOG.md are from other settings** ("recommended round" = near-IR fill 2 m2/g, 6-round burst;
  re-lock on; no gunner wander before v16). The 88 to 91% cut rates and "HKOI+APS 90%" there do not describe today's
  defaults. The earlier 99.6% was never reproduced.
- **The Battlefield (3D) layer adds more:** terrain sight lines (`los_clear`), launches from as close as a few hundred
  metres, hull-down (target half height), the tank moving, timed volleys. Expect lower cut rates there than in the
  standard raid. `tests/battle/battle.test.js` prints one battle per setting, which is a smoke test, not a study.
- **Crew matters.** With `crew.enabled = false` the tank never moves or pops smoke. That raises the cut rate and lowers
  survival, because a moving tank also makes blind missiles miss.

## What Shawn has decided or said about the round (13 Nov 2026)

- Payload in the simulator: 40 g (`rnd.payload_g`). Rough packaging estimate for a 30 x 113 mm shell at normal weight
  (about 235 g projectile, 805 m/s): 50 g planning figure with a proximity fuze, about 65 g with a time fuze only, brass
  flake fill. These are estimates, not design figures. 120 g does not fit this calibre.
- **He does not intend a proximity fuze on the anti-missile round:** the computer sets the burst point (programmable
  time fuze). The engine still models the first round of a burst as proximity-fuzed (5 m, 97%, arms at 60 m, 4% early
  bursts over clutter) and later rounds as time-fuzed onto it. Changing this is an offered task awaiting his go-ahead.
- A cut is permanent by his direction (`drift.relock = false`). This is the optimistic choice.
- His earlier cueing concept was bearing-only from the laser warner. The engine aims on a radar track. A time fuze needs
  range, so it needs a tracker.

## Open questions worth an audit (do not "fix" without telling him)

1. Standard raid at 3 mrad cuts 1% even for a lone Kornet, against 15% for a lone Kornet fixed at 2,000 m. Likely cause:
   longer random launch ranges give the crew time to reach evade speed before the burst. Not yet confirmed.
2. Sustain rounds are capped by the time before the gun's next task (`slack` in `resolveObs`). Check whether that rule
   is too tight in two- and three-missile raids.
3. Whether the crew should hold still for the two seconds of the burst and then move.

## Addendum, 14 Nov 2026: Shawn's figures since this was written, and the reference run with them

Read into the branch `claude/loving-newton-czylil` on 14 Nov (this file and `tests/study/hkoi_only.js` came from `main`, commit 9f2724f; the other 11 commits on `main` were not merged, see docs/HANDOFF.md).
Changes to the engine's defaults since the tables above, all at Shawn's direction on 14 Nov, none tuned to a target:

| Setting | Was | Now | His words |
| --- | --- | --- | --- |
| `rnd.payload_g` | 40 | 75 | "each round can hold 75 g of the obscurant". NOTE the packaging estimate above (50 g with a proximity fuze, about 65 g time fuze only, "120 g does not fit"): 75 g is above it. He has been told. |
| `aps.pk_uncued` | 0.80 | 0.85 | "Trophy in real life has a 10 to 15% fail rate" (cued stays 0.90; against drones stays 0.30) |
| `aps.mag_per_side` | 3 | 4 | "Trophy runs dry after 8 shots" |
| `radar.mode` | emcon (silent until cued) | continuous | "the radar is constantly scanning" |
| `radar.max_tracks` | 8 | 64 | "it can track as many threats as it wants" |
| `radar.acq_range_ref_m` | 3000 | 15000 | "ELM-2133 WindGuard ... instrumental detection range of roughly 15 km". An instrumented range is not the pick-up range against a missile-sized target; unverified; he has been told. Every launch in the simulator is inside 6 km, so in practice this means "seen at launch". |
| Kornet teams in battles (`TEAMS.kornet.rmin` in battle.js) | 150 m | 2,000 m | "Kornets must fire between 2 km and 5 km" |
| Magazine | 150 + 150 | unchanged | "the split is 50/50 from 300" |

`node tests/study/hkoi_only.js 1000` on that engine (commit after 53ec946), crew reacting:

| Setup | Survive, gunner 3 mrad | Survive, gunner 0.5 mrad |
| --- | --- | --- |
| No protection | 81.2% ±2.4 | 32.6% ±2.9 |
| Trophy only | 92.9% ±1.6 | 72.8% ±2.8 |
| **HKOI only** | **86.5% ±2.1** | **46.7% ±3.1** |
| HKOI + Trophy | 97.0% ±1.1 | 87.0% ±2.1 |

Beams cut per missile engaged with obscurant: 17 to 18% at 3 mrad (was 1%), 43 to 46% at 0.5 mrad (was 7 to 9%). HKOI only, 0.5 mrad, crew does not move the tank: 56.3% survive, 74% cut.
The payload rows of the script ("50 g", "65 g", "120 g") now read against a 75 g baseline; 120 g scores about the same as 75 g with the tank still (71 to 74% cut): the cloud is no longer the limit there, the crew's movement and the volley are.

Things Claude got wrong or loose on 14 Nov before reading this file, corrected here:
- Quoted `HK.meetLookup` (23/50/54/25/56% at 40 g, 80/93/95/97/98% at 75 g) to Shawn as "the engine's own table" for one Kornet. As this file says, that table has no gunner wander and a still tank: it is the fire control's planning table, NOT HKOI's effectiveness. The reference run above is.
- The raid presets in `src/battle/study.js` ("this setup's enemy"), the per-map study and the stress test all run with `crew.enabled = false` (the tank does not move or pop smoke). That raises the cut rate and lowers survival. It is stated on the numbers screen, but those figures are not comparable with this file's "crew reacting" tables.

Other studies added on 14 Nov (all in `src/battle/study.js`, same seeds for every setup, fire-control table rebuilt per setup):
`tests/battle/raids.js` (21 scenarios), `tests/battle/maps.js` (each map's real opening volleys), `tests/battle/stress.js` (a stream of up to 60 mixed threats arriving in groups until the vehicle is lost), `tests/battle/cloud.js` (which cloud input moves the planning table). Shawn's own v11 notebook uses a fill of 6.7 m2/g (60% carbon 8.5, 30% graphite 5.0, 10% brass 1.0) against the engine's 0.85, and this file records him choosing brass flake: the two disagree by a factor of about eight and the engine's figure has NOT been changed; the stress test offers the notebook fill as a labelled variant.

## Addendum, 16 Nov 2026: Shawn's orders of 16 Nov, and the reference run with them

Engine changes, all at his direction, none tuned to a target (formulas in HKOI_SPEC.md 3.3, 3.8, 3.10, 3.13):

| Setting | Was | Now | Note |
| --- | --- | --- | --- |
| `blind_spin` (Kornet blind flight) | off | **on** | leaves its spiral along the tangent, 15.7 to 31.4 mrad off, no lift (his figures) |
| `fc.table` (fire-control planning table) | still tank, steady gunner | **'honest'** | trials draw a gunner wander 0.5 to 3 mrad (ASSUMED) and move the tank at the 4 m/s steady speed in a random direction (ASSUMED). Fixes the known flaw above |
| `fc.scheduler` | classic | **'smart'** | plans with what it knows at each moment, values Trophy shots left per side and the real meeting range; see the spec 3.13 |
| `drift.relock_kornet` | (new) | **off** | Kornet re-lock flown from the blind state by the real autopilot: built, measured, and dropped by his order the same day. Kept as an option |
| blind missile and gunner wander | a cut, blind missile on course could still be turned into a "gunner's aim wandered" miss | fixed | a blind missile cannot follow its gunner. 13 of 1,791 cut missiles in 2,000 raids, 6 of 479 in 400 battles |

`node tests/study/hkoi_only.js 1000` on these defaults (commit after ac9e7bf):

| Setup | Survive, gunner 3 mrad | Survive, gunner 0.5 mrad |
| --- | --- | --- |
| No protection | 81.2% ±2.4 | 32.6% ±2.9 |
| Trophy only | 92.9% ±1.6 | 72.8% ±2.8 |
| **HKOI only** | **86.1% ±2.1** | **48.1% ±3.1** |
| HKOI + Trophy | 96.7% ±1.1 | 87.2% ±2.1 |

Beams cut per missile engaged: 17 to 18% at 3 mrad, 49 to 53% at 0.5 mrad. Obscurant rounds per raid 21 to 23 (was 28 to 29).
HKOI only, 0.5 mrad: crew does not move 62.8%; 50 g 41.3%; 65 g 45.1%; 120 g 58.9%; Kornet re-lock on 45.6%; spin off 48.2%;
classic scheduler 47.5%; old re-lock rule 43.2%.

Paired comparison, 3,000 raids per row (`node tests/study/engine_1116.js 3000 old,table,spin_table,spin_table_smart`), survival
HKOI only 3 mrad / both 3 mrad / HKOI only 0.5 mrad / both 0.5 mrad:
old 86.1 / 97.1 / 47.8 / 88.0; honest table only 86.0 / 97.0 / 47.0 / 88.3; spin + honest table, classic 85.4 / 96.9 / 48.0 / 87.5;
**spin + honest table + smart (the defaults) 85.7 / 97.1 / 48.6 / 88.3**. No change beyond the margin (about ±1.2 to 1.8); about 20% fewer
obscurant rounds. Trophy shots per raid at 0.5 mrad, both: 1.52 old, 1.40 now.
Bigger volley (6 threats in 8 s, 1,500 raids, with re-lock on at the time): smart against classic +2.0 points HKOI only and +2.7 with Trophy at
0.5 mrad, equal at 3 mrad.

What the planning table chooses for the Kornet (median over 1,000 raids, 3 mrad): old table, spin off: meet 1,325 m, cut at 855 m;
old table with spin on: meet 600 m, cut at 297 m (the table rated every range from 600 m at 0.99, so its ammunition charge picked the
shortest); honest table with spin on: meet 998 m (planned defeat chance 0.88), cut at 534 m.

Cut missiles passing within 2 m of the hull (`node tests/study/cut_pass.js raids 1000`, Shawn's "a missile fly like 1 meter above the
tank"): 3 mrad: old 5% (Kornet 2%), spin with the old table 12% (Kornet 9%), now 6% (Kornet 2%). 0.5 mrad: 8% (Kornet 5%), 13% (9%),
now 8% (Kornet 2%). The rest are Vikhr (helicopter beam-rider, 30 to 36% of its cuts within 2 m) and radio SACLOS (18 to 19%), cut under
600 m: a beam-rider flies 2 to 2.5 m above the sight line, about 1 m over the roof equipment, and those kinds draw a blind lift of
0 to 1 and a 3 mrad heading error, so a late cut barely moves them. Their blind flight is unchanged (no defensible figure yet).

Kornet re-lock as measured before it was dropped (old table, spin on, 3,000 raids, HKOI only, 0.5 mrad): of 3,275 Kornets cut, 971 re-locked
and 628 got back on target (445 hit). The re-locks that can happen come early: median 0.5 s blind, 2.5 to 2.8 m off the beam, about
320 m out, which the autopilot corrects in about a second. A Kornet that drifts far leaves the 4 m beam field and cannot re-lock at all.
This rests on the assumed 4 m field and 0.3 s recapture. Cost: about 4.5 points of HKOI-only survival at 0.5 mrad.

200 standard battles per cell (`node tests/battle/standard.js 200 trained,veteran`), M1 lost, both defences / HKOI only, old engine
against the new defaults with the classic and the smart scheduler:

| Force | Crews | old | new, classic | new, smart |
| --- | --- | --- | --- | --- |
| light | trained | 14 / 51 | 15 / 51 | 14 / 53 |
| light | veteran | 15 / 54 | 16 / 55 | 16 / 54 |
| ambush | trained | 17 / 60 | 18 / 59 | 17 / 61 |
| ambush | veteran | 28 / 64 | 29 / 64 | 24 / 64 |
| drones | trained | 1 / 1 | 1 / 2 | 1 / 2 |
| drones | veteran | 1 / 5 | 3 / 4 | 2 / 4 |
| standoff | trained | 4 / 25 | 4 / 22 | 4 / 23 |
| standoff | veteran | 7 / 43 | 6 / 45 | 6 / 45 |
| heavy | trained | 26 / 71 | 24 / 72 | 23 / 69 |
| heavy | veteran | 45 / 79 | 43 / 79 | 42 / 79 |

Margin about ±7 points a cell. No cell moves beyond it; the smart scheduler is never worse than classic beyond it, so it is the default.
