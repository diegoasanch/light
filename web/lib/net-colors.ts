import type { Connectivity } from "./pcb-types";

/** Stable net identity colors, independent of selection order. */
export function netKind(name: string): "ground" | "power" | "signal" {
  const label = name.replace(/^\//, "").toUpperCase();
  if (/^(?:GND|AGND|DGND|PGND|GNDA)$/.test(label)) return "ground";
  if (
    /^(?:\+\d+(?:V\d*)?|V(?:BUS|SYS|IN|BAT|CC|DD|REG5|REG_AVDD|IN_LDO|_RGB)|VRGB_OUT)$/.test(
      label,
    ) ||
    /\-(?:VIN[AB]?|VBAT|VDD[A-Z]*|VCC)\)$/.test(label)
  )
    return "power";
  return "signal";
}
export function netColor(name: string): string {
  const kind = netKind(name);
  if (kind === "ground") return "#000000";
  if (kind === "power") return "#ef4444";
  let hash = 2166136261;
  for (const c of name) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  // Keep automatic signals outside the red sector reserved for power.
  return `hsl(${35 + ((((hash >>> 0) % 290) * 137.508) % 290)}, 78%, 62%)`;
}

/** All selected nets include pours; selection controls shared-ground exclusion. */
export function highlightedCopper(net: Connectivity["nets"][number]) {
  return net.copper;
}
