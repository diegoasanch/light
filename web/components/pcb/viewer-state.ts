import { PALETTE } from "./palette";

export interface LayerVisibility {
  components: boolean;
  silkF: boolean;
  maskF: boolean;
  cuF: boolean;
  cuIn1: boolean;
  cuIn2: boolean;
  cuB: boolean;
  maskB: boolean;
  silkB: boolean;
  dielectric: boolean;
  vias: boolean;
}

export type ThemeId = "dark" | "light";

/**
 * Parameters for the baked "conformal mask" normal map (copper-bump.ts).
 * Plain numbers only — this file is imported by eagerly-loaded UI code and
 * must stay three-free.
 */
export interface MaskDepthSettings {
  /** Normal-map slope amplitude (0 = flat mask). */
  strength: number;
  /** Gaussian σ (in texels) of the slump blur — how softly mask rounds edges. */
  blurSigma: number;
}

export const MASK_DEPTH_RANGES = {
  strength: { min: 0, max: 3, step: 0.05 },
  blurSigma: { min: 0.4, max: 3, step: 0.05 },
} as const;

/**
 * Fab-style solder mask colors. Base albedos, not screen colors — deep and
 * saturated because the scene's specular paths add white on top (the blue is
 * the photo-calibrated one from palette.ts; the rest are eyeballed to the
 * same rule of thumb).
 */
export const MASK_COLORS: { id: string; label: string; color: string }[] = [
  { id: "blue", label: "Fab blue", color: PALETTE.maskBlue },
  { id: "green", label: "Classic green", color: "#0b5433" },
  { id: "red", label: "Red", color: "#971b1e" },
  { id: "purple", label: "Purple", color: "#46258f" },
  { id: "black", label: "Black", color: "#1b1e24" },
  { id: "white", label: "White", color: "#c9cdd4" },
];

export interface ViewerSettings {
  visibility: LayerVisibility;
  explode: number; // 0..1
  maskDepth: MaskDepthSettings;
  maskColor: string; // hex; applied to both mask materials
  ambientOcclusion: boolean; // SSAO pass (N8AO) — off is the weak-GPU escape hatch
  autoRotate: boolean;
  theme: ThemeId;
  backdrop: string; // BackdropDef id
  lighting: string; // LightingDef id
}

export const ALL_VISIBLE: LayerVisibility = {
  components: true,
  silkF: true,
  maskF: true,
  cuF: true,
  cuIn1: true,
  cuIn2: true,
  cuB: true,
  maskB: true,
  silkB: true,
  dielectric: true,
  vias: true,
};

export const DEFAULT_SETTINGS: ViewerSettings = {
  visibility: ALL_VISIBLE,
  explode: 0,
  // User-tuned against the physical boards (2026-09-01).
  maskDepth: { strength: 0.4, blurSigma: 0.6 },
  maskColor: PALETTE.maskBlue,
  ambientOcclusion: true,
  autoRotate: false,
  theme: "dark",
  backdrop: "midnight",
  lighting: "studio",
};

export interface Preset {
  id: string;
  label: string;
  apply: (s: ViewerSettings) => ViewerSettings;
}

export const PRESETS: Preset[] = [
  {
    id: "assembled",
    label: "Assembled",
    apply: (s) => ({ ...s, visibility: ALL_VISIBLE, explode: 0 }),
  },
  {
    id: "bare",
    label: "Bare board",
    apply: (s) => ({
      ...s,
      visibility: { ...ALL_VISIBLE, components: false },
      explode: 0,
    }),
  },
  {
    id: "copper",
    label: "Copper",
    apply: (s) => ({
      ...s,
      visibility: {
        ...ALL_VISIBLE,
        components: false,
        silkF: false,
        silkB: false,
        maskF: false,
        maskB: false,
        dielectric: false,
      },
      explode: 0,
    }),
  },
  {
    id: "exploded",
    label: "Exploded",
    apply: (s) => ({ ...s, visibility: ALL_VISIBLE, explode: 1 }),
  },
];

