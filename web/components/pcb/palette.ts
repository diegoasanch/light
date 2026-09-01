/**
 * Fab-matched palette: JLC blue mask over ENIG gold, white silk — tuned
 * against photos of the assembled rev-1 boards (see kicad/README.md).
 *
 * Lives apart from materials.ts so UI code (ControlPanel swatches) can import
 * colors without dragging three.js into the eager first-load bundle — the
 * whole 3D stack stays behind ViewerShell's dynamic() split.
 */
export const PALETTE = {
  // Calibrated 2026-09-01 against photos of the fabbed boards: rendered
  // median under the Studio rig measures H215 S0.76 V0.84 vs the photo's
  // H214 S0.84 V0.79 (hue pre-shifted ~9° cyan-ward to cancel the ACES
  // blue→violet skew; the S gap is the scene's residual specular floor).
  maskBlue: "#045ba6",
  maskBlueDark: "#062f6b",
  goldEnig: "#cfa94f",
  copper: "#b06a36",
  silk: "#eef1f4",
  fr4Core: "#8e8163",
  fr4Prepreg: "#a4966f",
  barrel: "#b8933f",
} as const;
