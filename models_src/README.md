# Source model packs

Added 14 Nov 2026 at Shawn's explicit direction, so they are available to Claude Code (he could not upload them there).
The repository was public at the time; he was told and chose to add them anyway. Author and licence of both packs are
unconfirmed: do not copy them elsewhere or credit them until he supplies the source.

- `t72_s/`: T-72B3 line-up. `source/T72B3_Lineup.zip` (multi-variant OBJ) + `textures/` (hull, track, Kord machine gun).
- `t90_s/`: T-90 line-up (T-90, T-90M, a third "Razv" variant). `source/T90_Lineup.zip` + `textures/`.

These are unprocessed originals. To make a game-ready vehicle: unzip the line-up, cut one variant out with
`tools/lineup_split.py`, pack hull and turret with `tools/vehicle_pack.py` (see CLAUDE.md, "Map of the code"), and put
the result in `assets/veh/` (which stays out of git). Everything else Shawn supplied is still only in `hkoi-assets.zip`.