export const LAYER_CONTROLS: { key: keyof LayerVisibility; label: string; group: string }[] = [
  { key: "components", label: "Components", group: "Assembly" },
  { key: "vias", label: "Via barrels", group: "Assembly" },
  { key: "silkF", label: "Silkscreen", group: "Top" },
  { key: "maskF", label: "Solder mask", group: "Top" },
  { key: "cuF", label: "Copper F.Cu", group: "Top" },
  { key: "cuIn1", label: "Copper In1.Cu", group: "Inner" },
  { key: "dielectric", label: "Dielectric (FR-4)", group: "Inner" },
  { key: "cuIn2", label: "Copper In2.Cu", group: "Inner" },
  { key: "cuB", label: "Copper B.Cu", group: "Bottom" },
  { key: "maskB", label: "Solder mask", group: "Bottom" },
  { key: "silkB", label: "Silkscreen", group: "Bottom" },
];

/* ------------------------------------------------------------------ scene */

/**
 * A backdrop is the canvas background plus the post/shadow tuning that makes
 * the board sit well on it. `theme` marks which UI theme it pairs with so a
 * theme toggle can swap in a matching backdrop.
 */
export interface BackdropDef {
  id: string;
  label: string;
  theme: ThemeId;
  css: string; // CSS background behind the (transparent) canvas
  vignette: number; // Vignette darkness
  shadowColor: string;
  shadowOpacity: number;
}

export const BACKDROPS: BackdropDef[] = [
  {
    id: "midnight",
    label: "Midnight",
    theme: "dark",
    css: "radial-gradient(120% 90% at 50% 20%, #0e101a 0%, #05070d 60%, #020307 100%)",
    vignette: 0.72,
    shadowColor: "#000208",
    shadowOpacity: 0.55,
  },
  {
    id: "dusk",
    label: "Dusk",
    theme: "dark",
    css: "radial-gradient(130% 100% at 50% 0%, #241432 0%, #120b20 52%, #06030e 100%)",
    vignette: 0.6,
    shadowColor: "#04010a",
    shadowOpacity: 0.5,
  },
  {
    id: "porcelain",
    label: "Porcelain",
    theme: "light",
    css: "radial-gradient(120% 90% at 50% 18%, #ffffff 0%, #e9edf4 55%, #cfd6e2 100%)",
    vignette: 0.26,
    shadowColor: "#1b2946",
    shadowOpacity: 0.38,
  },
  {
    id: "linen",
    label: "Linen",
    theme: "light",
    css: "radial-gradient(120% 90% at 50% 20%, #fbf8f1 0%, #f0e9db 58%, #dfd4bf 100%)",
    vignette: 0.22,
    shadowColor: "#3a3020",
    shadowOpacity: 0.34,
  },
];

export const BACKDROP_MAP = Object.fromEntries(BACKDROPS.map((b) => [b.id, b])) as Record<
  string,
  BackdropDef
>;

/** One panel of the procedural environment (a drei Lightformer). */
export interface LightformerSpec {
  intensity: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number];
  color: string;
}

export interface LightingDef {
  id: string;
  label: string;
  envBackground: string; // environment map base color (drives reflections)
  formers: LightformerSpec[];
  sun: { position: [number, number, number]; intensity: number; color: string };
  ambient: number;
}

