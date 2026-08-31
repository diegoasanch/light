"use client";

import { useId } from "react";

import styles from "./ControlPanel.module.css";
import { PALETTE } from "./pcb/materials";
import {
  LAYER_CONTROLS,
  PRESETS,
  type LayerVisibility,
  type ViewerSettings,
} from "./pcb/viewer-state";

const SWATCHES: Partial<Record<keyof LayerVisibility, string>> = {
  silkF: PALETTE.silk,
  silkB: PALETTE.silk,
  maskF: PALETTE.maskBlue,
  maskB: PALETTE.maskBlue,
  cuF: PALETTE.goldEnig,
  cuB: PALETTE.goldEnig,
  cuIn1: PALETTE.copper,
  cuIn2: PALETTE.copper,
  dielectric: PALETTE.fr4Core,
  vias: PALETTE.barrel,
};

interface Props {
  settings: ViewerSettings;
  onChange: (next: ViewerSettings) => void;
}

export function ControlPanel({ settings, onChange }: Props) {
  const groups: { name: string; items: typeof LAYER_CONTROLS }[] = [];
  for (const item of LAYER_CONTROLS) {
    const g = groups.find((g) => g.name === item.group);
    if (g) g.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  const matchesPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id)!;
    const applied = preset.apply(settings);
    return (
      JSON.stringify(applied.visibility) === JSON.stringify(settings.visibility) &&
      applied.explode === settings.explode
    );
  };

  return (
    <aside className={styles.panel} aria-label="Viewer controls">
      <section className={styles.section}>
        <div className={styles.sectionTitle}>View</div>
        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`${styles.presetBtn} ${matchesPreset(p.id) ? styles.presetBtnActive : ""}`}
              onClick={() => onChange(p.apply(settings))}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Explode</div>
        <div className={styles.sliderRow}>
          <input
            type="range"
            className={styles.slider}
            min={0}
            max={1}
            step={0.01}
            value={settings.explode}
            style={{ "--fill": `${settings.explode * 100}%` } as React.CSSProperties}
            onChange={(e) => onChange({ ...settings, explode: Number(e.target.value) })}
            aria-label="Exploded view amount"
          />
          <span className={styles.sliderValue}>{Math.round(settings.explode * 100)}%</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Layers</div>
        {groups.map((g) => (
          <div key={g.name}>
            <div className={styles.groupLabel}>{g.name}</div>
            {g.items.map((item) => (
              <LayerRow
                key={item.key}
                label={item.label}
                swatch={SWATCHES[item.key]}
                checked={settings.visibility[item.key]}
                onToggle={(v) =>
                  onChange({
                    ...settings,
                    visibility: { ...settings.visibility, [item.key]: v },
                  })
                }
              />
            ))}
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <SwitchRow
          label="Auto-rotate"
          checked={settings.autoRotate}
          onToggle={(v) => onChange({ ...settings, autoRotate: v })}
        />
      </section>
    </aside>
  );
}

function LayerRow({
  label,
  swatch,
  checked,
  onToggle,
}: {
  label: string;
  swatch?: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={`${styles.row} ${checked ? styles.rowOn : ""}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className={`${styles.box} ${checked ? styles.boxOn : ""}`} aria-hidden>
        <svg className={styles.check} viewBox="0 0 12 12">
          <path d="M2.5 6.5 L5 9 L9.5 3.5" />
        </svg>
      </span>
      <span className={styles.rowLabel}>{label}</span>
      {swatch && <span className={styles.swatch} style={{ background: swatch }} aria-hidden />}
    </label>
  );
}

function SwitchRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={styles.switchRow}>
      <span className={styles.switchLabel}>{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className={`${styles.track} ${checked ? styles.trackOn : ""}`} aria-hidden>
        <span className={styles.thumb} />
      </span>
    </label>
  );
}
