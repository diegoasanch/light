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
  const directNets = new Set(nets);
  const viaResistor = new Map<number, string>();
  const kinds = new Map(data.connectivity.nets.map(n => [n.id, netKind(n.name)]));
  // Only two-terminal resistor footprints bridge sections. Never traverse a
  // supply/ground branch, encoder, IC, or transistor as if it were a wire.
  if (selection?.kind === "component" || selection?.kind === "net") {
    let changed = true;
    while (changed) {
      changed = false;
      for (const part of parts) {
        if (!/^R_/.test(part.footprint)) continue;
        const terminals = [...new Set(part.pads.map(p => p.net).filter(n => n > 0))];
        if (terminals.length !== 2 || terminals.some(n => kinds.get(n) !== "signal")) continue;
        const [a, b] = terminals;
        if (nets.has(a) === nets.has(b)) continue;
        const next = nets.has(a) ? b : a;
        nets.add(next);
        viaResistor.set(next, part.ref);
        changed = true;
      }
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
    directNets,
    viaResistor,
    seeds: new Set(seeds.map((p) => p.ref)),
    connected: new Set(connected.map((p) => p.ref)),
  };
}
