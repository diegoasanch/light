import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { computeStack, type BoardData } from "./pcb-types";
import { highlightedCopper, netKind } from "./net-colors";
import { resolveSelection } from "./selection";
const board = JSON.parse(
  readFileSync(new URL("../public/pcb/board.json", import.meta.url), "utf8"),
) as BoardData;
test("all footprint pins resolve to exported nets and schematic areas", () => {
  assert.equal(board.connectivity.components.length, board.counts.footprints);
  const nets = new Set(board.connectivity.nets.map((n) => n.id));
  const areas = new Set(board.connectivity.areas.map((a) => a.id));
  for (const p of board.connectivity.components) {
    assert.ok(areas.has(p.area));
    for (const pad of p.pads) assert.ok(pad.net === 0 || nets.has(pad.net));
  }
  const viaIndices = board.connectivity.nets.flatMap((n) => n.vias);
  assert.equal(new Set(viaIndices).size, board.counts.vias);
});
test("CPU isolation excludes shared ground and retains other direct nets", () => {
  const cpu = board.connectivity.components.find((p) => p.ref === "U1")!;
  const graph = resolveSelection(board, { kind: "component", id: "U1" });
  assert.ok(
    !graph.nets.has(board.connectivity.nets.find((n) => n.name === "GND")!.id),
  );
  assert.deepEqual(
    [...graph.directNets].sort(),
    [
      ...new Set(
        cpu.pads
          .map((p) => p.net)
          .filter(
            (n) =>
              n > 0 &&
              n !==
                board.connectivity.nets.find((net) => net.name === "GND")!.id,
          ),
      ),
    ].sort(),
  );
  for (const p of board.connectivity.components)
    assert.equal(
      graph.connected.has(p.ref),
      p.ref === "U1" || p.pads.some((pad) => graph.nets.has(pad.net) &&
        netKind(board.connectivity.nets.find((n) => n.id === pad.net)!.name) === "signal"),
    );
  assert.ok(!graph.nets.has(0));
});
test("solder mask lies outside copper with no volume overlap on either face", () => {
  const s = computeStack(board);
  assert.ok(s.mask.F.y0 >= s.copper["F.Cu"].y1);
  assert.ok(s.mask.B.y1 <= s.copper["B.Cu"].y0);
  assert.ok(s.mask.F.y1 > s.mask.F.y0);
  assert.ok(s.mask.B.y1 > s.mask.B.y0);
  assert.equal(s.silk.F.y0, s.mask.F.y1);
  assert.equal(s.silk.B.y1, s.mask.B.y0);
});
test("every exported component reference maps uniquely to a footprint", async () => {
  const doc = await new NodeIO().read(
    new URL("../public/pcb/components.glb", import.meta.url).pathname,
  );
  let level = doc.getRoot().listScenes()[0].listChildren();
  while (
    level.length === 1 &&
    level[0].listChildren().length &&
    !level[0].getMesh()
  )
    level = level[0].listChildren();
  const refs = new Set(board.connectivity.components.map((p) => p.ref));
  assert.equal(new Set(level.map((n) => n.getName())).size, level.length);
  for (const node of level) assert.ok(refs.has(node.getName()), node.getName());
  assert.equal(
    board.connectivity.components.filter((p) => p.modelPresent).length,
    level.length,
  );
  assert.ok(level.some((n) => n.getName() === "U1"));
});

test("isolation routing excludes the ground plane fill while retaining ground pads and tracks", () => {
  const ground = board.connectivity.nets.find((n) => n.name === "GND")!;
  const area = (polygons: number[][][][]) =>
    polygons.reduce(
      (sum, p) =>
        sum +
        p.reduce(
          (sum, r, i) =>
            sum +
            (i ? -1 : 1) *
              Math.abs(
                r.reduce((a, v, j) => {
                  const next = r[(j + 1) % r.length];
                  return a + v[0] * next[1] - next[0] * v[1];
                }, 0) / 2,
              ),
          0,
        ),
      0,
    );
  for (const layer of ["F.Cu", "B.Cu"] as const) {
    assert.ok(ground.routed[layer].length > 0);
    assert.ok(area(ground.routed[layer]) < area(ground.copper[layer]) * 0.5);
  }
});

