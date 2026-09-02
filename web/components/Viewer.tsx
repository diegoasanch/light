"use client";

import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import { memo, useCallback, useEffect, useState } from "react";
import type { DirectionalLight } from "three";

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
}

/** Dev-only: `window.__cam(px, py, pz, tx, ty, tz)` for scripted camera moves. */
function DevCameraHook() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as { target?: THREE_Vec; update?: () => void } | null;
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
interface THREE_Vec { set: (x: number, y: number, z: number) => void }

/**
 * Render the shadow map once per frame, not once per scene render. Every
 * frame draws the scene twice — ContactShadows' top-down depth pass and the
 * composer's beauty pass — and three would redraw all casters into the
 * shadow map for each. Flagging it dirty at the top of the frame lets the
 * first pass build it and the second reuse it.
 */
function ShadowMapOncePerFrame() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame(() => {
    gl.shadowMap.needsUpdate = true;
  }, -1);
  return null;
}

/**
 * Feeds the FPS readout. Runs after the composer (priority 2 > its 1) so a
 * frame is stamped once it has actually been rendered.
 */
function FrameStatsProbe() {
  useFrame(() => recordFrame(performance.now()), 2);
  return null;
}

/** The slice of n8ao's (untyped) N8AOPostPass the viewer configures. */
interface AoPass {
  autoDetectTransparency: boolean;
  configuration: { transparencyAware: boolean };
}

/**
 * Procedural environment (no network fetches), keyed so a rig change rebuilds
 * the cubemap. Memoized: with unstable children, every settings update — each
 * explode-slider input event included — would re-render the env scene and
 * force a full PMREM rebuild despite frames={1}.
 */
const EnvironmentRig = memo(function EnvironmentRig({ rig }: { rig: LightingDef }) {
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

export function Viewer({ data, settings }: Props) {
  const backdrop = BACKDROP_MAP[settings.backdrop] ?? BACKDROPS[0];
  const rig = LIGHTING_MAP[settings.lighting] ?? LIGHTING[0];

  // n8ao's half-res path renders depth into an R32F color target, which
  // WebGL2 only allows with this extension — n8ao has no check or fallback,
  // so without it the AO would composite garbage. Full-res AO works on the
  // half-float targets every WebGL2 stack supports.
  const [floatTargets, setFloatTargets] = useState(true);

  const aoRef = useCallback((pass: AoPass | null) => {
    if (pass) {
      // The mask (opacity 0.96, depth-writing) and via barrels are
      // `transparent` materials, which makes n8ao auto-enable its
      // transparency-aware path: two extra full-resolution scene renders per
      // frame, never halved by halfRes. It buys nothing here — the mask's
      // depth write already puts AO on its top surface — so pin the cheap path.
      pass.autoDetectTransparency = false;
      pass.configuration.transparencyAware = false;
    }
    // Dev-only: live AO tuning from the console (pass.configuration).
    if (process.env.NODE_ENV !== "production")
      (window as unknown as Record<string, unknown>).__ao = pass ?? undefined;
  }, []);

  return (
    <Canvas
      onCreated={({ gl }) => {
        setFloatTargets(gl.getContext().getExtension("EXT_color_buffer_float") !== null);
      }}
      // PCF-soft shadow maps for the key light. The map itself only exists
      // while `settings.shadows` keeps the light casting.
      shadows="soft"
      dpr={[1, 2]}
      // Render only when something changed (interaction, explode animation,
      // settings) — an idle viewer costs zero GPU. Sources that need frames
      // call invalidate(); OrbitControls does so on its change events.
      frameloop="demand"
      camera={{ position: [-42, 52, 46], fov: 32, near: 0.5, far: 2000 }}
      // Canvas MSAA would be thrown away — every frame goes through the
      // EffectComposer, which multisamples its own buffers.
      gl={{
        antialias: false,
        stencil: false,
        powerPreference: "high-performance",
        // Dev-only: keeps the composited frame readable via toDataURL /
        // drawImage so tooling can measure rendered colors numerically.
        preserveDrawingBuffer: process.env.NODE_ENV !== "production",
      }}
      style={{ background: backdrop.css, transition: "background 400ms ease" }}
    >
      <DevCameraHook />
      <ShadowMapOncePerFrame />
      <FrameStatsProbe />
      <PcbModel
        data={data}
        visibility={settings.visibility}
        explode={settings.explode}
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

      <ContactShadows
        position={[0, -14 - settings.explode * 18, 0]}
        opacity={backdrop.shadowOpacity}
        scale={150}
        blur={2.4}
        far={44 + settings.explode * 22}
        resolution={512}
        color={backdrop.shadowColor}
        frames={Infinity}
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={12}
        maxDistance={280}
        autoRotate={settings.autoRotate}
        autoRotateSpeed={0.9}
      />

      <EffectComposer multisampling={4}>
        {/* Ambient occlusion pools soft shadow under component bodies, along
            pin rows and against connector shells. Radii are in board units
            (mm): 2.5mm reach with a tight falloff keeps it a contact effect
            rather than a scene-wide darkening. Mounted conditionally rather
            than via `enabled`: a merely-present pass still costs a per-frame
            full-res depth blit, a trailing copy pass and ~tens of MB of
            targets, so only unmounting makes the toggle a real escape hatch. */}
        {settings.ambientOcclusion && (
          <N8AO
            aoRadius={2.5}
            distanceFalloff={0.5}
            intensity={3}
            quality="medium"
            halfRes={floatTargets}
            depthAwareUpsampling
            ref={aoRef}
          />
        )}
        {/* Threshold sits above what a lit diffuse white reaches so bodies
            (connector shells, module can) never bloom — only specular glints. */}
        <Bloom mipmapBlur intensity={0.35} luminanceThreshold={1.4} luminanceSmoothing={0.25} />
        <Vignette eskil={false} offset={0.18} darkness={backdrop.vignette} />
      </EffectComposer>
    </Canvas>
  );
}
