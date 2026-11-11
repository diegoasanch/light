# light — RGB light controller

Hobby hardware project, full stack: KiCad boards, embedded Rust firmware, a web
PCB viewer. Two generations:

| | Board | Status | Guide | Linear (team LI) |
|---|---|---|---|---|
| **v1** | RP2350A + CYW43439, 12V-input WiFi controller | Built (4 boards, 2025), firmware in progress | [`v1/CLAUDE.md`](v1/CLAUDE.md) | "RP2350 prototype" |
| **v2** | ESP32-C6 battery lamp | Planning — no hardware or firmware yet | [`v2/CLAUDE.md`](v2/CLAUDE.md) | "Light v2", map LI-162 |

## Layout

```
v1/          RP2350 generation
  kicad/     schematic, PCB, libs
  firmware/  embassy-rp Rust crate
v2/          ESP32-C6 generation (planning)
docs/        shared docs, ADRs in docs/adr/
web/         Next.js three.js PCB viewer (reads v1/kicad/light.kicad_pcb)
assets/      renders and photos for the README
```

Read the generation's own `CLAUDE.md` before working inside `v1/` or `v2/`.

## Rules

- **Writing** (every doc): concise, every word earns its place. Link instead of
  duplicating. Visuals over text walls. Technical and information-rich. Ask
  Diego before assuming.
- **Teaching**: explain, then ask one check question before moving on.
