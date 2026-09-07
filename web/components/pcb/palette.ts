/**
 * Fab-matched palette: JLC blue mask over ENIG gold, white silk — tuned
 * against photos of the assembled rev-1 boards (see kicad/README.md).
 *
 * Lives apart from materials.ts so UI code (ControlPanel swatches) can import
 * colors without dragging three.js into the eager first-load bundle — the
 * whole 3D stack stays behind ViewerShell's dynamic() split.
 */
export const PALETTE = {
  // Visual match to the assembled-board photo: muted cyan-blue mask and
  // restrained brass contacts rather than saturated cobalt/yellow.
  maskBlue: "#075399",
  maskBlueDark: "#063566",
  goldEnig: "#bba16a",
  copper: "#b06a36",
  silk: "#e5e6df",
  fr4Core: "#8e8163",
  fr4Prepreg: "#a4966f",
  barrel: "#a38a56",
} as const;
