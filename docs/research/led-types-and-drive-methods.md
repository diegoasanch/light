# LED types and drive methods for the v2 light PCBs

Research note, written 2026-11-09. All sources were accessed on 2026-11-09; each
link in [Sources](#sources) carries the document's own revision or date where it
has one.

**Question.** v2 is a battery desk lamp: a base PCB (ESP32-C6 + power) and a
swappable "light PCB" carrying the LEDs, 1-15 W. What kinds of LEDs could a light
PCB carry, how is each driven, and which suit a battery desk lamp?

**How to read this.** Numbers followed by a source tag like `[WS-V5]` were read
from that document. Numbers marked *(derived)* are my arithmetic on sourced
numbers. Numbers marked *(estimate)* or *(unverified)* are not backed by a
primary source I could open; they are collected in
[What I could not verify](#what-i-could-not-verify).

## Short answer

1. **Addressable RGB pixels (WS2812B and friends) are the worst fit for the
   lamp's main light** and the best fit for effects. They make white at roughly
   20 lm/W *(estimate)*, have 8-bit dimming, their internal PWM sits at
   0.4-2 kHz, and every pixel draws 0.6-1 mA even when dark.
2. **White mid-power LEDs on a constant-current driver are the right main
   light.** 120-225 lm/W at the LED depending on colour quality, i.e. 5-10x the
   light per watt-hour of RGB pixels.
3. **The dimming method matters more than the LED.** Switching LED drivers lose
   almost all their PWM dimming range at flicker-safe frequencies (PT4115:
   5000:1 at 100 Hz, 25:1 at 20 kHz). Prefer drivers that turn an MCU PWM signal
   into a *DC current level* (TPS61169, TPS92200D2), or switch the LED string
   directly with a MOSFET at >= 3 kHz.
4. **One connector can plausibly serve every type** if the light PCB carries its
   own driver: switched battery rail, ground, 3.3 V, four general-purpose
   signal pins, and I2C for a board-ID EEPROM.

## Background: five ideas the rest depends on

**An LED is set by current, not voltage.** Brightness is proportional to
forward current. The forward voltage (Vf, the voltage across the LED when
conducting) varies between parts and falls as the LED warms (about -1 to
-4 mV/degC `[CREE-TH]`). TI's example: an LED fed through a resistor from a
fixed voltage sees a 30% current change for an 11% Vf change `[TI-SLYT084]`.
Since Vf falls with heat, a voltage-fed LED draws more as it warms. Hence
**constant-current (CC) drivers**: circuits that regulate the voltage across a
small sense resistor in series with the LED, rather than the output voltage
`[TI-SLYT084]`.

**Two ways to dim.** *Analog dimming* (also "CCR", constant-current reduction)
lowers the DC current. *PWM dimming* (pulse-width modulation) switches full
current on and off quickly and varies the on-fraction (duty cycle). Analog
dimming produces no flicker but shifts LED colour slightly and needs an analog
control; PWM keeps colour constant but is flicker by construction
`[TI-SLYT084]` `[PT4115]`.

**Flicker and IEEE 1789.** IEEE 1789-2015 is the recommended practice for
modulated LED current. As summarised by the chair of the IEEE working group
`[DOE-1789]`:

| Level | Rule | 100% modulation (plain PWM) allowed above |
|---|---|---|
| Low risk | % flicker <= 0.08 x frequency | 1250 Hz |
| No observable effect | % flicker <= 0.0333 x frequency | 3000 Hz *(derived: 100 / 0.0333)* |

"% flicker" is (max - min) / (max + min) of the light output; an LED switched
fully off each cycle is 100%. So **PWM dimming should be >= 1.25 kHz at minimum
and >= 3 kHz to be in the no-effect region.** IEEE lists the standard as
"Inactive-Reserved" since 2026-03-26 `[IEEE-1789]`; it remains the usual
reference. I did not read the standard itself (paywalled).

**Colour quality.** *CCT* (correlated colour temperature, in kelvin) says how
warm or cool the white is: 2700 K is incandescent-like, 4000 K neutral, 6500 K
daylight-blue. *CRI* (colour rendering index, Ra) scores 0-100 how faithfully
colours appear, averaged over only 8 pastel samples; *R9* is the separate score
for saturated red, where cheap LEDs are weak. *IES TM-30* is the newer method:
99 samples, giving a fidelity index Rf (0-100) and a gamut index Rg (saturation;
100 = neutral) `[DOE-TM30]`. For a desk lamp used for reading or craft work,
CRI >= 90 is the usual target. High CRI costs efficiency: compare 227 lm/W at
80 CRI `[CREE-J]` with 122-134 lm/W at Ra 98 `[NICHIA-OPT]`.

**Efficacy.** *lm/W* (lumens per watt) is light out per electrical power in.
"System" lm/W here means LED efficacy x driver efficiency, from the battery
terminals.

## Option 1: addressable LEDs

An addressable LED ("pixel", v1's "ARGB") is a package holding RGB (or RGBW)
dies plus a tiny driver IC. The IC receives serial data, keeps its own bytes,
forwards the rest, and PWMs its dies at a fixed internal frequency with built-in
constant-current sinks.

| Part | Supply (datasheet) | Idle current / pixel | Internal PWM | Logic-high threshold (VIH) | Protocol | Source |
|---|---|---|---|---|---|---|
| WS2812B (2013 sheet) | 3.5-5.3 V | not stated | >= 400 Hz | 0.7 x VDD | 1-wire 800 kbit/s | `[WS2812B]` |
| WS2812B-V5 | 3.7-5.3 V | 0.6 mA | 2 kHz | 0.63 x VDD (max VIL 0.7 V) | 1-wire | `[WS-V5]` |
| WS2813B-RGBW | 3.7-5.3 V | 0.6 mA | 2 kHz | 0.7 x VDD | 1-wire + backup input | `[WS2813]` |
| WS2815B (12 V) | 9.5-13.5 V | 2.1 mA | 2 kHz | 0.7 x VDD (8.4 V at 12 V!) | 1-wire + backup input | `[WS2815]` |
| SK6812RGBW | 3.5-5.5 V | 1 mA | 1.2 kHz | 3.4 V at VDD = 5 V | 1-wire, 32 bit/pixel | `[SK6812]` |
| APA102C | 5 V typ, 5.5 max | not stated | not stated | 0.7 x VDD | clock + data (SPI-like) | `[APA102]` |
| SK9822 | 5 V typ, 5.3 max | 1 mA | 1.2 kHz | (not extracted) | clock + data, up to 30 MHz | `[SK9822]` |

Notes on the table:

- The supply ranges for the Worldsemi and Opsco parts come from their
  "absolute maximum ratings" tables, while the electrical characteristics are
  only specified at VDD = 4.5-5.5 V (or 5 V). Treat anything under 4.5 V as
  "works in practice, not guaranteed".
- The "backup input" (BIN) on WS2813/WS2815 lets data skip one dead pixel
  `[WS2815]`.
- APA102/SK9822 add a 5-bit (32-level) global brightness field per pixel. In
  the SK9822 datasheet this scales the *drive current* of all three channels
  `[SK9822]`, which is real analog dimming and gives extra low-end resolution.
- SK6812 also exists as "WWA" (warm white / neutral white / amber-ish) -
  *unverified*, datasheet not fetched.

### Why idle current hurts a battery lamp

Every pixel's controller stays awake while the rail is powered. Worked example,
30 pixels *(derived)*:

- 30 x 0.6 mA = 18 mA at 5 V = 90 mW; about 100 mW at the battery after a 90%
  boost converter.
- A 10 Wh cell is empty after ~100 hours (4 days) of the lamp being "off".
- With 1 mA parts (SK6812, SK9822) it is ~60 hours. With WS2815 (2.1 mA at
  12 V) it is ~13 hours.

The fix is architectural: the base board needs a **load switch** on the LED
rail (v1 already has one, the "VRGB" switch on GPIO17), and the pixel data line
must be driven low or high-impedance when the rail is off so it does not
back-power the pixels through their input protection.

I did not find a mainstream addressable part with a sleep mode or
microamp-level idle current in the datasheets I read; "newer" Worldsemi
revisions cut idle from ~1 mA to 0.6 mA and raise PWM to 2 kHz, no more.

### Running pixels straight from one Li-ion cell

A Li-ion cell runs 4.2 V (full) to ~3.0 V (empty). The pixels' stated range
starts at 3.5-3.7 V, and blue/green dies need 3.0-3.4 V `[WS2812B]` plus
headroom for the current sink. So direct drive works for roughly the upper part
of the discharge, then blue and green fade first and white turns orange. A
bonus of direct drive: at VDD = 4.2 V the 0.7 x VDD threshold is 2.94 V, so
3.3 V logic meets it without a level shifter *(derived)*.

With a 5 V boost rail the colour is stable, but 0.7 x 5 V = 3.5 V is above a
3.3 V GPIO's output. WS2812B-V5 relaxes this to 0.63 x VDD = 3.15 V `[WS-V5]`,
which 3.3 V only just meets; SK6812 asks for 3.4 V `[SK6812]`. A single-gate
level shifter with TTL thresholds (e.g. 74AHCT1G125 powered from 5 V) is the
standard cure *(common practice, not sourced here)*.

### Light quality and efficiency

- **White from RGB** has a spiky spectrum and very poor colour rendering; none
  of the datasheets give a CRI.
- **RGBW white channel**: WS2813B-RGBW gives 1500-2500 mcd at 15 mA in three
  CCT bands (3000-3500 K, 4000-5000 K, 6000-8000 K) and no CRI `[WS2813]`.
  SK6812RGBW lists CCT bands (2700-3000 K, 4000-4500 K, 6000-7000 K) and no CRI
  or flux `[SK6812]`. Assume ordinary ~80 CRI phosphor at best *(estimate)*.
- **Efficacy** is not in any pixel datasheet (they give millicandela, a
  directional measure). Assuming a Lambertian emitter (flux ~ pi x intensity),
  WS2812B-V5 at full white is ~1.3 cd -> ~4 lm for 36 mA x 5 V = 0.18 W, i.e.
  **~20-25 lm/W** *(estimate)*. The WS2813B-RGBW white channel alone is
  ~6 lm for 75 mW, **~60-100 lm/W** *(estimate)*; about 2 V of the 5 V is
  burned in the pixel's current sink.
- **Dimming resolution** is 8 bits per channel (256 levels). See
  [low-end dimming](#low-end-dimming) for why that is coarse.
- **Flicker**: 400 Hz (old WS2812B) fails IEEE 1789 at full modulation;
  1.2 kHz (SK6812, SK9822) is just under the 1250 Hz low-risk line; 2 kHz
  (WS2812B-V5, WS2813, WS2815) is low-risk but not no-effect. APA102 is
  widely reported at ~20 kHz but its datasheet does not say *(unverified)*.

**Verdict.** Use pixels for accent, status and effects. Do not make them the
task light.

## Option 2: "dumb" LEDs switched by PWM

No intelligence on the LED side: the base (or light PCB) switches each colour
channel with an N-channel MOSFET between the LED cathode side and ground
("low-side switching"; this is v1's "DRGB"). Channel count sets the type:
RGB = 3, RGBW = 4, tunable white / "CCT" (one warm string + one cool string,
mixed to set colour temperature) = 2, RGB+CCT = 5.

**What limits the current?**

- *Resistor-limited at a fixed voltage* - what LED strips do. A 12 V strip is
  groups of 3 LEDs (~9 V) plus a resistor dropping the remaining ~3 V; 24 V
  strips use 6-7 LEDs per group; 5 V strips one LED per resistor. Simple, but
  the resistor wastes ~25% at 12 V *(derived)* and current follows supply
  voltage, which is exactly the weakness `[TI-SLYT084]` describes. From a
  single cell the 12 V or 24 V must also be boosted first, stacking a second
  loss.
- *Bare LEDs with a CC driver per channel* - see Option 3. PWM can then be
  applied to the driver or, better, to a MOSFET in series with the string.

**Why a plain MOSFET is attractive here.** A MOSFET switching a resistor- or
linear-CC-limited string can be PWMed at 20 kHz cleanly, far above the 3 kHz
no-effect line, at whatever bit depth the MCU timer offers. The ESP32-C6's LEDC
PWM peripheral has **6 channels and 4 timers** `[ESP-LEDC]` `[ESP-SOC]`; with
its 80 MHz clock the resolution is about log2(80 MHz / f) bits *(derived;
consistent with the documented "5 kHz -> 13 bit")*:

| PWM frequency | Max resolution *(derived)* |
|---|---|
| 1.22 kHz | 16 bit |
| 5 kHz | 13 bit `[ESP-LEDC]` |
| 20 kHz | 11 bit |
| 40 kHz | 10 bit |

Six channels cover RGB+CCT (5) with one spare. Note the 80 MHz clock does not
run in light sleep; the ~17.5 MHz RC clock does `[ESP-LEDC]`, which costs two
bits.

**Verdict.** Good for RGB/RGBW/CCT colour boards. Buying strip is the easy
route but is inefficient on a battery; bare LEDs laid out on the light PCB with
proper current control are better.

## Option 3: white power LEDs on constant-current drivers

### The LEDs

- **Mid-power SMD** (packages named by size: 2835 = 2.8 x 3.5 mm, 3030, 5630):
  ~0.2-1 W each, ~2.7-3 V, spread across the board. The efficiency leaders:
  Cree J Series 2835 at 227 lm/W typ (4000 K, 80 CRI, 65 mA, 2.7 V; rated to
  480 mA / 2 W; 90 CRI options) `[CREE-J]`. Samsung LM301B is listed at
  220 lm/W at 65 mA *(unverified, Samsung site redirects)*.
- **Very-high-CRI mid-power**: Nichia Optisolis 757 (3030 package), Ra 98-99
  with essentially no UV, 122-134 lm/W `[NICHIA-OPT]`. Roughly half the
  efficacy of the 80 CRI leaders - that is the price of the fuller spectrum.
- **COB** (chip-on-board: many dies under one phosphor disc, one bright
  uniform spot). Runs at higher voltage and concentrates heat. Example below.
- **Dim-to-warm**: a two-terminal module that shifts warmer as current drops,
  imitating a filament lamp, with *no extra control channel*. Bridgelux Vesta
  DTW 9 mm: 3000 K -> 1800 K, 90 or 95 CRI, e.g. 16.7 V at 300 mA (5 W),
  89-113 lm/W `[BXRV]`. It **needs analog dimming** (colour follows current) -
  PWM dimming would hold it at its full-current colour. Driving ~17 V from one
  cell needs a boost driver.

Running an LED below its maximum current raises its efficacy and lowers its
temperature, so "more LEDs, each driven gently" is the efficient layout.

### The drivers

A *linear* CC driver is a regulated valve: it burns the excess voltage as heat,
so efficiency ~ Vf / Vsupply. A *switching* driver uses an inductor to convert
voltage: a **buck** steps down (supply must exceed the LED string voltage), a
**boost** steps up (string voltage must exceed the supply).

| Driver | Type | Input | Output | Dimming behaviour | Fit for 1 cell (3.0-4.2 V) | Source |
|---|---|---|---|---|---|---|
| Diodes AL5809 | Linear, 2-terminal, fixed 15-150 mA | needs 2.5 V across itself | - | PWM by switching it, min 500 us pulses (so <= ~1 kHz) | No: 2.5 V headroom is too much | `[AL5809]` |
| Diodes AL8860 | Buck, hysteretic | 4.5-40 V | up to 1.5 A, up to 97% | Analog 5-100% via CTRL 0.3-2.5 V; PWM "recommended lower than 500 Hz" | No (needs > 4.5 V) | `[AL8860]` |
| PowTech PT4115 | Buck, hysteretic | 6-30 V | up to 1.2 A, up to 97% | Analog via DIM 0.5-2.5 V; PWM range **5000:1 at 100 Hz but 25:1 at 20 kHz** | No (needs > 6 V) | `[PT4115]` |
| TI TPS92200 | Buck, synchronous, 1 MHz | 4-30 V | 1.5 A | D1: PWM dimming, or analog 5-100%. **D2: PWM input converted to analog, 1-100%** | No (needs > 4 V) | `[TPS92200]` |
| TI TPS61169 | Boost, 1.2 MHz | 2.7-5.5 V | string up to 38 V, switch limit 1.2 A min, up to 90% | **PWM input (5-100 kHz, 1-100% duty) sets the reference; LED current is DC, "does not burst"** | Yes | `[TPS61169]` |
| MPS MP3302 | Boost, 1.3 MHz | 2.5-6 V | string up to ~40 V, 1.3 A switch, up to 87% | Analog via EN 0.7-1.4 V; direct PWM only 200 Hz-1 kHz; faster PWM must be RC-filtered into analog | Yes | `[MP3302]` |

Three things fall out of this table:

1. **The popular buck drivers cannot run from a single cell.** They need
   4-6 V minimum and a supply above the LED voltage. They fit a 2S+ pack, a
   USB-C PD input, or a boosted intermediate rail (two conversions in series,
   ~0.9 x 0.9).
2. **From one cell, boost drivers with LEDs in series are the natural match.**
   The string must sit above 4.2 V, so at least 2 white LEDs in series (~5.5 V);
   6-12 in series keeps current low. Power is capped by the switch current:
   ~1.2 A x ~3.3 V x efficiency is about **3 W** for TPS61169/MP3302-class
   parts *(derived)*. Going past ~3-5 W on one cell means a larger boost
   controller and 2-5 A of battery current *(derived: 15 W / 3.3 V = 4.5 A)* -
   a strong hint that 15 W wants a 2S pack or should be a wall-powered mode.
3. **PWM dimming of a switching driver fights flicker targets.** Each PWM
   pulse must restart the inductor current, so range collapses as frequency
   rises (PT4115's 5000:1 -> 25:1) and vendors recommend 500 Hz-1 kHz
   (AL8860, MP3302) - below the IEEE 1789 low-risk line. Drivers that
   translate PWM duty into a DC reference (TPS61169, TPS92200D2, MP3302 with
   an RC filter) give flicker-free output from a plain MCU PWM pin.

**The single-cell coincidence worth knowing.** A white LED's Vf (~2.7 V at
65 mA `[CREE-J]`) sits just under the cell's whole range. A low-dropout linear
current sink per LED (or per small parallel group)
therefore averages ~73% efficiency (2.7 / 3.7), with zero switching noise and
trivially clean analog or high-frequency PWM dimming *(derived)*. It loses
regulation as the cell nears 3.0 V. Worth a bench comparison against a boost.

### Low-end dimming

Perceived brightness is roughly a power law of light output, so equal PWM steps
look huge at the bottom: on an 8-bit linear scale the first step (1/255 = 0.4%
of full light) already appears as several percent brightness, and step 1 -> 2
doubles the light *(derived)*. A desk lamp that dims smoothly to a night-light
level wants **12 bits or more**, plus a gamma (perceptual) lookup curve. Ways
to get there:

- LEDC at 13 bit / 5 kHz or 11 bit / 20 kHz `[ESP-LEDC]`; the C6's LEDC can run
  multi-segment hardware fades that approximate a gamma curve, up to 16
  segments `[ESP-LEDC]` `[ESP-SOC]`.
- Hybrid: analog dimming for the top ~20:1, then PWM (or a second,
  lower-current range) below that. Analog-only drivers bottom out at 1-5%
  (table above), which is not very dim.
- For pixels: SK9822's 5-bit current scaling multiplies the 8-bit PWM
  `[SK9822]`; WS2812-class parts have nothing beyond 8 bits except temporal
  dithering in firmware.

### Diffusion

Mid-power LEDs are bright points; a diffuser (opal acrylic/polycarbonate sheet,
or a light-guide) hides them at the cost of light - typically 10-30% *(estimate,
not sourced)* - and needs distance roughly equal to the LED pitch to blend
*(rule of thumb, not sourced)*. Denser LED pitch allows a thinner head. COBs
need less mixing but produce harder shadows without a diffuser. This affects
the mechanical design more than the electrical interface.

## Thermal

Even good white LEDs turn most input power into heat. Cree: white LEDs are
"over 40% efficient"; for design, conservatively assume **75% of input power
becomes heat** `[CREE-TH]`. Rules from the same note:

- Natural convection moves roughly 10 W/m2K; first-order sizing is **5-10 in2
  (32-65 cm2) of exposed surface per watt of heat** `[CREE-TH]`.
- Junction temperature above the rating (150 degC for XLamp) destroys LEDs;
  below that, heat still costs light output, shifts colour and shortens life
  `[CREE-TH]`.

Board material `[CREE-PCB]`: FR-4 (standard PCB laminate) conducts 0.2 W/mK; a
metal-core PCB (MCPCB: copper on a thin dielectric on an aluminium plate) has a
2.2 W/mK dielectric only 100 um thick over 150 W/mK aluminium. FR-4 can be
rescued with thermal vias under the LED pads, but Cree does not recommend that
technique for LEDs above 5 W each.

The enclosure is the tighter limit. Prusament's data sheets list heat
deflection at ~55 degC for PLA and ~68 degC for PETG *(unverified - read via
search snippets; the PETG PDF text would not extract)*. A light PCB touching
printed plastic should therefore stay below ~50 degC (PLA) or ~60 degC (PETG),
i.e. only 25-35 degC above room temperature.

Putting that together *(derived, treat as starting points to measure)*:

| Light PCB power (electrical) | Heat (75%) | Guidance |
|---|---|---|
| <= ~1.5 W | ~1 W | Plain FR-4 with generous copper is fine; a 50 mm round board has ~39 cm2 both sides. |
| ~1.5-5 W | 1-4 W | Spread the heat: many mid-power LEDs, 2 oz copper or MCPCB, board exposed to air (not sealed in plastic), ideally an aluminium plate as the lamp head. PETG/ASA rather than PLA. |
| 5-15 W | 4-11 W | MCPCB bolted to a real heatsink or a metal lamp head (11 W needs ~350-700 cm2). Printed plastic only as a non-contact shroud. A 5-10 W COB puts all of it in a 9 mm spot. |

Distributed mid-power LEDs are thermally forgiving; COBs are not.

## Efficiency comparison and runtime

System lm/W = LED efficacy x driver/rail efficiency, from the battery. Runtime
assumes 10 Wh usable and ignores the MCU; "300 lm" is a modest desk task light.
All system figures are *(derived)* from the LED numbers cited above and an
assumed 85-90% converter; treat them as +/-25%.

| Option | LED-level lm/W | System lm/W | Lumen-hours from 10 Wh | Hours at 300 lm |
|---|---|---|---|---|
| RGB pixels mixed to white (WS2812B, APA102) | ~20-25 *(estimate)* | ~20 | ~200 | ~0.7 |
| RGBW pixel white channel (SK6812RGBW, WS2813B-RGBW) | ~60-100 *(estimate)* | ~50-90 | 500-900 | 1.7-3 |
| 12 V white strip, resistor-limited, boosted from 1 cell | ~80-110 *(estimate)* | ~50-70 | 500-700 | 1.7-2.3 |
| Dim-to-warm COB (Vesta 9 mm) on boost CC | 89-113 `[BXRV]` | ~75-100 | 750-1000 | 2.5-3.3 |
| Ra 98 mid-power (Optisolis) on boost CC | 122-134 `[NICHIA-OPT]` | ~105-120 | 1050-1200 | 3.5-4 |
| 90 CRI mid-power, single or CCT pair, on boost CC | ~160-190 *(estimate)* | ~135-165 | 1350-1650 | 4.5-5.5 |
| 80 CRI mid-power (J Series 2835) on boost CC | up to 227 `[CREE-J]` | ~170-200 | 1700-2000 | 5.7-6.7 |
| 80 CRI mid-power on linear sink direct from cell | up to 227 | ~150-165 | 1500-1650 | 5-5.5 |

The headline: per watt-hour, a proper white board gives **5-10x** the light of
RGB pixels and about **2x** an RGBW pixel's white channel. Datasheet efficacy
is measured at 25 degC and low current; expect 10-15% less when warm and driven
harder *(estimate)*.

## What each option demands from the base board

| Light PCB type | Rail it wants | Peak current from a 1-cell rail | Control signals | Protocol / peripheral |
|---|---|---|---|---|
| WS2812 / SK6812 pixels | 5 V (or raw cell, degraded) | 30 px RGBW full on: ~2.4 A at 5 V *(derived, 4 x ~20 mA; check the specific part)* | 1 data | 800 kbit/s one-wire; ESP32 RMT (2 TX channels on C6 `[ESP-SOC]`) |
| APA102 / SK9822 pixels | 5 V | similar | 2 (clock, data) | SPI |
| WS2815 pixels | 12 V; data must swing to ~8.4 V | lower current, higher voltage | 1 data + level shift to 12 V domain | one-wire |
| PWM RGB / RGBW / CCT / RGB+CCT | cell voltage if bare LEDs with on-board current control; 12/24 V if strip | 1-15 W / 3.3 V = 0.3-4.5 A | 2-5 PWM | LEDC |
| White CC board (boost on light PCB) | cell voltage | ~1 A for 3 W | 1 PWM (+1 enable) | LEDC, 5-100 kHz `[TPS61169]` |
| Dim-to-warm COB | cell voltage -> on-board boost to ~17 V | ~2 A for 5 W | 1 PWM (analog dimming) | LEDC |

### Could one connector serve all of them?

Plausibly yes, **if the driver lives on the light PCB** and the base supplies
power and logic only. A candidate pinout to evaluate:

| Pin(s) | Purpose |
|---|---|
| VLED (x2 or more) | Battery rail through a base-board load switch, 3.0-4.2 V (or the pack voltage if 2S). Switched so idle pixel/driver current is truly zero. |
| GND (x2 or more) | Return; size contacts for the peak current. |
| 3V3 | A few tens of mA for an ID EEPROM, level shifter, sensor. |
| SIG0-SIG3 | General-purpose 3.3 V signals: PWM (LEDC), pixel data (RMT) or SPI clock/data, assigned per board type in firmware. |
| SDA, SCL | I2C: board-ID EEPROM (type, channel map, current limits, calibration), optional temperature sensor on the light PCB. |

Reasoning and caveats:

- Four signal pins cover everything in the table except 5-channel RGB+CCT
  (which could reuse SDA/SCL-free designs, or take a 5th pin). LEDC has only
  6 channels total `[ESP-LEDC]`.
- An **ID resistor** read by an ADC is cheaper than an EEPROM but only encodes
  a type number; an EEPROM can carry limits ("max 700 mA", "PWM >= 5 kHz") so
  the base never overdrives an unknown board. The base should keep VLED off
  until it has read the ID.
- Putting 5 V / 12 V generation on the light PCBs that need it keeps the base
  simple and the connector voltage-agnostic, at the cost of repeating a boost
  converter per board. The alternative - a programmable rail on the base - is
  a bigger design decision and belongs in the power-architecture ticket.
- Whether the ESP32-C6 can route LEDC/RMT/SPI to arbitrary pins was assumed
  from general knowledge of its GPIO matrix, not re-checked here.
- A temperature sensor (or NTC on a spare pin) on higher-power boards lets
  firmware fold back current before the plastic softens.

## Shortlist: first light PCBs

1. **High-CRI white, distributed mid-power, boost CC with PWM-to-analog
   dimming.** ~2-3 W, 6-12 LEDs in series (90+ CRI, 2700-4000 K), a
   TPS61169-class boost on the light PCB, one PWM pin. This is the "real lamp"
   board: best light per Wh, flicker-free by construction, plain FR-4
   thermally. Its weakness is the dimming floor (1% of full); pair with a
   second low-current mode or a series MOSFET for night-light levels.
2. **Tunable white (CCT), two channels.** Same LEDs in a warm string and a cool
   string, two drivers or two MOSFET-switched strings, two PWM pins. Adds the
   most user-visible feature (warm evening / cool daytime) for one extra
   channel and exercises the multi-channel side of the connector.
3. **RGBW pixel board (SK6812RGBW or WS2813B-RGBW), ~12-24 pixels, on-board
   5 V boost and level shifter.** The fun/effects board and the v1 heritage
   path. It validates the data-pin use of the connector and the load-switch
   requirement, and makes the efficiency gap measurable on the bench.

Deliberately deferred: 12/24 V strip support (inefficient from one cell),
5-15 W COB or dim-to-warm (needs a metal head and likely a 2S pack - decide
power architecture first).

## Open questions for the owner

1. **How much light, for how long?** e.g. "400 lm for 4 h" fixes battery size
   and rules options in or out faster than any other answer. Is 15 W meant for
   battery use, or only when plugged into USB-C?
2. **1S or 2S pack?** 1S favours boost drivers and caps practical power around
   3-5 W; 2S opens the buck drivers (AL8860, TPS92200) and halves the current.
3. **Colour priorities:** is CRI 90 enough or is Ra 95+ worth ~35% less
   runtime? Fixed CCT, tunable CCT, or dim-to-warm?
4. **How dim must it go?** A night-light floor (<0.5%) changes the dimming
   design (hybrid dimming, more PWM bits).
5. **Where should 5 V / 12 V be generated** - per light PCB, or one
   programmable rail on the base?
6. **Head construction:** is an aluminium plate or MCPCB-as-structure
   acceptable, or must the head be fully printed? That sets the thermal
   ceiling (roughly 1.5 W sealed in PLA vs 5 W+ with exposed metal).
7. **Board ID:** EEPROM (self-describing boards) or resistor (cheapest)?
8. **Is hot-swapping light PCBs while powered a requirement?** It affects
   connector choice and inrush/ID sequencing.

## What I could not verify

- **IEEE 1789-2015 itself** (paywalled). Limits are from a DOE presentation
  co-authored by the working-group chair; the 3000 Hz figure is derived from
  its 0.0333 multiplier.
- **APA102 PWM frequency** - absent from the datasheet; the ~20 kHz figure is
  community measurement.
- **Efficacy of any addressable LED** - datasheets give mcd only; my lm/W
  values assume a Lambertian pattern and are rough.
- **CRI of RGBW pixel white channels** - not stated in the datasheets read.
- **SK6812 WWA, WS2812C/low-current variants, and any pixel with a true
  low-power standby** - not found or not fetched.
- **Samsung LM301B / LM281B and Lumileds LUXEON 2835** - manufacturer pages
  redirected or returned 403; the 220 lm/W Samsung figure is from a search
  snippet. The "90 CRI mid-power ~160-190 lm/W" row is an estimate.
- **PLA / PETG heat-deflection temperatures** - from search snippets of Prusa
  technical data sheets, not a clean read.
- **LED strip efficacy, diffuser losses, level-shifter recommendation,
  ESP32-C6 pin-routing flexibility** - general knowledge, unsourced.
- **Several datasheets were read from distributor mirrors** of the
  manufacturer PDF (WS2812B, WS2812B-V5, WS2813B-RGBW, WS2815B, SK6812RGBW,
  APA102C, SK9822, PT4115, MP3302). Revisions may lag the manufacturers'
  current ones. TPS92200 figures are from TI's product page (the datasheet PDF
  was too large to fetch).
- **Nichia Optisolis**: the page gave 122 and 134 lm/W for the 5000 K and
  3000 K parts; which is which was read by an automated extractor and should
  be re-checked before quoting per-CCT.
- No part availability, pricing or JLCPCB/LCSC stock was checked.

## Sources

All accessed 2026-11-09.

Addressable LEDs
- `[WS2812B]` Worldsemi, *WS2812B* datasheet (PDF metadata 2013-05-30), Adafruit mirror: https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf
- `[WS-V5]` Worldsemi, *WS2812B-V5* datasheet (V1.0 2017-05-23, later revisions), Watterott mirror: https://learn.watterott.com/kb/ws281x/WS2812B-v5.pdf
- `[WS2813]` Worldsemi, *WS2813B-RGBW* datasheet V1.3 (2021-04-01), TinyTronics mirror: https://www.tinytronics.nl/product_files/003375_Data-Sheet-of-WS2813B-RGBW-LED.pdf
- `[WS2815]` Worldsemi, *WS2815B* datasheet V1.0 (2018-08-20), Akizuki mirror: https://akizukidenshi.com/goodsaffix/ws2815b.pdf
- `[SK6812]` Opsco, *SK6812RGBW specification* Rev. 01 (2015-07-31), Adafruit mirror: https://cdn-shop.adafruit.com/product-files/2757/p2757_SK6812RGBW_REV01.pdf
- `[APA102]` Shiji Lighting / iPixel, *APA102C* datasheet (undated), Adafruit mirror: https://cdn-shop.adafruit.com/datasheets/APA102.pdf
- `[SK9822]` Opsco, *SK9822 specification* Rev. 01 (2016-03-18), Adafruit mirror: https://cdn-shop.adafruit.com/product-files/2343/SK9822_SHIJI.pdf

White LEDs
- `[CREE-J]` Cree LED, *J Series 2835* product page: https://www.cree-led.com/products/leds/j-series/2835/
- `[NICHIA-OPT]` Nichia, *Optisolis* product page: https://led-ld.nichia.co.jp/en/product/lighting_optisolis.html
- `[BXRV]` Bridgelux, *Vesta Series Dim-To-Warm 9mm Array* data sheet DS150 Rev D (2023-07): https://www.bridgelux.com/sites/default/files/2023-10/ds150_bridgelux_vesta_series_dim-to-warm_9mm_array_gen_1_data_sheet_202307_rev_d.pdf

Drivers and drive theory
- `[TI-SLYT084]` M. Day, "LED-driver considerations", TI *Analog Applications Journal* 1Q 2004: https://www.ti.com/lit/an/slyt084/slyt084.pdf
- `[AL8860]` Diodes Inc., *AL8860* datasheet DS39014 Rev. 8-2 (c) 2026: https://www.diodes.com/assets/Datasheets/AL8860.pdf
- `[AL5809]` Diodes Inc., *AL5809* datasheet DS36625 Rev. 5-2: https://www.diodes.com/assets/Datasheets/AL5809.pdf
- `[PT4115]` PowTech (CR PowTech), *PT4115* datasheet Rev EN_2.9, forum-hosted mirror: https://www.hobbielektronika.hu/forum/getfile.php?id=223015
- `[TPS92200]` Texas Instruments, *TPS92200* product page: https://www.ti.com/product/TPS92200
- `[TPS61169]` Texas Instruments, *TPS61169* datasheet SNVSA40B (Oct 2014, rev. June 2024): https://www.ti.com/lit/ds/symlink/tps61169.pdf
- `[MP3302]` Monolithic Power Systems, *MP3302* datasheet Rev. 0.98, RS mirror: https://docs.rs-online.com/3502/A700000013716748.pdf

Light quality
- `[DOE-1789]` N. Miller (PNNL) and B. Lehman (chair, IEEE PAR1789), "Flicker: Understanding the New IEEE Recommended Practice", US DOE, LightFair May 2015: https://www.energy.gov/sites/prod/files/2015/05/f22/miller+lehman_flicker_lightfair2015.pdf
- `[IEEE-1789]` IEEE 1789-2015 standard page (published 2015-06-05; Inactive-Reserved 2026-03-26): https://standards.ieee.org/ieee/1789/4479/
- `[DOE-TM30]` US DOE, "TM-30 intro webinar" slides (2015-09-15): https://www.energy.gov/sites/prod/files/2015/09/f26/tm30-intro-webinar_9-15-15.pdf

Thermal
- `[CREE-TH]` Cree LED, *Thermal Management of XLamp LEDs*, CLD-AP5 Rev 5 (c) 2004-2023: https://downloads.cree-led.com/files/da/x/XLamp-Thermal-Management.pdf
- `[CREE-PCB]` Cree LED, *Optimizing PCB Thermal Performance for Cree XLamp LEDs*, CLD-AP37 Rev 4A (c) 2010-2025: https://downloads.cree-led.com/files/da/x/XLamp-PCB-Thermal.pdf
- Prusa Research, Prusament PETG technical data sheet (not cleanly read): https://cdn.shopify.com/s/files/1/1745/6181/files/PETG_TechSheet_ENG.pdf

MCU
- `[ESP-LEDC]` Espressif, ESP-IDF (stable) LEDC documentation for ESP32-C6: https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-reference/peripherals/ledc.html
- `[ESP-SOC]` Espressif, ESP-IDF v5.4 `soc_caps.h` for ESP32-C6: https://github.com/espressif/esp-idf/blob/v5.4/components/soc/esp32c6/include/soc/soc_caps.h
