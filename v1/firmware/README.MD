# Light Firmware

Embedded Rust (embassy) firmware for the Light project, running on the custom
Light v1 PCB's RP2350A. There is no unified production firmware yet: the
current firmware is a set of per-peripheral hardware test binaries
(`src/bin/test-*.rs`) plus shared drivers in `src/`. A unified main is a
planned milestone (after `test-wifi-leds`, the cyw43 + ARGB coexistence test).

## Hardware Requirements

- **Light v1 PCB**: Custom RP2350A-powered PCB with onboard WS2812 LEDs
- **Raspberry Pi Debug Probe** (or Pico running debugprobe): for programming
  and debugging via the JST 3-pin connectors (DEBUG, UART)
- **Compatibility**: The LED / encoder / GPIO test binaries can also run on a
  stock Pico 2 with external WS2812 LEDs and a good power supply. The WiFi
  binaries are board-specific and only run on the Light PCB — this board's
  WL_CLK is GPIO11 (a stock Pico 2W uses GPIO29), so neither firmware works
  on the other board. See `WIFI.md`.

## Software Requirements

- **[Rust](https://www.rust-lang.org/tools/install)** >= 1.91 (smoltcp MSRV);
  latest stable recommended
- **RP2350 target**:
  ```bash
  rustup target add thumbv8m.main-none-eabihf
  ```
- **[probe-rs](https://probe.rs/)** for flashing and debugging:
  ```bash
  brew install probe-rs/probe-rs/probe-rs   # or: cargo install probe-rs-tools --locked
  ```
  The cargo runner is `probe-rs run --chip RP235x` (configured in
  `.cargo/config.toml`), with logs over defmt-RTT. `DEFMT_LOG` is also set
  there — note defmt filtering is compile-time (see the comment in that file).

## Project Structure

```
firmware/
├── src/
│   ├── lib.rs                       # Library root exposing the shared drivers
│   ├── argb.rs                      # ARGB (WS2812) driver on PIO + DMA
│   ├── rotary_encoder.rs            # Rotary encoder driver (pulse smoothing)
│   └── bin/                         # Per-peripheral hardware test binaries
│       ├── test-hello-world.rs      # Boot + defmt-RTT smoke test
│       ├── test-leds.rs             # Onboard WS2812 LEDs
│       ├── test-ext-leds.rs         # External ARGB output
│       ├── test-brightness-control.rs
│       ├── test-rotary-encoder.rs
│       ├── test-power-switch.rs     # 12V/5V output power switch
│       ├── test-wifi-scan.rs        # WiFi bring-up (no credentials needed)
│       └── test-wifi.rs             # WiFi join/DHCP/HTTP test
├── cyw43-firmware/                  # sha256-pinned CYW43439 firmware blobs
├── .cargo/config.toml               # probe-rs runner, build target, DEFMT_LOG
├── Cargo.toml                       # Dependencies (embassy set pinned, see comments)
├── memory.x                         # Memory layout for RP2350
├── build.rs                         # Build script for memory configuration
├── WIFI.md                          # WiFi bring-up story + bench playbook
└── README.MD                        # This file
```

## Running the Code

**Build, flash & run** (board connected via debug probe):
```bash
cargo run --release --bin <bin-name>
```

**Build without running:**
```bash
cargo build --release --bin <bin-name>
```

Bin names match the hyphenated filenames, e.g. `cargo run --release --bin test-leds`.

## WiFi

- Credentials are compile-time env vars — never committed:
  ```bash
  WIFI_NETWORK="YourSSID" WIFI_PASSWORD="..." cargo run --release --bin test-wifi
  ```
- Bring-up order: `test-wifi-scan` (credential-free) first, then `test-wifi`.
- The CYW43439 firmware blobs in `cyw43-firmware/` are sha256-pinned; verify
  with `shasum -a 256 -c SHA256SUMS` from inside that directory after any
  re-download.
- Full details, diagnostic decision tree, and bench playbook: `WIFI.md`.

## Development

### Adding New Binaries

To add a new binary for component testing or firmware:

1. Create a new file in `src/bin/your-binary-name.rs`
2. Use the same project structure as `test-hello-world.rs`
3. Run with: `cargo run --release --bin your-binary-name`

### Component Testing

For testing individual circuit components, create dedicated binaries in
`src/bin/` named `test-<name>.rs`, for example:
- `test-leds.rs` — LED functionality testing
- `test-wifi.rs` — WiFi module testing
