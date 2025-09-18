# Light Firmware

This repository contains the firmware for the Light project, built for the RP2350 microcontroller. The firmware includes both circuit component testing code and the final production firmware.

## Project Overview

This firmware is designed to run on the custom Light v1 PCB powered by the RP2350 microcontroller and includes:

- **Component Testing**: Code for testing individual circuit components during development
- **Final Firmware**: Production-ready firmware for the complete Light device. Supporting
  - Digital RGB (DRGB), using PWM
  - Addressable RGB (ARGB) for the WS2812 LEDs

## Hardware Requirements

- **Light v1 PCB**: Custom RP2350-powered PCB with onboard WS2812 LEDs
- **Raspberry Pi Pico Probe**: For programming and debugging via JST 3-Pin connectors (DEBUG, UART)
- **Compatibility**: Can also run on a regular Pico 2 board with external WS2812 LEDs connected and a good power supply

## Software Requirements

### Prerequisites

- **[Rust](https://www.rust-lang.org/tools/install)**: Latest stable version
- **[probe-rs](https://probe.rs/)**: For debugging and flashing via the Pico Probe
- **Target Architecture**: Install the RP2350 target:
  ```bash
  rustup target add thumbv8m.main-none-eabihf
  ```

## Project Structure

```
firmware/
├── src/
│   └── bin/
│       ├── test_hello_world.rs    # Basic hello world example
│       ├── test_leds.rs           # WS2812 LED control example
|       ├── release.rs             # Production ready code
|       └── ...
├── Cargo.toml                     # Dependencies and configuration
├── memory.x                       # Memory layout for RP2350
├── build.rs                       # Build script for memory configuration
└── README.MD                      # This file
```

## Running the Code

### Build and Run Commands

**Build, flash & run:**
```bash
cargo run --release --bin <file_name>
```

**Build without running:**
```bash
cargo build --release --bin <file_name>
```

## Development

### Adding New Binaries

To add a new binary for component testing or firmware:

1. Create a new file in `src/bin/your_binary_name.rs`
2. Use the same project structure as `hello_world.rs`
3. Run with: `cargo run --release --bin your_binary_name`


### Component Testing

For testing individual circuit components, create dedicated binaries in `src/bin/` with name `test_<file_name>`, for example:
- `test_leds.rs` - LED functionality testing
- `test_sensors.rs` - Sensor reading validation
- `test_wifi.rs` - WiFi module testing
