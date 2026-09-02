/** Shape of public/pcb/board.json, produced by scripts/extract_board.py. */

/** [x, y] in mm, KiCad board coordinates (+x right, +y down). */
export type Pair = [number, number];
/** Ring 0 is the outer boundary, following rings are holes. */
export type Polygon = Pair[][];
export type MultiPolygon = Polygon[];

export type CopperLayerName = "F.Cu" | "In1.Cu" | "In2.Cu" | "B.Cu";
export type Side = "F" | "B";

export interface StackupLayer {
  name: string;
  type: string; // "Top Solder Mask" | "copper" | "prepreg" | "core" | ...
  thickness: number; // mm
}

export interface BoardData {
  meta: {
    source: string;
    generated: string;
    kicad: string;
    boardThickness: number;
  };
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  stackup: StackupLayer[] | null;
  outline: MultiPolygon;
  copper: Record<CopperLayerName, { covered: MultiPolygon; exposed: MultiPolygon }>;
  mask: Record<Side, MultiPolygon>;
  silk: Record<Side, MultiPolygon>;
  /** [x, y, size, drill] mm */
  vias: [number, number, number, number][];
  holes: {
    /** [x, y, diameter, plated] */
    round: [number, number, number, 0 | 1][];
    slots: { a: Pair; b: Pair; width: number; plated: 0 | 1 }[];
  };
  counts: { tracks: number; vias: number; footprints: number; zones: number };
}

/** One physical slab of the board in the viewer's vertical stack. */
export interface StackSlot {
  /** y of the slab bottom in mm, 0 = bottom face of the bottom solder mask. */
  y0: number;
  y1: number;
}

export interface BoardStack {
  copper: Record<CopperLayerName, StackSlot>;
  dielectric: { name: string; type: string; slot: StackSlot }[];
  mask: Record<Side, StackSlot>;
  silk: Record<Side, StackSlot>;
  /** Total physical board thickness (mask outer face to mask outer face). */
  total: number;
}

const FALLBACK_STACKUP: StackupLayer[] = [
  { name: "F.Mask", type: "Top Solder Mask", thickness: 0.01 },
  { name: "F.Cu", type: "copper", thickness: 0.035 },
  { name: "dielectric 1", type: "prepreg", thickness: 0.1 },
  { name: "In1.Cu", type: "copper", thickness: 0.035 },
  { name: "dielectric 2", type: "core", thickness: 1.240198 },
  { name: "In2.Cu", type: "copper", thickness: 0.035 },
  { name: "dielectric 3", type: "prepreg", thickness: 0.1 },
  { name: "B.Cu", type: "copper", thickness: 0.035 },
  { name: "B.Mask", type: "Bottom Solder Mask", thickness: 0.01 },
];

const SILK_THICKNESS = 0.012;

/**
 * Compute each element's vertical extent from the stackup, bottom-up.
 * y = 0 is the outer face of the bottom solder mask; the top mask's outer
 * face lands at the physical board thickness.
 *
 * Mask slabs envelope their copper layer (mask thickness + copper thickness)
 * so pads sit recessed inside real mask openings, like on the fab.
 */
export function computeStack(data: BoardData): BoardStack {
  const src = (data.stackup ?? FALLBACK_STACKUP).filter(
    (l) =>
      l.type === "copper" ||
      l.type === "prepreg" ||
      l.type === "core" ||
      l.type.includes("Solder Mask"),
  );
  // Order top→bottom in the file; walk bottom→top.
  const layers = [...src].reverse();
  const copper = {} as BoardStack["copper"];
  const dielectric: BoardStack["dielectric"] = [];
  const mask = {} as BoardStack["mask"];
  let y = 0;
  for (const l of layers) {
    const slot: StackSlot = { y0: y, y1: y + l.thickness };
    if (l.type === "copper") {
      copper[l.name as CopperLayerName] = slot;
    } else if (l.type === "prepreg" || l.type === "core") {
      dielectric.push({ name: l.name, type: l.type, slot });
    } else if (l.name.startsWith("B.")) {
      mask.B = slot; // grows upward to envelope B.Cu, adjusted below
    } else {
      mask.F = slot;
    }
    y = slot.y1;
  }
  const total = y;
  // Envelope the copper: B mask spans [0, top of B.Cu], F mask spans
  // [bottom of F.Cu, total].
  mask.B = { y0: 0, y1: copper["B.Cu"].y1 };
  mask.F = { y0: copper["F.Cu"].y0, y1: total };
  const silk: BoardStack["silk"] = {
    B: { y0: -SILK_THICKNESS, y1: 0 },
    F: { y0: total, y1: total + SILK_THICKNESS },
  };
  return { copper, dielectric, mask, silk, total };
}
