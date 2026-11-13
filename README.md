# HKOI mission simulator

Browser simulator for the HKOI "Overtake-and-Bloom" concept (Pax Kinetics).

- `src/` build sources. `python3 src/patch15.py` (run inside `src/`) assembles the single-page sim.
- `build/` the last published single-file build (needs the `assets/` folder beside it to load models and audio).
- `tests/` engine consistency test (`node invariants.js`) and headless-browser checks.
- `docs/OVERHAUL_SPEC.md` the agreed scope of the overhaul. `docs/CHANGELOG.md` notes for every version.

Third-party models and audio are not in this repository.
