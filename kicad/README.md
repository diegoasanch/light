# Configuring KiCad

No configuration needed: all project symbols, footprints and 3D models live in
`kicad/libs/` and are referenced via the built-in `${KIPRJMOD}` variable
(the directory containing the project file), so a fresh clone renders the full
3D board out of the box.

> Historical note: the project previously required a manually configured
> `LIGHT_PROJECT_LIB_DIR` path variable (`Preferences > Configure Paths...`).
> That was replaced with `${KIPRJMOD}/libs` in 2026-08 — if your KiCad still
> has the old variable defined, it is unused and can be deleted.

Stock-library models are referenced through `${KICAD9_3DMODEL_DIR}`; KiCad 10
resolves the legacy variable to its own model directory automatically (the
`.wrl` references resolve to the shipped `.step` files).

## 3D model sources

- `libs/RP2350_KiCad/` — symbol, footprint and STEP for the RP2350A from
  [HDR/RP2350_KiCad](https://github.com/HDR/RP2350_KiCad) (GPL-3.0, LICENSE
  included in the directory).
- `libs/GT-EVA01AA-L1.pretty/` — rotary encoder (G-Switch GT-EVA01AA-L1,
  LCSC C17702124) WRL/STEP fetched from the EasyEDA parts API via
  `easyeda2kicad`. The WRL is referenced by the board; the same-basename STEP
  is there for `kicad-cli pcb export step --subst-models`.
- `DEBUG` (J8) and `GPIO` (J9) headers are marked DNP, so the 3D viewer hides
  their models unless "Models marked DNP" is enabled — this is intentional.

## PCB 3D Viewer

- Board color: #0A244A, 95% opacity
