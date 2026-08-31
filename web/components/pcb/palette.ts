/**
 * Fab-matched palette: JLC blue mask over ENIG gold, white silk — tuned
 * against photos of the assembled rev-1 boards (see kicad/README.md).
 *
 * Lives apart from materials.ts so UI code (ControlPanel swatches) can import
 * colors without dragging three.js into the eager first-load bundle — the
 * whole 3D stack stays behind ViewerShell's dynamic() split.
 */
export const PALETTE = {
  maskBlue: "#0a4494",
  maskBlueDark: "#062f6b",
  goldEnig: "#cfa94f",
  copper: "#b06a36",
  silk: "#eef1f4",
  fr4Core: "#8e8163",
  fr4Prepreg: "#a4966f",
  barrel: "#b8933f",
} as const;
