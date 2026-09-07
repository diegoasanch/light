import { netKind } from "./net-colors";
import type { BoardData } from "./pcb-types";
export type Selection =
  | { kind: "component"; id: string }
  | { kind: "area"; id: string }
  | { kind: "net"; id: number }
  | null;
export function resolveSelection(data: BoardData, selection: Selection) {
  const parts = data.connectivity.components;
  const seeds = parts.filter((p) =>
    selection?.kind === "component"
      ? p.ref === selection.id
      : selection?.kind === "area"
        ? p.area === selection.id
        : false,
  );
  const nets = new Set<number>(
    selection?.kind === "net"
      ? [selection.id]
      : seeds.flatMap((p) => p.pads.map((p) => p.net).filter((n) => n > 0)),
  );
  // Ground stitching spans the board; only include it when explicitly selected.
  if (selection?.kind !== "net") {
    for (const net of data.connectivity.nets) {
      if (net.name === "GND") nets.delete(net.id);
    }
  }
  // Supply copper remains active, but sharing a supply alone does not make
  // a component part of the highlighted neighborhood. Explicit net inspection
  // still shows every component on that net.
  const neighborNets = new Set(
    data.connectivity.nets
      .filter((net) => nets.has(net.id) &&
        (selection?.kind === "net" || netKind(net.name) === "signal"))
      .map((net) => net.id),
  );
  const connected = parts.filter(
    (p) => seeds.includes(p) || (selection?.kind !== "area" &&
      p.pads.some((pad) => neighborNets.has(pad.net))),
  );
  return {
    nets,
    seeds: new Set(seeds.map((p) => p.ref)),
    connected: new Set(connected.map((p) => p.ref)),
  };
}
