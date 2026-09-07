import { test } from "node:test";
import assert from "node:assert/strict";
import { netColor, netKind } from "./net-colors";
test("power and ground colors are fixed; control and switching signals are not supply rails", () => {
  for (const n of [
    "+3V3",
    "+1V1",
    "+12V",
    "/VBUS",
    "/VSYS",
    "/VREG5",
    "/V_RGB",
    "/VRGB_OUT",
    "Net-(VR1-VINA)",
  ])
    assert.equal(netColor(n), "#ef4444");
  for (const n of ["GND", "/GND", "AGND", "PGND"])
    assert.equal(netColor(n), "#000000");
  for (const n of ["/PWR_DRGB_LVL", "/VREG_LX", "/3V3_EN", "/WL_ON"])
    assert.equal(netKind(n), "signal");
});
test("signal colors remain consistent across selections", () => {
  const names = ["/GPIO0", "/GPIO1", "Net-(U9-IN)", "/BTN_ON_OFF"];
  const colors = new Map(names.map((n) => [n, netColor(n)]));
  for (const n of names.reverse()) assert.equal(netColor(n), colors.get(n));
  assert.equal(new Set(colors.values()).size, names.length);
});
