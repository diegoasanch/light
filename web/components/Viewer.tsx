"use client";

import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { memo, useEffect } from "react";

import { PcbModel } from "./pcb/PcbModel";
import type { BoardData } from "@/lib/pcb-types";
import {
  BACKDROP_MAP,
  BACKDROPS,
  LIGHTING,
  LIGHTING_MAP,
  type LightingDef,
  type ViewerSettings,
} from "./pcb/viewer-state";

interface Props {
  data: BoardData;
  settings: ViewerSettings;
}

/** Dev-only: `window.__cam(px, py, pz, tx, ty, tz)` for scripted camera moves. */
function DevCameraHook() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
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
  }, [camera, controls, gl, invalidate]);
  return null;
}
interface THREE_Vec { set: (x: number, y: number, z: number) => void }

/**
 * Procedural environment (no network fetches), keyed so a rig change rebuilds
 * the cubemap. Memoized: with unstable children, every settings update — each
 * explode-slider input event included — would re-render the env scene and
 * force a full PMREM rebuild despite frames={1}.
 */
const EnvironmentRig = memo(function EnvironmentRig({ rig }: { rig: LightingDef }) {
  return (
    <Environment key={rig.id} resolution={256} frames={1}>
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

  return (
    <Canvas
      dpr={[1, 2]}
      // Render only when something changed (interaction, explode animation,
      // settings) — an idle viewer costs zero GPU. Sources that need frames
      // call invalidate(); OrbitControls does so on its change events.
      frameloop="demand"
      camera={{ position: [-42, 52, 46], fov: 32, near: 0.5, far: 2000 }}
      // Canvas MSAA would be thrown away — every frame goes through the
      // EffectComposer, which multisamples its own buffers.
      gl={{ antialias: false, stencil: false, powerPreference: "high-performance" }}
      style={{ background: backdrop.css, transition: "background 400ms ease" }}
    >
      <DevCameraHook />
      <PcbModel data={data} visibility={settings.visibility} explode={settings.explode} />

      <EnvironmentRig rig={rig} />

      <directionalLight position={rig.sun.position} intensity={rig.sun.intensity} color={rig.sun.color} />
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
        {/* Threshold sits above what a lit diffuse white reaches so bodies
            (connector shells, module can) never bloom — only specular glints. */}
        <Bloom mipmapBlur intensity={0.35} luminanceThreshold={1.4} luminanceSmoothing={0.25} />
        <Vignette eskil={false} offset={0.18} darkness={backdrop.vignette} />
      </EffectComposer>
    </Canvas>
  );
}
