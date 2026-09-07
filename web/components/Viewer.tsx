"use client";

import {
  GizmoHelper,
  GizmoViewport,
  Environment,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  Outline,
  EffectComposer,
  Vignette,
} from "@react-three/postprocessing";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import { highlightedCopper } from "@/lib/net-colors";
import { resolveSelection, type Selection } from "@/lib/selection";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Object3D, DirectionalLight } from "three";

import { PcbModel } from "./pcb/PcbModel";
import { recordFrame } from "@/lib/frame-stats";
import type { BoardData } from "@/lib/pcb-types";
import {
  BACKDROP_MAP,
  BACKDROPS,
  LIGHTING,
  LIGHTING_MAP,
  sunPosition,
  type LightingDef,
  type ViewerSettings,
} from "./pcb/viewer-state";

/** Key-light distance from the board center (mm). Direction is what matters
 * for a directional light; this only has to clear the shadow frustum. */
const SUN_DISTANCE = 120;
const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 76, 55];
const DEFAULT_CAMERA_TARGET = new Vector3(0, 1, 0);
/** Half-extent (mm) of the shadow frustum: the 58×40 board plus the fully
 * exploded stack and components, at any light angle. */
const SHADOW_HALF = 50;

/** One-time shadow-camera setup for the key light (a fresh light per mount). */
function setupSunShadow(light: DirectionalLight | null) {
  if (!light) return;
  const cam = light.shadow.camera;
  cam.left = -SHADOW_HALF;
  cam.right = SHADOW_HALF;
  cam.top = SHADOW_HALF;
  cam.bottom = -SHADOW_HALF;
  cam.near = SUN_DISTANCE - 70;
  cam.far = SUN_DISTANCE + 70;
  cam.updateProjectionMatrix();
  // 100mm across 2048 texels ≈ 0.05mm/texel — resolves 0402 bodies. The
  // board layers are only tens of µm thick, so the acne fix has to be a
  // normal-offset rather than a depth bias large enough to detach contacts.
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -0.0002;
  light.shadow.normalBias = 0.04;
}

interface Props {
  data: BoardData;
  settings: ViewerSettings;
  selection: Selection;
  isolate: boolean;
  onSelect: (s: Selection) => void;
  cameraResetKey?: number;
}

/** Dev-only: `window.__cam(px, py, pz, tx, ty, tz)` for scripted camera moves. */
function DevCameraHook() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as {
    target?: THREE_Vec;
    update?: () => void;
  } | null;
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as Record<string, unknown>;
    w.__cam = (px: number, py: number, pz: number, tx = 0, ty = 0, tz = 0) => {
      camera.position.set(px, py, pz);
      controls?.target?.set(tx, ty, tz);
      controls?.update?.();
      invalidate();
    };
    w.__glinfo = () => ({
      frame: gl.info.render.frame,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    });
    w.__gl = gl;
    w.__scene = scene;
    // Synchronous frame for headless tooling: a hidden browser pane suspends
    // rAF, which stalls the demand loop — this renders one raw (un-post-
    // processed) frame straight into the preserved drawing buffer.
    w.__renderOnce = () => gl.render(scene, camera);
  }, [camera, controls, gl, scene, invalidate]);
  return null;
}
interface THREE_Vec {
  set: (x: number, y: number, z: number) => void;
}

/** Offscreen shadow passes run before the composer and must start clean.
 * The composer owns autoClear during its own render (Outline needs false). */
function ClearOffscreenFrames() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    gl.autoClear = true;
  }, -3);
  return null;
}

/** Reuse the directional light's shadow map during camera-only movement. */
function CachedLightShadow({ revision }: { revision: object }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const [live, setLive] = useState(true);
  const dirty = useRef(true);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    return () => { gl.shadowMap.autoUpdate = true; };
  }, [gl]);
  useEffect(() => {
    dirty.current = true;
    setLive(true);
    invalidate();
    const timer = window.setTimeout(() => {
      setLive(false);
      invalidate();
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [revision, invalidate]);
  useFrame(() => {
    if (live || dirty.current) {
      gl.shadowMap.needsUpdate = true;
      dirty.current = false;
    }
  }, -2);
  return null;
}

/** Frame-rate-independent orbit decay, with a hard stop after release. */
function OrbitSettling() {
  const controls = useThree((s) => s.controls) as unknown as {
    target: Vector3; dampingFactor: number; enableDamping: boolean;
    autoRotate: boolean; update: () => void;
    addEventListener: (name: string, listener: () => void) => void;
    removeEventListener: (name: string, listener: () => void) => void;
  } | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_, dt) => {
    if (controls) controls.dampingFactor = 1 - Math.exp(-14 * Math.min(dt, 0.1));
  }, -1.5);
  useEffect(() => {
    if (!controls) return;
    let timer = 0;
    const cancel = () => window.clearTimeout(timer);
    const release = () => {
      cancel();
      timer = window.setTimeout(() => {
        // Clear OrbitControls' private angular/pan velocity without applying
        // the remaining motion as a visible jump.
        const position = camera.position.clone();
        const target = controls.target.clone();
        const damping = controls.enableDamping;
        const rotating = controls.autoRotate;
        controls.autoRotate = false;
        controls.enableDamping = false;
        controls.update();
        camera.position.copy(position);
        controls.target.copy(target);
        controls.update();
        controls.enableDamping = damping;
        controls.autoRotate = rotating;
        invalidate();
      }, 800);
    };
    controls.addEventListener("start", cancel);
    controls.addEventListener("end", release);
    return () => {
      cancel();
      controls.removeEventListener("start", cancel);
      controls.removeEventListener("end", release);
    };
  }, [controls, camera, invalidate]);
  return null;
}

