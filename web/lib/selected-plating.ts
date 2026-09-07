import type { BoardData } from "./pcb-types";

/** Plating belongs to individual nets, not to the connected component body. */
export function selectedPlating(data: BoardData, nets: Set<number>) {
  const round = data.connectivity.nets
    .filter((n) => nets.has(n.id))
    .flatMap((n) =>
      n.vias.map((i) => ({
        net: n.id,
        x: data.vias[i][0],
        y: data.vias[i][1],
        diameter: data.vias[i][3],
      })),
    );
  for (const [x, y, diameter, plated, net] of data.holes.round) {
    if (plated && net > 0 && nets.has(net)) round.push({ net, x, y, diameter });
  }
  const slots = data.holes.slots.filter(
    (s) => s.plated && s.net > 0 && nets.has(s.net),
  );
  return { round, slots };
}
