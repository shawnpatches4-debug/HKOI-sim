# HKOI system specification with formulas (as built in the simulator, plus Shawn's stated intent)

Version 1, 13 Nov 2026. Owner: Shawn Patches, Pax Kinetics. Concept: "Overtake-and-Bloom", Hyper Kinetic Obscurant
Interceptor (USPTO provisional 64/103,041).

**How to read this.** Every number has a status:
- **MODEL** = what `src/engine.js` uses today (`HK.defaultConfig()`), an assumption unless marked otherwise.
- **INTENT** = what Shawn has said the real system should be. Where INTENT and MODEL differ, the model has **not** been
  changed yet; do not change it without his go-ahead, and never tune a value to reach a result.
- **ESTIMATE** = a rough engineering estimate made in conversation, not a design figure.
- **DATA** = from a public source.

Nothing here comes from a live firing or a chamber test. Companion files: `docs/HKOI_NUMBERS.md` (measured results, how to
measure, common mistakes), `tests/study/hkoi_only.js` (the reference study).

Units: metres, seconds, grams, milliradians (mrad), degrees. `ln` is the natural logarithm.

---

## 1. What the system is

A 30 mm M230LF weapon station on the turret roof of an M1A2 SEPv3, with a fire-control radar, a camera tracker, a laser
warner and a fire-control computer, working with Trophy.

- Against missiles that need a line back to their launcher (laser beam-riders, radio-command SACLOS): fire obscurant
  rounds to burst on the line between the missile and its launcher. The missile's rear receiver loses the beam, the
  missile flies blind and misses. HKOI does not try to hit the missile.
- Against drones, laser-homing and heat-seeking missiles: proximity HE rounds from the same gun.
- Against unguided RPGs and tank rounds: nothing (Trophy takes RPGs; nothing stops a long-rod penetrator).
- Trophy is the inner layer for anything still on course at the vehicle.

Round choice in the model: `obscurant if guidance in {beam_rider, radio_saclos} else HE`; RPG: hold fire.

## 2. Parameters

### 2.1 Gun and mount

| Parameter | Symbol | MODEL | Notes |
| --- | --- | --- | --- |
| Gun | | M230LF, 30 x 113 mm | DATA |
| Rate of fire | ROF | 200 rounds/min, so 0.3 s between rounds | DATA for M230 family |
| Muzzle velocity | v0 | 805 m/s, sigma 5 m/s | DATA (M789) |
| Drag constant at sea level, 15 C | k_ref | 2.4e-4 per metre | MODEL |
| Burst | n | 4 rounds, then up to 8 single sustain rounds | MODEL |
| Magazine | | 150 obscurant + 150 HE | MODEL (spec sheet said 80 + 40) |
| Dispersion | sigma_disp | 2 mrad + 0.015 mrad per round already fired | MODEL |
| Pointing error | sigma_point | 0.5 mrad + 0.12 mrad per m/s of vehicle speed (+2 mrad for about 1 s after a lurch or main-gun shot) | MODEL |
| Boresight bias | | 0.7 mrad, fixed per mission, each axis | MODEL |
| Traverse / elevation rate | w_az, w_el | 90 deg/s, 60 deg/s; main turret adds 40 deg/s on swings over 15 deg | MODEL |
| Mount acceleration | a | 400 deg/s^2 | MODEL |
| Settle time | t_settle | 0.2 s | MODEL |
| Elevation limits | | -10 to +60 deg | MODEL |
| Blind arc | | 155 to 205 deg relative to the turret (can be unmasked by swinging the turret, at a time cost) | MODEL, to confirm |
| Jam | | 2% per burst, 4 s to clear | MODEL |
| Fire-control latency | t_fc | 0.3 s | MODEL |

### 2.2 Obscurant round