/** Spend pixels on still frames; keep a measured 30 FPS budget while moving. */
function MotionResolution() {
  const camera = useThree((s) => s.camera);
  const setDpr = useThree((s) => s.setDpr);
  const invalidate = useThree((s) => s.invalidate);
  const nativeDpr = useThree((s) => s.viewport.initialDpr);
  const state = useRef({
    position: new Vector3(), quaternion: camera.quaternion.clone(),
    moving: false, resolution: 1, samples: 0, elapsed: 0,
    timer: 0,
  });
  useEffect(() => () => window.clearTimeout(state.current.timer), []);
  useFrame((_, dt) => {
    const s = state.current;
    const changed = camera.position.distanceToSquared(s.position) > 1e-8 ||
      1 - Math.abs(camera.quaternion.dot(s.quaternion)) > 1e-10;
    s.position.copy(camera.position);
    s.quaternion.copy(camera.quaternion);
    if (!changed) return;
    window.clearTimeout(s.timer);
    if (!s.moving) {
      s.moving = true;
      s.samples = 0;
      s.elapsed = 0;
      setDpr(Math.min(nativeDpr, s.resolution));
    } else if (dt > 0 && dt < 0.2) {
      s.samples++;
      s.elapsed += dt;
      // Change infrequently: render-target reallocations must not happen
      // every frame. Keep the learned moving resolution for the next orbit.
      if (s.samples >= 24) {
        const average = s.elapsed / s.samples;
        const next = average > 1 / 32
          ? Math.max(0.6, s.resolution - 0.15)
          : average < 1 / 50 ? Math.min(1, s.resolution + 0.1) : s.resolution;
        if (next !== s.resolution) {
          s.resolution = next;
          setDpr(Math.min(nativeDpr, next));
        }
        s.samples = 0;
        s.elapsed = 0;
      }
    }
    s.timer = window.setTimeout(() => {
      s.moving = false;
      setDpr(nativeDpr);
      invalidate();
    }, 220);
  });
  return null;
}

/**
 * Feeds the FPS readout. Runs after the composer (priority 2 > its 1) so a
 * frame is stamped once it has actually been rendered.
 */
function FrameStatsProbe() {
  useFrame(() => recordFrame(performance.now()), 4);
  return null;
}

/** The slice of postprocessing's EffectComposer the viewer touches. */
interface ComposerBuffers {
  inputBuffer: { dispose(): void };
  outputBuffer: { dispose(): void };
}

/**
 * Procedural environment (no network fetches), keyed so a rig change rebuilds
 * the cubemap. Memoized: with unstable children, every settings update — each
 * explode-slider input event included — would re-render the env scene and
 * force a full PMREM rebuild despite frames={1}.
 */
const EnvironmentRig = memo(function EnvironmentRig({
  rig,
}: {
  rig: LightingDef;
}) {
  return (
    <Environment
      key={rig.id}
      resolution={256}
      frames={1}
      environmentIntensity={rig.envIntensity}
    >
      <color attach="background" args={[rig.envBackground]} />
      {rig.formers.map((f, i) => (
        <Lightformer
          key={i}
          intensity={f.intensity}
          position={f.position}
          rotation={f.rotation}
          scale={[f.scale[0], f.scale[1], 1]}
          color={f.color}
        />
      ))}
    </Environment>
  );
});

