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
  is there for `kicad-cli pcb export step/glb --subst-models`. The raw
  EasyEDA STEP sits 0.9741 mm off the WRL in Y, so the committed STEP has the
  origin of its root `AXIS2_PLACEMENT_3D` (entity `#15348`) shifted by that
  amount — shifting the `CARTESIAN_POINT`s instead gets applied twice by the
  OCC import chain, and any edit must round-trip the file byte-exactly
  (an earlier encoding-damaged copy made OCC import it as empty geometry).
  Verified via `web/scripts/sync-pcb.ts`'s GLB export: model bbox center
  lands on the footprint to <0.1 µm.
- `DEBUG` (J8) and `GPIO` (J9) headers are marked DNP, so the 3D viewer hides
  their models unless "Models marked DNP" is enabled — this is intentional.

## PCB 3D Viewer

Colors matching the fabbed boards (blue mask, white silk, ENIG) are encoded in
two places:

- **Board stackup** (Board Setup → Physical Stackup, checked into this repo):
  solder mask `rgba(8, 72, 155, 0.902)`, silkscreen `White`, finish `ENIG`.
  Tick "Use board stackup colors" in the 3D viewer to use them. Note:
  `kicad-cli pcb render --use-board-stackup-colors` is broken in KiCad 10.0.5
  (renders the mask black even for stock templates) — use the preset below for
  CLI renders.
- **"fab blue" 3D viewer preset** (machine-local, in KiCad's `3d_viewer.json`):
  soldermask `rgba(8, 72, 155, 0.902)`, silkscreen `rgb(245, 245, 245)`,
  board body `rgba(30, 33, 32, 0.902)`, copper `rgb(191, 156, 59)`.
  Recreate it via 3D viewer → Appearance → save preset if on a new machine.

Render like the fab:

```bash
kicad-cli pcb render --preset "fab blue" --quality high -w 1920 -h 1440 --side top --background opaque --output render.png kicad/light.kicad_pcb
```

(The old manual note — board color #0A244A @ 95% — predates the fabbed boards
and is superseded by the values above, which were matched against photos of
the assembled rev with the blue JLC mask.)
