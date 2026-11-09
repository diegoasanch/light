# Battery and power building blocks for light v2

Research date: 2026-11-09. Status: survey of the option space, not a design.

Scope: v2 is a battery-powered desk lamp. A base PCB carries an ESP32-C6
module (3.3 V logic) and all battery/power electronics; a separate, swappable
light PCB carries the LEDs (type undecided, 1-15 W). Charging over USB-C. Each
block will be breadboarded with off-the-shelf modules before any PCB.

How to read this document:

- Numbers followed by a tag like `[BQ24074]` were read directly from that
  source (listed with revision dates in [Sources](#sources)).
- Arithmetic and design reasoning derived from those numbers is marked
  "derived". Things I could not check against a primary source are marked
  **unverified** and collected in [What could not be verified](#what-could-not-be-verified).
- Jargon is defined at first use and again in the [Glossary](#glossary).

## 1. The big picture

v1 has an easy power story: 12 V comes in, USB-C only powers logic, and a
switch selects 12 V or 5 V for the light. A battery changes four things:

1. **The source voltage moves.** A lithium-ion cell goes from 4.2 V (full) to
   about 3.0 V (empty). Nothing in the lamp wants "3.0 to 4.2 V", so every
   load needs a regulator.
2. **The source is dangerous if mistreated.** Overcharging, over-discharging,
   shorting or charging a cold cell can damage it or start a fire, so
   independent protection is mandatory.
3. **Energy is finite**, so efficiency and "off" current (how much the lamp
   draws while doing nothing) decide how long it lasts on a shelf and in use.
4. **Two sources exist at once** (USB and battery) and something must decide
   who powers the lamp and who gets charged.

The blocks, in the order energy flows:

```
USB-C connector
  -> [A] USB-C input: CC resistors (5 V) or a PD sink IC (9-20 V)
  -> [B] Charger: turns USB power into a safe charge profile
  -> [C] Power path: lets USB run the lamp while the battery charges
  -> [D] Protection: last-resort cut-off for over/under-voltage, overcurrent, short
  -> [E] Cell(s): the energy store        [F] Fuel gauge: "how full is it?"
  -> [G] On/off: soft latch, deep sleep or ship mode
  -> [H] 3.3 V rail for the ESP32-C6
  -> [I] LED rail: 5 V boost, 12 V, or a constant-current LED driver
```

Many ICs combine several blocks (for example a BQ24074 is B + C; a BQ25895
is B + C + part of F + part of G; an IP5306 is B + C + a 5 V boost).

## 2. Cells [E]

### Why this block matters

Chemistry and cell count set every other voltage in the system, so this is the
first real decision.

### Jargon

- **1S, 2S, 3S**: cells in *series* (voltages add). 1S Li-ion is 3.0-4.2 V,
  2S is 6.0-8.4 V, 3S is 9.0-12.6 V (derived from the single-cell range).
- **2P**: cells in *parallel* (capacity and current capability add, voltage
  stays the same). A 1S2P pack behaves like one bigger cell.
- **C rate**: current relative to capacity. For a 3350 mAh cell, 1C = 3.35 A,
  0.5C = 1.7 A.
- **CC-CV**: constant-current then constant-voltage, the standard Li-ion
  charge profile: charge at a fixed current until the cell hits 4.2 V, hold
  4.2 V while the current tapers, stop when it falls to a small value.

### Options

| Option | Voltage range | Energy (example) | Good at | Watch out for |
|---|---|---|---|---|
| 1S Li-ion 18650 (e.g. Samsung INR18650-35E) | 2.65-4.2 V (cut-off / charge) `[35E]` | >= 3350 mAh, about 12 Wh (derived, 3.6 V nominal) | Cheap, dense, huge choice of 1S charger/protection ICs and breakouts | Bare steel can: needs a holder and external protection; counterfeits are common (general knowledge, unverified) |
| 1S Li-ion 21700 (e.g. Molicel INR21700-P42A) | 2.5-4.2 V `[P42A]` | 4200 mAh typ, 15.5 Wh `[P42A]` | More energy and far more current (45 A continuous) than needed `[P42A]` | Bigger holder; a high-power cell makes a short circuit more violent |
| 1S LiPo pouch | Same 3.0-4.2 V family | Any size | Flat shapes; hobby packs usually ship with a protection PCB and a JST-PH lead (Adafruit/SparkFun ecosystem) | Soft pouch is easy to puncture or crush; swelling when abused |
| 1S2P / 1S3P Li-ion | Same as 1S | 2x / 3x | More runtime and lower stress per cell with the *same* 1S electronics | Cells must be at the same voltage before being paralleled, otherwise a large current flows between them (derived) |
| 2S / 3S Li-ion | 6.0-8.4 V / 9.0-12.6 V | 2x / 3x | Lower currents for high LED power; 3S can feed "12 V" strips almost directly | Needs per-cell monitoring and balancing (section 3); cannot be charged from 5 V USB without a boost or PD (section 4); fewer breadboard modules |
| LiFePO4 (LFP) | 2.5-3.65 V, nominal 3.2-3.3 V `[BU-205]` | 90-120 Wh/kg vs 150-220 for NMC `[BU-205]` | Safest common lithium chemistry (thermal runaway about 270 C vs about 210 C for NMC), 2000+ cycles `[BU-205]` | About half the energy for the same weight; needs a charger with a 3.6/3.65 V setting (e.g. BQ25185 `[BQ25185]`); a full LFP cell (about 3.3 V under load) leaves almost no headroom for a 3.3 V LDO (derived) |

Reference numbers for one mainstream cell, Samsung INR18650-35E `[35E]`:
charge 4.2 V; standard charge 1.7 A (4 h); recommended for cycle life 1.02 A;
max charge 2.0 A; max continuous discharge 8 A; cut-off 2.65 V; charge
allowed only between 0 and 45 C; discharge -10 to 60 C.

Consequence (derived): **a single 18650 cannot use a "3 A fast charger"**. A
1 A charge takes roughly 4-5 h; 2 A is the cell's ceiling. Faster charging
needs a bigger or parallel pack, not a bigger charger.

### Protected vs unprotected cells

Every cylindrical cell has internal safety parts (a PTC that limits surge
current, a CID that opens on over-pressure, a vent) `[BU-304b]`. A "protected"
cell additionally has a small protection PCB (section 3) welded to it. An
"unprotected" cell does not, so **the protection circuit must be on your
board**. Battery University's guidance is to use only cells with a designated
protection circuit and an approved charger `[BU-304b]`.

For a breadboard: use either a LiPo pack with built-in protection PCB, or a
bare 18650 in a holder wired through a protection module. Protected 18650s
are a few mm longer than bare ones and may not fit every holder (general
knowledge, unverified).

### Holders and connectors

- 18650/21700: plastic holder with spring or leaf contacts, wires or PCB pins.
  Spring contacts add resistance, which matters at several amps.
- LiPo packs: JST-PH 2-pin is the Adafruit/SparkFun convention. **Polarity is
  not standardised** across vendors; check with a multimeter before plugging
  any battery into any module (general knowledge, unverified, cheap to check).

### Runtime math

Assumption (mine, not from a source): 80% of the cell's rated energy reaches
the LEDs (converter losses plus stopping before the cell is fully empty).
Runtime = energy x 0.8 / load power.

| Pack | Energy | 1 W | 3 W | 5 W | 10 W | 15 W |
|---|---|---|---|---|---|---|
| 1x 18650 (3350 mAh) | 12 Wh | 9.6 h | 3.2 h | 1.9 h | 58 min | 38 min |
| 1x 21700 (4200 mAh) | 15.5 Wh | 12.4 h | 4.1 h | 2.5 h | 74 min | 50 min |
| 2x 18650 (2P or 2S) | 24 Wh | 19 h | 6.4 h | 3.8 h | 1.9 h | 77 min |
| 3x 18650 (3P or 3S) | 36 Wh | 29 h | 9.6 h | 5.8 h | 2.9 h | 1.9 h |

Cell current on 1S (derived, 85% converter efficiency, battery sagging to
3.3 V): 5 W needs about 1.8 A, 10 W about 3.6 A, 15 W about 5.3 A. The cell can
do it (8 A rating) but 15 W on 1S is hard on connectors, inductors and
traces, and impossible on a breadboard. This is the main argument for 2S/3S
at the top of the power range.

## 3. Protection [D]

### Why it exists

The charger and firmware are the *first* line of defence. The protection
circuit is the independent *last* line: if the charger fails, firmware
crashes or a wire shorts, it disconnects the cell. It must not depend on the
microcontroller.

### What a 1S protection IC does

A protection IC watches the cell voltage and the voltage drop across two
back-to-back MOSFETs in the battery's negative lead, and turns them off on a
fault. For the ubiquitous DW01 (normally paired with an FS8205A dual MOSFET)
`[DW01]`:

| Fault | DW01-P threshold | Meaning |
|---|---|---|
| Overcharge | 4.25 V +/- 50 mV, releases at 4.05 V | Stops charging if the charger overshoots |
| Over-discharge | 2.40 V +/- 100 mV, releases at 3.0 V | Stops discharge before the cell is damaged |
| Overcurrent | 150 mV across the MOSFETs, about 10-20 ms delay | Current limit = 150 mV / MOSFET resistance |
| Short circuit | 1.35 V across the MOSFETs, about 500 us | Fast trip on a dead short |
| Own consumption | 3 uA typical | Always on, so it counts toward standby drain |

Things to understand:

- **2.4 V is an emergency floor, not an operating limit.** The Samsung 35E's
  rated cut-off is 2.65 V `[35E]`. Firmware should stop the lamp much earlier
  (around 3.0-3.2 V) and the protection IC should never normally trip.
- The overcurrent trip point depends on the MOSFET's resistance, which varies
  with part and temperature, so it is imprecise. With the usual FS8205A it is
  commonly quoted as about 3 A (**unverified**: I could not fetch the FS8205A
  datasheet). A 10-15 W 1S design would need a lower-resistance MOSFET or a
  different protector.
- TI's BQ297x family is the same function with tighter, factory-set
  thresholds (BQ29700: overcharge 4.275 V, over-discharge 2.8 V) `[BQ2970]`.
- The protection FETs add resistance in the battery path (50-100 mOhm is
  typical for a protection circuit `[BU-304b]`), which costs a little
  voltage at high current.

### What "BMS" means

"BMS" (battery management system) is used loosely. For **1S** it usually just
means the protection circuit above. For **2S and up** it also has to:

- monitor **every cell individually** (a 2S pack at 8.0 V could be 4.0 + 4.0
  or a dangerous 4.4 + 3.6) `[BU-304b]`;
- **balance**: bleed or move a little charge so cells that drifted apart end
  up at the same voltage. Example parts: BQ77915 (3-5S protector with
  autonomous passive balancing, up to 50 mA internal) `[BQ77915]`; BQ25887
  (2S charger with built-in balancing up to 400 mA) `[BQ25887]`.

That extra monitoring and balancing is the real cost of going multi-cell.

## 4. Charging [B]

### Why it exists

A Li-ion cell must be charged CC-CV to a precise voltage (4.2 V, within about
1%), with a pre-charge phase for deeply discharged cells, a termination
condition, a safety timer and ideally a temperature check. A charger IC does
all of that. You cannot charge a lithium cell from a plain 5 V supply or a
bench supply left unattended.

### Linear vs switching

- **Linear charger**: a controlled transistor drops the difference between
  USB voltage and battery voltage as heat. Simple, quiet, cheap, no inductor.
  Heat = (Vin - Vbat) x Icharge: at 5 V in, 3.5 V battery and 1 A that is
  1.5 W in a tiny package (derived). TI's own comparison says linear charging
  is limited to roughly under 1 A applications because efficiency is set only
  by the ratio of battery to input voltage `[SLYT769]`. All of these chips
  reduce charge current automatically when they get hot ("thermal
  regulation"), so charging quietly slows down instead of failing.
- **Switching (buck) charger**: uses an inductor to convert efficiently
  (around 90%+ `[SLYT769]`, `[BQ25895]`), so more of the USB power reaches the
  battery, it runs cool, and it can accept higher input voltages (USB PD).
  Costs: an inductor, careful layout, switching noise, usually I2C setup.

### Options

| IC | Type | Charge current | Input | Power path | Temp sense (NTC) | Notes |
|---|---|---|---|---|---|---|
| TP4056 `[TP4056]` | Linear | Up to 1 A (resistor: 1.2 k = 1 A, 2.4 k = 500 mA) | Abs. max 8 V | **No** | TEMP pin (45%/80% of VIN window); disabled by grounding it, which cheap modules reportedly do (unverified) | 4.2 V +/- 1.5%; C/10 termination; the classic blue module adds DW01 + FS8205A |
| MCP73831 `[MCP73831]` | Linear | 15-500 mA | 3.75-6 V | **No** | No | 4.2 V +/- 0.75%; SOT-23-5; good for small cells |
| MCP73871 `[MCP73871]` | Linear | 50 mA-1 A | USB (100/500 mA) or adapter up to 1.8 A total | **Yes** (load sharing, ideal diode) | Yes | Used on Adafruit PowerBoost 1000C |
| BQ24074 `[BQ24074]` | Linear | Up to 1.5 A | 28 V rated, over-voltage cut at 10.5 V | **Yes** (DPPM, battery supplement) | Yes | Input limit 100 mA / 500 mA / resistor-set up to 1.5 A via EN1/EN2; thermal regulation at 125 C; no I2C needed |
| BQ25185 `[BQ25185]` | Linear | 5 mA-1 A | 3.0-18 V (25 V tolerant) | **Yes** (SYS regulated to 4.5 V) | Yes | Resistor-configured; supports Li-ion and LiFePO4; input limit 100/500/1100 mA |
| BQ25895 / BQ25896 `[BQ25895]` `[BQ25896]` | Switching buck, I2C | 5 A / 3 A | 3.9-14 V | **Yes** (NVDC, supplement, 11 mOhm battery FET) | Yes | Input limit 100 mA-3.25 A; 93% at 2 A; built-in ADC; 5 V boost-back (OTG); ship mode |
| BQ25620 / BQ25622 `[BQ2562x]` | Switching buck, I2C | 3.5 A | 3.9-18 V (26 V abs. max) | **Yes** (NVDC) | Yes, flexible JEITA profile | 1.5 uA battery-only quiescent; 0.15 uA ship mode; 12-bit ADC; BQ25620 has D+/D- adapter detection, BQ25622 has an ILIM pin instead |
| IP5306 `[IP5306]` | Switching, "power-bank SoC" | 2.1 A | 5 V | **Yes** | - | Also contains a 5 V / 2.1 A boost and LED gauge driver; < 100 uA standby; turns its output off automatically at light load (see below) |
| BQ25887 `[BQ25887]` | Switching **boost**, I2C, **2S** | 2 A | 3.9-6.2 V (i.e. plain 5 V USB) | - | Yes | Charges a 2S pack from 5 V and balances it |
| BQ25798 `[BQ25798]` | Switching buck-boost, I2C, **1-4S** | 5 A | Wide (USB PD range) | Yes | Yes | One chip for any cell count; complex |

Notes:

- **IP5306 caveat.** It is designed for power banks, which should switch off
  when the phone is unplugged, so it drops into standby at light load
  `[IP5306]`. A lamp in deep sleep *is* a light load, so the chip would cut
  power to the ESP32. The exact threshold and timing are not in the English
  datasheet I read (third-party sources say roughly 45-50 mA for about 32 s,
  **unverified**). Fine as a learning module, awkward as the final design.
- Injoinic IP2312 and MPS multi-cell chargers (e.g. MP2639A) were on the
  ticket's list but I could not retrieve their datasheets: **unverified**,
  not described here.

### NTC and JEITA

- **NTC**: a thermistor (resistor whose value falls as temperature rises)
  taped to the cell and wired to the charger's TS/TEMP/THERM pin so the
  charger knows the cell temperature.
- **JEITA**: a Japanese industry guideline (2007) for charging by
  temperature. The idea `[SLYT365]`: full current and voltage only in the
  comfortable band (roughly 10-45 C); reduced current when cool; reduced
  voltage when warm; **no charging at all below about 0 C** (lithium metal
  plates onto the anode, which is permanent damage and a short-circuit risk)
  or when hot. The cell datasheet agrees: charge only between 0 and 45 C
  `[35E]`.
- For an indoor desk lamp the cold limit is unlikely, but a lamp charging in
  direct sun or next to hot LEDs can exceed 45 C. Plan for an NTC in the
  final design even if the breadboard skips it.

## 5. Power path / load sharing [C]

### The problem

The naive wiring is charger -> battery, with the lamp connected straight
across the battery. Used while charging, this has three problems
`[AN1149]`:

1. **Charging may never terminate.** The charger stops when charge current
   falls below a threshold (e.g. C/10). The lamp's current flows through the
   same pin, so the charger never sees the current fall and keeps holding the
   cell at 4.2 V indefinitely, which ages it.
2. The battery is cycled continuously even when USB could power the lamp.
3. With a dead or missing battery the lamp cannot run from USB.

### The solutions

- **Do nothing** (TP4056, MCP73831): acceptable only if the lamp is always
  off while charging, or its current is far below the termination current.
- **Discrete load sharing** `[AN1149]`: a P-channel MOSFET plus a Schottky
  diode. With USB present the diode feeds the load from USB and the MOSFET
  disconnects the battery from the load; with USB absent the MOSFET connects
  the battery. Three parts, works with any simple charger.
- **Integrated power-path charger** (BQ24074, BQ25185, MCP73871, BQ2589x,
  BQ2562x): three terminals, IN, SYS (also called OUT) and BAT. The system
  always hangs off SYS. The chip splits input power between SYS and the
  battery, **reduces charge current when the load needs more** (TI calls this
  DPPM), and in **supplement mode** lets the battery add current when the
  load exceeds what the input can give `[BQ24074]`. Charge termination works
  because battery current is measured separately from system current
  `[BQ24074]`.

**NVDC** ("narrow voltage DC", used by BQ2589x/BQ2562x) is the switching
version: SYS is kept just above battery voltage, never below a minimum
system voltage, and the system starts instantly even with a depleted or
missing battery `[BQ2562x]`.

For a lamp that people will certainly use while plugged in, a power-path
charger is the robust choice.

## 6. USB-C input [A]

### 5 V without any IC

A USB-C source does not put 5 V on VBUS until it detects a sink. The sink
announces itself with a **5.1 kOhm resistor from each CC pin to ground**
(one resistor per CC pin, two total; called Rd). The source has pull-ups (Rp)
whose value advertises how much current it can supply `[AN1953]`,
`[TI-PRIMER]`:

| Source advertises | Rp to 5 V | What the sink may draw |
|---|---|---|
| Default USB power | 56 kOhm | 500 mA (USB 2.0) / 900 mA (USB 3) |
| 1.5 A | 22 kOhm | 1.5 A at 5 V = 7.5 W |
| 3.0 A | 10 kOhm | 3.0 A at 5 V = 15 W |

The sink is *supposed* to measure the CC voltage (the Rp/Rd divider) to learn
which of the three applies, and stay under it `[TI-PRIMER]`. As a guide, one
CC-logic IC's detection windows are 0.25-0.61 V = default, 0.70-1.16 V =
1.5 A, 1.31-2.04 V = 3 A `[TUSB320]`. Options:

- Read CC with two ESP32 ADC pins and set the charger's input limit
  accordingly.
- Use a small CC-logic IC that reports it (e.g. TUSB320) `[TUSB320]`.
- Use a charger that protects weak sources by itself: an **input current
  limit** (BQ24074: 100 mA / 500 mA / resistor-set; BQ2589x/BQ2562x:
  programmable) plus **input voltage regulation** (VINDPM: the charger backs
  off when the source voltage starts to sag) `[BQ24074]`, `[BQ2562x]`.

Why input limits matter: a charger that blindly pulls 2 A from a 500 mA port
can brown out or shut down the source.

15 W at 5 V is the ceiling without Power Delivery. If the lamp itself burns
15 W, nothing is left for charging.

### USB Power Delivery (PD)

PD is a digital negotiation over the CC wire that lets the sink request
higher voltages (9, 12, 15, 20 V). A **PD sink IC** ("trigger" chip) does the
negotiation alone:

| IC | Selection method | Notes |
|---|---|---|
| CH224K `[CH224]` | One resistor (6.8 k = 9 V, 24 k = 12 V, 56 k = 15 V, 120 k = 20 V) or three logic pins | PD 3.0, up to 100 W; very cheap generic "PD trigger" boards |
| HUSB238 `[HUSB238]` | Resistors (VSET/ISET) or I2C | Up to 100 W; 3-25 V; USB-IF certified; I2C can read what the source offers; drives a P-MOSFET to gate VBUS |
| STUSB4500 `[STUSB4500]` | Up to 3 profiles stored in non-volatile memory, set over I2C | Runs standalone after programming; dead-battery mode; VBUS switch gate drivers; certified |
| TPS25730 `[TPS25730]` | Pin strapping | PD 3.1 sink with integrated power switch |

When PD is worth it:

- **Worth it** if you need more than 15 W in (run a 10-15 W lamp *and* charge
  at the same time), or you choose a 2S/3S pack and want to charge it with a
  buck charger from 9-20 V.
- **Not worth it** for a 1S lamp at a few watts with a 1-2 A charge: 5 V at
  up to 3 A is plenty and needs two resistors.

**Safety warning for breadboarding PD**: a trigger board will happily put
9-20 V on its output. A TP4056 (8 V absolute max `[TP4056]`), MCP73831 (6 V
`[MCP73831]`) or BQ25887 (6.2 V operating `[BQ25887]`) connected to that is
destroyed, possibly with the battery attached. Only combine PD with chargers
rated for it (BQ2589x to 14 V, BQ2562x to 18 V, BQ24074 survives 28 V but
stops charging above 10.5 V).

## 7. Fuel gauging [F]

### Why it is harder than it looks

Li-ion voltage is a poor "fuel needle": the curve is flat in the middle,
depends on temperature and age, and the terminal voltage **sags under load**
(internal resistance), so the reading drops when the lamp turns on and
recovers when it turns off.

### Options

| Method | How | Pros | Cons |
|---|---|---|---|
| Voltage via ESP32 ADC | Resistor divider to an ADC pin, lookup table | Free, two resistors | Coarse (think 4-5 bars, not percent); jumps with load; the divider drains the battery continuously unless high-value or switched (derived) |
| Charger's built-in ADC | BQ2589x and BQ2562x report battery voltage, charge current, input voltage over I2C `[BQ25895]`, `[BQ2562x]` | No extra part | Still voltage-based for state of charge |
| MAX17048 `[MAX17048]` | Voltage-only "ModelGauge" algorithm, I2C | No sense resistor, no learning cycle, 23 uA active / 3 uA hibernate, +/- 7.5 mV voltage accuracy; reports percent directly; low-battery alert pin | Uses a generic cell model; no current or mAh reading. MAX17049 is the 2S version |
| BQ27441-G1 `[BQ27441]` | "Impedance Track": measures current through a sense resistor (coulomb counting) plus voltage and learned cell impedance | Reports mAh, current, state of health; adapts to aging | Must be configured with the cell's capacity; needs a learning cycle; more firmware; 1S only |
| LC709203F | Voltage-based | Was the Adafruit default | Distributors list it obsolete/EOL; onsemi's own status **unverified**. Avoid for a new design |

Suggested path: start with the ADC to understand the problem, add a MAX17048
breakout when you want a believable percentage.

## 8. Rails [H] and [I]

### Jargon

- **LDO** (low-dropout linear regulator): burns the excess voltage as heat.
  Output can only be *lower* than input, by at least the "dropout" voltage.
- **Buck**: switching step-down converter (inductor-based, efficient).
- **Boost**: switching step-up converter.
- **Buck-boost**: output can be above or below the input.
- **Quiescent current (Iq)**: what the regulator itself consumes with no
  load. It flows 24/7, so it dominates standby life.
- **Constant-current (CC) driver**: regulates LED *current* instead of
  voltage. LEDs are current-driven devices; brightness follows current.

### 3.3 V for the ESP32-C6

Requirements from Espressif: 3.0-3.6 V, supply able to deliver **at least
0.5 A**; WiFi transmit peaks up to **382 mA** (802.11b) / 251-316 mA
(g/n/ax); receive about 78 mA; modem-sleep 14-38 mA; light-sleep 35-180 uA;
deep-sleep 7 uA; powered-off 1 uA `[C6-WROOM]`. Espressif's hardware
guidelines add at least 10 uF at the power entry and warn that transmit
current steps can collapse the rail; for "unstable" supplies such as
batteries under charge they recommend a reset supervisor around 3.0 V
`[C6-HW]`.

The catch: the cell (3.0-4.2 V) straddles 3.3 V.

| Approach | Example (verified figures) | Pros | Cons |
|---|---|---|---|
| LDO | AP2112K-3.3: 600 mA, 250 mV dropout at 600 mA, **55 uA Iq** `[AP2112]`. MCP1700: 1.6 uA Iq but only 250 mA, too little for WiFi bursts `[MCP1700]`. TPS7A02: 25 nA Iq but 200 mA `[TPS7A02]` | Simplest, silent, no inductor. Efficiency = 3.3/Vbat, i.e. 79% at 4.2 V, 89% at 3.7 V (derived), acceptable because the ESP32 is a small load next to the LEDs | Falls out of regulation when the battery is below about 3.3 V + dropout. The ESP32 tolerates down to 3.0 V, so in practice the lamp must shut down around 3.2-3.3 V battery (derived), leaving a little capacity unused |
| Buck | TPS62840: 60 nA Iq, 750 mA, 1.8-6.5 V in, 100% duty-cycle mode (acts like a switch when the battery nears 3.3 V) `[TPS62840]` | Best standby current; efficient | Same low-battery limit as an LDO; inductor + layout |
| Buck-boost | TPS63802: 1.3-5.5 V in, 2 A at 3.3 V, 11 uA Iq `[TPS63802]`. TPS63020: 2 A, 25 uA `[TPS63020]`. TPS63900: 75 nA Iq but "> 400 mA", marginal against the 0.5 A requirement `[TPS63900]` | Solid 3.3 V over the whole discharge, uses all the capacity | Most complex layout; more ripple |
| Buck from 2S/3S | TPS54302: 4.5-28 V in, 3 A, 45 uA Iq `[TPS54302]` | Required if the pack is multi-cell | A 45 uA+ regulator plus BMS makes low standby harder |

WiFi burst handling in practice: a regulator rated >= 500 mA, 10 uF or more
right at the module, short thick wires. On a breadboard, long jumpers and
contact resistance make brown-out resets during WiFi start-up the most likely
first failure; add a few hundred uF near the module if it happens (derived).

### LED rail

What the base must supply depends entirely on the LED type:

**(a) 5 V addressable LEDs (WS2812-class).** Up to about 60 mA per pixel at
full white, 20 mA per pixel as a typical-use rule of thumb `[NEOPIXEL]`.
Needs a 1S -> 5 V boost:

| Boost | Verified capability | Module |
|---|---|---|
| TPS61023 `[TPS61023]` | 0.5-5.5 V in, 3.7 A valley switch limit, 94% at 3.6 V -> 5 V / 1.5 A, true output disconnect | Adafruit MiniBoost 5V #4654: about 1.1 A out at 3.5 V in, 0.8 A at 3.0 V in `[ADA-4654]` |
| TPS61090 `[TPS61090]` | 1.8-5.5 V in, 2 A switch, 20 uA Iq | Adafruit PowerBoost 1000C #2465 (with MCP73871 charger + load sharing) `[ADA-2465]` |
| TPS6123x `[TPS6123x]` | Up to 3.5 A out for 3.3 V -> 5 V, 10 uA Iq | No common breakout found |

Reality check (derived): 5 W of pixels is 1 A at 5 V and about 1.8 A from the
cell, comfortable. 15 W is 3 A at 5 V and over 5 A from the cell, which
needs a TPS6123x-class converter and is not breadboard territory.
Alternative for small strips: run the pixels straight from the cell (they
get dimmer and may misbehave at low voltage `[NEOPIXEL]`).

**(b) PWM-dimmed strips (RGB/white, like v1's DRGB).** 5 V strips: same boost
as (a) plus low-side MOSFETs. 12 V strips: boost 1S -> 12 V (a 4x step-up, so
input current is high: 10 W needs roughly 3.5 A from the cell), or use a 3S
pack whose 9-12.6 V feeds the strip directly (brightness falls as the battery
drains unless regulated).

**(c) Constant-current power LEDs.** The most efficient way to make white
light, and the driver choice depends on LED string voltage vs battery
voltage:

| Situation | Driver type | Example |
|---|---|---|
| LED string voltage **above** battery (2+ white LEDs in series on 1S) | Boost CC driver | TPS61165: 3-18 V in, 1.2 A switch, up to 38 V out, PWM/one-wire dimming `[TPS61165]`. TPS61169: 2.7-5.5 V in, 1.8 A switch `[TPS61169]`. LM3410: 2.7-5.5 V in, 2.8 A switch, 3-24 V out `[LM3410]` |
| LED string voltage **below** battery (2S/3S pack, 1-2 LEDs) | Buck CC driver | AL8860: 4.5-40 V in, up to 1 A / 1.5 A, PWM or analog dimming `[AL8860]` |
| LED voltage **inside** the battery range (one white LED, about 3 V, on 1S) | Buck-boost CC or a linear CC regulator | Awkward case: neither a plain buck nor a plain boost works over the full discharge (derived) |

Dimming is done by PWM or an analog level on the driver's control pin, which
maps nicely to an ESP32 LEDC output.

**Inductor and layout sensitivity.** All switching converters depend on the
inductor (saturation current must exceed the peak switch current) and on a
tight loop between IC, inductor and capacitors. This is why they are bought
as modules for breadboarding: the critical layout is already done. Jumper
wires on the *input* of a boost converter drawing 2-3 A are the weak point.

## 9. On/off and standby [G]

### Options

1. **Always-on MCU in deep sleep.** The button wakes the ESP32. Standby =
   ESP32 deep sleep (7 uA `[C6-WROOM]`) + regulator Iq + protection +
   gauge + charger leakage + anything else left powered. Simple hardware; the
   lamp can wake on a timer. WiFi is off while asleep.
2. **Stay connected to WiFi while "off".** Modem-sleep is 14-38 mA
   `[C6-WROOM]` before any radio activity. On a 3350 mAh cell 20 mA lasts
   about 7 days (derived). A battery lamp that is reachable over WiFi 24/7
   needs frequent charging; decide whether that is a requirement.
3. **Soft-latch power switch.** A small circuit that connects power on a
   button press and lets the MCU (or a second press) cut its own power; off
   current is essentially zero. Module: Pololu Mini Pushbutton Power Switch
   LV #2808 (2.2-20 V, about 0.01 uA off, OFF/CTRL inputs so the load can
   switch itself off) `[POLOLU-2808]`. A plain load switch such as TPS22916
   (10 nA off, 2 A) can also gate individual rails `[TPS22916]`.
4. **Ship mode.** The charger opens its battery FET so the whole system is
   disconnected until a button press or USB plug-in. BQ2562x: 0.15 uA in ship
   mode `[BQ2562x]`; BQ25895 supports ship mode with a button wake
   `[BQ25895]`; BQ24075/79 have a SYSOFF pin `[BQ24074]`. Used for shipping,
   long storage and as a firmware-controlled "hard off".

### Standby budget

For a 3350 mAh cell (derived): 25 uA -> years (cell self-discharge dominates);
100 uA -> about 3.8 years; 1 mA -> about 140 days; 5 mA -> about 28 days;
20 mA -> about 7 days.

Example "good" budget using verified figures: DW01 3 uA + MAX17048 hibernate
3 uA + TPS63802 11 uA + ESP32-C6 deep sleep 7 uA + BQ2562x battery-only
1.5 uA = about 26 uA.

What ruins budgets in practice: LDOs with tens of uA Iq (AP2112: 55 uA), power
LEDs on breakout boards (the PowerBoost 1000C draws 5 mA enabled, 20 uA
disabled `[ADA-2465]`), boost converters left enabled, ADC dividers, level
shifters and addressable LEDs (each pixel draws idle current even when dark;
switch the LED rail off).

## 10. Safety for breadboarding with lithium cells

Lithium cells store a lot of energy and can deliver tens of amps into a
short (45 A continuous for the P42A `[P42A]`). Rules:

1. **Develop without the battery first.** Use a current-limited bench supply
   set to 3.7 V / 0.5-1 A in place of the cell while wiring and debugging
   regulators and loads. Do not use a bench supply as a "battery" on a
   charger's BAT pin unless it can sink current (most cannot).
2. **Fuse the battery lead**, right at the battery, before anything else. A
   2-3 A fuse or resettable polyfuse on a 1S breadboard setup. The fuse
   protects against wiring mistakes; the protection IC is the backup, not
   the other way round.
3. **Always have a protection circuit** in the loop (protected pack or a
   DW01-type module on a bare cell).
4. **Respect the breadboard's limits.** A typical breadboard datasheet says
   36 V, 2 A max, do not run multiple contacts at maximum current because of
   heating, and warns that contact resistance is "relatively high and not
   very reproducible" `[BB170]`. Ratings vary by maker; treat **about 1 A per
   contact as the working limit** (conservative rule of thumb). Anything
   above that (boost inputs, LED rails, battery leads) should use soldered
   wires or screw terminals, not breadboard rows.
5. **Never charge unattended**, and charge on a non-flammable surface (a
   ceramic tile or metal tray), away from paper and curtains.
6. **Never charge below 0 C or above 45 C** `[35E]`; stop if the cell is
   warm to the touch.
7. **Check polarity with a multimeter** before every first connection of a
   battery to a module. Reverse polarity kills most charger modules
   instantly.
8. **Never short or solder directly to a bare cell.** Use a holder or
   pre-tabbed cells. Insulate loose battery leads; never let both bare ends
   dangle.
9. **Retire damaged cells**: dented, swollen, leaking, torn wrap, or
   over-discharged below about 2.5 V for an unknown time. Do not "revive"
   them.
10. **Do not mix PD voltages with 5 V-only parts** (section 6).
11. **Buy cells from a reputable seller.** No real 18650 exceeds roughly
    3600 mAh; labels claiming 5000-9900 mAh are fake (general knowledge,
    unverified; consistent with the 3350 mAh of a top-tier cell `[35E]`).
12. Have a plan: a bucket of sand or a metal container nearby, and know that
    a venting cell produces toxic smoke, so ventilate and leave.

## 11. Breakout modules for breadboarding

Availability in Argentina was **not verified** for any of these. Adafruit,
SparkFun and Pololu parts mean international shipping, import taxes and
couriers that restrict lithium cells; generic modules are usually easier to
find locally. Prices and stock are as shown on the vendor pages on
2026-11-09.

| Block | Module | What is on it | Notes |
|---|---|---|---|
| Charger, no power path | Generic "TP4056 with protection" (USB-C version) | TP4056 + DW01 + FS8205A | The cheapest start; 1 A default is too much for small LiPos (change the PROG resistor); CC resistors on generic USB-C versions vary (**unverified**) |
| Charger, no power path | Adafruit Micro-Lipo #1904 `[ADA-1904]` | 100 / 500 mA linear charger | Micro-USB; $6.95 |
| Charger + power path | Adafruit bq24074 Universal Charger #4755 `[ADA-4755]` | BQ24074 | 1 A default, 500 mA / 1.5 A by jumper; 5-10 V in; load output up to 1.5 A; $14.95, in stock |
| Charger + power path | Adafruit bq25185 Charger #6091 `[ADA-6091]` | BQ25185 | USB-C with 5.1k resistors, 1 A, Li-ion or LiFePO4, thermistor pad; $6.95, out of stock on the day checked |
| Charger + power path + gauge | SparkFun Battery Babysitter PRT-13777 `[SFE-13777]` | BQ24075 + BQ27441 | 100 mA / 500 mA / 1.5 A; $23.95; only a few left, may be end-of-life |
| Charger + power path + 5 V boost | Adafruit PowerBoost 1000C #2465 `[ADA-2465]` | MCP73871 + TPS61090 | 5.2 V at 1 A+, enable pin; 5 mA quiescent when on; $19.95 |
| Charger + 5 V boost | Generic IP5306 "power bank" board | IP5306 | Auto-off at light load; see section 4 |
| Protection only | Generic "1S BMS" strip (DW01 + 8205) | - | For bare 18650s in holders |
| USB-C 5 V input | Generic USB-C breakout with CC pins broken out | add 2x 5.1k | Verify the resistors are present or add them |
| USB PD sink | Adafruit HUSB238 #5807 `[ADA-5807]` | HUSB238 | 5-20 V by jumper or I2C; $5.95 |
| USB PD sink | SparkFun Power Delivery Board DEV-15801 `[SFE-15801]` | STUSB4500 | I2C/Qwiic configuration; $31.92 |
| USB PD sink | Generic "PD trigger / decoy" board | Often CH224K | Fixed or solder-jumper voltage |
| Fuel gauge | Adafruit MAX17048 #5580 `[ADA-5580]` | MAX17048 | I2C, STEMMA QT, JST-PH pass-through; $5.95 |
| 3.3 V buck-boost | Pololu S7V8F3 #2122 `[POLOLU-2122]` | - | 2.7-11.8 V in, 3.3 V, 0.5-1 A, < 0.1 mA quiescent; works for 1S and 2S, **not** 3S (12.6 V); $9.95 |
| 3.3 V LDO | Generic AMS1117 / AP2112 / HT7333 boards | - | AMS1117's dropout is too high for 1S (general knowledge, **unverified**); prefer AP2112-class |
| 5 V boost | Adafruit MiniBoost 5V #4654 `[ADA-4654]` | TPS61023 | About 1 A at 5 V from a LiPo; $3.95 |
| 5 V boost | Pololu U3V16F5 #4941 `[POLOLU-4941]` | - | 2 A switch limit; $7.95 |
| Boost, adjustable | Generic MT3608 module | MT3608 | Ubiquitous and cheap; ratings **unverified** |
| CC LED driver | Generic PT4115 / "1 W-3 W LED driver" boards | PT4115 | Buck type, needs input above the LED voltage, so 2S/3S only; **unverified** |
| Soft power switch | Pololu Mini Pushbutton Power Switch LV #2808 `[POLOLU-2808]` | - | $4.95 |
| ESP32-C6 | Any ESP32-C6 dev board | - | Its onboard LDO and USB-UART add standby current; measure the bare-module case separately |

I found no mainstream breakout for the BQ2589x/BQ2562x I2C switching
chargers, the BQ25887 2S charger or a 2S/3S balancing BMS from the three
named vendors. Generic modules exist but were not verified. This matters:
**the multi-cell path is much harder to breadboard**.

## 12. Candidate end-to-end architectures

### A. "1S + power-path charger + 5 V boost" (addressable or 5 V PWM LEDs)

```
USB-C (2x 5.1k) -> power-path charger (BQ24074 / BQ25185; later BQ2562x)
   BAT <-> protection <-> 1S cell (18650 / 21700 / LiPo), optional MAX17048
   SYS -> 3.3 V regulator (buck-boost or LDO) -> ESP32-C6
   SYS -> 5 V boost with enable (TPS61023-class) -> light PCB
```

- Pros: every block exists as a cheap breakout; all on-topic for v1's ARGB
  code; simplest safe design; one cell means no balancing.
- Cons: boost losses on the whole LED power; practical ceiling about 5 W
  (maybe 7-10 W with a 21700 or 2P and a bigger boost); addressable LEDs are
  inefficient as room lighting and draw idle current; 15 W is unrealistic.
- Best for: ambient / colour lamp, 1-5 W.

### B. "1S + constant-current driver" (white or tunable-white power LEDs)

```
Same input, charger, protection, 3.3 V rail as A.
   SYS -> boost CC LED driver (TPS61165 / LM3410-class), PWM-dimmed from ESP32
       -> series LED string on the light PCB
```

- Pros: highest efficiency (one conversion, straight into LED current); best
  light quality per watt; no 5 V rail at all; long runtime at 1-5 W.
- Cons: the driver is tied to the LED string voltage, so "swappable light
  PCB" needs a rule: either the driver lives on the light PCB (base supplies
  raw SYS + 3.3 V + PWM), or all light PCBs share one string voltage; no
  breadboard-friendly module from the big vendors; colour needs one driver
  per channel.
- Best for: a task/reading lamp, 1-6 W of white light.

### C. "2S/3S + buck" (high power, 12 V strips or multi-LED strings)

```
USB-C -> PD sink (9-15 V) -> buck / buck-boost multi-cell charger (BQ25798-class)
      or 5 V -> boost 2S charger with balancing (BQ25887)
   pack <-> 2S/3S BMS with per-cell protection + balancing
   pack -> buck to 3.3 V (TPS54302-class) -> ESP32-C6
   pack -> buck CC driver (AL8860-class) or direct/regulated 12 V -> light PCB
```

- Pros: 10-15 W becomes comfortable (currents are 2-3x lower); buck
  converters are efficient; 3S matches 12 V LED strips and v1's DRGB concept.
- Cons: balancing and per-cell monitoring; needs PD or a boost charger; more
  ICs with higher quiescent current; almost no breadboard modules; a 3S pack
  fault is more energetic. The hardest first battery project.
- Best for: a bright lamp (10-15 W) where runtime at high power matters.

### Shortcut worth knowing: power-bank SoC

An IP5306-class board gives charger + power path + 5 V boost in one cheap
module. It is a quick way to see a battery lamp work, but the auto-shutoff
and lack of control make it a poor final architecture.

### A design note that applies to all three

Because the light PCB is swappable, **the connector between base and light
PCB is an architectural decision**: a fixed 5 V rail is simple but forces a
boost and rules out efficient CC drive; passing raw SYS (battery) voltage plus
3.3 V and control signals lets each light PCB carry its own optimal driver.
A and B can share one base if the base exposes SYS and the LED-specific
converter sits on the light board.

Suggested learning order regardless of the final choice: (1) TP4056 module +
protected cell + multimeter: watch CC-CV happen; (2) swap in a power-path
charger and observe the difference while a load runs; (3) add the 3.3 V rail
and ESP32-C6 and hunt WiFi brown-outs; (4) add a fuel gauge; (5) add the LED
rail; (6) measure standby current and fix it.

## 13. Open questions for the owner

1. **LED type** on the first light PCB: addressable, PWM strip, or
   constant-current white? (Decides A vs B vs C more than anything else.)
2. **Brightness / power**: what is the real maximum, 3 W, 6 W or 15 W? Is
   maximum brightness needed on battery, or only when plugged in?
3. **Runtime** at typical brightness: 3 h, 8 h, a weekend? (Sets pack size:
   see the table in section 2.)
4. **Charge time** and charger: is overnight (1 A) fine, or 2 h? Must it
   charge from any phone charger / laptop port (5 V only), or is a PD
   charger acceptable?
5. **Use while charging**: at full brightness? (If yes at > 10 W, 5 V input
   is not enough.)
6. **Behaviour when "off"**: must it stay on WiFi (days of standby) or may it
   deep-sleep and wake on a button (months to years)?
7. **Shelf life / ship mode**: should it survive months in a drawer?
8. **Cell format and serviceability**: user-replaceable 18650/21700 in a
   holder, or a fixed LiPo pack? What can be bought reliably in Buenos Aires?
9. **Base-to-light interface**: fixed 5 V, raw battery voltage, or both?
   Should the light PCB identify itself (ID resistor / EEPROM) so the base
   can limit power?
10. **Fuel gauge fidelity**: a few bars, or a trustworthy percentage in the
    app?
11. **Mechanical / thermal**: where does 1-2 W of charger and LED-driver heat
    go, and can the cell stay under 45 C next to the LEDs?
12. **Chemistry preference**: is LiFePO4's safety worth roughly half the
    runtime for the same size?

## What could not be verified

- **Availability and prices in Argentina** for every module: not checked.
- **FS8205A** datasheet (fetch failed): the "about 3 A" DW01 overcurrent
  figure is hearsay.
- **IP5306 light-load shut-off threshold and timing**: not in the datasheet
  copy read; 45-50 mA / 32 s comes from third-party posts.
- **IP2312, MP2639A/MP2672A, TPS61088, PT4115, MT3608, AMS1117, HT7333,
  LTC2954/MAX16054**: datasheets not retrieved; either omitted or flagged.
- **LC709203F**: onsemi's page did not load; lifecycle status is from
  distributor listings only.
- **MAX17048, STUSB4500, HUSB238, TP4056, DW01, Samsung 35E** figures come
  from manufacturer datasheets hosted on third-party mirrors (SparkFun CDN,
  a battery retailer), because the manufacturer sites timed out or have no
  public copy. Revisions are stated; a newer revision may exist.
- **USB Type-C specification**: only the USB-IF document page (title,
  release, date) was read. The resistor values come from Microchip AN1953
  and TI's primer, which quote the spec. The CC voltage windows quoted are
  one IC's (TUSB320) detection thresholds, not the spec's own table.
- **JEITA temperature/current/voltage breakpoints** are quoted from TI's
  article as examples; the JEITA guideline itself was not read.
- **Breadboard "about 1 A"**: no single authoritative figure exists; one
  maker's datasheet says 2 A with a heating caveat, others claim 1.5-5 A.
  1 A is a deliberately conservative rule of thumb.
- **Protected-cell length, JST polarity differences, fake-capacity cells**:
  general hobbyist knowledge, not sourced.
- The 80% usable-energy factor and all "derived" numbers are my own
  estimates, not measurements.
- Nothing here was tested on hardware.

## Glossary

- **BMS**: battery management system; protection, plus per-cell monitoring and
  balancing for multi-cell packs.
- **Balancing**: equalising the voltages of series cells.
- **CC / CV**: constant current / constant voltage.
- **CC pins**: "configuration channel" pins of a USB-C connector (unrelated to
  "constant current").
- **DPPM / power path**: charger feature that powers the system from the
  input and charges the battery with what is left.
- **Iq**: quiescent current, a part's own consumption.
- **JEITA**: temperature-dependent charging guideline.
- **NTC**: thermistor used to sense cell temperature.
- **NVDC**: switching-charger power-path architecture where the system rail
  tracks slightly above battery voltage.
- **PD**: USB Power Delivery, negotiation for more than 5 V.
- **Rd / Rp**: CC pull-down (sink) / pull-up (source) resistors.
- **Ship mode**: battery electrically disconnected by the charger's FET.
- **Supplement mode**: battery assists the input when the load exceeds the
  input limit.
- **Thermal regulation**: charger lowers its current to limit its own
  temperature.
- **VINDPM**: charger reduces its draw when the input voltage sags.

## Sources

All accessed 2026-11-09. Date shown is the document's own revision date.

Cells and chemistry

- `[35E]` Samsung SDI, *Specification of product INR18650-35E*, Ver. 1.1, 2015-07-09 (retailer-hosted copy): https://www.orbtronic.com/content/samsung-35e-datasheet-inr18650-35e.pdf
- `[P42A]` Molicel, *INR-21700-P42A product data sheet*: https://www.molicel.com/wp-content/uploads/INR21700P42A-V4-80092.pdf
- `[BU-205]` Battery University (secondary), *BU-205: Types of Lithium-ion*, updated 2023-12-08: https://batteryuniversity.com/article/bu-205-types-of-lithium-ion
- `[BU-304b]` Battery University (secondary), *BU-304b: Making Lithium-ion Safe*, updated 2021-10-25: https://batteryuniversity.com/article/bu-304b-making-lithium-ion-safe

Protection

- `[DW01]` DW01-P datasheet V10 (SparkFun-hosted copy): https://cdn.sparkfun.com/assets/learn_tutorials/2/5/1/DW01-P_DataSheet_V10.pdf
- `[BQ2970]` TI, *BQ297xx*: https://www.ti.com/lit/ds/symlink/bq2970.pdf
- `[BQ77915]` TI, *BQ77915*, SLUSCU0L, rev. Aug 2023: https://www.ti.com/lit/ds/symlink/bq77915.pdf

Chargers and power path

- `[TP4056]` NanJing Top Power, *TP4056* (SparkFun-hosted copy, undated): https://dlnmh9ip6v2uc.cloudfront.net/datasheets/Prototyping/TP4056.pdf
- `[MCP73831]` Microchip, *MCP73831/2*, DS20001984H, 2020: https://ww1.microchip.com/downloads/en/DeviceDoc/MCP73831-Family-Data-Sheet-DS20001984H.pdf
- `[MCP73871]` Microchip, *MCP73871*, DS20002090E, 2019: https://ww1.microchip.com/downloads/en/DeviceDoc/MCP73871-Data-Sheet-20002090E.pdf
- `[AN1149]` Microchip, *AN1149: Designing a Li-Ion Battery Charger and Load Sharing System*: https://ww1.microchip.com/downloads/en/AppNotes/01149c.pdf
- `[BQ24074]` TI, *BQ2407x*, SLUS810N, rev. Oct 2021: https://www.ti.com/lit/ds/symlink/bq24074.pdf
- `[BQ25185]` TI, *BQ25185*, SLUSF65B, rev. Aug 2026: https://www.ti.com/lit/ds/symlink/bq25185.pdf
- `[BQ25895]` TI, *BQ25895*, SLUSC88C, rev. Oct 2022: https://www.ti.com/lit/ds/symlink/bq25895.pdf
- `[BQ25896]` TI, *bq25896*, SLUSC76C, rev. May 2018: https://www.ti.com/lit/ds/symlink/bq25896.pdf
- `[BQ2562x]` TI, *BQ25620/BQ25622*, SLUSEG2D, rev. Feb 2025: https://www.ti.com/lit/ds/symlink/bq25620.pdf
- `[BQ25887]` TI, *BQ25887*, SLUSD89B, rev. Nov 2019: https://www.ti.com/lit/ds/symlink/bq25887.pdf
- `[BQ25798]` TI, *BQ25798*, SLUSDV2C, rev. Jun 2026: https://www.ti.com/lit/ds/symlink/bq25798.pdf
- `[IP5306]` Injoinic, *IP5306*, V1.10 (distributor-hosted copy): https://electrokit.com/upload/quick/12/91/662c_IP5306.pdf
- `[SLYT769]` TI Analog Design Journal, *A comparison of battery-charger topologies for portable applications*, 2Q 2019: https://www.ti.com/lit/an/slyt769/slyt769.pdf
- `[SLYT365]` TI Analog Applications Journal, *Li-ion battery-charger solutions for JEITA compliance*, 1Q 2010: https://www.ti.com/lit/an/slyt365/slyt365.pdf

USB-C and PD

- USB-IF, *USB Type-C Cable and Connector Specification*, Release 2.5 (page dated 04/08/2026; page only, spec not read): https://www.usb.org/document-library/usb-type-cr-cable-and-connector-specification-release-24
- `[AN1953]` Microchip, *AN1953: Introduction to USB Type-C*, DS00001953A, 2015: https://ww1.microchip.com/downloads/en/appnotes/00001953a.pdf
- `[TI-PRIMER]` TI, *A Primer on USB Type-C and USB Power Delivery Applications and Requirements*, SLYY109B, Mar 2022: https://www.ti.com/lit/wp/slyy109b/slyy109b.pdf
- `[TUSB320]` TI, *TUSB320*, SLLSEN9F, rev. Mar 2022: https://www.ti.com/lit/ds/symlink/tusb320.pdf
- `[CH224]` WCH, *CH224 Datasheet*, V2.0: https://www.wch-ic.com/download/file?id=302
- `[HUSB238]` Hynetek, *HUSB238*, Rev. 2.0 (SparkFun-hosted copy): https://cdn.sparkfun.com/assets/9/1/7/a/4/USB_PD_Sink_HUSB238.pdf
- `[STUSB4500]` ST, *STUSB4500*, DS12499 Rev 3, Dec 2019 (SparkFun-hosted copy): https://cdn.sparkfun.com/assets/b/6/e/8/9/DS-15801-STUSB4500.pdf
- `[TPS25730]` TI, *TPS25730*: https://www.ti.com/lit/ds/symlink/tps25730.pdf

Fuel gauges

- `[MAX17048]` Maxim/Analog Devices, *MAX17048/MAX17049*, 19-6171 Rev 7, 11/2016 (SparkFun-hosted copy): https://cdn.sparkfun.com/assets/b/b/2/c/b/MAX17048.pdf
- `[BQ27441]` TI, *bq27441-G1*, SLUSBH1C, rev. Dec 2014: https://www.ti.com/lit/ds/symlink/bq27441-g1.pdf

ESP32-C6

- `[C6-WROOM]` Espressif, *ESP32-C6-WROOM-1 & WROOM-1U Datasheet*, v1.4, 2025-12-10: https://documentation.espressif.com/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf
- `[C6-HW]` Espressif, *ESP Hardware Design Guidelines, ESP32-C6 schematic checklist*: https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c6/schematic-checklist.html

Regulators and LED drivers

- `[AP2112]` Diodes Inc., *AP2112*, DS39724 Rev. 2-2: https://www.diodes.com/assets/Datasheets/AP2112.pdf
- `[MCP1700]` Microchip, *MCP1700*, DS20001826F: https://ww1.microchip.com/downloads/en/DeviceDoc/MCP1700-Data-Sheet-20001826F.pdf
- `[TPS7A02]` TI, SBVS277C, rev. Sep 2022: https://www.ti.com/lit/ds/symlink/tps7a02.pdf
- `[TPS62840]` TI, SLVSEC6D, rev. Mar 2020: https://www.ti.com/lit/ds/symlink/tps62840.pdf
- `[TPS63802]` TI, SLVSEU9D, rev. Jan 2021: https://www.ti.com/lit/ds/symlink/tps63802.pdf
- `[TPS63020]` TI, SLVS916I, rev. Oct 2019: https://www.ti.com/lit/ds/symlink/tps63020.pdf
- `[TPS63900]` TI, SLVSET3D, rev. Oct 2020: https://www.ti.com/lit/ds/symlink/tps63900.pdf
- `[TPS54302]` TI, SLVSDG6C, rev. Mar 2026: https://www.ti.com/lit/ds/symlink/tps54302.pdf
- `[TPS61023]` TI, SLVSF14B, rev. Aug 2020: https://www.ti.com/lit/ds/symlink/tps61023.pdf
- `[TPS61090]` TI, SLVS484C, rev. Dec 2014: https://www.ti.com/lit/ds/symlink/tps61090.pdf
- `[TPS6123x]` TI, *TPS6123x*: https://www.ti.com/lit/ds/symlink/tps61235p.pdf
- `[TPS61165]` TI, SLVS790E, rev. Apr 2019: https://www.ti.com/lit/ds/symlink/tps61165.pdf
- `[TPS61169]` TI, SNVSA40B, rev. Jun 2024: https://www.ti.com/lit/ds/symlink/tps61169.pdf
- `[LM3410]` TI, SNVS541H, rev. Aug 2016: https://www.ti.com/lit/ds/symlink/lm3410.pdf
- `[AL8860]` Diodes Inc., *AL8860*: https://www.diodes.com/assets/Datasheets/AL8860.pdf
- `[TPS22916]` TI, *TPS22916xx*: https://www.ti.com/lit/ds/symlink/tps22916.pdf
- `[NEOPIXEL]` Adafruit (secondary), *NeoPixel Uberguide: Powering NeoPixels*: https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels

Breadboard

- `[BB170]` BusBoard Prototype Systems, *BB170 solderless breadboard datasheet* (aggregator-hosted copy): https://static.datasheets.com/doc/9188535-busboard-bb170-g-ds.pdf

Vendor product pages (specs, price and stock as displayed 2026-11-09)

- `[ADA-4755]` https://www.adafruit.com/product/4755
- `[ADA-6091]` https://www.adafruit.com/product/6091
- `[ADA-1904]` https://www.adafruit.com/product/1904
- `[ADA-2465]` https://www.adafruit.com/product/2465
- `[ADA-4654]` https://www.adafruit.com/product/4654
- `[ADA-5580]` https://www.adafruit.com/product/5580
- `[ADA-5807]` https://www.adafruit.com/product/5807
- `[SFE-13777]` https://www.sparkfun.com/products/13777
- `[SFE-15801]` https://www.sparkfun.com/products/15801
- `[POLOLU-2808]` https://www.pololu.com/product/2808
- `[POLOLU-2122]` https://www.pololu.com/product/2122
- `[POLOLU-4941]` https://www.pololu.com/product/4941
