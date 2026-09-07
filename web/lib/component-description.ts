import type { BoardComponent, BoardData } from "./pcb-types";

const descriptions: Record<string, string> = {
  "RP2350A-QFN60": "Microcontroller that runs the board’s firmware.",
  "LBEE5KL1YN-814": "Radio module for wireless connectivity.",
  TPS5405DR: "Voltage regulator that steps down the input supply.",
  RT6154AGQW: "Voltage regulator for the board’s logic supply.",
  TPS2115ADRBR: "Power multiplexer that selects between supply inputs.",
  TPS2121RUXR: "Power multiplexer that selects between supply inputs.",
  W25Q128JVS: "Flash memory that stores the firmware and persistent data.",
  HDC1080: "Digital sensor that measures temperature and humidity.",
  MAX6816: "Switch debouncer that cleans up button signals.",
  "GT-EVA01AA-L1": "Rotary encoder that detects turns and presses.",
  "WS2812B-2020": "Addressable RGB LED with an integrated controller.",
  PMEG60T30ELRX: "Schottky diode that conducts current in one direction.",
  SS34: "Schottky diode that conducts current in one direction.",
  PRTR5V0U2X: "Protection diode that suppresses electrostatic discharges.",
  IRLML6344: "MOSFET that electronically switches current.",
};

/** Short component identities, separate from detailed schematic specifications. */
function genericDescription(part: BoardComponent): string {
  if (descriptions[part.value]) return descriptions[part.value];
  if (part.ref === "J2") return "USB-C connector for power and data.";
  if (part.ref === "J3") return "Barrel jack for the external power supply.";
  const kind = part.ref.match(/^[A-Z]+/)?.[0];
  const types: Record<string, string> = {
    C: "Capacitor that stores charge and filters voltage changes.",
    R: "Resistor that limits current or sets signal levels.",
    L: "Inductor that stores energy in a magnetic field.",
    J: "Connector for attaching external wiring or peripherals.",
    JP: "Solder jumper for configuring a circuit connection.",
    SW: "Push button that provides a momentary input.",
    H: "Mounting hole for securing the board.",
    TP: "Test point for probing an electrical signal.",
    AE: "Antenna for transmitting and receiving radio signals.",
    Y: "Crystal that provides a timing reference.",
    D: /LED/i.test(part.value) ? "LED that provides a visual indicator." : "Diode that controls current flow.",
  };
  return types[kind ?? ""] || part.properties.Description || "Electronic circuit component.";
}


// Board-specific roles checked against the exported pad nets. L2's topology
// matches Richtek's RT6154A application circuit (inductor between LX1 and LX2).
const circuitRoles: Record<string, string> = {
  L2: "Inductor used by VR1 to transfer energy between its switching nodes and regulate the board’s 3.3 V supply.",
  L1: "Inductor used by U1’s internal regulator to generate the RP2350’s 1.1 V core supply.",
  L3: "Output inductor that works with U2 to convert the 12 V input into the 5 V supply.",
  L4: "Inductor in U4’s switching supply, feeding the WiFi module’s VIN_LDO rail.",
  R14: "Feedback resistor that works with R15 to set VR1’s 3.3 V output.",
  R15: "Feedback resistor that works with R14 to set VR1’s 3.3 V output.",
  C5: "Input capacitor that buffers VR1’s VSYS supply during switching.",
  C21: "Output capacitor that smooths VR1’s 3.3 V supply.",
  C4: "Bypass capacitor that filters VR1’s analog supply input.",
  R12: "Pull-up resistor on VR1’s enable input, tied to VSYS.",
  R40: "Pull-up resistor that holds rotary encoder R6’s B signal high when its contact is open.",
  R41: "Pull-up resistor that holds rotary encoder R6’s A signal high when its contact is open.",
  R36: "Pull-up resistor for the SDA data line between sensor U7 and the RP2350.",
  R37: "Pull-up resistor for the SCL clock line between sensor U7 and the RP2350.",
  R9: "Series resistor between U1 and the USB D+ line.",
  R10: "Series resistor between U1 and the USB D− line.",
  R16: "Series resistor on the WiFi clock between U1 and radio module U4.",
  R4: "Series resistor between U1 and the external addressable RGB data output.",
  R44: "Series resistor feeding the first onboard RGB LED, D1, from U1.",
  R5: "Resistor that limits current through the red 12 V indicator LED, D68.",
  R43: "Resistor that limits current through the blue USB power indicator LED, D67.",
  U8: "Debouncer that cleans up rotary encoder R6’s push-button signal for U1.",
  U9: "Debouncer that cleans up the On/Off button SW3’s signal for U1.",
  U10: "Debouncer that cleans up the Mode button SW4’s signal for U1.",
};

export function componentDescription(part: BoardComponent, data?: BoardData): string {
  if (circuitRoles[part.ref]) return circuitRoles[part.ref];
  const description = genericDescription(part);
  if (!data) return description;
  const area = data.connectivity.areas.find((a) => a.id === part.area)?.name;
  const rails = [...new Set(part.pads.map((p) => p.name))];
  if (/^C\d/.test(part.ref) && rails.includes("GND")) {
    const rail = rails.find((name) => /^(\+|\/V)/.test(name));
    if (rail) return `Capacitor that filters the ${rail.replace(/^\//, "")} supply in the ${area ?? "board"} circuit.`;
  }
  if (area && !area.startsWith("Other"))
    return `${description} Used in the ${area} circuit.`;
  return description;
}
