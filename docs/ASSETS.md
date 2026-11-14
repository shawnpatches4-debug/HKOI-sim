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