export function Viewer({
  data,
  settings,
  selection,
  isolate,
  onSelect,
  cameraResetKey = 0,
}: Props) {
  const [outlined, setOutlined] = useState<Object3D[]>([]);
  const [hovered, setHovered] = useState<Object3D[]>([]);
  const glowMeshes = useMemo(() => [...new Set([...outlined, ...hovered])], [outlined, hovered]);
  const glowActive = !!selection || hovered.length > 0;
  const shadowRevision = useMemo(() => ({}), [data, settings, selection, isolate, outlined]);
  const backdrop = BACKDROP_MAP[settings.backdrop] ?? BACKDROPS[0];
  const rig = LIGHTING_MAP[settings.lighting] ?? LIGHTING[0];

  const composerImpl = useRef<ComposerBuffers | null>(null);
  const composerRef = useCallback((composer: ComposerBuffers | null) => {
    composerImpl.current = composer;
    // Dev-only: `window.__composer` = the postprocessing EffectComposer, for
    // inspecting passes / render targets from the console.
    if (process.env.NODE_ENV !== "production")
      (window as unknown as Record<string, unknown>).__composer =
        composer ?? undefined;
  }, []);

  // Recreate matching depth attachments when the outline pass changes.
  useEffect(() => {
    const composer = composerImpl.current;
    if (!composer) return;
    composer.inputBuffer.dispose();
    composer.outputBuffer.dispose();
  }, [glowActive]);

  return (
    <Canvas
      onPointerMissed={(event) => {
        if (event.type === "click" && event.button === 0) onSelect(null);
      }}
      // PCF-soft shadow maps for the key light. The map itself only exists
      // while `settings.shadows` keeps the light casting.
      shadows="soft"
      dpr={[1, 2]}
      // Render only when something changed (interaction, explode animation,
      // settings) — an idle viewer costs zero GPU. Sources that need frames
      // call invalidate(); OrbitControls does so on its change events.
      frameloop="demand"
      camera={{ position: DEFAULT_CAMERA_POSITION, fov: 32, near: 1, far: 600 }}
      // Canvas MSAA would be thrown away — every frame goes through the
      // EffectComposer, which multisamples its own buffers.
      gl={{
        antialias: false,
        stencil: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      }}
      style={{ background: backdrop.css, transition: "background 400ms ease" }}
    >
      <ClearOffscreenFrames />
      <DevCameraHook />
      <MotionResolution />
      <OrbitSettling />
      <FrameStatsProbe />
      <FocusCamera data={data} selection={selection} isolate={isolate} cameraResetKey={cameraResetKey} />
      <PcbModel
        onOutline={setOutlined}
        onHover={setHovered}
        selection={selection}
        isolate={isolate}
        onSelect={onSelect}
        data={data}
        visibility={settings.visibility}
        explode={selection ? 0 : settings.explode}
        maskDepth={settings.maskDepth}
        maskColor={settings.maskColor}
      />

      <EnvironmentRig rig={rig} />

      {/* Key light: the one shadow caster. Aimed at the origin (the light's
          default target), so the panel's azimuth/elevation fully describe it. */}
      <directionalLight
        ref={setupSunShadow}
        position={sunPosition(settings.sun, SUN_DISTANCE)}
        intensity={settings.sun.intensity}
        color={rig.sun.color}
        castShadow={settings.shadows}
      />
      <ambientLight intensity={rig.ambient} />

      <CachedLightShadow revision={shadowRevision} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.2}
        minDistance={12}
        maxDistance={280}
        autoRotate={settings.autoRotate && !isolate}
        autoRotateSpeed={0.9}
      />

      <EffectComposer autoClear={!glowActive} multisampling={2} ref={composerRef}>
        {/* Threshold sits above what a lit diffuse white reaches so bodies
            (connector shells, module can) never bloom — only specular glints. */}
        {glowActive && <Outline
          selection={glowMeshes}
          visibleEdgeColor="#75e5ef"
          hiddenEdgeColor="#75e5ef"
          edgeStrength={5}
          blur
          xRay
        />}
        <Bloom
          mipmapBlur
          intensity={0.22}
          luminanceThreshold={1.4}
          luminanceSmoothing={0.25}
        />
        <Vignette eskil={false} offset={0.18} darkness={backdrop.vignette} />
      </EffectComposer>
      <GizmoHelper alignment="top-right" margin={[68, 62]} renderPriority={3}>
        <GizmoViewport
          axisColors={["#e78487", "#99c68e", "#7baee4"]}
          labelColor="#10161e"
          font="600 17px sans-serif"
          axisHeadScale={0.85}
        />
      </GizmoHelper>
    </Canvas>
  );
}

