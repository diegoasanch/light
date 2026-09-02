/**
 * Frame-rate probe shared between the canvas (writer) and the HTML overlay
 * (reader). A plain mutable record instead of React state: the writer runs
 * every rendered frame and must not trigger renders; the overlay polls it.
 *
 * The canvas runs a demand frameloop — idle = zero frames — so the rate is
 * measured only within bursts of consecutive frames. A gap longer than
 * `BURST_GAP_MS` starts a new burst rather than counting as a slow frame.
 */
export interface FrameStats {
  /** Smoothed frame interval (ms) within the current/last burst; 0 = none yet. */
  frameMs: number;
  /** performance.now() of the last rendered frame; 0 = none yet. */
  lastFrameAt: number;
}

export const frameStats: FrameStats = { frameMs: 0, lastFrameAt: 0 };

const BURST_GAP_MS = 250;
/** EMA weight — ~10-frame memory, quick enough to follow a drag's rate. */
const SMOOTHING = 0.1;

export function recordFrame(now: number): void {
  const dt = now - frameStats.lastFrameAt;
  if (frameStats.lastFrameAt !== 0 && dt < BURST_GAP_MS) {
    frameStats.frameMs =
      frameStats.frameMs === 0 ? dt : frameStats.frameMs + (dt - frameStats.frameMs) * SMOOTHING;
  }
  frameStats.lastFrameAt = now;
}

/** True when no frame has rendered recently — the demand loop is parked. */
export function isIdle(now: number, idleAfterMs = 400): boolean {
  return frameStats.lastFrameAt === 0 || now - frameStats.lastFrameAt > idleAfterMs;
}
