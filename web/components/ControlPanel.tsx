"use client";

import { useId } from "react";

import styles from "./ControlPanel.module.css";
import { PALETTE } from "./pcb/palette";
import {
  applyTheme,
  BACKDROPS,
  LAYER_CONTROLS,
  LIGHTING,
  MASK_COLORS,
  MASK_DEPTH_RANGES,
  PRESETS,
  type LayerVisibility,
  type MaskDepthSettings,
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
        <div className={styles.sectionTitle}>Scene</div>
        <Segmented
          options={[
            { id: "dark", label: "Dark" },
            { id: "light", label: "Light" },
          ]}
          value={settings.theme}
          onChange={(t) => onChange(applyTheme(settings, t as "dark" | "light"))}
          ariaLabel="Interface theme"
        />
        <div className={styles.groupLabel}>Lighting</div>
        <div className={styles.presets}>
          {LIGHTING.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`${styles.presetBtn} ${settings.lighting === l.id ? styles.presetBtnActive : ""}`}
              onClick={() => onChange({ ...settings, lighting: l.id })}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className={styles.groupLabel}>Backdrop</div>
        <div className={styles.sceneSwatches}>
          {BACKDROPS.map((b) => (
            <button
              key={b.id}
              type="button"
              title={b.label}
              aria-label={`${b.label} backdrop`}
              aria-pressed={settings.backdrop === b.id}
              className={`${styles.sceneSwatch} ${settings.backdrop === b.id ? styles.sceneSwatchActive : ""}`}
              style={{ background: b.css }}
              onClick={() => onChange({ ...settings, backdrop: b.id })}
            />
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
                swatch={
                  item.key === "maskF" || item.key === "maskB"
                    ? settings.maskColor
                    : SWATCHES[item.key]
                }
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
        <div className={styles.sectionTitle}>Solder mask</div>
        <div className={styles.groupLabel}>Color</div>
        <div className={styles.maskSwatches}>
          {MASK_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.label}
              aria-label={`${c.label} solder mask`}
              aria-pressed={settings.maskColor === c.color}
              className={`${styles.sceneSwatch} ${styles.maskSwatch} ${
                settings.maskColor === c.color ? styles.sceneSwatchActive : ""
              }`}
              style={{ background: c.color }}
              onClick={() => onChange({ ...settings, maskColor: c.color })}
            />
          ))}
          <label
            title="Custom color"
            className={`${styles.sceneSwatch} ${styles.maskSwatch} ${styles.maskCustom} ${
              MASK_COLORS.some((c) => c.color === settings.maskColor)
                ? ""
                : styles.sceneSwatchActive
            }`}
          >
            <input
              type="color"
              className={styles.maskColorInput}
              value={settings.maskColor}
              onChange={(e) => onChange({ ...settings, maskColor: e.target.value })}
              aria-label="Custom solder mask color"
            />
          </label>
        </div>
        <MaskDepthSlider
          label="Depth"
          param="strength"
          settings={settings}
          onChange={onChange}
        />
        <MaskDepthSlider
          label="Softness"
          param="blurSigma"
          settings={settings}
          onChange={onChange}
        />
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

function MaskDepthSlider({
  label,
  param,
  settings,
  onChange,
}: {
  label: string;
  param: keyof MaskDepthSettings;
  settings: ViewerSettings;
  onChange: (next: ViewerSettings) => void;
}) {
  const { min, max, step } = MASK_DEPTH_RANGES[param];
  const value = settings.maskDepth[param];
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <>
      <div className={styles.groupLabel}>{label}</div>
      <div className={styles.sliderRow}>
        <input
          type="range"
          className={styles.slider}
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ "--fill": `${fill}%` } as React.CSSProperties}
          onChange={(e) =>
            onChange({
              ...settings,
              maskDepth: { ...settings.maskDepth, [param]: Number(e.target.value) },
            })
          }
          aria-label={`Solder mask ${label.toLowerCase()}`}
        />
        <span className={styles.sliderValue}>{value.toFixed(2)}</span>
      </div>
    </>
  );
}

function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={ariaLabel}>
      <span
        className={styles.segThumb}
        aria-hidden
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`${styles.segBtn} ${value === o.id ? styles.segBtnActive : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
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
