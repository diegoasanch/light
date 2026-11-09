# ESP32-C6 modules and dev boards for light v2

- **Researched:** 2026-11-09 (all links accessed that day)
- **Question:** which ESP32-C6 module should the v2 lamp-base PCB target, and which dev board(s) should be bought for breadboarding first?
- **Method:** primary sources only for technical facts (Espressif datasheets, hardware design guidelines, ESP-IDF docs, vendor docs/schematics). Prices and stock come from distributor search snippets and are explicitly marked as soft.
- **Convention note:** the repo had no `docs/` folder before this file; `docs/research/` was created for it as requested by the ticket.

Confidence labels used below: **[DS]** = read directly in the datasheet text, **[DOC]** = read in vendor/Espressif web docs, **[INFER]** = my reasoning from those facts, **[UNVERIFIED]** = could not confirm from a primary source.

---

## 1. TL;DR

- **Target module: `ESP32-C6-WROOM-1-N8`** (PCB antenna, 8 MB flash, 23 GPIOs, 1.27 mm castellated edge pads). Switch to the `-1U` (u.FL connector) variant only if the lamp base turns out to be metal or the antenna cannot sit at a board edge.
- **Dev boards: 2x `ESP32-C6-DevKitC-1-N8`** (it carries the exact target module, has no battery charger to confuse power prototyping, and has a jumper for measuring module current). Optional third board: **Seeed XIAO ESP32C6** as a cheap, tiny low-power reference.
- The whole v1 "RP2350 + QSPI flash + crystal + CYW43 radio + antenna" block collapses into: one module, one bulk capacitor + one 0.1 uF, an RC on EN, a pull-up + button on GPIO9, a pull-up on GPIO8, and a USB-C connector wired to GPIO12/13.
- Biggest design constraint found: the module wants **3.0 to 3.6 V at >= 0.5 A**, with Wi-Fi TX peaks up to **382 mA**. A single Li-ion cell swings roughly 3.0 to 4.2 V, so the regulator choice is the real v2 power problem (out of scope here, see open questions).

---

## 2. Background: chip vs module vs dev board

- **Chip (SoC)**: the bare ESP32-C6 silicon in a QFN package. Using it directly means designing the crystal, flash, RF matching network and antenna yourself, and paying for radio certification. This is what v1 did with the RP2350 + CYW43439.
- **Module**: a small shielded PCB from Espressif containing the chip, a 40 MHz crystal, SPI flash, the RF matching network and an antenna (or antenna connector). It is tested and radio-certified as a unit. You solder it onto your own board like one big component. [DS: block diagram, WROOM datasheet ch. 2]
- **Dev board**: a module plus a USB connector, 3.3 V regulator, buttons and pin headers, for breadboarding.

The ESP32-C6 itself is a single-core 32-bit RISC-V MCU with 2.4 GHz Wi-Fi 6 (802.11ax), Bluetooth LE 5, and IEEE 802.15.4 (Thread/Zigbee). [DS] It is 2.4 GHz only.

