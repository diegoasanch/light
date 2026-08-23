# WiFi on this board — status, history, and bench playbook

**Status (2026-08-23):** all identified WiFi blockers were software, all are now
fixed, and every binary compiles. The chip has **never actually been probed** by
working software — pending first real bench test with `test-wifi-scan`.
No hardware fault was found in an exhaustive schematic/netlist/footprint audit.

## What was actually wrong (the 2025 mystery, solved)

The symptom "can't even detect the CYW43439" was an artifact. Five stacked
software issues meant no code ever exchanged a single valid gSPI bit with the
radio:

1. **The wifi code never compiled.** `Cargo.toml` pinned `cyw43 0.1.0` /
   `cyw43-pio 0.1.0` / `embassy-net 0.2.0` against `embassy-rp 0.6.0` /
   `embassy-time 0.2.0` — an unresolvable dependency graph (three incompatible
   `embassy-time` majors demanded at once), and `test-wifi.rs` used APIs from
   crates 4+ major versions newer. The stored rustc outputs in `target/` show
   both 2025 compile attempts died with 21 errors. No wifi ELF ever existed.
2. **The firmware blobs were GitHub 404 HTML pages** (~286KB each, saved from
   dead URLs), not firmware. Both the committed files and the documented
   pre-flash at `0x10100000`/`0x10140000` *would have* fed HTML to the chip —
   though nothing ever got that far, and whether the pre-flash was actually
   executed is unverifiable from the repo. (Detection doesn't even use the
   blobs; firmware load would have hung forever.)
3. **`PioSpi::new` arguments were swapped**: the code passed CLK-pin GPIO11 as
   `dio` and data-pin GPIO24 as `clk`. The signature is `(..., cs, dio, clk, dma)`.
4. **The MicroPython attempt used a stock Pico 2W build**, which hardcodes
   WL_CLK=GPIO29 at compile time — unconnected on this board (our WL_CLK is
   GPIO11). It powered the module (and presumably strapped it correctly, since
   pico-sdk drives the same GPIO24 net) but never clocked it. Guaranteed
   failure on healthy hardware; proves nothing about the board.
5. The AI-generated `WIFI_*.md` docs "confirmed" things that were false
   (wrong blob URLs/sizes, wrong version advice) and committed WiFi credentials
   in plaintext (see the leak section at the bottom).