| Parameter | Symbol | MODEL | INTENT / ESTIMATE |
| --- | --- | --- | --- |
| Payload mass | m | 40 g | ESTIMATE: about 50 g with a proximity fuze, about 65 g (best case 75 g) with a time fuze only, brass flake, projectile kept near 235 g so v0 holds. 120 g does not fit 30 x 113 mm. |
| Mass extinction coefficient at the guidance wavelength | alpha | 0.85 m^2/g (flake or fibre, literature value) | Must be measured in a chamber at the threat laser wavelength. Fine carbon may reach about 2 m^2/g but packs at lower density. |
| Screening area per round | A = alpha*m | 34 m^2 | 55 m^2 at 65 g |
| Cloud radius at formation | sigma0 | 2 m (Gaussian 1-sigma) | MODEL |
| Formation time | t_form | 0.3 s | MODEL |
| Fuze, first round of a burst | | proximity: triggers within 5 m, arms at 60 m, 97% reliable, 4% early burst over ground clutter (x0.5 open, x1 mixed, x2 urban) | **INTENT: no proximity fuze. Programmable time fuze; the computer sets the burst point.** |
| Fuze, later rounds | | time-fuzed onto the first burst point | same as INTENT |
| Fuze timing error (co-located rounds) | | 4 ms | MODEL |
| Lock-break threshold | tau_lock | 4.6 optical depth (transmission 1%, OD 2.0) | From the spec sheet |

### 2.3 HE round, sensors, Trophy

| Parameter | MODEL |
| --- | --- |
| HE kill chance per full burst | drone 0.70, missile 0.20, before dodging and upset factors |
| HE lethal radius against a drone | 12 m |
| Laser warner | bearing sigma 8 deg, latency 0.1 s, reference detection 0.95, half-range 4 km for beam-riders |
| Passive radio detector | radio-linked drones at up to 3,500 m, +0.5 s |
| Fire-control radar | silent until first warning (EMCON); pick-up 3,000 m on 0.02 m^2; track 2 mrad; track time 0.5 s (0.25 s with AI); 8 tracks |
| AI fire control | track error x0.5, pick-up range x1.1, removes 80% of a weaving missile's weave |
| Camera tracker | 0.3 mrad inside 3,000 m when extinction is 1.2 per km or less |
| Trophy | radar 1,000 m; 3 interceptors per side; 0.6 s reset per side; kill 0.9 cued by HKOI's track, 0.8 uncued, 0.3 against drones; held back half the time when friendly infantry are close |

### 2.4 Threats

| Threat | Guidance | Speed m/s | Launch range m | HKOI response | Kill chance if it hits |
| --- | --- | --- | --- | --- | --- |
| Kornet-class | laser beam-rider | 250 | 300 to 5,500 | obscurant | 0.50 |
| Vikhr-class (helicopter) | laser beam-rider | 610 | 1,500 to 8,000 | obscurant | 0.50 |
| Radio-command SACLOS | wire/radio command | 400 | 400 to 6,000 | obscurant (works 60% of the time when the cloud blocks) | 0.50 |
| Semi-active laser | laser homing | 300 | 500 to 8,000 | HE | 0.55 |
| Fire-and-forget IR | heat seeker | 200 | 300 to 4,000 | HE | 0.60 |
| FPV drone (radio or fibre) | operator | 30 | 300 to 4,000 / 10,000 | HE | 0.15 |
| RPG | unguided | 250 | 80 to 500 | none | 0.30 |
| Tank round (APFSDS) | none | 1,700 | 300 to 4,000 | none | 0.35 |

