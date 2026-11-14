# Third-party assets

| File | What | Supplied by | Source and licence |
|---|---|---|---|
| assets/enemy/kornet.glb | 9M133 Kornet launcher, tripod and missile | Shawn, 13 Nov 2026 | archive "9m133-kornet-at-14-spriggan"; author and licence to be confirmed |
| assets/enemy/soldier.glb | Russian soldier, rigged (mixamorig skeleton) | Shawn, 13 Nov 2026 | archive "russian-soldier"; author and licence to be confirmed |
| assets/enemy/fpv.glb | FPV strike drone | Shawn, 13 Nov 2026 | archive "fpv-drone"; file names suggest a commercial game origin. NOT in the repository until confirmed |
| assets/m1/* | M1A2 SEPv2 with Trophy | Shawn | not in the repository while it is public |

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
| assets/crew2_cdr.mp3, crew2_gnr.mp3, crew2_ldr.mp3, crew2_drv.mp3, crew2_any.mp3, crew2_hq.mp3, crew2_index.json (2.2 MB together, not in git) | 126 clips of the crew pack above, chosen clip by clip in `tools/audio/crew_release.json` (in git): the tank crew and the radio net. Same unconfirmed source and licence as the pack. | `python3 -I tools/audio/build_crew.py <work> assets` |

The tank crew no longer uses any machine-made speech. The older strips voice_cdr / voice_gnr / voice_ldr / voice_drv (Kokoro text-to-speech) and voice_panic (generated) stay on disk but are not loaded. Still used from the old set: voice_ru.mp3 (the enemy calls, cut from the Russian crew pack Shawn supplied: human) and screams.mp3 (0 A.D., Wildfire Games, CC-BY-SA 3.0: human), both through voice_index.json.
Who says what, and which events are silent because the pack has no line, is in `src/audio/crewtalk.js`; `node tests/audio/crewtalk.test.mjs` prints the silent lines with counts.
`tools/audio/speakers.py` tried to tell the voice actors apart with a speaker-recognition network: it could NOT separate them reliably (the pack may be one or two people). `tools/audio/recheck.py` re-reads doubtful clips three ways.

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
| smoke_discharge | the smoke grenade dischargers | |
| turbine_in_loop, turbine_out_loop, tracks_loop | engine inside / outside, tracks | must loop cleanly; pitch follows the throttle |
| wind_loop, rain_loop, rain_roof_loop | weather outside; rain on the armour heard inside | must loop cleanly |

Still synthesised with no slot yet: drone motors, turret traverse whir, track squeal, creaks, birds and insects, the far battle rumble, the warning tones and intercom clicks.
Measuring sound without ears: `node tests/audio/render.mjs <scratch folder with node-web-audio-api> assets <out>` renders the real sound code to WAV files, `python3 tests/audio/check.py <out>` passes or fails them, `python3 tests/audio/analyse.py <out> --png <name>` draws spectrograms, `python3 -I tests/audio/hear.py <scene.wav> <Whisper model>` lets a speech recogniser listen to an intercom scene. `bash tools/dev.sh sound <out>` runs the crew-line checks and the page test (tests/beta/sound.py).