test("J6 focus retains its eight signal vias, while direct GND selection is available", () => {
  const graph = resolveSelection(board, { kind: "component", id: "J6" });
  assert.deepEqual(
    board.connectivity.nets
      .filter((n) => graph.nets.has(n.id))
      .map((n) => n.name)
      .sort(),
    ["/GPIO0", "/GPIO1"],
  );
  assert.equal(
    board.connectivity.nets
      .filter((n) => graph.nets.has(n.id))
      .reduce((sum, n) => sum + n.vias.length, 0),
    8,
  );
  const ground = board.connectivity.nets.find((n) => n.name === "GND")!;
  assert.ok(
    resolveSelection(board, { kind: "net", id: ground.id }).nets.has(ground.id),
  );
  const area = board.connectivity.components.find((p) => p.ref === "J6")!.area;
  assert.ok(
    !resolveSelection(board, { kind: "area", id: area }).nets.has(ground.id),
  );
});


test("J3 and D69 selection includes their pour-only connection on the unnamed net", () => {
  const net = board.connectivity.nets.find((n) => n.name === "Net-(D69-A)")!;
  for (const ref of ["J3", "D69"]) {
    const graph = resolveSelection(board, { kind: "component", id: ref });
    assert.ok(graph.nets.has(net.id));
    assert.ok(graph.connected.has("J3") && graph.connected.has("D69"));
    assert.ok(!graph.nets.has(board.connectivity.nets.find((n) => n.name === "GND")!.id));
  }
  const copper = highlightedCopper(net);
  assert.deepEqual(copper, net.copper);
  // The export has a filled copper graphic beyond the pads/tracks. It must survive
  // highlighting even though this auto-generated net name is not a power label.
  assert.notDeepEqual(copper["F.Cu"], net.routed["F.Cu"]);
  assert.equal(net.routed["F.Cu"].length, 2);
  assert.equal(copper["F.Cu"].length, 1, "the pour joins both pads into one copper region");
});


test("power-only neighbors stay glass while power copper and direct net inspection remain active", () => {
  const graph = resolveSelection(board, { kind: "component", id: "U1" });
  const power = board.connectivity.nets.find((n) => n.name === "+3V3")!;
  assert.ok(graph.nets.has(power.id));
  const powerOnly = board.connectivity.components.filter((p) =>
    p.ref !== "U1" && p.pads.some((pad) => pad.net === power.id) &&
    !p.pads.some((pad) => graph.nets.has(pad.net) &&
      netKind(board.connectivity.nets.find((n) => n.id === pad.net)!.name) === "signal"));
  assert.ok(powerOnly.length > 0);
  const direct = resolveSelection(board, { kind: "net", id: power.id });
  for (const part of powerOnly) {
    assert.ok(!graph.connected.has(part.ref), part.ref);
    assert.ok(direct.connected.has(part.ref), part.ref);
  }
  assert.ok(graph.connected.has("U1"));
});


test("rotary encoder belongs to UI and is not highlighted by the RP2350 area", () => {
  const ui = board.connectivity.areas.find((a) => a.name === "UI")!;
  const cpu = board.connectivity.areas.find((a) => a.name === "RP2350")!;
  assert.equal(board.connectivity.components.find((p) => p.ref === "R6")!.area, ui.id);
  assert.ok(resolveSelection(board, { kind: "area", id: ui.id }).connected.has("R6"));
  assert.ok(!resolveSelection(board, { kind: "area", id: cpu.id }).connected.has("R6"));
});


test("series resistors extend USB, WiFi and RGB without traversing supplies", () => {
  const graph = resolveSelection(board, { kind: "component", id: "U1" });
  for (const name of ["/USB_D+", "/USB_D-", "/ARGB-DATA", "Net-(U4-SDIO_CLK)"]) {
    const net = board.connectivity.nets.find(n => n.name === name)!;
    assert.ok(graph.viaResistor.has(net.id), name);
    assert.ok(graph.nets.has(net.id));
  }
  assert.ok(graph.connected.has("J2"));
  for (const id of graph.viaResistor.keys()) {
    assert.equal(netKind(board.connectivity.nets.find(n => n.id === id)!.name), "signal");
    assert.ok(!graph.directNets.has(id));
  }
  const ground = board.connectivity.nets.find(n => n.name === "GND")!;
  assert.equal(resolveSelection(board, { kind: "net", id: ground.id }).nets.size, 1);
});
