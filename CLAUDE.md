# light — RGB light controller

Custom-PCB RGB light controller. Full-stack hobby hardware project: KiCad board
design + embedded Rust firmware. 4 boards were fabbed and assembled (2025);
ALL peripherals validated on hardware, including WiFi (broken 2025, fixed and
bench-validated 2026-08-23: join/DHCP/HTTP confirmed — see `firmware/WIFI.md`).
Next firmware milestone: `test-wifi-leds` (cyw43 + Argb coexistence), then a
unified main.

## Layout

- `kicad/` — schematic (`light.kicad_sch`, single sheet), PCB (`light.kicad_pcb`),
  fab outputs, symbol/footprint libs. KiCad 8+. `kicad/.history/` is editor noise.
- `firmware/` — embedded Rust (embassy) for the RP2350A. No unified main yet:
  `src/bin/test-*.rs` are per-peripheral hardware test binaries; shared drivers
  live in `src/` (`argb.rs`, `rotary_encoder.rs`).
- `assets/` — renders/photos for the README.

Rust/embassy is the only supported path for WiFi: stock Pico 2W
MicroPython/CircuitPython builds can NEVER work on this board (they hardcode
WL_CLK=GPIO29; this board uses GPIO11). The old `micropython/` experiments
were removed 2026-08 for exactly this reason.

## Hardware (as built, netlist-verified)

RP2350A + W25Q128JVS 16MiB QSPI flash + Murata LBEE5KL1YN-814 radio module
(CYW43439 inside, 37.4MHz crystal embedded) — a Raspberry Pi Pico 2W clone with:
12V input, USB-C (VBUS powers logic only), 12V/5V switchable light output,
DRGB (PWM per channel) + ARGB output modes, HDC1080 temp/humidity sensor,
2 onboard WS2812s, 2 hardware-debounced buttons (MAX6816), rotary encoder.

Pin map (ground truth = `kicad/light.kicad_sch` rev 5):

| Function | GPIO |
|---|---|
| WiFi WL_ON (module REG_ON) | 23 |
| WiFi WL_D = gSPI DIO (CMD+DATA_2 direct, DATA_0 via 470R, DATA_1 via 10K) | 24 |
| WiFi WL_CS (DATA_3) | 25 |
| WiFi WL_CLK (via 27R) — **GPIO11, NOT GPIO29 like the Pico 2W** | 11 |
| WiFi HOST_WAKE / module WL_GPIO0 — module drives this net if firmware calls `control.gpio_set(0, ...)`; keep GPIO10 input-only | 10 |
| Onboard WS2812 LEDs | 5 |
| External ARGB data | 20 |
| DRGB PWM R / G / B | 27 / 28 / 26 |
| Rotary encoder A / B / button | 12 / 13 / 9 |
| Buttons | 18, 19 |
| I2C (HDC1080) SDA / SCL | 6 / 7 |
| 12V/5V output power switch | 17 |

## Firmware workflow

```bash
cd firmware
cargo build --release --bins                 # needs Rust >= 1.91 (smoltcp MSRV)
cargo run --release --bin test-leds          # flash+run via probe-rs (RP235x)
cargo run --release --bin test-wifi-scan     # WiFi bring-up (see firmware/WIFI.md)
```

- Runner is `probe-rs run --chip RP235x` (`.cargo/config.toml`); logs via defmt-RTT.
- Dependency versions are a matched set pinned to the embassy `cyw43-v0.7.0`
  release tag. Never bump embassy crates individually — take the whole set from
  the tag's `examples/rp235x/Cargo.toml` (NOT embassy main, which uses
  unreleased APIs).
- WiFi credentials go in via compile-time env (`WIFI_NETWORK`, `WIFI_PASSWORD`)
  — never commit secrets (this happened once; see `firmware/WIFI.md`).
- CYW43 firmware blobs in `firmware/cyw43-firmware/` are sha256-pinned
  (`SHA256SUMS`); verify after any re-download (a previous download silently
  saved GitHub 404 HTML pages).
- PIO/DMA allocation: cyw43 WiFi owns PIO0 + DMA_CH0 in the wifi bins. When
  integrating LEDs + WiFi in one binary, put `Argb` on PIO1 + a different DMA
  channel (supported — pass the right peripherals + a `bind_interrupts!` struct).
- The linker warning `.text ... not a multiple of alignment (8)` is believed
  cosmetic — our `memory.x` sections are byte-identical to the upstream embassy
  rp235x example's (apart from the flash size), and the binaries link and run.

## WiFi debugging

Full story, diagnostic decision tree, and bench/oscilloscope playbook:
`firmware/WIFI.md`. The four `firmware/WIFI_*.md` files are quarantined
historical docs (AI-generated during a 2025 debugging session, factually wrong).
