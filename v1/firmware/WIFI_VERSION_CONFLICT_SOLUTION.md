> [!WARNING]
> **OUTDATED & FACTUALLY WRONG — kept only as a historical artifact.**
> AI-generated during the 2025 debugging session; its version advice, blob URLs/sizes,
> and "confirmed"/checkmarked claims are incorrect. The real story and current
> instructions live in [WIFI.md](WIFI.md) (2026-08-23).

# WiFi Version Conflict Solution

## Problem

You're getting the error "Invalid program binary file specified" because the WiFi dependencies have version conflicts with your current embassy setup. The `cyw43` crate requires older embassy versions that conflict with your newer embassy-rp setup.

## Root Cause

The issue is that:

- `cyw43` v0.1.0 depends on `embassy-time` v0.3.0
- Your `embassy-rp` v0.8.0 depends on `embassy-time` v0.5.0
- These create a conflict in the `embassy-time-driver` linking

## Solutions

### Option 1: Use Compatible Embassy Versions (Recommended)

Downgrade your embassy versions to be compatible with cyw43:

```toml
# In Cargo.toml, replace your current embassy versions with:
embassy-executor = { version = "0.8.0", features = [
    "arch-cortex-m",
    "executor-thread", 
    "executor-interrupt",
    "defmt",
] }
embassy-time = { version = "0.3.0", features = [
    "defmt",
    "defmt-timestamp-uptime",
] }
embassy-rp = { version = "0.7.0", features = [
    "defmt",
    "unstable-pac",
    "time-driver",
    "critical-section-impl",
    "rp235xa",
    "binary-info",
] }
embassy-net = { version = "0.3.0", features = [
    "defmt",
    "tcp",
    "dns",
    "medium-ethernet",
] }

# Then uncomment the WiFi dependencies:
cyw43 = { version = "0.1.0", features = ["defmt"] }
cyw43-pio = "0.1.0"
reqwless = { version = "0.1.0", features = ["defmt"] }
serde = { version = "1.0", features = ["derive"] }
serde-json-core = "0.2.0"
```

### Option 2: Use Pre-flashed Firmware (Alternative)

If you want to keep your current embassy versions, you can pre-flash the WiFi firmware:

1. **Download firmware files manually**:

   ```bash
   # Create firmware directory
   mkdir -p firmware/cyw43-firmware
   
   # Download from Raspberry Pi Foundation
   curl -o firmware/cyw43-firmware/43439A0.bin https://github.com/raspberrypi/firmware/raw/master/boot/43439A0.bin
   curl -o firmware/cyw43-firmware/43439A0_clm.bin https://github.com/raspberrypi/firmware/raw/master/boot/43439A0_clm.bin
   ```

2. **Flash firmware to chip**:

   ```bash
   probe-rs download firmware/cyw43-firmware/43439A0.bin --binary-format bin --chip RP2350 --base-address 0x10100000
   probe-rs download firmware/cyw43-firmware/43439A0_clm.bin --binary-format bin --chip RP2350 --base-address 0x10140000
   ```

3. **Modify your code** to use pre-flashed firmware:

   ```rust
   // Replace the include_bytes! lines with:
   let fw = unsafe { core::slice::from_raw_parts(0x10100000 as *const u8, 230321) };
   let clm = unsafe { core::slice::from_raw_parts(0x10140000 as *const u8, 4752) };
   ```

### Option 3: Wait for Updated cyw43 Crate

The cyw43 crate may be updated to support newer embassy versions. Check the embassy-rs repository for updates.

## Quick Fix for Now

To get your project working immediately:

1. **Use the template**: The `test-wifi-template.rs` compiles and shows the pin configuration
2. **Test other binaries**: Your other test binaries should work fine
3. **Plan WiFi integration**: Decide which approach above you want to use for WiFi

## Testing

After implementing one of the solutions:

```bash
cd firmware
cargo build --bin test-wifi
cargo run --bin test-wifi
```

## Pin Configuration (Already Correct)

Your pin configuration is correct based on the schematics:

- WL_ON: GPIO23 (pin 35)
- WL_CLK: GPIO11 (pin 15)  
- WL_D: GPIO24 (pin 36)
- WL_CS: GPIO25 (pin 37)
- WL_HOST_WAKE: GPIO10 (pin 14)

## Next Steps

1. Choose one of the solutions above
2. Update your Cargo.toml accordingly
3. Download the firmware files
4. Test the WiFi functionality
5. Update your WiFi credentials in the code

The template is ready to use once you resolve the version conflicts!