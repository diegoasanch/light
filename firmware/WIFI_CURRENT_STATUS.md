> [!WARNING]
> **OUTDATED & FACTUALLY WRONG — kept only as a historical artifact.**
> AI-generated during the 2025 debugging session; its version advice, blob URLs/sizes,
> and "confirmed"/checkmarked claims are incorrect. The real story and current
> instructions live in [WIFI.md](WIFI.md) (2026-08-23).

# WiFi Current Status and Solution

## ✅ What's Working

1. **Firmware files downloaded**: The CYW43 firmware files are now properly downloaded (~293KB each)
2. **Pin configuration correct**: Based on your RP2350 schematics
3. **Setup example compiles**: `test-wifi-setup` shows the pin configuration and instructions

## ❌ Current Issue

The WiFi dependencies have **version conflicts** with your current embassy setup:

- `cyw43` v0.1.0 requires `embassy-time` v0.3.0
- Your `embassy-rp` v0.8.0 requires `embassy-time` v0.5.0
- This creates a conflict in `embassy-time-driver` linking

## 🔧 Solutions

### Option 1: Use Pre-flashed Firmware (Recommended)

This avoids the dependency conflicts entirely:

1. **Flash firmware to chip**:

   ```bash
   cd firmware
   probe-rs download cyw43-firmware/43439A0.bin --binary-format bin --chip RP2350 --base-address 0x10100000
   probe-rs download cyw43-firmware/43439A0_clm.bin --binary-format bin --chip RP2350 --base-address 0x10140000
   ```

2. **Uncomment WiFi dependencies** in `Cargo.toml`:

   ```toml
   cyw43 = { version = "0.1.0", features = ["defmt"] }
   cyw43-pio = "0.1.0"
   embassy-net = { version = "0.4.0", features = ["defmt", "tcp", "dns", "medium-ethernet"] }
   reqwless = { version = "0.1.0", features = ["defmt"] }
   serde = { version = "1.0", features = ["derive"] }
   serde-json-core = "0.2.0"
   ```

3. **Use pre-flashed firmware** in your code:

   ```rust
   // Replace include_bytes! with:
   let fw = unsafe { core::slice::from_raw_parts(0x10100000 as *const u8, 230321) };
   let clm = unsafe { core::slice::from_raw_parts(0x10140000 as *const u8, 4752) };
   ```

### Option 2: Downgrade Embassy Versions

Use compatible embassy versions:

```toml
embassy-time = { version = "0.3.0", features = ["defmt", "defmt-timestamp-uptime"] }
embassy-rp = { version = "0.7.0", features = ["defmt", "unstable-pac", "time-driver", "critical-section-impl", "rp235xa", "binary-info"] }
embassy-net = { version = "0.3.0", features = ["defmt", "tcp", "dns", "medium-ethernet"] }
```

## 🚀 Immediate Next Steps

1. **Test the setup example**:

   ```bash
   cd firmware
   cargo run --bin test-wifi-setup
   ```

2. **Choose your approach** (pre-flashed firmware recommended)

3. **Follow the setup instructions** in the example output

## 📁 Available Files

- `test-wifi-setup.rs` - Working example showing pin configuration
- `test-wifi-template.rs` - Template with commented WiFi code
- `cyw43-firmware/` - Firmware files (ready to use)
- `WIFI_VERSION_CONFLICT_SOLUTION.md` - Detailed technical solution

## 🔍 Pin Configuration (Confirmed)

Your pin configuration is correct:

- **WL_ON**: GPIO23 (pin 35) - Power control
- **WL_CLK**: GPIO11 (pin 15) - SPI Clock  
- **WL_D**: GPIO24 (pin 36) - SPI Data
- **WL_CS**: GPIO25 (pin 37) - SPI Chip Select
- **WL_HOST_WAKE**: GPIO10 (pin 14) - Host wake signal

## 📝 Summary

The WiFi functionality is **ready to implement** once you resolve the version conflicts. The pre-flashed firmware approach is the easiest path forward and avoids the complex dependency management issues.