**Hardware audit result:** the schematic is a faithful Pico 2W gSPI copy
(strap topology identical: SDIO_DATA_2 hard-tied to WL_D, actively driven low
by the driver before REG_ON rises). U4 footprint verified pad-by-pad against
the Murata land pattern. Power tree correct. Murata has officially confirmed
SPI works on this module (community answer 0D5F90000AJr7gTKQR: "SPI is
supported. Recommend using SDIO."). Residual hardware risk is small
(assembly defects; gSPI-on-1YN has no public precedent board).

## The fix (2026-08-23)

- `Cargo.toml` rebuilt on the matched embassy `cyw43-v0.7.0` release set
  (embassy-rp 0.10.0 / executor 0.10.0 `platform-cortex-m` / time 0.5.1 /
  sync 0.8.0 / net 0.9.1 / cyw43 0.7.0 / cyw43-pio 0.10.0 / reqwless 0.14.0);
  unused deps dropped. Requires Rust ≥ 1.91.
- Real blobs (fw 231,077 B / clm 984 B / nvram 742 B) installed and
  sha256-pinned in `cyw43-firmware/` (see its README + `SHA256SUMS`); loaded
  via `cyw43::aligned_bytes!` — the pre-flash + `from_raw_parts` approach is gone.
- `test-wifi-scan.rs` (new): credential-free bring-up binary with stage markers.
- `test-wifi.rs`: rewritten on the official webrequest example; correct pin
  order (`dio=PIN_24`, `clk=PIN_11`), `RM2_CLOCK_DIVIDER` (25 MHz),
  credentials via compile-time env vars.
- `.cargo/config.toml` bakes `DEFMT_LOG=debug,cyw43=trace,cyw43_pio=trace` so
  the detection-stage logs are always compiled in during bring-up.
- Placeholder bins `test-wifi-{minimal,setup,template}.rs` deleted
  (recoverable from git).
- `src/argb.rs` migrated to embassy-rp 0.10; interrupt bindings moved into the
  binaries so WiFi (PIO0) and LEDs (PIO1) can later coexist.

## First bench session (do these in order)

```bash
cd firmware

# 0a. Prove probe-rs attach + flash + defmt-RTT (~1 min, eliminates a whole
#     class of misattribution before any WiFi conclusions)
cargo run --release --bin test-hello-world

# 0b. Regression baseline for the embassy 0.6→0.10 migration: PIO + DMA on
#     real hardware, verified visually, no logging dependency
cargo run --release --bin test-leds

# 0c. Optional one-time hygiene: wipe historical flash state (old test bins,
#     and the 2025 HTML pre-flash if it ever ran — functionally inert either
#     way, but this makes flash state known-clean)
probe-rs erase --chip RP235x

# 1. THE decisive test — no credentials needed
cargo run --release --bin test-wifi-scan

# 2. Only after STAGE 4 + APs appear: full join/DHCP/HTTP test
WIFI_NETWORK="YourSSID" WIFI_PASSWORD="..." cargo run --release --bin test-wifi
```

**Trace-filter positive controls** (defmt filtering is compile-time; a stale
build can silently ignore the config): at startup cyw43_pio traces its PIO
program/frequency choice, and right after STAGE 2 cyw43 traces `WL_REG off/on`
then `read REG_BUS_TEST_RO`. If those lines are missing, run
`cargo clean -p cyw43 -p cyw43-pio` and rebuild — do NOT interpret their
absence as a dead bus.

**Log capture:** `... cargo run ... 2>&1 | tee bench-$(date +%H%M).log` so
signatures can be compared across boards and clock speeds afterwards.

**Power:** bring-up may run on USB. If stages restart spontaneously (defmt
uptime timestamps reset) or scans are flaky, switch to the 12 V input — VBAT
sits at 3.3 V, already at the edge of Murata's 3.2–4.2 V specification band, so
rail droop during TX bursts goes straight to RF misbehavior. A current-limited
(~1 A) bench supply on the 12 V input both protects the board during probing
and gives the current-step readout the multimeter checks below want.

## Reading the output

The FEEDBEAD detection loop logs at **trace only** — at plain `debug` a dead
bus is totally silent. Once the bus answers, the alp/watermark/chip-ID stages
log at debug. In the FEEDBEAD loop at trace, expect **dropped log frames**
(defmt-rtt's buffer can't sustain a zero-delay poll loop; frames drop whole,
timing is not distorted) — judge by the **values** seen, never by line rate or
gaps.

| Observation | Meaning | Next step |
|---|---|---|
| STAGE 4 + APs listed | WiFi works. Board vindicated | `test-wifi` with env credentials; record RSSI numbers — free antenna-health data |
| STAGE 4 but repeated "scan pass complete: 0 APs" | Bus + firmware fine; RF path suspect | Verify C31 (0.4 pF) / C44 (0.2 pF) populated, C45 absent, under magnification; compare RSSI vs a phone |
| AP visible on phone but absent from scan | Possibly regulatory: NVRAM ships `ccode=ALL` (worldwide profile — channels 12/13 restricted) | Move the AP to channel 1–11 before suspecting hardware |
| Hang after STAGE 2; trace shows endless `REG_BUS_TEST_RO` reads = `0x00000000` | Chip not answering: unpowered, or strapped into SDIO | Power + strap checks below |
| Same, reads = `0xFFFFFFFF` | DIO floating / no drive | Power-off continuity: GPIO24 → R18/R19 pads (proves copper; an LGA joint can't be beeped externally) |
| Same, unstable garbage | Clocking / signal integrity | Scope CLK at R16; halve the SPI clock |
| Debug log `timeout while waiting for alp clock!` then an unwrap panic | Detected, then sick clock — marginal bus | Halve SPI clock; scope CLK edges |
| defmt assert panic (TEST_PATTERN / FEEDBEAD re-read) | Half-working marginal bus | Halve SPI clock; scope signal quality |
| `chip ID: 43439` then hang at `waiting for HT clock...`, or debug log `timeout while waiting for function 2 to be ready` + unwrap panic | Blob-load-stage issue (blobs are sha256-verified → suspect marginal bus corrupting the 231 KB upload first) | Halve clock; re-verify blobs second |

To halve the clock for experiments: add `fixed = "1"` to `Cargo.toml` (already
in the lock as a transitive dep), `use fixed::FixedU32;`, and replace
`RM2_CLOCK_DIVIDER` with `FixedU32::from_bits(0x0600)` (divider 6.0 →
12.5 MHz gSPI).

**If FEEDBEAD never appears on board #1: swap boards before touching the
scope.** Label the boards, run `test-wifi-scan` on #2–#4, record per-board
results. Identical signatures on all four → systematic issue (scope + Murata
escalation). Divergent results → per-unit assembly defect (inspect/reflow U4
on the failing units).

## Bench measurements (multimeter + oscilloscope)

Only needed if `test-wifi-scan` doesn't reach STAGE 3/4.

**Technique rules first:**
- Continuity/resistance checks: **power off only.**
- Attach probes/clips with power off, then power up.
- **Never externally drive GPIO23/24/25/11** — all are push-pull driven by the
  RP2350; forcing them is driver contention. Everything below is
  observe-only; the firmware itself creates every state worth measuring.
- For the 25 MHz CLK/DIO measurements use a **ground spring**, not the
  alligator ground lead — ground-lead inductance rings at these speeds and
  fakes the "marginal bus" diagnosis.
- Don't probe the antenna feed area; keep the supply current-limited.

**Multimeter (chip power-up, ~5 min):** while `test-wifi-scan` is stuck in the
FEEDBEAD hang, the driver has already left REG_ON permanently high — just
measure, no forcing needed:
1. 3V3 present at the module's decoupling (C28/L4 area).
2. Module's internal buck output **VIN_LDO ≈ 1.35 V across the L4 (2.2 µH)
   network**. Present ⇒ chip powers up, PMU runs ⇒ it's a bus problem.
   Absent ⇒ power/REG_ON problem: check GPIO23 ≥ 0.65 × VDDIO (**≈ 2.15 V**
   at 3.3 V; in practice expect ~3.3 V — materially below rail already means
   loading/contention on the WL_ON net).
3. 3V3 current draw steps up visibly when REG_ON rises (board reset →
   watch the bench-supply readout).

**Oscilloscope probe map** (every WiFi net is reachable at passives or vias —
no LGA probing needed; if vias are mask-tented, scrape or use needle probes):

| Net | Probe at | Expect |
|---|---|---|
| WL_CLK | R16 pads; vias (172.64, 103.77) / (169.69, 103.48) | Clean 25 MHz bursts during FEEDBEAD polling |
| WL_D (DIO) | R18/R19 shared side; vias (171.48, 95.14) / (167.82, 90.09) | Command bursts alongside CLK; **any chip-driven response proves the die talks gSPI** |
| WL_ON (REG_ON) | vias (164.97, 90.69) / (172.85, 109.03) | Low 20 ms → high, stays high |
| WL_CS | vias (169.25, 108.08) / (164.40, 92.56) | Low around transfers |
| VIN_LDO | L4 / C28 | ≈1.35 V appearing ms after REG_ON |

(Via coordinates are from `light.kicad_pcb`, in board millimeters.)

**The one two-channel trace that matters (strap timing):** CH1 = WL_D via,
CH2 = WL_ON via, trigger on WL_ON rising. DIO must be actively driven low at
that edge and stay low ≥ 10 ms after (the strap is sampled a few ms after
internal POR, which completes ~4.5 ms post-REG_ON). If DIO is high or floating
there, the chip latches SDIO mode and goes permanently silent on gSPI. The
driver guarantees the correct sequence by construction — verify it, don't
force it: **resetting the board replays the exact re-strap sequence**
(REG_ON low 20 ms with DIO driven low, then high).

⚠ Never test the strap with a passive pull-down: a field report shows
DATA_2's internal pull-up is far stronger than documented (10 kΩ down was not
enough; ≤1 kΩ or active drive required).

**RP2350 E9 erratum warning:** never diagnose this board's GPIOs with
input-mode + internal-pull-down loopback tests — E9 latches pads at ~2.1 V and
you'll chase phantoms. The WiFi bus itself is immune (no pulls, actively driven).

**Escalation:** if the bus stays silent with power confirmed and strap+clock
verified on all 4 boards, quote Murata's own "SPI is supported" answer
(question 0D5F90000AJr7gTKQR) and open a ticket with them; also consider a
1-board SDIO experiment or reflow inspection of U4.

## After WiFi works

1. `test-wifi` (join + DHCP + HTTP) — with rotated credentials.
2. **The real integration milestone:** a `test-wifi-leds` binary running cyw43
   on PIO0 + DMA_CH0 and `Argb` on PIO1 + another DMA channel concurrently
   (LED animation while scanning). This burns down the last known resource
   conflict (the old code had both on PIO0+DMA_CH0) and is the go/no-go gate
   for the unified application firmware. Tonight's `argb.rs` refactor made
   this a parameter choice; it has never run on hardware.
3. Watch for: module `WL_GPIO0` (= the HOST_WAKE net on GPIO10) is driven *by
   the module* if firmware ever calls `control.gpio_set(0, ...)` (Pico W LED
   convention in many examples) — keep RP2350 GPIO10 input-only.
4. Check each board reports a unique MAC after join: the NVRAM ships a generic
   `macaddr` (the module's OTP usually overrides it, but with 4 boards on one
   LAN, verify before deploying).

## Credentials leak (do before pushing!)

Commit `7d74556` contains the real WiFi SSID+password. It is **not pushed**
(origin/main = `46aeac8`). The working tree was scrubbed on 2026-08-23
(`WIFI_FINAL_SOLUTION.md` redacted, `micropython/wifi-get.py` placeholders,
new wifi bins use env vars) — **verify with `git grep -i` for your SSID before
committing**, then rewrite history so the secret never lands on GitHub:
`git reset --soft 46aeac8` and re-commit the clean tree as fresh commits.
Compiled artifacts under untracked `target/` also contain the old strings;
`cargo clean` if that bothers you. Treat the password as burned and rotate it —
it's cheap.

The four `WIFI_*.md` docs are kept only as historical artifacts with warning
banners; they are safe to delete once this file feels sufficient.