Enemy gunner aim wander (beam-riders, SACLOS, SAL): 3 mrad 1-sigma by default (Shawn's choice), half slow drift
(0.3 to 3 Hz), half tremor (8 to 12 Hz). 0.5 mrad is used for an expert gunner.

---

## 3. Formulas

### 3.1 Atmosphere

```
rho  = (1 - 2.25577e-5 * altitude_m)^5.25588 * 288.15 / (273.15 + temp_C)     air density relative to sea level, 15 C
k    = k_ref * rho                                                             round drag constant, per metre
K    = K_ref * max(0.15, 0.25 + 0.25 * wind)        K_ref = 2 m^2/s            cloud spreading rate (equals 2 at 3 m/s wind)
```
Weather sets extinction of clear air `beta` per km (clear 0.1, haze 0.5, rain 1.0, dust 2.5, fog 4.0), cloud washout
rate `w` per second (rain 0.20, fog 0.05, else 0) and default wind (clear 3, rain 6, dust 8, fog 1 m/s).

### 3.2 Round flight (drag proportional to speed squared)

```
dv/ds = -k * v
v(t)  = v0 / (1 + k*v0*t)                 speed after time t
s(t)  = ln(1 + k*v0*t) / k                distance after time t
t(s)  = (exp(k*s) - 1) / (k*v0)           time to reach distance s
drop(t) = 0.5 * g * t^2                   g = 9.81
wind drift(s,t) = w_cross * (t - s/v0)    lag rule
```
Worked example, sea level: s = 900 m gives t = 1.25 s and v = 649 m/s. s = 2,000 m gives t = 3.2 s and v = 498 m/s.

### 3.3 Where the round meets the missile

Missile at distance `rem` from the vehicle when the round is fired, closing at speed `vm`. Solve for the round's flight
time `t`:
```
s(t) + vm * t = rem            (Newton iteration from t = rem/(v0 + vm))
meet distance d = s(t)
```
To meet a Kornet (250 m/s) at d = 900 m the gun fires when the missile is at 900 + 250*1.25 = 1,212 m.
Closing speed at the meet is about 649 + 250 = 900 m/s.

Meeting range choice: before the fight the fire control builds a table `p(d)` for d = 400 ... 2,500 m by trial
engagements and picks `argmax [ p(d) - 0.003 * rounds(d) ]`. Known flaw: the trials use a still tank and a steady
gunner, so `p` is optimistic (see HKOI_NUMBERS.md).

### 3.4 Warning, track and time line

Laser warner against a beam-rider at distance d (km), checked as the missile closes:
```
Pd(d) = 0.95 * (strength/0.25) * exp(-beta*d) / (1 + (d/4)^2)        capped at 0.995
```
Radar pick-up range for cross-section `rcs`:
```
R_acq = 3000 * (rcs/0.02)^0.25 * exp(N(0, 0.5)) * clutter * (1.1 with AI)     also limited by terrain line of sight
```
Time line for one engagement:
```
t_cue    = time missile reaches detection distance + 0.1
t_track  = max(t_cue + 0.15, time missile enters R_acq) + 0.25 (AI) or 0.5
t_fire   = max(t_track + t_fc, gun free) + slew + t_settle
slew(theta) = 2*sqrt(theta/a)                  if theta < w^2/a      (never reaches full rate)
            = theta/w + w/a                    otherwise
```
with `w` = 90 deg/s (130 with turret assist, plus 0.1 s) and `a` = 400 deg/s^2. A 45 deg swing takes about 0.77 s
with turret assist (0.67 s + 0.1 s spin-up), plus 0.2 s settle.

### 3.5 Where the burst lands (aim error)

At meet distance d, each round's miss from the aim point, per axis:
```
sigma_track = min(radar 2 mrad * (0.5 with AI), camera 0.3 mrad if usable) + 0.08 mrad per m/s vehicle speed
sigma_aim   = sqrt(sigma_track^2 + sigma_point^2)           common to the whole burst
error_round = N(0, sigma_aim)*d + bias*d + N(0, sigma_disp)*d + wind-estimate error + drop error
```
At d = 900 m, tank halted, camera usable: common error about 0.5 m, bias about 0.6 m, round-to-round scatter about 1.8 m.
Wind is known to 1.5 m/s and air density to 2%.

### 3.6 Fuze

MODEL: a round "blooms" by proximity if armed (d >= 60 m), passes within 5 m of the missile, and the fuze works (0.97).
Once one round has bloomed, every later round is time-fuzed to that same point, shifted to follow the beam's predicted
movement and offset upwind by `min(6, w_cross * hold/2)` metres. If no round blooms the burst is wasted (`fuze_miss`).

INTENT: all rounds time-fuzed to a computed point. Consequences to model when approved:
```
along-track placement error = closing speed * timing error + range error     (about 0.9 m per millisecond at a 900 m meet)
```
Along-track error matters little: the cloud only has to sit on the launcher-to-missile line somewhere behind the
missile. Lateral error (3.5) is what counts. A time fuze needs range to the missile, so it needs the radar or a
laser rangefinder, not the laser warner alone; and the gun needs a fuze setter.

### 3.7 The cloud (Gaussian puff)

Each burst is a spherical Gaussian puff of mass `m`, centre drifting with the wind, spreading with time:
```
sigma^2(age) = sigma0^2 + 2*K*age                        age measured from burst + t_form
mass left    = m * exp(-w*age)                           washout in rain or fog
```
Optical depth through the centre of one puff, along a line:
```
tau_centre(age) = alpha * m * exp(-w*age) / (2*pi*sigma^2(age))
```
Optical depth along the straight line from the missile's tail A to the launcher B, for puff centre at perpendicular
distance b from the line and distance `along` from A along it (L = length AB):
```
tau = sum over puffs of  alpha*m*exp(-w*age) / (2*pi*sigma^2) * exp(-b^2 / (2*sigma^2))
                         * 0.5 * [ erf((L - along)/(sigma*sqrt2)) + erf(along/(sigma*sqrt2)) ]
```
Worked values for one 40 g round, alpha 0.85, wind 3 m/s (K = 2): 1.35 at formation, 0.68 one second later,
0.45 two seconds later. For 65 g: 2.20, 1.10, 0.73.

### 3.8 The cut

```
tau_need = max(0.5, tau_lock - beta * L_km)        L_km = launcher-to-cloud distance in km (at least 0.1)
cut when tau >= tau_need                           tested every 0.02 s against true 3D positions
transmission = exp(-tau)                           tau 4.6 is 1%
```
Clear air: `tau_need` is about 4.5 at 1 km. Dust (beta 2.5) lowers it to about 2.1 at 1 km.
A cut is permanent (`drift.relock = false`, Shawn's direction; optimistic). If re-lock is switched on, the missile gets
its beam back when the line has been clear for 0.3 s, it is within 4 m of the beam and more than 200 m out.
SACLOS: when blocked, the cloud breaks the launcher's tracker with probability 0.6.

**Rule of thumb for rounds needed (ESTIMATE, derived from 3.5 and 3.7, not from the engine):** N rounds placed with
lateral scatter sigma_p and average age `a` give, at the centre,
```
tau ≈ N * alpha * m / ( 2*pi * (sigma0^2 + sigma_p^2 + 2*K*a) )
N_needed ≈ tau_need * 2*pi * (sigma0^2 + sigma_p^2 + 2*K*a) / (alpha * m)
```
With sigma0 = 2 m, sigma_p = 1.9 m, K = 2, a = 1 s, tau_need = 4.5: about 10 rounds at 40 g, 6 at 65 g, 3 at 120 g,
and that is with the beam held on the cloud centre. At 0.3 s per round, 10 rounds take 2.7 s, in which a Kornet
travels 675 m. Rate of fire and payload, not accuracy, are the binding limits.

### 3.9 What pulls the beam off the cloud

```
gunner wander at the cloud  = jitter_mrad/1000 * (distance from launcher to cloud)      3 mrad at 1,100 m = 3.3 m
own-movement sweep          = v_lateral_tank * (1 - d/R) * time since the cloud was laid
wind                        = w_cross * age
```
Compare each with the cloud radius sigma (2 m growing to 2.8 m after 1 s). The fire control leads for own movement
(it reads the driver's controls 1.2 s ahead) and offsets upwind; it cannot predict gunner wander.

### 3.10 The missile (guided, then blind)

Guided flight uses a second-order autopilot toward the (wandering) beam centre:
```
a_cmd = wn^2 * (target - pos) + 2*zeta*wn * (target_rate - vel)      wn = 2.5 rad/s, zeta = 0.7
a     follows a_cmd with a 0.12 s lag, limited to 15 g; gravity acts throughout
```
A beam-rider flies 2.5 m above the sight line until the last 300 m (Kornet), 2.0 m (Vikhr).
At the cut the missile keeps its velocity and gets:
```
heading error  = N(0, 3 mrad) each axis
lateral accel  = N(0, 1 m/s^2)
vertical accel = -g*(1 - lift) + N(0, 1 m/s^2)       lift uniform 0..1 (default "drift")
                                                      lift = 0 "free fall" (spec sheet), lift = 1 "hold course"
```
Blind position after time t: `y = y0 + v*t*hy + 0.5*ay*t^2`, same form for z.
Outcome: ground short of the tank (z reaches 0), miss, or hit if at the vehicle plane
`|y - tank| <= half width and |z - centre| <= half height` (half width 1.85 m front, 3.95 m flank; half height 1.2 m,
plus roof equipment 0.9 m high, 1.25 m half width; half height x0.5 when hull-down).

### 3.11 HE against drones

```
P_kill(burst) = Pk * (rounds/4) * Rk^2 / (Rk^2 + dj^2) * (0.8 during a stabiliser upset)
dj = 0.5 * jink_g * 9.81 * t_flight^2 * 0.6           jink_g 1.2 (x0.4 novice, x1.7 expert, x1.6 on follow-up bursts)
Rk = 12 m for drones
```
An expert pilot wastes a burst outright 25% of the time by feinting. After a miss the gun fires again once the drone
has closed about 120 m.

### 3.12 Trophy and survival

```
Trophy fires at each threat still on course if: enabled, not inhibited, side magazine > 0, side reset (0.6 s) complete
P_kill = 0.3 (drone) | 0.9 (HKOI radar track exists) | 0.8 (no HKOI track)
vehicle killed if any hit "kills":  each hit kills with the threat's kill chance (table 2.4)
P_survive = 1 - mean(killed)          P_no_hits = share of raids with no hit at all
margin (95%) = 1.96 * sqrt(p*(1-p)/N)
```

---

## 4. Measured performance of the model (see HKOI_NUMBERS.md for method)

Standard raid, 1,000 raids, survival: no protection 80.3% / Trophy 91.1% / HKOI only 83.7% / both 96.2% at 3 mrad
gunner wander; 30.7 / 64.7 / 36.6 / 80.4 at 0.5 mrad. Beams cut: 1% and 7% of missiles engaged with obscurant.
One Kornet from 2,000 m, tank still, steady gunner: 58% cut. HKOI only at 0.5 mrad with 65 g: 40.5% (33% cut);
with 120 g: 56.3% (72% cut).

## 5. Differences between the original spec sheet, the model and current intent

| Topic | Spec sheet | MODEL | INTENT now |
| --- | --- | --- | --- |
| Aiming | laser-warner bearing only | radar track + camera | tracker needed for a time fuze; bearing-only not modelled |
| Fuze | proximity ("overtake") | proximity first, then time | time fuze on every round |
| Burst | 4 rounds | 4 + up to 8 sustain | open |
| Payload | about 40 g | 40 g | as much as fits: 50 to 65 g estimate |
| Envelope | 800 to 3,500 m | meet 400 to 2,500 m, best 900 m for Kornet | open |
| Blind missile | free fall | drift with random lift | open (unknown real behaviour) |
| Re-lock | not covered | off | off |
| Magazine | 80 + 40 | 150 + 150 | open |

## 6. Open design questions

1. Measure alpha at the threat wavelength, and the real cloud radius and spreading rate (chamber test first).
2. Real cavity volume and fuze mass for a 30 x 113 mm carrier shell (ask Northrop Grumman; XM1211 body is the nearest).
3. Fuze setter for the M230LF.
4. Does holding the tank still for the burst help more than moving? (model study, not yet run)
5. Make the planning table include gunner wander and own movement.
6. Is 3 mrad the right default gunner wander? It lets 80% of unprotected tanks survive, against the 80 to 90% hit rate
   usually credited to Kornet.
7. Larger calibre (30 x 173 mm, 40 mm) as the route to a 100 g class payload.