/** Recenter orbit on the selected electrical group, preserving viewing direction. */
function FocusCamera({
  data,
  selection,
  isolate,
  cameraResetKey,
}: {
  data: BoardData;
  selection: Selection;
  isolate: boolean;
  cameraResetKey: number;
}) {
  const controls = useThree((s) => s.controls) as unknown as {
    target: Vector3;
    autoRotate: boolean;
    enableDamping: boolean;
    update: () => void;
    addEventListener: (n: string, f: () => void) => void;
    removeEventListener: (n: string, f: () => void) => void;
  } | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const goal = useRef<{
    target: Vector3;
    position: Vector3;
    fromTarget: Vector3;
    fromPosition: Vector3;
    elapsed: number;
    started: boolean;
  } | null>(null);
  const orbitAutoRotate = useRef<boolean | null>(null);
  const restoreOrbit = useCallback(() => {
    if (controls && orbitAutoRotate.current !== null) {
      controls.autoRotate = orbitAutoRotate.current;
      orbitAutoRotate.current = null;
    }
  }, [controls]);
  useEffect(() => {
    if (!controls) return;
    // Drain residual orbit damping without moving the transition's start pose.
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    if (orbitAutoRotate.current === null)
      orbitAutoRotate.current = controls.autoRotate;
    controls.autoRotate = false;
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
    camera.position.copy(startPosition);
    controls.target.copy(startTarget);
    controls.update();
    const graph = resolveSelection(data, selection);
    const cx = (data.bbox.minX + data.bbox.maxX) / 2;
    const cy = (data.bbox.minY + data.bbox.maxY) / 2;
    const bounds = new Box3();
    const include = (x: number, y: number, z: number) =>
      bounds.expandByPoint(new Vector3(x - cx, y, z - cy));

    // Use the same copper as the highlight, including all active pours
    // and excluding shared ground. Include endpoints even when a part has no 3D model.
    for (const net of data.connectivity.nets) {
      if (!graph.nets.has(net.id)) continue;
      for (const polygons of Object.values(highlightedCopper(net)))
        for (const polygon of polygons)
          for (const [x, z] of polygon[0]) {
            include(x, 0, z);
            include(x, data.meta.boardThickness, z);
          }
      for (const index of net.vias) {
        const [x, z, diameter] = data.vias[index];
        include(x - diameter / 2, 0, z - diameter / 2);
        include(x + diameter / 2, data.meta.boardThickness, z + diameter / 2);
      }
    }
    for (const part of data.connectivity.components) {
      if (!graph.connected.has(part.ref)) continue;
      include(part.position[0], 0, part.position[1]);
      for (const pad of part.pads)
        include(pad.position[0], data.meta.boardThickness, pad.position[1]);
    }
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (graph.connected.has(object.userData.ref))
        bounds.union(new Box3().setFromObject(object));
    });
    if (bounds.isEmpty()) {
      include(data.bbox.minX, 0, data.bbox.minY);
      include(data.bbox.maxX, data.meta.boardThickness, data.bbox.maxY);
    }
    const target = bounds.getCenter(new Vector3());
    const direction = camera.position.clone().sub(controls.target).normalize();
    const right = new Vector3().crossVectors(camera.up, direction).normalize();
    const up = new Vector3().crossVectors(direction, right).normalize();
    const tanY = camera instanceof PerspectiveCamera
      ? Math.tan(camera.getEffectiveFOV() * Math.PI / 360)
      : Math.tan(35 * Math.PI / 360);
    const tanX = tanY * size.width / size.height;
    let distance = 12;
    // Fit every corner in camera space, including depth, with 12% breathing room.
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = new Vector3(x, y, z).sub(target);
          distance = Math.max(distance, corner.dot(direction) + 1.12 * Math.max(
            Math.abs(corner.dot(right)) / tanX,
            Math.abs(corner.dot(up)) / tanY,
          ));
        }
    const position = selection
      ? direction.multiplyScalar(distance).add(target)
      : new Vector3(...DEFAULT_CAMERA_POSITION);
    if (!selection) target.copy(DEFAULT_CAMERA_TARGET);
    goal.current = {
      target, position,
      fromTarget: controls.target.clone(),
      fromPosition: camera.position.clone(),
      elapsed: 0,
      started: false,
    };
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      controls.target.copy(target);
      camera.position.copy(position);
      controls.update();
      goal.current = null;
      restoreOrbit();
    }
    invalidate();
  }, [data, selection, isolate, cameraResetKey, controls, camera, invalidate, scene, size.width, size.height, restoreOrbit]);
  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      goal.current = null;
      restoreOrbit();
    };
    controls.addEventListener("start", stop);
    return () => {
      controls.removeEventListener("start", stop);
      restoreOrbit();
    };
  }, [controls, restoreOrbit]);
  useFrame((_, dt) => {
    if (!goal.current || !controls) return;
    const motion = goal.current;
    // Demand rendering reports idle time in the first frame's delta. Start
    // at the current pose, and cap stalls so material/shader work cannot jump
    // the camera ahead by a large fraction of the transition.
    if (motion.started) motion.elapsed += Math.min(dt, 1 / 30);
    motion.started = true;
    controls.autoRotate = false;
    const t = Math.min(1, motion.elapsed / 1.15);
    const eased = t * t * (3 - 2 * t);
    controls.target.lerpVectors(motion.fromTarget, motion.target, eased);
    camera.position.lerpVectors(motion.fromPosition, motion.position, eased);
    controls.update();
    if (t === 1) {
      goal.current = null;
      restoreOrbit();
    }
    else invalidate();
  });
  return null;
}
