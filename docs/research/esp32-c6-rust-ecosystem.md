# ESP32-C6 embedded Rust ecosystem (state as of November 2026)

- **Researched:** 2026-11-09. Every source below was read on that date; release dates are given next to version numbers.
- **Question:** what is the state of Rust on the ESP32-C6, and what should the v2 (battery desk lamp) firmware be built on?
- **Method:** primary sources only — the `esp-rs` GitHub org (READMEs, changelogs, source on `main`), crates.io metadata, The Rust on ESP Book, the ESP32-C6 datasheet, ESP-IDF docs/source, and the `embassy-rs`, `probe-rs` and `rs-matter` repos. Nothing was built or measured on hardware.
- **Convention:** "Verified" means I read it in a primary source. Anything inferred or not confirmed is collected in [What I could not verify](#what-i-could-not-verify) and flagged inline with *(unverified)*.

---

## 1. Short answer

Build v2 on the **`no_std` path: `esp-hal` 1.2 + `esp-rtos` (embassy executor) + `esp-radio`**, generated with `esp-generate`, flashed and debugged with **probe-rs over the chip's built-in USB-Serial-JTAG**.

Why, in one paragraph: it is the path Espressif pays engineers to maintain (the `std` crates are explicitly a community effort), it is the same mental model as v1 (`embassy` async tasks, `embedded-hal` traits, `defmt`, `probe-rs run`), it builds on stable Rust for the C6, and every peripheral the lamp needs has a working driver. The price is that most of those drivers are still behind an `unstable` feature flag, the radio crate is a `1.0.0-beta`, and Matter/Thread are bleeding-edge. If v2's headline feature becomes "Matter-over-Thread sleepy device" rather than "nice lamp with BLE/Wi-Fi", that decision should be revisited (see section 4).

---

## 2. Two ways to write Rust for an ESP32 — and which fits

Jargon first:

- **HAL** (hardware abstraction layer): the crate that turns register pokes into safe types like `I2c` or `Output`. v1 uses `embassy-rp`.
- **`no_std`**: Rust without the standard library — no OS, no heap unless you add one, no threads unless you add a scheduler. This is what v1 does.
- **`std`**: Rust *with* the standard library (`std::thread`, `std::net`, `Vec`, ...). On an MCU this only works if an operating system sits underneath.
- **ESP-IDF**: Espressif's official C framework (FreeRTOS + drivers + Wi-Fi/BLE/Thread/Zigbee stacks). The `std` path is Rust on top of this.
- **Blob**: a precompiled binary library from the vendor with no source. Espressif's Wi-Fi/BLE radio drivers are blobs in *both* paths.

| | `no_std`: `esp-hal` + `esp-rtos` + `esp-radio` | `std`: `esp-idf-sys` / `esp-idf-hal` / `esp-idf-svc` |
|---|---|---|
| Who maintains it | Espressif-employed team ("officially supported ... with paid developer time") | "**all `esp-idf-*` crates are a community effort**, in that Espressif puts little to no paid developer time in these" |
| What is underneath | Bare metal. Rust all the way down except the radio blobs | The whole ESP-IDF C framework, built by cargo via CMake |
| Concurrency model | embassy async tasks (same as v1) | FreeRTOS threads, `std::thread`; async is optional |
| Rust toolchain (C6) | Stable Rust, target `riscv32imac-unknown-none-elf` (Tier 2) | Target `riscv32imac-esp-espidf`; needs `build-std`, i.e. nightly Rust or the `espup` toolchain, plus Python, CMake, `ldproxy` |
| Build time / size | Small, fast, one language | Large (compiles ESP-IDF), slower first build |
| Maturity of radio | `esp-radio` 1.0.0-beta.1; works, API still moving | ESP-IDF's stacks are production-grade; Rust wrappers lag "a bit" and have no hardware-in-the-loop tests |
| Wi-Fi / BLE | Yes / yes (TrouBLE host) | Yes / yes (NimBLE or Bluedroid wrappers) |
| Thread / Matter / Zigbee | Thread via `openthread` crate (young); Matter via `rs-matter-embassy` (git deps); Zigbee: none found | Thread wrappers in `esp-idf-svc`; Matter via `esp-idf-matter`; Zigbee: no Rust wrapper found *(unverified whether raw bindings are practical)* |
| Low power | Rewritten in esp-hal 1.2; you assemble it yourself | ESP-IDF's power management (auto light sleep, DTIM) is the reference implementation |
| Debug loop | probe-rs + defmt-RTT, like v1 | Mostly `espflash` + serial monitor |

Sources: the "Community Effort" paragraph is quoted from the [`esp-rs/esp-idf` README](https://github.com/esp-rs/esp-idf/blob/master/README.md) (the three `esp-idf-*` repos were merged into this monorepo; latest releases esp-idf-svc 0.53.0, esp-idf-hal 0.47.0, esp-idf-sys 0.38.1, Sep 2026 per crates.io). Toolchain requirements for the std path are from the [`esp-idf-template` README](https://github.com/esp-rs/esp-idf-template/blob/master/README.md), which lists supported ESP-IDF versions v5.3.6 through v6.1. Targets are from the [esp-hal README](https://github.com/esp-rs/esp-hal/blob/main/esp-hal/README.md) and [Rust on ESP Book, toolchain chapter](https://github.com/esp-rs/book/blob/main/src/getting-started/toolchain.md).

**Why `no_std` is the better fit coming from `embassy-rp`:** the application code is structurally the same as v1 — `#[embassy_executor::task]` functions, `embassy-time` timers, `embassy-sync` channels, `embedded-hal`/`embedded-hal-async` drivers (the HDC1080 driver choice carries over), `static_cell`, `defmt`. What changes is the HAL crate and the runtime glue. The std path would mean learning ESP-IDF's C configuration system (`sdkconfig`), FreeRTOS threading and a different debugging flow at the same time as a new chip.

**One real conceptual difference from v1 to learn:** on the RP2350, the embassy executor is all you need, and the `cyw43` Wi-Fi chip is an external device driven over SPI. On an ESP32 the radio is inside the MCU and its blob expects a *preemptive* scheduler (threads, queues, timers). So `esp-rtos` provides a small real RTOS, and the embassy executor runs as a thread on top of it. The `esp-radio` docs are explicit: "You MUST start the scheduler before initializing the radio", and Wi-Fi/BLE "require a dynamic memory allocator" (`esp-alloc`) — v1 has no heap, v2 will. ([esp-radio `lib.rs` docs](https://github.com/esp-rs/esp-hal/blob/main/esp-radio/src/lib.rs), [esp-rtos `lib.rs` docs](https://github.com/esp-rs/esp-hal/blob/main/esp-rtos/src/lib.rs))

### 2.1 esp-hal stability: what "1.0" actually covers

Verified from the [esp-hal changelog](https://github.com/esp-rs/esp-hal/blob/main/esp-hal/CHANGELOG.md) and crates.io:

| Release | Date |
|---|---|
| esp-hal 1.0.0 | 2025-10-30 |
| esp-hal 1.1.0 | 2026-04-24 |
| esp-hal 1.2.0 | 2026-09-01 (1.2.2 on 2026-09-18 is the latest) |

"1.0" does **not** mean every driver is stable. esp-hal splits its API in two:

- **Stable** drivers follow semantic versioning (no breaking changes within 1.x).
- Everything else is hidden behind the cargo feature **`unstable`** and "may undergo breaking changes" in any *minor* release (never in a patch release).

Per-driver status for the **ESP32-C6**, from the chip metadata on `main` ([`esp-metadata/devices/esp32c6/soc.toml`](https://github.com/esp-rs/esp-hal/blob/main/esp-metadata/devices/esp32c6/soc.toml)) and the [README support table](https://github.com/esp-rs/esp-hal/blob/main/esp-hal/README.md#peripheral-support):

| Stable on C6 | Unstable on C6 (needs `unstable`) |
|---|---|
| GPIO, UART, SPI master, I2C master, core init/clock/time/interrupt APIs | **RMT**, **LEDC** (flagged "planned overhaul", [issue #2286](https://github.com/esp-rs/esp-hal/issues/2286)), **ADC**, **light/deep sleep**, flash, USB-Serial-JTAG, timers, DMA, I2C slave, LP core, RNG (partial on C6, [#5979](https://github.com/esp-rs/esp-hal/issues/5979)), and **all radio** (Wi-Fi, BLE, 802.15.4) |

So for this project: **the lamp's interesting peripherals are all `unstable`.** That is workable — it is how everyone uses esp-hal today, and `esp-radio` itself "currently requires you to enable the `unstable` feature on `esp-hal`" — but it dictates the pinning strategy in section 9.

The surrounding crates are all pre-1.0 and listed as "Unstable" in the [book's crate table](https://github.com/esp-rs/book/blob/main/src/introduction/ancillary-crates.md): esp-rtos 0.4.0, esp-alloc 0.11.0, esp-println 0.18.0, esp-backtrace 0.20.0, esp-bootloader-esp-idf 0.6.0 (all released 2026-08-26). `esp-hal-embassy` and `esp-wifi` are **dead names**: their last releases were October 2025 and they were replaced by `esp-rtos` and `esp-radio` respectively. Tutorials that mention them predate esp-hal 1.0.

---

## 3. Wireless

The C6 has one 2.4 GHz radio shared by three protocols: Wi-Fi 6 (802.11ax, 2.4 GHz only), Bluetooth LE 5, and IEEE 802.15.4 (the radio layer under Thread and Zigbee).

### 3.1 no_std: `esp-radio`

- Version: **1.0.0-beta.1** (2026-09-16). 1.0.0-beta.2 was published the next day and then **yanked** on crates.io, although Espressif's docs site still lists beta.2 — use beta.1. Last non-beta: 0.18.0 (2026-04-16). ([changelog](https://github.com/esp-rs/esp-hal/blob/main/esp-radio/CHANGELOG.md), crates.io)
- C6 support matrix from the [esp-radio README](https://github.com/esp-rs/esp-hal/blob/main/esp-radio/README.md): Wi-Fi yes, BLE yes, Wi-Fi+BLE coexistence yes, ESP-NOW yes, IEEE 802.15.4 yes. The README's wording is cautious: a check mark "means that some driver implementation exists".
- **Wi-Fi**: station and access point, plugs into `embassy-net` (TCP/UDP/DHCP — the same network stack v1 uses with cyw43). The beta changelogs show the API is still being reshaped (`WifiController::new`, new `Password`/`Ssid` types, renamed events), so expect to edit code on each bump. Blobs were updated to ESP-IDF 6.1 in beta.1.
- **BLE**: `esp-radio` provides only the *controller* (the radio half, speaking HCI — the standard host/controller protocol). The *host* (GATT, pairing, etc.) is **TrouBLE** (`trouble-host`, 0.8.0 on 2026-08-25, from the embassy project), which esp-radio's README recommends. TrouBLE supports peripheral and central roles, GATT server/client, L2CAP channels and (per its examples) security/bonding; it states qualification is "a future goal", i.e. it is **not a Bluetooth-SIG-qualified stack**. Fine for a hobby lamp. ([TrouBLE README](https://github.com/embassy-rs/trouble/blob/main/README.md))
- **Coexistence** ("coex": two protocols time-sharing the one radio): Wi-Fi + BLE is supported (`coex` feature; there is an `examples/wifi/embassy_coex` example). 802.15.4 + BLE is supported. **802.15.4 + Wi-Fi is not supported** in esp-radio ("coexistence with BLE is supported, coexistence with Wi‑Fi remains unsupported", beta.1 changelog; same note in the [ieee802154 module docs](https://github.com/esp-rs/esp-hal/blob/main/esp-radio/src/ieee802154/mod.rs)).
- **802.15.4**: a low-level driver that sends/receives raw frames. Thread is layered on top via the [`openthread` crate](https://github.com/esp-rs/openthread) (esp-rs org; 0.4.0 on 2026-09-14; Rust bindings to the C OpenThread stack, examples default to the ESP32-C6 with esp-hal `~1.2`). It is young: three breaking releases between June and September 2026, and support for Thread "sleepy end devices" (the battery-friendly role) is still landing on `main`.
- **Zigbee**: I found no Rust Zigbee stack for esp-radio.
- Practical requirements quoted from the esp-radio docs: a heap (their quick-start allocates ~100 KB across two regions), and "the radio blobs require optimization level 2 or 3 to function correctly" — set `[profile.dev.package.esp-radio] opt-level = 3`.

### 3.2 Matter

**Matter** is the smart-home application protocol (Apple Home / Google Home / Home Assistant). It runs over Wi-Fi or Thread and uses BLE only for initial pairing ("commissioning").

- [`rs-matter`](https://github.com/project-chip/rs-matter) (0.4.1, 2026-09-17) is a pure-Rust, `no_std`, async Matter implementation under the official `project-chip` org. Its README says it is "relatively feature complete", implements Matter spec 1.6, has been tested against Google Home, Apple Home, Alexa, Home Assistant, SmartThings and IKEA Dirigera — and that "the API is not stable". It is **not certified**; "work towards certification" is listed as a next step. Stated footprint: ~60 KB static RAM + ~20 KB stack minimum.
- On embassy it is used through [`rs-matter-embassy`](https://github.com/sysgrok/rs-matter-embassy), which supports "Espressif ESP32XX" with both Wi-Fi and Thread transports and BLE commissioning via TrouBLE. Maturity warning, verified from its manifests: the crates.io release is a `0.0.0` placeholder, the workspace patches `rs-matter` and `openthread` to git, and the ESP examples currently patch **all of esp-hal to a personal fork branch** (`ieee802154-sleep`). That is an "expect to track git and fix breakage" situation, not a pinned-release one.
- On the std path the equivalent is [`esp-idf-matter`](https://github.com/sysgrok/esp-idf-matter) (same author, rs-matter on ESP-IDF networking). I did not find a maintained Rust wrapper for Espressif's own certified C++ `esp-matter` SDK.

### 3.3 std: `esp-idf-svc`

Wraps ESP-IDF's production stacks: Wi-Fi, BLE (NimBLE wrappers added in 0.53.0; Bluedroid also available), Thread (OpenThread wrappers exist — the 0.53.0 changelog has Thread fixes), HTTP/MQTT/TLS, NVS storage and OTA. ESP-IDF itself supports all three coexistence pairs on the C6, with the caveat from [its coexistence guide](https://github.com/espressif/esp-idf/blob/master/docs/en/api-guides/coexist.rst) that 802.15.4 receive has the lowest priority, so a Thread *router* next to busy Wi-Fi drops packets (Espressif recommends two chips for border routers).

### 3.4 What this means for the lamp

- **BLE-only or Wi-Fi(+BLE provisioning) lamp:** well served by the no_std path today.
- **Matter over Wi-Fi:** feasible in no_std with `rs-matter-embassy`, accepting git dependencies and no certification.
- **Matter over Thread on battery:** the most attractive architecture for a battery lamp on paper (sleepy end device), and the least mature in Rust right now.

---

## 4. LED peripherals

### 4.1 RMT for addressable LEDs (WS2812 / SK6812)

**RMT** ("remote control transceiver") is a peripheral that plays back a list of precisely timed high/low pulses from a small RAM buffer — originally for infrared remotes, and the standard ESP32 way to generate the WS2812 one-wire waveform. It plays the role PIO plays in v1's `argb.rs`.

- C6 hardware: 4 channels — **2 transmit, 2 receive** — each with 48 pulse-code words of RAM (esp-hal metadata; matches `SOC_RMT_MEM_WORDS_PER_CHANNEL 48` in [ESP-IDF `soc_caps.h`](https://github.com/espressif/esp-idf/blob/master/components/soc/esp32c6/include/soc/soc_caps.h)). One WS2812 bit = one pulse code, so 48 words is only 2 RGB LEDs; longer strips rely on the driver refilling the buffer mid-transmission. Only two TX channels means at most two independent strips.
- esp-hal's RMT driver is `unstable` and was substantially reworked in 1.0 → 1.1 (`PulseCode` type, `TxTransaction`, `Channel::with_pin`); blocking and async APIs exist (`examples/async/embassy_rmt_tx`).
- Ready-made driver: [`esp-hal-smartled`](https://github.com/esp-rs/esp-hal-community/tree/main/esp-hal-smartled) **0.18.0** (2026-09-05, esp-rs community repo). It targets esp-hal `~1.2`, implements the `smart-leds` traits (blocking and async), ships timing constants for WS2812, WS2812B, SK68XX and WS2811, supports RGBW colour orders, and absorbed the `esp-hal-smartled2` fork in this release. It requires esp-hal's `unstable` feature.

### 4.2 LEDC for PWM dimming

**LEDC** ("LED controller") is the hardware PWM peripheral. **Duty resolution** is how many brightness steps one PWM period is divided into (N bits = 2^N steps). Resolution and frequency trade off: `max frequency = source clock / 2^bits`.

- C6 hardware (ESP-IDF `soc_caps.h`): 6 channels, 4 timers, up to **20-bit** timers, hardware fades including multi-segment gamma-curve fades, clock sources PLL-derived 80 MHz, 40 MHz crystal, or the internal fast RC oscillator.
- esp-hal's driver exposes less than the hardware ([`ledc/timer.rs`](https://github.com/esp-rs/esp-hal/blob/main/esp-hal/src/ledc/timer.rs) on `main`): on the C6 the duty enum stops at **14 bits** (15–20 bit are compiled only for the original ESP32), the only selectable clock is `APBClk`, only fixed-frequency output is supported, and hardware *linear* fades are available (`start_duty_fade`). The driver is marked "planned overhaul — expect major breaking changes".
- Worked numbers, assuming the 80 MHz source *(unverified which clock `APBClk` resolves to on the C6)*: 14-bit → max ≈ 4.9 kHz; 13-bit → ≈ 9.8 kHz; 12-bit → ≈ 19.5 kHz (above audible range, 4096 steps); 10-bit → ≈ 78 kHz.
- Why this matters for a lamp: perceived brightness is roughly logarithmic, so the bottom of the dimming range needs many more steps than the top. 12 bits is usable; 14 bits at ~4.9 kHz is noticeably smoother at "night-light" levels but may interact with a switching LED driver's own frequency. If the full 20 bits or gamma fades turn out to matter, that means either contributing to esp-hal, writing registers directly, or the std path (ESP-IDF's LEDC driver exposes all of it).
- For the std path, `esp-idf-hal` wraps ESP-IDF's LEDC and RMT drivers; the third-party `ws2812-esp32-rmt-driver` crate serves the same role as esp-hal-smartled *(existence noted from esp-hal-smartled's docs; not evaluated)*.

---

## 5. Low power

Jargon:

- **Modem sleep**: CPU runs, radio is switched off between Wi-Fi beacons.
- **Light sleep**: CPU clock stopped, RAM and peripheral state kept; wakes in well under a millisecond-to-milliseconds and continues where it left off.
- **Deep sleep**: almost everything powered off; only the low-power ("LP", formerly "RTC") domain stays alive. Waking is a **reboot** — the program starts from `main` again, with only a few bytes of LP memory preserved.
- **DTIM**: the interval at which a Wi-Fi access point announces buffered traffic; a sleeping station only needs to wake for those beacons.

### 5.1 What the chip can do (Espressif's numbers)

From the [ESP32-C6 datasheet v1.5](https://www.espressif.com/sites/default/files/documentation/esp32-c6_datasheet_en.pdf) §5.6 (3.3 V, 25 °C, bare chip):

| State | Typical current |
|---|---|
| Wi-Fi TX peak | 252–354 mA |
| Wi-Fi RX | 78–82 mA |
| BLE TX at 0 dBm / 9 dBm; RX | 130 / 190 mA; 71 mA |
| 802.15.4 TX at 0 dBm; RX | 119 mA; 74 mA |
| Modem sleep, CPU idle, 80 MHz (radio off) | 14–25 mA |
| Light sleep (peripheral clocks off) | 180 µA |
| Light sleep (CPU + peripherals powered down) | 35 µA |
| Deep sleep (LP timer + LP memory on) | **7 µA** |
| Powered off via CHIP_PU | 1 µA |

From ESP-IDF's measured [C6 Wi-Fi low-power summary](https://github.com/espressif/esp-idf/blob/master/docs/en/api-guides/sleep-current/esp32c6_summary.inc) — average current **while staying associated to an access point**, using ESP-IDF's implementation:

| Mode | DTIM1 | DTIM3 | DTIM10 |
|---|---|---|---|
| Modem sleep | 27.5 mA | 27.1 mA | 26.9 mA |
| Modem sleep + frequency scaling | 14.4 mA | 13.9 mA | 13.7 mA |
| Auto light sleep | 0.92 mA | 0.37 mA | 0.17 mA |

What those mean for a battery (illustrative arithmetic, 2000 mAh cell, ignoring the regulator and the LEDs): always-connected Wi-Fi with modem sleep only ≈ 3 days; with auto light sleep at DTIM3 ≈ 7 months; deep sleep ≈ limited by the battery's self-discharge and the regulator's quiescent current, not the chip. **These are module-level best cases** — a dev board's USB bridge/LDO/power LED typically adds far more than 7 µA, so the regulator and board design matter more than the firmware once the chip sleeps. And when the lamp is *on*, the LEDs dwarf everything here; sleep strategy is about the *off/standby* state.

### 5.2 What Rust exposes

**no_std (esp-hal 1.2 + esp-rtos 0.4)** — the sleep API was **rewritten in esp-hal 1.2** (so pre-September-2026 examples and blog posts are wrong). Verified from the 1.2.0-rc.0 changelog and source:

- `rtc_cntl::sleep::LowPower` with `sleep_light`, `sleep_deep`, `sleep_deep_with_rejection`; `wakeup_cause()` returns the set of sources that ended the sleep.
- C6 wake sources in the metadata: timer, GPIO, EXT1 (LP-domain pins), UART0/1, Wi-Fi, Wi-Fi beacon, BT, LP core, SDIO. The module docs say plain GPIO wake is light-sleep only; for **deep sleep the wake pin must be an LP pin — GPIO0–GPIO7 on the C6** (datasheet LP_GPIO table).
- "A listening pin wakes the chip from light sleep": an embassy `input.wait_for_falling_edge().await` now survives automatic light sleep (important for the encoder/buttons).
- **Automatic light sleep**: `esp_rtos::sleep::configure(LPWR)` returns an idle hook that puts the chip into light sleep whenever every task is waiting long enough (`ESP_RTOS_CONFIG_LIGHT_SLEEP_MIN_US`), plus a `WakeLock` guard to forbid sleeping during critical sections, and optional CPU power-down with state retention. Added for the C6 specifically in esp-rtos 0.4.0; example: `examples/async/embassy_auto_light_sleep`.
- C6 light sleep now "powers down XTAL + RC_FAST and drops the HP rail" (#5803), i.e. the driver is aiming at the datasheet's low figures.
- Wi-Fi power save: `WifiController::set_power_saving(PowerSaveMode::{None, Minimum, Maximum})` maps to ESP-IDF's modem-sleep modes; **the default is `None`** (radio always on, ~80 mA), so this must be set explicitly. `Maximum` uses the station's listen interval.
- The C6's second, low-power RISC-V core can be programmed with `esp-lp-hal` (0.3.0, Oct 2025) to e.g. poll a sensor while the main CPU is in deep sleep. Probably overkill for a lamp.
- All of this is `unstable`, and I found no Espressif-published current measurements for the Rust implementation. Whether esp-rtos auto light sleep keeps a Wi-Fi association alive on the C6 at ESP-IDF-like currents is *(unverified)* — see open questions.

**std** — ESP-IDF's power management framework is what produced the table above and is the mature option if "stay connected to Wi-Fi for months" is the goal.

**Two hardware-level gotchas that affect design now:**

1. **PWM and sleep conflict.** In ESP-IDF, LEDC keeps running in light sleep only if clocked from a light-sleep-compatible source (the RC oscillator). esp-hal's C6 LEDC driver only offers `APBClk`, so assume **the chip cannot light-sleep while PWM-dimming** in the no_std path *(inference, unverified)*. Acceptable — when the lamp is on, the CPU's ~15–25 mA is small next to the LEDs — but it means the firmware needs two clear power states.
2. **USB dies in sleep.** The built-in USB-Serial-JTAG stops when the chip sleeps (ESP-IDF's `soc_caps.h` has the C6 "maintain USB in light sleep" capability commented out as a TODO). Logs and the debugger drop whenever the chip sleeps; plan for a UART pin or a "stay awake while USB is attached" build flag.

---

## 6. Toolchain and debug loop

- **Rust target:** `riscv32imac-unknown-none-elf` — the C6 is a standard RISC-V core (integer, multiply, **a**tomics, compressed), so upstream **stable Rust** works; the Xtensa fork/`espup` is only needed for the older ESP32/S2/S3. `esp-generate`'s template writes a `rust-toolchain.toml` with the `rust-src` component. ([book](https://github.com/esp-rs/book/blob/main/src/getting-started/toolchain.md))
- **MSRV** (minimum supported Rust version): esp-hal 1.2 declares 1.95 and states it is only "guaranteed to compile when using the latest stable Rust version at the time of the crate's release". v1 needs ≥ 1.91, so one toolchain can serve both. TrouBLE's `main` already says 1.97.
- **Project generator:** `esp-generate` **2.0.0** (2026-10-23). `esp-generate --chip esp32c6 -o embassy -o unstable-hal -o alloc -o wifi -o ble-trouble -o probe-rs -o defmt ...` (run `esp-generate list-options`). Its [template `Cargo.toml`](https://github.com/esp-rs/esp-generate/blob/main/template/Cargo.toml) is the best single source of a known-good version set (section 9).
- **`espflash`** (4.7.0, 2026-10-29): flashes through the ROM serial bootloader — on the C6 that works over the built-in USB with no extra hardware — and monitors serial output, decoding `defmt` if asked (`--log-format defmt`).
- **`probe-rs`** (0.32.0, 2026-07-22): the same tool as v1. The Rust on ESP Book: chips with the USB-Serial-JTAG peripheral (it lists the C6) "can use `probe-rs` without any external hardware". **USB-Serial-JTAG** is a fixed-function USB device inside the chip that exposes both a serial port and a JTAG debug adapter over one cable — so the C6's USB-C socket *is* the debug probe. The generated runner is `probe-rs run --chip=esp32c6 --preverify --always-print-stacktrace --no-location`, with logging via `rtt-target` + `defmt`. The book: "We recommend pairing `defmt` with `probe-rs` for the best results". Breakpoints/GDB/VS Code debugging come with it.
- **Logging choices:** `defmt` over RTT (probe-rs; closest to v1), `defmt` over serial (`esp-println` feature `defmt-espflash`), or plain-text `log`/`println!` over serial (`esp-println`). Panic handlers: `panic-rtt-target` or `esp-backtrace`.

**Compared with the RP2350 flow:**

| | v1 (RP2350) | v2 (ESP32-C6) |
|---|---|---|
| Command | `cargo run --release --bin x` → `probe-rs run --chip RP235x` | `cargo run --release` → `probe-rs run --chip=esp32c6` (or `espflash flash --monitor`) |
| Probe hardware | External SWD debug probe | None — the board's own USB port |
| Boot chain | Boot ROM → your image | Boot ROM → **ESP-IDF second-stage bootloader** → your image (flashing tools insert the bootloader and partition table for you) |
| Mandatory boilerplate | `memory.x`, image-def block | `esp_bootloader_esp_idf::esp_app_desc!();` — the bootloader refuses images without this "app descriptor" (probe-rs checks for it) |
| Logs while asleep | SWD keeps working | USB disappears in sleep (section 5) |
| Bricked firmware | BOOTSEL button | Hold BOOT (GPIO9 strap) low at reset → ROM download mode |

Module-selection consequence: the USB D−/D+ signals are **GPIO12/GPIO13**. To keep this dev loop on the custom lamp PCB, route those two pins to the USB-C connector and do not reuse them; also keep the strapping pins (GPIO8, GPIO9, GPIO15 among them — check the datasheet's strapping section) free of loads that could change their level at reset.

---

## 7. ADC, I2C, flash storage and OTA

**ADC (battery voltage).** Hardware: one 12-bit SAR ADC with 7 channels on **GPIO0–GPIO6**. Datasheet §5.5 calibrated accuracy: ±12 mV on the 0–1.0 V and 0–1.3 V ranges, ±23 mV on 0–1.9 V, **±40 mV on the 0–3.3 V range**; nonlinearity is poor (DNL −8/+12 LSB), and the datasheet itself recommends averaging. esp-hal: `esp_hal::analog::adc` is `unstable`; the C6 has basic, line-fitting and curve-fitting calibration (calibration data v2 added in 1.2); the API is a non-blocking one-shot read (async ADC was only added for S2/S3). Design implications: a Li-ion cell (up to 4.2 V) needs a resistor divider; use a high-value divider with a ~100 nF capacitor at the pin (the datasheet's test condition) and prefer scaling into a lower-attenuation range for better accuracy; expect roughly 1 % voltage accuracy, which is enough for a 4–5 bar battery indicator but not for coulomb-accurate gauging (a dedicated fuel-gauge IC over I2C is the alternative). **Pin budget conflict:** the ADC pins (GPIO0–6) overlap the only deep-sleep wake pins (GPIO0–7), and GPIO0/1 are also the optional 32 kHz crystal pins.

**I2C.** `esp_hal::i2c::master::I2c` is one of the few **stable** drivers, with blocking and async modes and `embedded-hal` / `embedded-hal-async` trait implementations — any generic sensor driver crate works unchanged. The C6 has one main I2C controller plus a low-power one; 1.2 added bus-recovery helpers and stopped holding the clock while idle (good for sleep).

**Flash storage.** Things are mid-migration: `esp-storage` (0.10.0) is **deprecated on `main`** in favour of `esp_hal::flash::Flash` (raw, `unstable`) and `FlashRegion` in `esp-bootloader-esp-idf`, which gives partition-scoped access and implements the `embedded-storage` NOR-flash traits ([esp-storage README](https://github.com/esp-rs/esp-hal/blob/main/esp-storage/README.md)). For settings (brightness, colour, Wi-Fi credentials) put a wear-levelling key-value layer on those traits, e.g. `sequential-storage` (8.0.2, 2026-10-01) *(not evaluated on ESP)*. Unlike the RP2350, flash is described by an ESP-IDF-format **partition table**, so "where do settings live" is a partition, not a hand-picked offset.

**OTA** (over-the-air update). The ESP-IDF bootloader supports A/B app slots (`ota_0`/`ota_1`) plus an `otadata` partition recording which to boot. no_std support lives in `esp-bootloader-esp-idf` (`ota` and `ota_updater` modules) with a worked example in `examples/ota/update`; you write the transport (HTTP over embassy-net, or BLE). Two caveats from the crate docs and book: the example is "basic", and "the prebuilt bootloaders provided by `espflash` *might not* include OTA support. In that case, the bootloader must be built from source". A community crate, `esp-hal-ota` (0.7.2, Oct 2026), also exists *(not evaluated)*. On the std path, OTA is a mature ESP-IDF service wrapped by `esp-idf-svc`. Decide the partition layout (two app slots roughly halve the space per image) **before** relying on it, and pick a module with ≥ 8 MB flash if Matter is on the table.

---

## 8. Known gotchas (collected)

1. **Stale tutorials.** Anything mentioning `esp-wifi`, `esp-hal-embassy`, `esp-hal 0.2x`, or `Rtc::sleep_light` predates the current APIs. Trust the examples at the git tag matching your esp-hal version (the repo README says the same: `main` examples may not match releases).
2. **`unstable` breaks on minor bumps.** 1.1 → 1.2 rewrote sleep and renamed LP-pin types; RMT changed in 1.0 → 1.1. Pin with `~`.
3. **esp-radio 1.0.0-beta.2 is yanked**; the docs site still shows it.
4. **Start `esp-rtos` before the radio; you need a heap; `esp-radio` needs `opt-level` 2/3** even in dev builds. Do not enable any `arch-*` feature on `embassy-executor` (esp-rtos provides the executor integration).
5. **Mismatched crate sets fail in confusing ways** — exactly like v1's "matched set pinned to the `cyw43-v0.7.0` tag" rule. Here the matched set is one esp-hal release train plus the embassy versions it was built against (embassy-executor 0.10, embassy-time 0.5, embassy-net 0.9, embassy-sync 0.8).
6. **Wi-Fi power save defaults to off.**
7. **App descriptor macro is mandatory** with the default bootloader.
8. **USB-Serial-JTAG vanishes during sleep**; `espflash` may need `--after watchdog-reset` to leave download mode over USB (book FAQ).
9. **No Wi-Fi + 802.15.4 coexistence in esp-radio.** A design that needs Thread *and* Wi-Fi simultaneously is std-only.
10. **LEDC is capped at 14 bits and one clock source in esp-hal on the C6**, and is scheduled for a breaking redesign.
11. **Only two RMT TX channels.**
12. **The radio is a blob in both paths** — "pure Rust" stops at the HCI/driver boundary; radio bugs are fixed by blob updates in esp-radio releases.
13. **Deep sleep = reboot.** State must be persisted (flash or LP memory), and wake-to-light latency includes boot time. For a lamp with physical controls, light sleep with GPIO wake is the more natural standby; deep sleep fits "off for hours".

---

## 9. Version-pinning strategy

Principle (same as v1): **take a whole matched set from one authoritative manifest, never bump crates individually.** For ESP the authoritative manifest is the `esp-generate` template at the release you generated with, cross-checked against the examples at the matching `esp-hal-vX.Y.Z` git tag.

Known-good set from [esp-generate 2.0.0's template](https://github.com/esp-rs/esp-generate/blob/main/template/Cargo.toml) (2026-10-23), plus two community crates checked against it:

```toml
esp-hal                = { version = "~1.2.2", features = ["esp32c6", "unstable", "defmt"] }
esp-rtos               = { version = "0.4.0",  features = ["esp32c6", "embassy", "esp-radio", "esp-alloc", "defmt"] }
esp-radio              = { version = "=1.0.0-beta.1", features = ["esp32c6", "wifi", "ble", "coex", "esp-alloc", "unstable", "defmt"] }
esp-bootloader-esp-idf = { version = "0.6.0",  features = ["esp32c6", "defmt"] }
esp-alloc              = { version = "0.11.0", features = ["esp32c6", "defmt"] }
embassy-executor       = "0.10.0"
embassy-time           = "0.5.0"
embassy-net            = "0.9.1"     # with smoltcp 0.14.0
trouble-host           = "0.7.0"     # with bt-hci 0.9.0 (what the template pins; 0.8.0 exists but is not in the template)
esp-hal-smartled       = "0.18.0"    # requires esp-hal ~1.2
rtt-target             = { version = "0.6.2", features = ["defmt"] }
panic-rtt-target       = { version = "0.2.0", features = ["defmt"] }
defmt                  = "1.0.1"
static_cell            = "2.1.1"
```

Rules:

1. **Tilde-pin esp-hal** (`~1.2.2` = patch updates only). This is the esp-hal team's own instruction for `unstable` users.
2. **Exact-pin the beta** (`=1.0.0-beta.1`): cargo treats pre-releases specially and betas break between each other.
3. **Commit `Cargo.lock`** and pin the compiler in `rust-toolchain.toml` (a specific stable ≥ 1.95, not floating `stable`), because esp-hal's MSRV policy is "latest stable at release time".
4. **Upgrade as a train**: when esp-hal 1.3 / esp-radio 1.0 final ships, regenerate a scratch project with the new `esp-generate`, diff its `Cargo.toml` against yours, read each crate's changelog/migration guide, then move everything at once.
5. **Avoid git dependencies** for the lamp firmware proper. If Matter is pursued, isolate it in its own experiment crate, since `rs-matter-embassy` currently requires git patches.
6. Record the set and the reason in v2's `CLAUDE.md`, as v1 does for the `cyw43-v0.7.0` tag.

Expect one disruptive upgrade soon: esp-radio 1.0 final and the LEDC overhaul are both pending.

---

## 10. Recommendation

1. **Framework:** `no_std` — esp-hal `~1.2` + esp-rtos (embassy) + esp-radio beta, stable Rust, generated by `esp-generate`. Rationale: Espressif-maintained, same async/embassy/defmt/probe-rs model as v1, lightest toolchain, and all required peripherals exist. Accept `unstable` and pin as in section 9.
2. **Connectivity, in order of maturity:** start with **BLE (TrouBLE)** for control — lowest power, no provisioning problem, works today. Add **Wi-Fi** only if a concrete feature needs it (OTA download, Home Assistant/MQTT), using BLE to provision credentials via coex. Treat **Matter** as a separate, later experiment; do not let it drive the v2 board design beyond "leave ≥ 8 MB flash".
3. **LEDs:** RMT + `esp-hal-smartled` for addressable LEDs; LEDC at 12–14 bit for analog dimming, with gamma correction in software. Prototype the low-brightness behaviour early, since 14 bits/linear fades is the driver's ceiling.
4. **Power:** design two states — *on* (PWM active, no sleep, Wi-Fi/BLE power save enabled) and *standby* (auto light sleep with GPIO wake for controls; deep sleep with an LP-pin wake only if standby current misses the target). Measure on real hardware in week one; the Rust sleep code is three months old.
5. **Dev loop:** route GPIO12/13 to USB-C and use probe-rs + defmt-RTT; keep a UART test point for debugging sleep.
6. **Fallback trigger:** switch to the std path (or plain ESP-IDF C for the radio-heavy part) only if a hard requirement appears for certified Matter, Zigbee, Wi-Fi+Thread coexistence, or months-long always-connected Wi-Fi on battery that the Rust sleep code cannot reach.

A cheap de-risking step before any PCB work: buy an ESP32-C6-DevKitC-1 (or similar), run `esp-generate`, and reproduce v1's test-binary ladder (`test-leds` → `test-ble` → `test-sleep` with a current meter → `test-adc`).

---

## 11. Open questions for the owner

1. **What must the lamp talk to?** Phone-only (BLE), home network (Wi-Fi/MQTT/Home Assistant), or a smart-home ecosystem (Matter)? This decides almost everything in section 3.
2. **Is it reachable while "off"?** A lamp that must respond to the network while dark needs months-long connected standby (hard, Wi-Fi) or BLE advertising/Thread (easier). A lamp woken only by its knob can deep-sleep at microamps.
3. **Battery and runtime targets** — capacity, expected hours of light, acceptable standby life. These set whether standby current needs to be ~1 mA, ~100 µA or ~10 µA.
4. **LED topology** — addressable (SK6812 RGBW?) via RMT, constant-current white channels via LEDC PWM, or both? How low must it dim, and is 14-bit / ~4.9 kHz acceptable for the chosen LED driver?
5. **Is OTA a v2 requirement?** It fixes the partition layout and minimum flash size up front.
6. **Which module?** (e.g. ESP32-C6-MINI-1 vs WROOM-1; 4 vs 8 MB flash; antenna type.) Needs a pin budget that reconciles ADC (GPIO0–6), deep-sleep wake (GPIO0–7), USB (GPIO12/13) and strapping pins — worth its own research note.
7. **Appetite for bleeding edge:** is tracking git dependencies for Matter/Thread an interesting learning goal or an unwanted distraction?
8. **Battery gauging accuracy:** is an ADC-based ~1 % voltage estimate enough, or should the board carry a fuel-gauge IC?

---

## What I could not verify

- **No hardware testing.** All current figures are Espressif's (datasheet and ESP-IDF-measured); none were measured with the Rust stack. Whether esp-rtos auto light sleep on the C6 holds a Wi-Fi/BLE connection at comparable currents is unknown.
- **Per-chip esp-hal docs page for 1.2.2** returned 404 at the URL I tried; C6 driver stability was taken from the README table and chip metadata on `main`, which may differ slightly from the 1.2.2 release.
- **probe-rs's own ESP32 documentation page** was not found (404); probe-rs claims rest on the Rust on ESP Book, the esp-generate template, and the probe-rs changelog/target files.
- **Which clock esp-hal's LEDC `APBClk` selects on the C6** (the frequency/resolution figures assume 80 MHz), and **whether LEDC output survives light sleep in esp-hal** (assumed not).
- **How `[unstable] build-std` in the generated `.cargo/config.toml` behaves on stable** — I believe cargo ignores it on stable and uses the prebuilt `core` for the target; not confirmed.
- **Whether espflash's bundled C6 bootloader supports OTA/rollback** — the docs only say it "might not".
- **Zigbee in Rust** — I found nothing in either path; absence of evidence only.
- **std-path details** (esp-idf-hal LEDC/RMT/ADC ergonomics, Thread wrapper completeness, NimBLE wrapper maturity) were only skimmed via READMEs/changelogs, not examined in depth.
- **Not evaluated:** `sequential-storage` and `esp-hal-ota` on the C6, `ws2812-esp32-rmt-driver`, BLE idle/advertising current, TrouBLE bonding robustness against phones.
- **GPIO numbers for USB (12/13) and strapping pins** are stated from the datasheet pin tables; re-check against the specific module's datasheet before layout.

---

## Sources

All accessed 2026-11-09.

**esp-hal monorepo (github.com/esp-rs/esp-hal, `main`)**
- [Repo README (support and release policy)](https://github.com/esp-rs/esp-hal/blob/main/README.md)
- [esp-hal README (targets, peripheral support table, `unstable`, MSRV)](https://github.com/esp-rs/esp-hal/blob/main/esp-hal/README.md)
- [esp-hal CHANGELOG](https://github.com/esp-rs/esp-hal/blob/main/esp-hal/CHANGELOG.md) — 1.0.0 (2025-10-30), 1.1.0 (2026-04-24), 1.2.0-rc.0 (2026-08-24), 1.2.0 (2026-09-01)
- [ESP32-C6 chip metadata](https://github.com/esp-rs/esp-hal/blob/main/esp-metadata/devices/esp32c6/soc.toml)
- [LEDC timer source](https://github.com/esp-rs/esp-hal/blob/main/esp-hal/src/ledc/timer.rs), [LEDC module docs](https://github.com/esp-rs/esp-hal/blob/main/esp-hal/src/ledc/mod.rs), [RMT](https://github.com/esp-rs/esp-hal/blob/main/esp-hal/src/rmt.rs), [ADC](https://github.com/esp-rs/esp-hal/blob/main/esp-hal/src/analog/adc/mod.rs), [sleep](https://github.com/esp-rs/esp-hal/blob/main/esp-hal/src/rtc_cntl/sleep/mod.rs)
- [esp-radio README](https://github.com/esp-rs/esp-hal/blob/main/esp-radio/README.md), [CHANGELOG](https://github.com/esp-rs/esp-hal/blob/main/esp-radio/CHANGELOG.md) (1.0.0-beta.0 2026-06-03, beta.1 2026-09-15), [lib docs](https://github.com/esp-rs/esp-hal/blob/main/esp-radio/src/lib.rs), [Wi-Fi source (`PowerSaveMode`)](https://github.com/esp-rs/esp-hal/blob/main/esp-radio/src/wifi/mod.rs), [802.15.4 docs](https://github.com/esp-rs/esp-hal/blob/main/esp-radio/src/ieee802154/mod.rs)
- [esp-rtos README](https://github.com/esp-rs/esp-hal/blob/main/esp-rtos/README.md), [CHANGELOG](https://github.com/esp-rs/esp-hal/blob/main/esp-rtos/CHANGELOG.md) (0.4.0, 2026-08-25), [sleep module](https://github.com/esp-rs/esp-hal/blob/main/esp-rtos/src/sleep.rs)
- [esp-bootloader-esp-idf docs](https://github.com/esp-rs/esp-hal/blob/main/esp-bootloader-esp-idf/src/lib.rs), [OTA module](https://github.com/esp-rs/esp-hal/blob/main/esp-bootloader-esp-idf/src/ota.rs)
- [esp-storage README (deprecation notice)](https://github.com/esp-rs/esp-hal/blob/main/esp-storage/README.md)
- [Examples directory](https://github.com/esp-rs/esp-hal/tree/main/examples)

**Other esp-rs repos**
- [esp-generate README](https://github.com/esp-rs/esp-generate/blob/main/README.md), [CHANGELOG](https://github.com/esp-rs/esp-generate/blob/main/CHANGELOG.md) (2.0.0, 2026-10-23), [template Cargo.toml](https://github.com/esp-rs/esp-generate/blob/main/template/Cargo.toml), [template cargo config](https://github.com/esp-rs/esp-generate/blob/main/template/.cargo/config.toml)
- [esp-hal-community / esp-hal-smartled](https://github.com/esp-rs/esp-hal-community/tree/main/esp-hal-smartled) (0.18.0, 2026-09-05)
- [esp-rs/esp-idf monorepo README](https://github.com/esp-rs/esp-idf/blob/master/README.md), [esp-idf-svc CHANGELOG](https://github.com/esp-rs/esp-idf-svc/blob/master/CHANGELOG.md) (0.53.0, Sep 2026), [esp-idf-template README](https://github.com/esp-rs/esp-idf-template/blob/master/README.md)
- [esp-rs/openthread](https://github.com/esp-rs/openthread) (0.4.0, 2026-09-14), [its ESP example manifest](https://github.com/esp-rs/openthread/blob/main/examples/esp/Cargo.toml)
- [espflash](https://github.com/esp-rs/espflash) (4.7.0, 2026-10-29)

**The Rust on ESP Book (github.com/esp-rs/book, published at docs.espressif.com/projects/rust/book/)**
- [Preface (stability)](https://github.com/esp-rs/book/blob/main/src/preface.md), [Ancillary crates](https://github.com/esp-rs/book/blob/main/src/introduction/ancillary-crates.md), [Toolchain](https://github.com/esp-rs/book/blob/main/src/getting-started/toolchain.md), [probe-rs](https://github.com/esp-rs/book/blob/main/src/getting-started/tooling/probe-rs.md), [Logging](https://github.com/esp-rs/book/blob/main/src/application-development/logging.md), [OTA](https://github.com/esp-rs/book/blob/main/src/application-development/ota.md), [FAQ](https://github.com/esp-rs/book/blob/main/src/frequently-asked-questions.md)
- [Espressif Rust documentation index (crate versions)](https://docs.espressif.com/projects/rust/)

**Espressif hardware and ESP-IDF**
- [ESP32-C6 Series Datasheet v1.5](https://www.espressif.com/sites/default/files/documentation/esp32-c6_datasheet_en.pdf) (© 2026) — §5.5 ADC, §5.6 current consumption, pin tables
- [ESP-IDF `soc_caps.h` for ESP32-C6](https://github.com/espressif/esp-idf/blob/master/components/soc/esp32c6/include/soc/soc_caps.h)
- [ESP-IDF LEDC docs](https://github.com/espressif/esp-idf/blob/master/docs/en/api-reference/peripherals/ledc.rst)
- [ESP-IDF C6 Wi-Fi sleep-current summary](https://github.com/espressif/esp-idf/blob/master/docs/en/api-guides/sleep-current/esp32c6_summary.inc), [Wi-Fi low-power guide](https://github.com/espressif/esp-idf/blob/master/docs/en/api-guides/low-power-mode/low-power-mode-wifi.rst)
- [ESP-IDF RF coexistence guide](https://github.com/espressif/esp-idf/blob/master/docs/en/api-guides/coexist.rst)

**Embassy, probe-rs, Matter**
- [TrouBLE README](https://github.com/embassy-rs/trouble/blob/main/README.md), [its ESP32 example manifest](https://github.com/embassy-rs/trouble/blob/main/examples/esp32/Cargo.toml) (trouble-host 0.8.0, 2026-08-25)
- [probe-rs CHANGELOG](https://github.com/probe-rs/probe-rs/blob/master/CHANGELOG.md), [ESP32-C6 target definition](https://github.com/probe-rs/probe-rs/blob/master/probe-rs-espressif/targets/esp32c6.yaml) (probe-rs-tools 0.32.0, 2026-07-22)
- [rs-matter README](https://github.com/project-chip/rs-matter/blob/main/README.md) (0.4.1, 2026-09-17), [rs-matter-embassy README](https://github.com/sysgrok/rs-matter-embassy/blob/master/rs-matter-embassy/README.md), [its ESP example manifest](https://github.com/sysgrok/rs-matter-embassy/blob/master/examples/esp/Cargo.toml), [esp-idf-matter README](https://github.com/sysgrok/esp-idf-matter/blob/master/README.md)
- crates.io API (`https://crates.io/api/v1/crates/<name>`) for all version numbers and release dates quoted above
