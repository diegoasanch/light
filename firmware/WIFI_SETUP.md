> [!WARNING]
> **OUTDATED & FACTUALLY WRONG — kept only as a historical artifact.**
> AI-generated during the 2025 debugging session; its version advice, blob URLs/sizes,
> and "confirmed"/checkmarked claims are incorrect. The real story and current
> instructions live in [WIFI.md](WIFI.md) (2026-08-23).

# WiFi Setup Guide for RP2350

This guide explains how to set up WiFi functionality on your RP2350-based board using the Embassy framework.

## Hardware Configuration

Your board uses the LBEE5KL1YN-814 WiFi module (CYW43439-based) with the following pin connections:

- **WL_ON**: GPIO23 (pin 35) - Power control
- **WL_CLK**: GPIO11 (pin 15) - SPI Clock  
- **WL_D**: GPIO24 (pin 36) - SPI Data
- **WL_CS**: GPIO25 (pin 37) - SPI Chip Select
- **WL_HOST_WAKE**: GPIO10 (pin 14) - Host wake signal

## Setup Steps

### 1. Download WiFi Firmware Files

The CYW43439 WiFi chip requires firmware files to function. Download them to the `firmware/cyw43-firmware/` directory:

```bash
# Create the firmware directory
mkdir -p firmware/cyw43-firmware

# Download firmware files
curl -o firmware/cyw43-firmware/43439A0.bin https://raw.githubusercontent.com/embassy-rs/embassy/main/examples/rp/src/bin/cyw43-firmware/43439A0.bin
curl -o firmware/cyw43-firmware/43439A0_clm.bin https://raw.githubusercontent.com/embassy-rs/embassy/main/examples/rp/src/bin/cyw43-firmware/43439A0_clm.bin
```

### 2. Configure Dependencies

Uncomment and adjust the WiFi dependencies in `Cargo.toml`:

```toml
# WiFi and networking dependencies
cyw43 = { version = "0.1.0", features = ["defmt"] }
cyw43-pio = "0.1.0"
embassy-net = { version = "0.4.0", features = [
    "defmt",
    "tcp",
    "dns",
    "medium-ethernet",
] }
reqwless = { version = "0.1.0", features = ["defmt"] }
serde = { version = "1.0", features = ["derive"] }
serde-json-core = "0.2.0"
```

**Note**: You may need to adjust versions based on embassy compatibility. Check the embassy-rs repository for the latest compatible versions.

### 3. Use the WiFi Template

The `test-wifi-template.rs` file provides a working template that shows the pin configuration. To use it:

1. Rename `test-wifi-template.rs` to `test-wifi.rs`
2. Uncomment the WiFi code in the template
3. Update the WiFi credentials:

```rust
const WIFI_NETWORK: &str = "your_ssid"; // change to your network SSID
const WIFI_PASSWORD: &str = "your_password"; // change to your network password
```

### 4. Compile and Flash

```bash
cd firmware
cargo build --bin test-wifi --release
# Flash to your board using your preferred method
```

## Alternative: Pre-flash Firmware

For faster development, you can pre-flash the firmware to the chip instead of including it in your binary:

```bash
# Flash firmware to the chip
probe-rs download firmware/cyw43-firmware/43439A0.bin --binary-format bin --chip RP2350 --base-address 0x10100000
probe-rs download firmware/cyw43-firmware/43439A0_clm.bin --binary-format bin --chip RP2350 --base-address 0x10140000
```

Then uncomment the pre-flashed firmware lines in your code:

```rust
let fw = unsafe { core::slice::from_raw_parts(0x10100000 as *const u8, 230321) };
let clm = unsafe { core::slice::from_raw_parts(0x10140000 as *const u8, 4752) };
```

## Troubleshooting

### Version Conflicts

If you encounter version conflicts between embassy crates:

1. Check the embassy-rs repository for the latest compatible versions
2. Use the same embassy version across all embassy crates
3. Consider using a specific commit hash for embassy crates if needed

### Compilation Errors

- Ensure all firmware files are downloaded and in the correct location
- Check that pin assignments match your hardware schematic
- Verify that all required features are enabled in Cargo.toml

### WiFi Connection Issues

- Verify your WiFi credentials are correct
- Check that your network supports the WiFi standards used by the CYW43439
- Ensure the WiFi module is properly powered and connected

## Example Usage

The template includes a complete example that:

1. Initializes the WiFi module
2. Connects to your WiFi network
3. Makes HTTP requests to get the current time
4. Parses JSON responses

You can modify the example to make requests to your own APIs or services.

## Resources

- [Embassy Framework](https://github.com/embassy-rs/embassy)
- [CYW43439 Datasheet](https://www.infineon.com/cms/en/product/wireless-connectivity/airoc-wi-fi-plus-bluetooth-combos/cyw43439/)
- [LBEE5KL1YN-814 Module Information](https://www.murata.com/en-us/products/connectivitymodule/wifi-bluetooth/overview/lineup/lbee5kl1yn)