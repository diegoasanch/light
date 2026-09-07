"use client";

import { Inspector } from "./Inspector";
import type { Selection } from "@/lib/selection";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

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
  const [text, setText] = useState<{ fps: string; idle: boolean }>({
    fps: "—",
    idle: true,
  });
  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      const idle = isIdle(now);
      const fps =
        frameStats.frameMs > 0
          ? Math.round(1000 / frameStats.frameMs).toString()
          : "—";
      setText((prev) =>
        prev.fps === fps && prev.idle === idle ? prev : { fps, idle },
      );
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
      {text.idle
        ? text.fps === "—"
          ? "idle"
          : `idle · last ${text.fps} fps`
        : `${text.fps} fps`}
    </span>
  );
}

const Viewer = dynamic(() => import("./Viewer").then((m) => m.Viewer), {
  ssr: false,
  loading: () => <div className={styles.loading}>loading board…</div>,
});

export function ViewerShell() {
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [explore, setExplore] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [isolate, setIsolate] = useState(false);
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);

  const exitSelection = useCallback(() => {
    setSelection(null);
    setIsolate(false);
  }, []);
  const select = useCallback((next: Selection) => {
    if (!next) exitSelection();
    else {
      setSelection(next);
      setExplore(true);
    }
  }, [exitSelection]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      exitSelection();
      setExplore(false);
      setAppearance(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [exitSelection]);

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
    <div
      className={styles.shell}
      onKeyDown={() => setKeyboard(true)}
      onPointerDown={() => setKeyboard(false)}
    >
      <div className={styles.canvasWrap}>
        {data && (
          <Viewer
            data={data}
            settings={settings}
            selection={selection}
            isolate={isolate}
            onSelect={select}
            cameraResetKey={cameraResetKey}
          />
        )}
      </div>
      {!data && <div className={styles.loading}>loading board…</div>}

      <button
        className={styles.cameraHome}
        aria-label="Reset camera to home view"
        title="Home view"
        onClick={() => {
          exitSelection();
          setCameraResetKey((key) => key + 1);
        }}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9" />
        </svg>
      </button>
      <header className={styles.header}>
        <div className={styles.title}>
          light<span className={styles.period}>.</span> <span>Board study</span>
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

      <nav className={styles.toolbar} aria-label="Viewer tools">
        <button
          aria-expanded={explore}
          onClick={() => {
            setExplore(!explore);
            setAppearance(false);
          }}
        >
          Explore
        </button>
        <button
          aria-expanded={appearance}
          onClick={() => {
            setAppearance(!appearance);
            setExplore(false);
          }}
        >
          Appearance
        </button>
        {selection && (
          <button
            onClick={exitSelection}
          >
            Exit
          </button>
        )}
      </nav>
      <div className={styles.gestureHint} aria-label="Left-drag to orbit · Right-drag to pan · Scroll to zoom">
        <span title="Left-drag to orbit">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a6 6 0 0 0-6 6v2h6Z" fill="currentColor" stroke="none" />
            <rect x="6" y="2" width="12" height="20" rx="6" />
            <path d="M12 2v8H6m6 0h6" />
          </svg>
          Orbit
        </span>
        <span className={styles.hintSeparator} aria-hidden="true">·</span>
        <span title="Right-drag to pan">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a6 6 0 0 1 6 6v2h-6Z" fill="currentColor" stroke="none" />
            <rect x="6" y="2" width="12" height="20" rx="6" />
            <path d="M12 2v8H6m6 0h6" />
          </svg>
          Drag
        </span>
        <span className={styles.hintSeparator} aria-hidden="true">·</span>
        <span title="Scroll to zoom">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="2" width="12" height="20" rx="6" />
            <path d="M12 6v5m-2-3 2-2 2 2" />
          </svg>
          Zoom
        </span>
      </div>
      <MotionConfig reducedMotion="user">
        <AnimatePresence initial={false}>
          {data?.connectivity && explore && (
            <motion.div
              key="explorer"
              initial={{ opacity: keyboard ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: keyboard ? 1 : 0 }}
              transition={{ duration: keyboard ? 0 : 0.14 }}
            >
              <Inspector
                data={data}
                selection={selection}
                onSelect={select}
                isolate={isolate}
                onIsolate={(active) => {
                  if (active) setIsolate(true);
                  else exitSelection();
                }}
              />
            </motion.div>
          )}
          {data && selection && (
            <motion.div
              key="selection-details"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: keyboard ? 0 : 0.16 }}
            >
              <Inspector
                view="details"
                data={data}
                selection={selection}
                onSelect={select}
                isolate={isolate}
                onIsolate={(active) => {
                  if (active) setIsolate(true);
                  else exitSelection();
                }}
              />
            </motion.div>
          )}
          {data && appearance && (
            <motion.div
              key="appearance"
              initial={{ opacity: keyboard ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: keyboard ? 1 : 0 }}
              transition={{ duration: keyboard ? 0 : 0.14 }}
            >
              <ControlPanel
                settings={settings}
                onChange={(s) => {
                  if (s.explode > 0) {
                    setSelection(null);
                    setIsolate(false);
                  }
                  setSettings(s);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