export const LIGHTING: LightingDef[] = [
  {
    id: "studio",
    label: "Studio",
    envBackground: "#06070c",
    formers: [
      { intensity: 2.4, position: [0, 60, 0], rotation: [Math.PI / 2, 0, 0], scale: [110, 110], color: "#e7ecff" },
      { intensity: 1.6, position: [-60, 25, -35], rotation: [0, Math.PI / 2.6, 0], scale: [110, 14], color: "#ffe9c4" },
      { intensity: 1.1, position: [62, 18, 30], rotation: [0, -Math.PI / 2.4, 0], scale: [100, 10], color: "#bcd2ff" },
      { intensity: 1.4, position: [0, -55, 40], rotation: [-Math.PI / 2.4, 0, 0], scale: [110, 60], color: "#8fa8d8" },
      { intensity: 1.0, position: [30, -45, -40], rotation: [Math.PI / 1.7, 0, 0], scale: [90, 40], color: "#ffe2b8" },
    ],
    sun: { position: [-35, 60, 25], intensity: 0.7, color: "#fff3dd" },
    ambient: 0.12,
  },
  {
    id: "daylight",
    label: "Daylight",
    envBackground: "#dfe6f2",
    formers: [
      { intensity: 2.6, position: [0, 60, 0], rotation: [Math.PI / 2, 0, 0], scale: [120, 120], color: "#ffffff" },
      { intensity: 1.7, position: [-60, 20, -20], rotation: [0, Math.PI / 2.4, 0], scale: [110, 40], color: "#f2f6ff" },
      { intensity: 1.5, position: [60, 20, 20], rotation: [0, -Math.PI / 2.4, 0], scale: [110, 40], color: "#fff4e2" },
      { intensity: 1.1, position: [0, -50, 0], rotation: [-Math.PI / 2, 0, 0], scale: [120, 120], color: "#dde6f5" },
    ],
    sun: { position: [-30, 70, 40], intensity: 1.2, color: "#ffffff" },
    ambient: 0.3,
  },
  {
    id: "sunset",
    label: "Sunset",
    envBackground: "#170a0e",
    formers: [
      { intensity: 3.0, position: [-70, 12, 0], rotation: [0, Math.PI / 2, 0], scale: [90, 16], color: "#ff8a3c" },
      { intensity: 0.9, position: [0, 55, -10], rotation: [Math.PI / 2, 0, 0], scale: [110, 110], color: "#ffc79a" },
      { intensity: 0.6, position: [65, 22, 10], rotation: [0, -Math.PI / 2.3, 0], scale: [90, 12], color: "#7d8fd8" },
      { intensity: 0.8, position: [0, -50, 30], rotation: [-Math.PI / 2.3, 0, 0], scale: [100, 50], color: "#ff9d68" },
    ],
    sun: { position: [-55, 25, 10], intensity: 1.0, color: "#ffb070" },
    ambient: 0.07,
  },
  {
    id: "rgb",
    label: "RGB",
    envBackground: "#040509",
    formers: [
      { intensity: 2.7, position: [-60, 30, -30], rotation: [0, Math.PI / 2.6, 0], scale: [100, 12], color: "#ff2d3c" },
      { intensity: 1.5, position: [0, 55, -45], rotation: [Math.PI / 2.2, 0, 0], scale: [110, 30], color: "#2dff6a" },
      { intensity: 2.7, position: [62, 26, 28], rotation: [0, -Math.PI / 2.4, 0], scale: [100, 12], color: "#2d6bff" },
      { intensity: 0.7, position: [0, 60, 15], rotation: [Math.PI / 2, 0, 0], scale: [90, 90], color: "#cfd6e6" },
      { intensity: 0.7, position: [0, -52, 35], rotation: [-Math.PI / 2.3, 0, 0], scale: [100, 50], color: "#7a4bd8" },
    ],
    sun: { position: [0, 60, 30], intensity: 0.35, color: "#ffffff" },
    ambient: 0.1,
  },
];

export const LIGHTING_MAP = Object.fromEntries(LIGHTING.map((l) => [l.id, l])) as Record<
  string,
  LightingDef
>;

const THEME_DEFAULTS: Record<ThemeId, { backdrop: string; lighting: string }> = {
  dark: { backdrop: "midnight", lighting: "studio" },
  light: { backdrop: "porcelain", lighting: "daylight" },
};

/**
 * Switch UI theme. A backdrop from the other theme's family swaps to the new
 * theme's default so the page never lands on a clashing combination, and the
 * lighting follows only if it was still the old theme's default — an explicit
 * lighting pick survives the toggle.
 */
export function applyTheme(s: ViewerSettings, theme: ThemeId): ViewerSettings {
  if (theme === s.theme) return s;
  const next = THEME_DEFAULTS[theme];
  return {
    ...s,
    theme,
    backdrop: BACKDROP_MAP[s.backdrop]?.theme === theme ? s.backdrop : next.backdrop,
    lighting: s.lighting === THEME_DEFAULTS[s.theme].lighting ? next.lighting : s.lighting,
  };
}