Two chip packages exist, and they explain the module differences: QFN40 with 30 GPIOs and QFN32 with 22 GPIOs ([Espressif product page](https://www.espressif.com/en/products/socs/esp32-c6)). The WROOM modules use the chip with **external** flash on the module; the MINI modules use the `ESP32-C6FH4/FH8` chip with flash **inside the chip package**. [DS]

---

## 3. Module family

Sources: [ESP32-C6-WROOM-1 / WROOM-1U datasheet v1.4 (2025-12-10)](https://documentation.espressif.com/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf), [ESP32-C6-MINI-1 / MINI-1U datasheet v1.5 (2026-06-16)](https://documentation.espressif.com/esp32-c6-mini-1_mini-1u_datasheet_en.pdf).

| | WROOM-1 | WROOM-1U | MINI-1 | MINI-1U |
|---|---|---|---|---|
| Antenna | on-board PCB trace | u.FL / MHF I connector | on-board PCB trace | connector |
| Size (mm) | 18.0 x 25.5 x 3.1 | 18.0 x 19.2 x 3.2 | 13.2 x 16.6 x 2.4 | 13.2 x 12.5 x 2.4 |
| Flash options | N4 / N8 / N16 (4/8/16 MB) | N4 / N8 / N16 | N4, H4 (4 MB), H8 (8 MB) | N4, H4, H8 |
| Flash location | separate chip on module | separate chip on module | inside chip package | inside chip package |
| Ambient temp | -40 to 85 C | -40 to 85 C | N: -40 to 85 C, H: -40 to 105 C | same |
| Module pins | 29 (28 edge + ground pad) | 29 | 53 (many are ground) | 53 |
| GPIOs brought out | **23** | **23** | **22** | **22** |
| GPIO missing | GPIO14 | GPIO14 | GPIO10, GPIO11 | GPIO10, GPIO11 |
| Edge pad pitch | 1.27 mm | 1.27 mm | not extracted | not extracted |

All rows [DS] except the GPIO counts, which I counted from the pin tables (WROOM: GPIO0-13, 15-23; MINI: GPIO0-9, 12-23). The counts agree with the ESP-IDF GPIO page, which says variants with in-package flash have 22 usable GPIOs and that GPIO14 is not led out on variants without in-package flash ([ESP-IDF GPIO docs, v6.1 stable](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-reference/peripherals/gpio.html)).

Notes:

- **N16 is new**: the 16 MB WROOM variants were added in datasheet v1.4 (2025-12-10). The body text of the same datasheet still says "two versions: 4 MB, 8 MB", so the document is internally inconsistent; the part-number table is the newer edit. [DS]
- **Flash size reasoning** [INFER]: 4 MB is enough for a Wi-Fi lamp firmware, but over-the-air (OTA) updates need two copies of the application in flash, so 8 MB removes a constraint for a negligible price difference.
- **"Any newer C6 variants?"**: within the C6 family I found only these four module lines plus the N16 addition. Other Espressif chips (for example ESP32-C5 with 5 GHz, ESP32-C61) are different SoCs, not C6 variants, and were not researched. [UNVERIFIED that no other C6 module exists; the Espressif product page I fetched did not list modules by name.]

### 3.1 Antenna options and keep-out

A PCB antenna radiates into free space; copper, ground planes, batteries and metal enclosures near it detune it and absorb power. "Keep-out" is the area that must stay free of copper and components.

From [Espressif Hardware Design Guidelines, ESP32-C6, PCB Layout > Positioning a Module on a Base Board](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c6/pcb-layout-design.html) [DOC]:

- Preferred: place the module so its antenna **overhangs the edge of the base board**, with the antenna feed point near the board edge.
- If it cannot overhang: keep the feed point as close to the edge as possible and **cut the base board away** beside and below the antenna.
- Keep the antenna at least **15 mm from the housing** in all directions.
- Validate range/throughput on the final product.
- The guideline gives the board keep-out as a figure, not as millimetre numbers; read the figure when doing layout.

The WROOM-1U / MINI-1U have no keep-out zone on the module [DS], but need an external 2.4 GHz antenna on a pigtail. The WROOM-1U connector is compatible with Hirose U.FL and I-PEX MHF I. [DS] Note for certification purists: the modular certification covers specific tested antennas; datasheet v1.3+ lists the external antenna information used for certification. [DS, details not extracted]

[INFER] For a lamp: a plastic or wooden base favours the PCB-antenna module at a board edge. A metal base (common for weighted lamp bases) can block the antenna badly; then use the -1U with an antenna outside the metal.

### 3.2 Certifications

From [Espressif certificates page](https://www.espressif.com/en/support/documents/certificates) [DOC], issue dates as listed:

| | WROOM-1 | WROOM-1U | MINI-1 | MINI-1U |
|---|---|---|---|---|
| FCC (USA) | 2023-09-14 | 2025-08-19 | 2023-09-14 | 2025-08-19 |
| IC (Canada) | 2023-09-14 | 2025-08-20 | 2023-09-14 | 2025-08-20 |
| CE-RED (EU) | 2025-12-18 | 2025-12-18 | 2025-12-18 | 2025-12-18 |
| SRRC (China) | 2025-08-20 | - | 2025-07-09 | 2025-07-09 |
| KCC (Korea) | 2024-02-08 | - | 2025-10-27 | - |
| TELEC (Japan) | 2024-01-08 | - | 2024-09-05 | - |
| NCC (Taiwan) | - | - | 2024-12-19 | 2025-10-27 |
| ANATEL (Brazil) | 2026-04-24 | - | - | - |
| RCM (Australia) | - | - | 2025-12-18 | - |

Also listed: Wi-Fi Alliance (WROOM-1 and MINI-1), Bluetooth BQB, Thread 1.3/1.4 and Zigbee 3.0 at chip level.

- **No ENACOM (Argentina) certificate is listed** for any C6 module. This matters only if the lamp is ever sold in Argentina; for a personal one-off it is not a blocker. [INFER, not legal advice]
- I did not extract FCC ID / IC numbers; they are inside the linked PDFs.

### 3.3 Hand-solderability and JLCPCB assembly

- WROOM-1: 28 pads along the module edges on a 1.27 mm pitch (the dimension drawing shows "28 x 0.45" by "28 x 0.85" mm pads), plus a ground pad (EPAD) underneath. [DS] The datasheet says soldering the EPAD is **not mandatory** (it only improves thermal performance). [DS] So the module can be soldered with an iron: all required pads are reachable from the edge. [INFER]
- MINI-1: 53 pads on a 13.2 mm body, including a block of ground pads (pins 36-53). [DS] I did not extract the pad geometry; with that density and under-body ground pads it is a hot-air/reflow part rather than an iron part. [INFER, UNVERIFIED]
- Both are moisture sensitivity level 3 (must be soldered within 168 h of opening the bag, or baked). [DS, WROOM]
- JLCPCB lists `ESP32-C6-WROOM-1-N8` as LCSC **C5366877**, type **Extended**, SMT assembly supported, PCBA type "Economic and Standard" ([JLCPCB part page](https://jlcpcb.com/partdetail/6203223-ESP32_C6_WROOM_1N8/C5366877)). "Extended" means JLCPCB charges a per-part loading fee because the reel is not permanently on their machines. Live stock and price were not visible to my fetch. [DOC]
- `ESP32-C6-WROOM-1U-N8` appears as C18212191 and `ESP32-C6-MINI-1-N4` as LCSC C5736265 in search results. [UNVERIFIED: seen only in search listings, JLCPCB assembly status not confirmed]
- LCSC single-unit prices seen in search snippets ranged about USD 3.2 to 5.5 for the WROOM-1-N8 depending on snapshot date. [UNVERIFIED, soft]

---

## 4. Pin constraints (for the pin budget)

Sources: WROOM datasheet ch. 3-4 [DS]; [ESP-IDF GPIO docs](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-reference/peripherals/gpio.html); [Hardware Design Guidelines, schematic checklist](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c6/schematic-checklist.html); [ESP-IDF sleep modes](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-reference/system/sleep_modes.html).

Jargon:

- **Strapping pin**: a pin the chip samples once at reset to decide how to boot. After reset (hold time 3 ms [DS]) it is a normal GPIO, but whatever is wired to it must not force the wrong level during reset.
- **LP GPIO** (low-power GPIO, called RTC GPIO on older ESP32s): pins in the always-on power domain that keep working in deep sleep and can wake the chip.
- **ADC**: analog-to-digital converter input, for example to read battery voltage.

### 4.1 Per-pin table (WROOM-1 numbering)

| GPIO | ADC | LP (deep-sleep capable) | Constraint | Verdict for v2 |
|---|---|---|---|---|
| 0 | CH0 | LP0 | also 32 kHz crystal pin (XTAL_32K_P) | free; good ADC / wake pin |
| 1 | CH1 | LP1 | XTAL_32K_N | free; good ADC / wake pin |
| 2 | CH2 | LP2 | - | free |
| 3 | CH3 | LP3 | - | free |
| 4 | CH4 | LP4 | strapping (MTMS, SDIO clock edge), JTAG | usable; strap only matters for SDIO |
| 5 | CH5 | LP5 | strapping (MTDI, SDIO clock edge), JTAG | usable; same |
| 6 | CH6 | LP6 | JTAG MTCK, LP I2C SDA | free |
| 7 | - | LP7 | JTAG MTDO, LP I2C SCL | free |
| 8 | - | - | **strapping**: must be high for download mode; ROM print control | needs 10 k pull-up; do not pull low at reset |
| 9 | - | - | **strapping**: boot mode (low at reset = download mode), internal weak pull-up | reserve for BOOT button |
| 10, 11 | - | - | none (WROOM only; absent on MINI) | free |
| 12 | - | - | **USB D-** | reserve for USB |
| 13 | - | - | **USB D+** | reserve for USB |
| 14 | - | - | not available on WROOM (present on MINI) | - |
| 15 | - | - | **strapping**: JTAG source select, no internal pull, only matters if an eFuse is burnt | usable with care |
| 16 | - | - | UART0 TX: ROM prints boot log here at reset | keep as debug UART or accept boot chatter |
| 17 | - | - | UART0 RX | keep as debug UART |
| 18-23 | - | - | SDIO alternate functions only | free |
| 24-30 | - | - | internal SPI flash, not on module pins | unavailable |

Details behind the table:

- **Strapping pins are GPIO4 (MTMS), GPIO5 (MTDI), GPIO8, GPIO9, GPIO15.** [DS] Defaults: GPIO9 weak pull-up, the others floating. [DS]
- **Boot mode**: GPIO9 = 1 gives normal SPI boot (GPIO8 any value). GPIO9 = 0 **and** GPIO8 = 1 gives "joint download boot" (flashing over USB-Serial-JTAG or UART). GPIO8 = 0 with GPIO9 = 0 is invalid per the design guidelines. [DS + DOC] This is why Espressif's reference circuit has a 10 k pull-up on GPIO8.
- **GPIO9**: guidelines say place an external pull-up and do **not** hang a large capacitor on it, or the chip may land in download mode. [DOC]
- **GPIO4/5** only select SDIO clock edges; irrelevant unless SDIO is used. [DS] ESP-IDF still lists them as strapping pins.
- **GPIO15** has no internal pull resistor; it only has an effect when `EFUSE_JTAG_SEL_ENABLE` is burnt (default is not burnt, where GPIO15 is ignored). [DS]
- **GPIO12/13** are the built-in USB Serial/JTAG controller (D-/D+). If firmware reconfigures them as GPIO, USB-JTAG stops working. [DOC] Guidelines add that USB_D+ can fluctuate at power-up. [DOC] The USB-Serial-JTAG peripheral is fixed-function: serial console + flashing + JTAG debugging. It cannot act as a keyboard or mass-storage device (Adafruit states this explicitly for their C6 board).
- **ADC**: only ADC1, channels 0-6 on GPIO0-6. Guidelines recommend a 0.1 uF capacitor from the ADC pin to ground and give total error of +-12 mV up to 1.3 V, +-23 mV up to 1.9 V, +-40 mV up to 3.3 V (by attenuation setting). [DOC]
- **Deep-sleep wake**: ext1 wake-up supports GPIO0-7 on the C6, and deep-sleep GPIO wake-up only works on pins in the VDDPST1 (LP) domain. [DOC] So **wake buttons / encoder push / charger-status signals must land on GPIO0-7**. Any GPIO can wake from light sleep. [DOC]
- **Sleep leakage**: internal pulls fighting an external circuit waste current in deep sleep; ESP-IDF recommends `rtc_gpio_isolate()` on such pins. [DOC]
- **Drive strength**: typical 40 mA source / 28 mA sink at maximum drive setting. [DS] These are characterisation figures, not a recommendation to load pins that hard.

### 4.2 Budget summary (WROOM-1) [INFER]

- 23 GPIOs on the module.
- Minus 2 for USB (12, 13) = 21.
- Minus 2 strapping pins best left alone (8, 9; GPIO9 can double as a user button after boot) = 19.
- Minus 2 if the debug UART is kept (16, 17) = 17.
- Of those 17: 8 are deep-sleep capable (0-7), and 7 of those are ADC capable (0-6). GPIO4/5/15 carry mild strapping caveats.
- The LP pins are the scarce resource. Assign them first to things that must work in deep sleep or need the ADC (battery sense, wake button, charger interrupt), and put PWM/LED data/I2C on GPIO10, 11, 18-23.

For comparison, v1's pin map uses roughly 13 signal pins besides the radio (2 LED data, 3 PWM, 3 encoder, 2 buttons, 2 I2C, 1 power switch), which fits.

---

## 5. Electrical

### 5.1 Supply

| Parameter | Value | Source |
|---|---|---|
| Supply voltage (VDD33) | 3.0 min / 3.3 typ / 3.6 max V | [DS] table 6-2 |
| Absolute maximum | 3.6 V | [DS] table 6-1 |
| Supply current capability required | >= 0.5 A | [DS] table 6-2 |
| Wi-Fi TX peak, 802.11b 1 Mbps @ 20.5 dBm | 382 mA | [DS] table 6-4 |
| Wi-Fi TX peak, 802.11g 54 Mbps @ 19 dBm | 316 mA | [DS] |
| Wi-Fi TX peak, 802.11n HT20 MCS7 @ 18 dBm | 295 mA | [DS] |
| Wi-Fi TX peak, 802.11ax MCS9 @ 15.5 dBm | 251 mA | [DS] |
| Wi-Fi RX | 78-82 mA | [DS] |
| BLE TX @ 0 dBm / 9 dBm / 19 dBm | 130 / 190 / 309 mA | [DS] table 6-5 |
| Modem-sleep, CPU running @ 160 MHz | 27 mA (clocks off) to 38 mA (clocks on) | [DS] table 6-7 |
| Modem-sleep, CPU idle @ 80 MHz | 14 to 25 mA | [DS] |

All measured at 3.3 V, 25 C; TX at 100 % duty cycle. Identical tables appear in the MINI datasheet. [DS]

Why this matters: the absolute maximum **equals** the recommended maximum (3.6 V). A fully charged Li-ion cell is about 4.2 V, so the cell can never be connected directly; and a nearly empty cell (about 3.0-3.3 V) is below what a plain LDO needs to still output 3.3 V. Wi-Fi TX bursts are short but large, so the regulator and capacitors must hold the rail above 3.0 V during a ~0.4 A step, otherwise the chip browns out and resets. [INFER]

### 5.2 Decoupling / bulk capacitance

"Decoupling" capacitors sit next to a power pin and supply fast current spikes locally; "bulk" capacitance is a larger reservoir for longer bursts.

- Module-level reference circuit: **22 uF + 0.1 uF** on the 3V3 pin. [DS] figure 9-1 (WROOM; the MINI figure shows the same 22 uF + 0.1 uF)
- Design guidelines (chip-level, already handled inside the module, but useful context): at least 10 uF at the power entrance, an ESD protection diode at the power entrance, main power traces at least 25 mil wide. [DOC]
- [INFER] With a battery and a switching regulator upstream, plan footprint space for more bulk capacitance near the module than the 22 uF minimum and verify the rail on a scope during Wi-Fi TX, as was done for v1 WiFi bring-up.

### 5.3 Sleep currents: bare module

| Mode | What stays on | Typical current | Source |
|---|---|---|---|
| Light-sleep, peripheral clocks disabled | CPU and radio powered down, peripherals still powered, GPIOs high-Z | 180 uA | [DS] table 6-8 |
| Light-sleep, peripherals powered down | CPU, radio and peripherals powered down, GPIOs high-Z | 35 uA | [DS] (row grouping read from PDF text layout; confirm against the table) |
| Deep-sleep | RTC timer + LP memory only | **7 uA** | [DS] |
| Power off (EN low) | nothing | 1 uA | [DS] |

Jargon: **light sleep** pauses the CPU and keeps memory, wake is fast and the program continues; **deep sleep** powers down almost everything, and waking is effectively a reboot (only LP memory survives). ESP-IDF forces the SPI flash off in deep sleep; in light sleep the flash stays powered unless deep-power-down is enabled in config. [DOC]

Scale check [INFER]: 7 uA from a 2000 mAh cell is about 30 years on paper, so in deep sleep the module is irrelevant; the regulator's quiescent current, the battery protection/charger IC and LED-driver leakage will dominate. In light sleep with Wi-Fi association kept alive the average is in the mA range and depends on the access point's DTIM interval; no primary figure extracted for that.

### 5.4 Sleep currents: dev boards (why they mislead)

Dev boards add an always-on power LED, a 3.3 V LDO with its own quiescent current, sometimes a USB-UART bridge chip, a charger and a fuel gauge. Vendor-stated or vendor-measured deep-sleep figures for the **whole board**:

| Board | Deep sleep (whole board) | Light sleep | Source |
|---|---|---|---|
| Bare module (reference) | 7 uA | 180 uA | Espressif [DS] |
| Seeed XIAO ESP32C6 | 15 uA typ (at 3.8 V battery input) | 3.1 mA typ | [Seeed wiki](https://wiki.seeedstudio.com/xiao_esp32c6_getting_started/) |
| DFRobot Beetle ESP32-C6 | 14 uA (hw v1.0), 37 uA (hw v1.1), battery powered | - | [DFRobot wiki](https://wiki.dfrobot.com/SKU_DFR1117_Beetle_ESP32_C6) |
| DFRobot FireBeetle 2 ESP32-C6 | 16 uA (v1.0), 36 uA (v1.2), battery powered | - | [DFRobot wiki](https://wiki.dfrobot.com/SKU_DFR1075_FireBeetle_2_Board_ESP32_C6) |
| Adafruit Feather ESP32-C6 | marketing: "as low as 17uA"; measured in their guide: **72.15 uA** | 353 uA measured | [overview](https://learn.adafruit.com/adafruit-esp32-c6-feather/overview), [low-power page](https://learn.adafruit.com/adafruit-esp32-c6-feather/low-power-use) |
| SparkFun Thing Plus ESP32-C6 | not stated | - | [SparkFun docs](https://docs.sparkfun.com/SparkFun_Thing_Plus_ESP32_C6/hardware_overview/) |
| Espressif DevKitC-1 / DevKitM-1 | **not stated by Espressif** | - | user guides |

So the well-designed battery boards sit at roughly 2x to 10x the bare module. Note the two Adafruit numbers disagree with each other, and both DFRobot boards got worse in later hardware revisions; treat every vendor number as "measure it yourself".

For the Espressif DevKitC-1 there is no official whole-board figure. Its schematic (v1.4) shows an SGM2212-3.3 LDO, a CP2102N USB-UART bridge, a WS2812B and a power LED ([schematic PDF](https://dl.espressif.com/dl/schematics/esp32-c6-devkitc-1-schematics_v1.4.pdf)). A lit indicator LED alone is typically on the order of a milliamp, i.e. more than 100x the module's deep-sleep current. [INFER, UNVERIFIED: I did not compute the LED current from the schematic or look up the LDO's quiescent current.] The important feature is the **J5 jumper**: removing it and inserting an ammeter measures the module alone, excluding LED, LDO and bridge. [DOC] That gives numbers that transfer directly to the custom PCB.

---

## 6. Dev boards for breadboarding

| Board | Module / chip, flash | USB | Charger / gauge on board | LEDs | Sleep suitability | GPIO on headers | Approx. price (soft) |
|---|---|---|---|---|---|---|---|
| **Espressif ESP32-C6-DevKitC-1-N8** | ESP32-C6-WROOM-1, 8 MB | 2x USB-C: native USB-Serial-JTAG **and** CP2102N UART bridge | none | WS2812 on GPIO8, 3.3 V power LED | whole board poor; module measurable via J5 | all 23 (2x16 header) | ~USD 9 (Mouser/DigiKey snippets) |
| Espressif ESP32-C6-DevKitM-1-N4 | ESP32-C6-MINI-1, 4 MB | same two ports | none | WS2812 on GPIO8, power LED | same, J5 present | 22 (2x15 header) | not checked |
| Seeed XIAO ESP32C6 | bare C6 chip + Seeed's own RF, 4 MB | 1x USB-C, native | LiPo charger (chip/current not stated on wiki), battery pads on underside | user LED GPIO15, charge LED | good (15 uA) | 11 on castellated edge + more on underside pads | ~USD 5-7.5 |
| Adafruit Feather ESP32-C6 (#5933) | 4 MB module | 1x USB-C, native serial/JTAG | LiPo charger **and MAX17048 fuel gauge** (I2C 0x36) | NeoPixel on GPIO9, red LED GPIO15, CHG LED | fair (17-72 uA) | ~21, Feather layout | ~EUR 13 (Mouser IT snippet) |
| SparkFun Thing Plus ESP32-C6 | ESP32-C6-WROOM-1, 16 MB | 1x USB-C | MCP73831 charger (214 mA) **and MAX17048**, microSD | WS2812 on GPIO23, PWR + CHG LEDs (cuttable jumpers) | unknown | 21-23 (docs inconsistent) | not checked |
| DFRobot Beetle ESP32-C6 | C6FH4 chip, 4 MB | 1x USB-C, native CDC | TP4057 charger, up to 0.5 A | LED GPIO15 | good (14-37 uA) | 13 | not checked |
| DFRobot FireBeetle 2 ESP32-C6 | C6FH4 chip, 4 MB | 1x USB-C, native CDC | CN3165 solar/LiPo charger 0.5 A, battery sense on GPIO0 | LED GPIO15 | good (16-36 uA) | 19 | not checked |

Sources: [DevKitC-1 user guide](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c6/esp32-c6-devkitc-1/user_guide.html), [DevKitM-1 user guide](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c6/esp32-c6-devkitm-1/user_guide.html), [Seeed wiki](https://wiki.seeedstudio.com/xiao_esp32c6_getting_started/), [Adafruit pinouts](https://learn.adafruit.com/adafruit-esp32-c6-feather/pinouts), [SparkFun hardware overview](https://docs.sparkfun.com/SparkFun_Thing_Plus_ESP32_C6/hardware_overview/), DFRobot wikis linked above.

Per-board notes:

- **DevKitC-1**: uses the exact module recommended for the PCB, so the pin set, strapping behaviour and RF performance match the final design. Two USB ports let you compare the native USB path (what the custom PCB will use) against a classic UART bridge. Can be powered from USB, the 5V pin, or the 3V3 pin (mutually exclusive) [DOC], so an external battery + regulator prototype can feed the 3V3 pin directly, exactly as the final board will. No charger on board, so nothing interferes with your own charger experiments. Caveats: GPIO8 (a strapping pin) drives the on-board WS2812; GPIO12/13 are wired to the native USB port. Breadboard fit: Espressif says it can be mounted on a breadboard [DOC]; the exact row spacing is in a dimensions PDF I did not read, and boards of this style are often wide enough to leave only one free breadboard column per side. [UNVERIFIED]
- **DevKitM-1**: same idea around the MINI-1. Only buy it if the MINI-1 becomes the target.
- **XIAO ESP32C6**: not an Espressif module, so RF and pinout do not transfer to the final design. It has an on-board RF switch between ceramic antenna and u.FL that consumes GPIO3 (switch enable, drive low) and GPIO14 (antenna select). [DOC] Battery voltage is not measured on board; Seeed suggests an external divider into A0. [DOC] Good as a "how low can a C6 board go" reference and for throwaway experiments.
- **Feather / Thing Plus / FireBeetle / Beetle**: all include a LiPo charger, and two include a fuel gauge. Convenient for a finished gadget, but for this project they hide exactly the circuits v2 is meant to teach and design (charging, power path, gauge), and their charger sits between your bench supply and the module. The Adafruit board shares GPIO9 between the boot button and the NeoPixel, and gates NeoPixel + I2C power with GPIO20. [DOC]

### 6.1 Availability to Buenos Aires

[UNVERIFIED throughout; I could not confirm shipping or import terms from a primary source.]

- Espressif DevKitC-1-N8 is stocked by Mouser and DigiKey (search snippets showed ~USD 9, one DigiKey snapshot showed a 12-week lead time). Both distributors ship internationally in general; shipping cost to Argentina and current courier import rules need checking by the owner.
- XIAO ESP32C6 appeared at Mouser at ~USD 7.5 with stock in a snippet. Seeed also sells directly.
- AliExpress carries DevKitC-1 clones and XIAO boards; listings named "ESP32-C6-DevKitC-1" are frequently third-party copies whose LDO/LED choices differ from Espressif's schematic, so sleep-current measurements on them may not match. Espressif also has an official AliExpress store. [UNVERIFIED]
- Local resellers (MercadoLibre etc.) were not researched.

---

## 7. Minimal "module on a custom PCB" support circuit

This is everything that replaces v1's RP2350 + W25Q128 flash + crystal + Murata radio + antenna matching. Based on the peripheral schematic in the WROOM datasheet (figure 9-1) and the design guidelines.

```
            3V3 rail (3.0-3.6 V, >= 0.5 A)
               |
     +---------+---------+-----------+-----------+
     |         |         |           |           |
   22 uF     0.1 uF     R 10k       R 10k       R 10k (optional but advised)
     |         |         |           |           |
    GND       GND        +-- EN      +-- GPIO8   +-- GPIO9 ---- BOOT button --- GND
                         |
                       C 1 uF        (RESET button from EN to GND, optional)
                         |
                        GND

   USB-C D-  ---[ R, 22-33 ohm ]--- GPIO12
   USB-C D+  ---[ R, 22-33 ohm ]--- GPIO13
   USB-C CC1, CC2 --- 5.1k each to GND   (standard USB-C device requirement, not ESP-specific)
   USB-C VBUS --- charger / power path (separate v2 topic)

   GPIO16 (TX), GPIO17 (RX), GND --- 3-pin debug header (recommended fallback)
```

Piece by piece:

1. **Power**: 3.3 V on the `3V3` pin with 22 uF + 0.1 uF close to the pin. [DS] Add an ESD diode at the power entrance. [DOC]
2. **EN (enable / reset)**: high = run, low = off; must never float. [DS] Espressif recommends an RC delay, usually **R = 10 k to 3V3, C = 1 uF to GND**, so EN rises after the rail is stable (the rail must be stable for at least 50 us before EN goes high; EN must be held low at least 50 us to reset). [DS] If the supply rises slowly or is switched on/off often, the guidelines say an RC may not be enough and suggest a supply supervisor IC with a threshold around 3.0 V. [DOC] That caveat is relevant for a battery product with a power switch and a sagging cell. A reset button from EN to ground is optional.
3. **GPIO9 = BOOT**: pull-up (internal weak one exists; external recommended) plus a button to ground. Holding it low during reset enters download mode. No big capacitor on this pin. [DOC]
4. **GPIO8**: 10 k pull-up, because download mode requires GPIO8 = 1 and it floats by default. [DS figure 9-1 + boot table]
5. **USB**: GPIO12 = D-, GPIO13 = D+ straight to a USB-C receptacle, with series resistor footprints (start with 22 or 33 ohm per the guidelines; the module datasheet shows them as "TBD") and optional small capacitors to ground. Route as a 90 ohm differential pair. [DOC] This single connection gives flashing, serial console and JTAG debugging with **no USB-UART bridge chip**. In normal use the tools reset the chip into download mode over USB by themselves; the BOOT button is the manual fallback (for example if firmware has reconfigured GPIO12/13 or is crash-looping). [INFER from DOC]
6. **UART0 header** (GPIO16/17): not required, but a cheap recovery/debug path. Guidelines suggest a 499 ohm series resistor on U0TXD. [DOC]
7. **Not needed**: crystal (inside module), flash (inside module), RF matching and antenna (inside module), 32.768 kHz crystal (optional, shown as not populated in the reference schematic; if unused, GPIO0/1 are normal GPIOs). [DS]
8. **Layout**: antenna overhanging or at the board edge with the keep-out respected (section 3.1); ground pour under the rest of the module; EPAD soldering optional. [DS + DOC]

Compared with v1, the failure classes that caused the 2025 WiFi saga (gSPI pin mapping, clock pin differences, firmware blob loading) do not exist here: the radio is inside the SoC.

---

## 8. Recommendation

**Module for the final PCB: `ESP32-C6-WROOM-1-N8`.**

- Hand-solderable 1.27 mm edge pads with an optional ground pad; the MINI-1 is denser.
- 23 GPIOs with all eight LP pins and all seven ADC pins brought out; comfortable margin over v1's ~13 signals.
- Widest certification coverage of the four (FCC, IC, CE, SRRC, KCC, TELEC, ANATEL).
- In JLCPCB's assembly library (C5366877, Extended).
- 8 MB leaves room for OTA updates.
- The 18 x 25.5 mm footprint is not a problem in a lamp base. If it becomes one, the MINI-1 is the fallback at the cost of GPIO10/11 and easier soldering.
- Use `ESP32-C6-WROOM-1U-N8` instead if the enclosure is metal. The footprint differs in length (19.2 vs 25.5 mm) but uses the same 28-pad pattern pitch; check the land pattern before assuming a dual footprint. [UNVERIFIED that the pad positions are identical]

**Dev boards: two `ESP32-C6-DevKitC-1-N8`**, optionally one **Seeed XIAO ESP32C6**.

- DevKitC-1 = the target module on headers: what works on the breadboard transfers pin-for-pin.
- No charger or gauge on board, so battery/charger/regulator prototypes are entirely your own circuit, fed into the 3V3 pin like the final design.
- J5 gives honest module-only current measurements for the battery-life budget.
- Two boards because one will eventually be miswired, and a second lets one stay in a known-good state.
- The XIAO is a cheap extra for seeing a low whole-board sleep current and for quick side experiments; do not design around its pinout.
- Avoid the Feather / Thing Plus / FireBeetle for this project's power prototyping: their on-board chargers and gauges overlap with what v2 needs to design.

---

## 9. Open questions for the owner

1. **Enclosure material and antenna position**: is the lamp base metal, plastic or wood, and can the module's antenna end sit at a PCB edge at least 15 mm from the housing? This decides WROOM-1 vs WROOM-1U.
2. **Regulator topology** (separate research ticket suggested): single Li-ion cell (3.0-4.2 V) to a 3.0-3.6 V rail with 382 mA peaks. LDO (wastes the bottom of the battery), buck (same dropout problem), or buck-boost? What quiescent current is acceptable given the module itself sleeps at 7 uA?
3. **Sleep strategy**: must the lamp stay reachable over Wi-Fi while "off" (light sleep with Wi-Fi connected, mA-level average), or is waking by button/encoder enough (deep sleep, uA-level)? This changes battery life by orders of magnitude and decides which inputs need GPIO0-7.
4. **Thread/Zigbee/Matter**: is the 802.15.4 radio a reason for choosing the C6, or is Wi-Fi + BLE enough? (Does not change the module choice, but affects firmware stack choice.)
5. **Firmware stack**: v1 is Rust + embassy on RP2350. For the C6 the options are ESP-IDF (C) or Rust via `esp-hal`. Not researched here; support for Wi-Fi + light sleep in the Rust stack should be checked before committing.
6. **Flash size**: is 8 MB wanted for OTA, or is 4 MB acceptable to widen sourcing?
7. **Supply supervisor**: given a power switch and a battery that sags, should EN be driven by a voltage supervisor instead of a plain RC (Espressif's own caveat)?
8. **Purchase channel**: Mouser/DigiKey (genuine Espressif boards, shipping cost and import handling to verify) vs AliExpress (cheap, clone risk)?
9. **USB-C role**: will the same USB-C port both charge the battery and provide data to GPIO12/13? If so the charger's input and the USB data lines share one connector, which affects ESD protection and power-path design.

---

## 10. What I could not verify

- Dev-board prices, stock and lead times: taken from search-result snippets on 2026-11-09, mixed currencies and regions. Treat as rough.
- Shipping and import conditions to Argentina: not confirmed from any primary source.
- JLCPCB live stock/price for C5366877, and assembly status of the WROOM-1U (C18212191) and MINI-1 (C5736265) parts.
- Whole-board sleep current of the Espressif DevKitC-1/DevKitM-1 (no vendor figure; LED and LDO quiescent currents not computed).
- DevKitC-1 physical width / breadboard row spacing (dimension PDF not read).
- MINI-1 pad geometry and practical hand-solderability.
- FCC/IC ID numbers and the list of antennas approved for the -1U variants (inside certificate PDFs, not opened).
- Exact keep-out dimensions (given as figures in the datasheet/guidelines; not extractable as text).
- Whether WROOM-1 and WROOM-1U land patterns are drop-in interchangeable.
- That no further C6 module variants exist beyond WROOM-1/1U and MINI-1/1U.
- Which mode label the 35 uA row of table 6-8 belongs to (I read it as a second light-sleep row from the PDF text layout); re-read the table before using it in a power budget.
- SparkFun Thing Plus and DFRobot whole details beyond their hardware overview / wiki pages; Adafruit charger IC and charge current.

## 11. Sources

All accessed 2026-11-09.

Espressif (primary):

- [ESP32-C6-WROOM-1 & WROOM-1U Datasheet v1.4, 2025-12-10](https://documentation.espressif.com/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf)
- [ESP32-C6-MINI-1 & MINI-1U Datasheet v1.5, 2026-06-16](https://documentation.espressif.com/esp32-c6-mini-1_mini-1u_datasheet_en.pdf)
- [ESP Hardware Design Guidelines, ESP32-C6, Schematic Checklist ("latest")](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c6/schematic-checklist.html)
- [ESP Hardware Design Guidelines, ESP32-C6, PCB Layout Design ("latest")](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c6/pcb-layout-design.html)
- [ESP-IDF Programming Guide (stable, v6.1), ESP32-C6 GPIO & RTC GPIO](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-reference/peripherals/gpio.html)
- [ESP-IDF Programming Guide (stable), ESP32-C6 Sleep Modes](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-reference/system/sleep_modes.html)
- [ESP32-C6-DevKitC-1 v1.2 user guide](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c6/esp32-c6-devkitc-1/user_guide.html)
- [ESP32-C6-DevKitC-1 schematic v1.4 (PDF)](https://dl.espressif.com/dl/schematics/esp32-c6-devkitc-1-schematics_v1.4.pdf)
- [ESP32-C6-DevKitM-1 user guide](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c6/esp32-c6-devkitm-1/user_guide.html)
- [Espressif certificates](https://www.espressif.com/en/support/documents/certificates)
- [ESP32-C6 product page](https://www.espressif.com/en/products/socs/esp32-c6)

Dev board vendors (primary for their own boards):

- [Seeed Studio XIAO ESP32C6 getting started](https://wiki.seeedstudio.com/xiao_esp32c6_getting_started/)
- [Adafruit ESP32-C6 Feather: overview](https://learn.adafruit.com/adafruit-esp32-c6-feather/overview), [pinouts](https://learn.adafruit.com/adafruit-esp32-c6-feather/pinouts), [low power use](https://learn.adafruit.com/adafruit-esp32-c6-feather/low-power-use)
- [SparkFun Thing Plus ESP32-C6 hardware overview](https://docs.sparkfun.com/SparkFun_Thing_Plus_ESP32_C6/hardware_overview/)
- [DFRobot Beetle ESP32-C6 (DFR1117) wiki](https://wiki.dfrobot.com/SKU_DFR1117_Beetle_ESP32_C6)
- [DFRobot FireBeetle 2 ESP32-C6 (DFR1075) wiki](https://wiki.dfrobot.com/SKU_DFR1075_FireBeetle_2_Board_ESP32_C6)

Sourcing (soft data):

- [JLCPCB part page, ESP32-C6-WROOM-1-N8, C5366877](https://jlcpcb.com/partdetail/6203223-ESP32_C6_WROOM_1N8/C5366877)
- [LCSC, ESP32-C6-WROOM-1-N8](https://www.lcsc.com/product-detail/C5366877.html), [LCSC, ESP32-C6-MINI-1-N4](https://lcsc.com/product-detail/C5736265.html)
- [DigiKey, ESP32-C6-DEVKITC-1-N8](https://www.digikey.de/en/products/detail/espressif-systems/ESP32-C6-DEVKITC-1-N8/17728861), [DigiKey, Adafruit 5933](https://www.digikey.co.uk/en/products/detail/adafruit-industries-llc/5933/24892281), [Mouser ESP32-C6 dev tools listing](https://www.mouser.it/en/c/embedded-solutions/engineering-tools/rf-wireless-development-tools/?q=esp32-c6)
