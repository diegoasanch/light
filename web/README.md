# light — web PCB viewer

Interactive three.js viewer for the board, rendered from the actual KiCad
design data. Next.js + react-three-fiber; later destined to be embedded in a
portfolio page.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm sync-pcb   # re-extract geometry after editing kicad/light.kicad_pcb
```

## Data pipeline (`pnpm sync-pcb`)

Two generated artifacts live in `public/pcb/` (committed, so the app runs
without a KiCad install):

- **`board.json`** — all board geometry as 2D multipolygons + the physical
  stackup. Produced by [`scripts/extract_board.py`](scripts/extract_board.py),
  which runs inside KiCad's bundled Python and uses `pcbnew` itself for every
  shape: per-layer unioned copper (tracks, zone fills with plot-accurate
  min-thickness handling, pads incl. custom shapes, graphics, knockout text),
  solder-mask openings (per-pad margins, dual-layer copper+mask art, tenting
  rules), silkscreen glyph outlines, the arc-exact board outline, vias and
  every drill. Copper is split into `covered` (under mask) and `exposed`
  (mask openings → bare ENIG) so the viewer can shade them differently.
- **`components.glb`** — component bodies exported by `kicad-cli pcb export
  glb`, one named node per reference designator. The sync script rewrites 3D
  model paths to resolved absolute `.step` files first because the GLB
  exporter neither expands legacy `${KICAD9_3DMODEL_DIR}` references nor
  falls back from `.wrl` to `.step` on its own.

Orchestrated by [`scripts/sync-pcb.ts`](scripts/sync-pcb.ts). KiCad install
paths are autodetected for macOS; override with `KICAD_CLI`, `KICAD_PYTHON`,
`KICAD_3DMODEL_DIR`.

Extraction correctness was validated by rasterizing the extracted polygons
and pixel-diffing them against `kicad-cli pcb export svg` plots of every
layer (agreement within sub-pixel tessellation noise; the only intended
differences are NPTH pads, which KiCad's 2D plots paint as copper but which
are physically just holes).

## Coordinate conventions

- board.json is in **mm, KiCad board coordinates** (+x right, +y down).
- The scene maps `(three.x, three.z) = (kicad_x − cx, kicad_y − cy)` with
  +y up through the stack; y = 0 is the outer face of the bottom solder mask.
- The GLB is glTF-standard meters with the same axis mapping
  (`GLB(X,Y,Z) = (kicad_x, height, kicad_y)/1000`, origin `--user-origin
  0x0mm`), so it drops in with a ×1000 scale and the same recentering.

## Structure

- `lib/pcb-types.ts` — board.json types + stackup → vertical-slot math
- `lib/build-geometry.ts` — multipolygons → extruded three.js geometry
- `components/pcb/PcbModel.tsx` — the board: every stack element (each
  copper layer, each dielectric slab, masks, silks, via barrels, top/bottom
  component groups) is an independently toggleable group with an explode slot
- `components/Viewer.tsx` — canvas, procedural studio environment (no
  network fetches), controls, post-processing
- `components/ControlPanel.tsx` — layer visibility, explode slider, presets

The dielectric is modeled for real: two prepreg slabs and the core as
separate solids with their true thicknesses from the board stackup, drilled
through by every via/PTH/NPTH hole, with stretching via barrels connecting
the copper layers in the exploded view.
