import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardData } from "./pcb-types";
import { selectedPlating } from "./selected-plating";
const board = JSON.parse(
  readFileSync(new URL("../public/pcb/board.json", import.meta.url), "utf8"),
) as BoardData;

test("every plated hole carries an explicit valid net, including slots", () => {
  const codes = new Set([0, ...board.connectivity.nets.map((n) => n.id)]);
  for (const hole of board.holes.round) assert.ok(codes.has(hole[4]));
  for (const hole of board.holes.slots) assert.ok(codes.has(hole.net));
});
test("individual net selection includes only its vias and through-hole plating", () => {
  for (const net of board.connectivity.nets) {
    const result = selectedPlating(board, new Set([net.id]));
    assert.equal(
      result.round.length,
      net.vias.length +
        board.holes.round.filter((h) => h[3] && h[4] === net.id).length,
    );
    assert.equal(
      result.slots.length,
      board.holes.slots.filter((h) => h.plated && h.net === net.id).length,
    );
    assert.ok(
      [...result.round, ...result.slots].every((p) => p.net === net.id),
    );
  }
  const vbus = board.connectivity.nets.find((n) => n.name === "/VBUS")!;
  const focused = selectedPlating(board, new Set([vbus.id]));
  assert.ok(focused.round.length > 0);
  assert.ok(focused.round.length < board.vias.length);
});
test("empty selection does not leak netless or unrelated hole plating", () => {
  assert.deepEqual(selectedPlating(board, new Set()), { round: [], slots: [] });
  assert.deepEqual(selectedPlating(board, new Set([0])), {
    round: [],
    slots: [],
  });
});
