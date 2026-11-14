# Third-party assets

| File | What | Supplied by | Source and licence |
|---|---|---|---|
| assets/enemy/kornet.glb | 9M133 Kornet launcher, tripod and missile | Shawn, 13 Nov 2026 | archive "9m133-kornet-at-14-spriggan"; author and licence to be confirmed |
| assets/enemy/soldier.glb | Russian soldier, rigged (mixamorig skeleton) | Shawn, 13 Nov 2026 | archive "russian-soldier"; author and licence to be confirmed |
| assets/enemy/fpv.glb | FPV strike drone | Shawn, 13 Nov 2026 | archive "fpv-drone"; file names suggest a commercial game origin. NOT in the repository until confirmed |
| assets/m1/* | M1A2 SEPv2 with Trophy | Shawn | not in the repository while it is public |
| models_src/t72_s, models_src/t90_s | T-72B3 and T-90 line-up packs, unprocessed originals | Shawn, 14 Nov 2026 | IN the repository at his explicit direction while it was public; author and licence to be confirmed |

Processing: textures resized to 1024 and stored as WebP; the drone simplified to 30% of its triangles (tools: FBX2glTF, trimesh, gltf-transform).
Rejected: "m1a1-abrams-main-battle-tank" (game-mod model, token interior, lower detail than the current exterior).

## Sound packs

| File | What | Supplied by | Source and licence |
|---|---|---|---|
| crew_dialogs_ground_en_us.assets.bank (18.5 MB, kept in .cache/audio/crew_dialogs_ground_en_us/, not in git) | Tank crew voice pack, US English. FMOD sound bank holding 1042 voice clips (38.3 minutes, mono Ogg Vorbis, 22 to 44.1 kHz), with no clip names. 522 distinct recordings; the second half of the bank repeats the first. Crew orders and reports (driver, loader, gunner, commander), damage reports, wounded calls, and a radio net ("Blackjack", "Banshee One Three", "Brimstone Four Zero"). | Shawn, 13 Nov 2026 | **Source and licence: to be confirmed by Shawn; do not redistribute.** The file name and layout look like the crew voice file of a commercial game. |
| assets/crewvoice_cdr.mp3, crewvoice_gnr.mp3, crewvoice_ldr.mp3, crewvoice_drv.mp3, crewvoice_any.mp3, crewvoice_index.json (4.4 MB together, not in git) | 303 clips cut from that pack: one strip per crewman plus an index. Made by tools/audio/build_strips.py | built from the pack above | same as the pack: unconfirmed, do not redistribute |

Rules for sound packs: the bank, the decoded clips and the built strips stay out of git (`assets/`, `.cache/`, `*.mp3` and `*.bank` are ignored; never `git add -f`). Only the scripts and the hand-written map of clip numbers to lines are in git.
While the source is unconfirmed, publishing a build that contains `assets/crewvoice_*` puts this audio on Shawn's private beta page: that is his decision. Without those six files the simulator falls back to the older recorded voices by itself.

### How a pack is processed (tools/audio/, each script explains itself at the top)
1. `fsb_unpack.py <bank> <work> <python-fsb5 folder>`: one .ogg per clip. Needs the current python-fsb5 sources (the PyPI 1.0 release cannot decode 16 of these clips) and libogg/libvorbis.
2. `transcribe.py <work> <model folder>`: speech to text with Whisper small.en through sherpa-onnx (model archive from the k2-fsa/sherpa-onnx "asr-models" release on GitHub; huggingface.co and openaipublic.azureedge.net are blocked in the cloud workspace). About 25 minutes for this pack.
3. `features.py <work>` (and optionally `cluster.py <work>`): length, loudness, pitch and voice colour of every clip.
4. Write the map by hand: `tools/audio/<pack>.map.json` says which clip numbers are which line, who speaks it and which event it is. `catalogue.py <work> <map>` then writes catalogue.json, catalogue.csv and catalogue_summary.txt (kept in .cache/audio/<pack>/).
5. `build_strips.py <work> <assets> [prefix]`: trims silence, sets every clip to the same loudness (speech at -19 dB, peaks under -1.5 dB), writes one mono 80 kbit/s mp3 strip per speaker and `<prefix>_index.json`. `check_strips.py <assets> [prefix]` measures the result.
6. In the page: `sound.cue(who, event, level)` plays a pack line; `Sound._event` in src/audio/sound.js maps the engine's crew lines to events; `voiceLine` in src/app/main.js maps battle-log lines to events. `tests/beta/voicepack.py` checks all of it in the real page.

Nobody has listened to this pack in the workspace. What each clip says comes from speech-to-text; 67 of the 415 distinct takes are marked as guesses in the map (for example the loader's very short "Up!").
A new pack (guns, explosions, engines) takes the same steps 1, 3, 4, 5 with its own map and prefix; effects need no transcripts.
(Step 6 above describes the first wiring. For the release the page uses the crew2 files below: `src/audio/crewtalk.js` decides the lines from battle events, `src/audio/intercom.js` plays them, `tests/beta/sound.py` checks them in the real page.)

### Release crew voices (human recordings only)
| File | What | Made by |
|---|---|---|
| assets/crew3_cdr.mp3, crew3_gnr.mp3, crew3_ldr.mp3, crew3_drv.mp3, crew3_any.mp3, crew3_hq.mp3, crew3_index.json (2.7 MB together, kept out of the repository; the page loads these, and falls back to the earlier 126-clip crew2_* set when they are missing) | 151 clips of the crew pack above, chosen clip by clip in `tools/audio/crew_release.json` (in git): the tank crew and the radio net. Same unconfirmed source and licence as the pack. | `python3 -I tools/audio/build_crew.py <work> assets` |

The tank crew no longer uses any machine-made speech. The older strips voice_cdr / voice_gnr / voice_ldr / voice_drv (Kokoro text-to-speech) and voice_panic (generated) stay on disk but are not loaded. Still used from the old set: voice_ru.mp3 (the enemy calls, cut from the Russian crew pack Shawn supplied: human) and screams.mp3 (0 A.D., Wildfire Games, CC-BY-SA 3.0: human), both through voice_index.json.
Who says what, and which events are silent because the pack has no line, is in `src/audio/crewtalk.js`; `node tests/audio/crewtalk.test.mjs` prints the silent lines with counts.
`tools/audio/speakers.py` tried to tell the voice actors apart with a speaker-recognition network: it could NOT separate them reliably (the pack may be one or two people). `tools/audio/recheck.py` re-reads doubtful clips three ways.

### Four voices and the made lines (third pass)
| File | What | Made by |
|---|---|---|
| assets/crew4_cdr.mp3, crew4_gnr.mp3, crew4_ldr.mp3, crew4_drv.mp3, crew4_hq.mp3, crew4_index.json (5.6 MB together, kept out of the repository; the page loads these first and falls back to crew3_*) | The same pack clips RE-VOICED so that the four men sound different (pitch and formants moved independently with the Rubber Band library through ffmpeg, pace, microphone colour: settings in `tools/audio/voicelib.py`), plus the lines the pack does not have: 16 words cut out of pack clips (`tools/audio/splice.py`) and about 180 lines synthesised with the open Kokoro v1.0 model (Apache-2.0; stock voices, NOT a copy of the pack actor), each in the man's voice treatment and matched to his real lines in loudness and tone colour. Every index entry carries `made`: '' (the pack's recording), 'splice', 'synth' or 'recorded'. | `python3 -I tools/audio/build_voices.py <work> assets <Kokoro folder> <Whisper folder> <splice folder> [drop-in folder]` |

Shawn authorised making the missing lines on 14 Nov 2026. The wordings are in `tools/audio/made_lines.json`. To replace a made line with a real recording: put `<WHO>.<event>.<level>.wav` (level 0 calm, 1 tense, 2 shouted; for example `CDR.missile_3.1.wav`) into a folder, give that folder to build_voices.py as its last argument, and rebuild. `python3 -I tools/audio/voice_report.py assets <work> crew4 --list` prints how the four voices measure and the full list of made lines with how far each is from the man's real lines. The Kokoro model is `kokoro-multi-lang-v1_0.tar.bz2` from the "tts-models" release of k2-fsa/sherpa-onnx on GitHub.

### Sound slots: dropping in recordings
Every sound that is not a voice is synthesised in code until recordings arrive. `assets/sfx_index.json` (a copy of `tools/audio/sfx_index.template.json`) names a recording for any slot; a slot with an empty list stays synthesised. No code changes are needed.
Entry: `{ "file": "sfx/name.mp3", "start": seconds, "len": seconds, "gain": 1 }` (start, len and gain optional; several entries for one slot are picked at random). Record weapons close (5 to 15 m) and dry: the simulator adds the delay, the loss of highs and the level for distance, the country's echo and the muffling inside the hull itself.

| Slot | Heard when | Notes |
|---|---|---|
| gun30_out, gun30_in | one 30 mm round, outside / inside the turret | one round per entry; the simulator fires them at the gun's rate |
| gun120_out, gun120_in | the main gun | inside: slam, breech, stub case, fume extractor |
| mg50_out, mg50_in, mg762_out, mg762_in | one round of the .50 / the 7.62 mm | single rounds |
| aps_out, aps_in | Trophy firing | the double crack as one file |
| launch_small, launch_big | RPG / guided missile launch, at the launcher | |
| flyby, crack | a missile passing; the crack of a supersonic round passing | |
| explosion_small, explosion_medium, explosion_large, airburst | blasts by size | close and dry |
| hit_in | a round striking the vehicle, heard inside | |
| pen_in, nearmiss_in | heard inside: a round coming through the armour (crack, spall, venting), on top of hit_in; a near miss | |
| smoke_discharge | the smoke grenade dischargers | |
| turbine_in_loop, turbine_out_loop, tracks_loop | engine inside / outside, tracks | must loop cleanly; pitch follows the throttle |
| wind_loop, rain_loop, rain_roof_loop | weather outside; rain on the armour heard inside | must loop cleanly |

Still synthesised with no slot yet: the fire and penetration alarm, a fire burning inside, drone motors, turret traverse whir, track squeal, creaks, birds and insects, the far battle rumble, the warning tones and intercom clicks.
Measuring sound without ears: `node tests/audio/render.mjs <scratch folder with node-web-audio-api> assets <out>` renders the real sound code to WAV files, `python3 tests/audio/check.py <out>` passes or fails them, `python3 tests/audio/analyse.py <out> --png <name>` draws spectrograms, `python3 -I tests/audio/hear.py <scene.wav> <Whisper model>` lets a speech recogniser listen to an intercom scene. `bash tools/dev.sh sound <out>` runs the crew-line checks and the page test (tests/beta/sound.py).

## Enemy tanks: T-72B3 and T-90M (made 14 Nov 2026 from the line-up packs in models_src/)

| File (all in assets/veh/, not in git) | What |
|---|---|
| t72.json (3.3 MB) | T-72B3 with Kontakt-5, variant "1_T_72B3" of models_src/t72_s. About 40,500 triangles close up + 8,900 in the light copy for the middle distance. Pieces: hull, turret, gun, kord, trackL, trackR, wheel_00 to wheel_15, lod1_hull, lod1_turret, lod1_gun, lod1_track, lod1_gear |
| t72_c.webp (2048), t72_n.webp (1024), t72_rm.webp (1024), t72_track_c.webp (512) | colour ("Standard" scheme), normal map, roughness + metallic packed (green, blue), track colour with its cut-out |
| t90.json (4.8 MB) | T-90M with the Kord roof gun, variant "4_T_90M_Kord" of models_src/t90_s. About 49,200 triangles close up + 12,800 in the light copy (the turret's many small armour pieces will not reduce further without holes) |
| t90_c.webp (2048, with cut-out), t90_n.webp, t90_rm.webp, t90_track_c.webp | as for the T-72 |
| kord_c.webp (512) | the Kord machine gun, used by both |

Author and licence of both packs are unconfirmed (see models_src/README.md): the converted files stay out of git like every other asset.
The pictures are not inside the .json files: the page attaches them by name (SPEC in src/render/vehmodels.js). The .json carries, in its
scene "extras", where the turret and the gun turn, the muzzle, and every wheel's axle and radius.

How they were made (S = any scratch folder outside the repository; the converters are in .cache/conv):
```
unzip models_src/t72_s/source/T72B3_Lineup.zip -d S/t72;  unzip models_src/t90_s/source/T90_Lineup.zip -d S/t90
python3 tools/lineup_split.py S/t72/T72B3_Lineup.obj "1_T_72B3__" S/t72/parts 'hull=^(Base|K5_B3)$' 'turret=^(turret|B3)$' 'kord=^Kord' 'trackL=TanktrakL' 'trackR=TanktrakR'
python3 tools/vehicle_pack.py S/t72/parts S/t72/pack t72 hull=hull,trackL,trackR turret=turret,kord wheels=hull
python3 tools/vehicle_join.py S/t72/pack t72 assets/veh/t72.json $PWD/.cache/conv/node_modules/.bin/gltf-transform ratio=0.3 err=0.004 far=0.1
python3 tools/vehicle_tex.py S/t72/textures assets/veh c:RU_T72B3_Standard_BaseColor.png:t72_c:2048 n:RU_T72B3_Normal.png:t72_n:1024 rm:RU_T72B3_Roughness.png,RU_T72B3_Metallic.png:t72_rm:1024 c:RU_T72B_track_BaseColor.png:t72_track_c:512 c:Kord_BaseColor.png:kord_c:512

python3 tools/lineup_split.py S/t90/T90_Lineup.obj "4_T_90M_Kord__" S/t90/parts 'hull=^Chassis$' 'turret=^(turret|BaseArmor)$' 'kord=^Kord' 'trackL=TanktrakL' 'trackR=TanktrakR'
python3 tools/vehicle_pack.py S/t90/parts S/t90/pack t90 hull=hull,trackL,trackR turret=turret,kord wheels=hull
python3 tools/vehicle_join.py S/t90/pack t90 assets/veh/t90.json $PWD/.cache/conv/node_modules/.bin/gltf-transform ratio=0.2 err=0.006 far=0.08
python3 tools/vehicle_tex.py S/t90/textures assets/veh c:RU_T90M_Standard_BaseColor.png:t90_c:2048 n:RU_T90M_Normal.png:t90_n:1024 rm:RU_T90M_Roughness.png,RU_T90M_Metallic.png:t90_rm:1024 c:RU_TrackOld_BaseColor.png:t90_track_c:512
```
What the new tools do. `vehicle_join.py`: takes vehicle_pack's hull, turret and wheels, trues the vehicle by its two rows of roadwheels
(the T-90 was 1.3 degrees out), finds the turret ring (the middle of the turret's lowest rim), cuts the gun out of the turret (the long thin
piece pointing forward and everything round it) so it can elevate and recoil, reduces the triangles, makes the light copy without the
small fittings, and writes one .json. `vehicle_tex.py`: resizes pictures to WebP and packs roughness with metallic.
The other paint schemes in the packs (Alternative, Set_L1, Set_L2, Winter) are not converted; one `vehicle_tex.py` job each would do it.
Other variants in the packs: T-72B3M, B3M obr. 2016 with side armour, B3A / B3AM with an active protection fit; T-90, T-90A, T-90M with
bar or bag armour or "Arena", and three "Razvedchik" variants.
If assets/veh/t72.json or t90.json is missing the page draws a plain tank shape made in code instead (and says so in the console).
