/**
 * Fab-matched palette: JLC blue mask over ENIG gold, white silk — tuned
 * against photos of the assembled rev-1 boards (see kicad/README.md).
 *
 * Lives apart from materials.ts so UI code (ControlPanel swatches) can import
 * colors without dragging three.js into the eager first-load bundle — the
 * whole 3D stack stays behind ViewerShell's dynamic() split.
 */
export const PALETTE = {
  // Calibrated 2026-09-01 against photos of the fabbed boards (median mask
  // HSV of the render matched to the photo's H214 S0.84 V0.79; base hue is
  // pre-shifted cyan-ward to cancel the ACES blue→violet skew), then final
  // shade hand-picked by Diego with the in-panel picker: HSL(211, 96%, 30%).
  maskBlue: "#034a96",
  maskBlueDark: "#062f6b",
  goldEnig: "#cfa94f",
  copper: "#b06a36",
  silk: "#eef1f4",
  fr4Core: "#8e8163",
  fr4Prepreg: "#a4966f",
  barrel: "#b8933f",
} as const;
