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

export interface ViewerSettings {
  visibility: LayerVisibility;
  explode: number; // 0..1
  autoRotate: boolean;
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
  autoRotate: false,
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
