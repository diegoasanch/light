"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { ControlPanel } from "./ControlPanel";
import { DEFAULT_SETTINGS, type ViewerSettings } from "./pcb/viewer-state";
import { frameStats, isIdle } from "@/lib/frame-stats";
import type { BoardData } from "@/lib/pcb-types";
import styles from "./ViewerShell.module.css";

/**
 * Live frame rate of the canvas. Polled, not event-driven: the probe writes
 * on every rendered frame, and re-rendering this at that rate would be
 * self-defeating. Reads "idle" while the demand loop is parked, which is
 * the normal state of an untouched viewer.
 */
function FpsReadout() {
  const [text, setText] = useState<{ fps: string; idle: boolean }>({ fps: "—", idle: true });
  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      const idle = isIdle(now);
      const fps = frameStats.frameMs > 0 ? Math.round(1000 / frameStats.frameMs).toString() : "—";
      setText((prev) => (prev.fps === fps && prev.idle === idle ? prev : { fps, idle }));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span
      className={text.idle ? styles.fpsIdle : undefined}
      title="Frame rate while rendering — the canvas only draws when something changes"
      aria-live="off"
    >
      {text.idle ? (text.fps === "—" ? "idle" : `idle · last ${text.fps} fps`) : `${text.fps} fps`}
    </span>
  );
}

const Viewer = dynamic(() => import("./Viewer").then((m) => m.Viewer), {
  ssr: false,
  loading: () => <div className={styles.loading}>loading board…</div>,
});

export function ViewerShell() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    let cancelled = false;
    fetch("/pcb/board.json")
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((json: BoardData) => {
        if (!cancelled) setData(json);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className={styles.shell}>
        <div className={styles.loading}>
          failed to load board data ({error}) — run `pnpm sync-pcb`
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.canvasWrap}>{data && <Viewer data={data} settings={settings} />}</div>
      {!data && <div className={styles.loading}>loading board…</div>}

      <header className={styles.header}>
        <div className={styles.title}>
          light <span>· rev 1</span>
        </div>
        {data && (
          <div className={styles.stats}>
            <span>
              {(data.bbox.maxX - data.bbox.minX).toFixed(0)}×
              {(data.bbox.maxY - data.bbox.minY).toFixed(0)} mm
            </span>
            <span>4 layers</span>
            <span>{data.counts.footprints} parts</span>
            <span>{data.counts.vias} vias</span>
            <FpsReadout />
          </div>
        )}
      </header>

      {data && <ControlPanel settings={settings} onChange={setSettings} />}
    </div>
  );
}
