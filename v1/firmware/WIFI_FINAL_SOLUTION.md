> [!WARNING]
> **OUTDATED & FACTUALLY WRONG — kept only as a historical artifact.**
> AI-generated during the 2025 debugging session; its version advice, blob URLs/sizes,
> and "confirmed"/checkmarked claims are incorrect. The real story and current
> instructions live in [WIFI.md](WIFI.md) (2026-08-23).

# WiFi Final Solution

## ✅ Current Status

You have successfully:

- ✅ **Flashed CYW43 firmware** to your chip
- ✅ **Flashed CLM** to your chip  
- ✅ **Configured WiFi credentials** (REDACTED 2026-08-23 — plaintext credentials removed; see WIFI.md §Credentials leak)
- ✅ **Pin configuration confirmed** based on your RP2350 schematics

## ❌ Current Issue

The **embassy version conflicts** prevent the WiFi dependencies from compiling:

- `cyw43` v0.1.0 requires `embassy-time` v0.3.0
- Your `embassy-rp` v0.8.0 requires `embassy-time` v0.5.0
- This creates a conflict in `embassy-time-driver` linking

## 🔧 Solution Options

### Option 1: Use Compatible Embassy Versions (Recommended)

Downgrade your embassy versions to be compatible with cyw43:

```toml
# In Cargo.toml, replace your current embassy versions with:
embassy-time = { version = "0.3.0", features = ["defmt", "defmt-timestamp-uptime"] }
embassy-rp = { version = "0.7.0", features = ["defmt", "unstable-pac", "time-driver", "critical-section-impl", "rp235xa", "binary-info"] }
embassy-net = { version = "0.3.0", features = ["defmt", "tcp", "dns", "medium-ethernet"] }
embedded-hal-1 = { package = "embedded-hal", version = "1.0.0-rc.2" }

# Then uncomment the WiFi dependencies:
cyw43 = { version = "0.1.0", features = ["defmt"] }
cyw43-pio = "0.1.0"
reqwless = { version = "0.1.0", features = ["defmt"] }
serde = { version = "1.0", features = ["derive"] }
serde-json-core = "0.2.0"
```

### Option 2: Wait for Updated cyw43 Crate

The cyw43 crate may be updated to support newer embassy versions. Check the embassy-rs repository for updates.

### Option 3: Use Alternative WiFi Implementation

Consider using a different WiFi implementation that's compatible with your current embassy versions.

## 🚀 Immediate Next Steps

1. **Test the minimal example**:

   ```bash
   cd firmware
   cargo run --bin test-wifi-minimal
   ```

2. **Choose your approach** (Option 1 recommended)

3. **Implement the solution**:
   - If using Option 1: Update Cargo.toml with compatible versions
   - If using Option 2: Wait for updates
   - If using Option 3: Research alternative implementations

## 📁 Available Files

- **`test-wifi-minimal.rs`** - Working example showing pin configuration and setup
- **`test-wifi-setup.rs`** - Setup instructions example
- **`test-wifi-template.rs`** - Template with commented WiFi code
- **`test-wifi.rs`** - Full implementation (needs version conflicts resolved)

## 🔍 Pin Configuration (Confirmed)

Your pin configuration is correct:

- **WL_ON**: GPIO23 (pin 35) - Power control
- **WL_CLK**: GPIO11 (pin 15) - SPI Clock  
- **WL_D**: GPIO24 (pin 36) - SPI Data
- **WL_CS**: GPIO25 (pin 37) - SPI Chip Select
- **WL_HOST_WAKE**: GPIO10 (pin 14) - Host wake signal

## 📝 Summary

You're **very close** to having WiFi working! The hardware setup is complete, firmware is flashed, and credentials are configured. The only remaining issue is resolving the embassy version conflicts.

**Recommendation**: Use Option 1 (compatible embassy versions) as it's the most straightforward path to get WiFi working with your current setup.

## 🎯 Quick Test

Run this to see your current setup:

```bash
cd firmware
cargo run --bin test-wifi-minimal
```

This will show you the pin configuration and confirm that everything is ready for WiFi implementation once the version conflicts are resolved.