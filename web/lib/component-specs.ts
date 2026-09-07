/** Manufacturer references supplement empty schematic fields; ratings are chip specs. */
export const COMPONENT_SPECS: Record<
  string,
  { datasheet: string; specs: string }
> = {
  "RP2350A-QFN60": {
    datasheet: "https://datasheets.raspberrypi.com/rp2350/rp2350-datasheet.pdf",
    specs:
      "Dual-core Arm Cortex-M33 / Hazard3 RISC-V · up to 150 MHz · 520 KB SRAM · 30 GPIO",
  },
  "LBEE5KL1YN-814": {
    datasheet:
      "https://www.murata.com/products/productdata/8815814344734/type1yn.pdf",
    specs: "Murata Type 1YN · CYW43439 · 2.4 GHz 802.11 b/g/n · Bluetooth 5.1",
  },
  TPS5405DR: {
    datasheet: "https://www.ti.com/lit/ds/symlink/tps5405.pdf",
    specs: "Buck regulator · 6.5–28 V input · fixed 5 V output · up to 2 A",
  },
  TPS2115ADRBR: {
    datasheet: "https://www.ti.com/lit/ds/symlink/tps2115a.pdf",
    specs: "Automatic dual-input power multiplexer",
  },
  TPS2121RUXR: {
    datasheet: "https://www.ti.com/lit/ds/symlink/tps2121.pdf",
    specs: "Priority power multiplexer · 2.8–22 V input",
  },
};
