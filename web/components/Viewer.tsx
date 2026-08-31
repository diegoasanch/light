"use client";

import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect } from "react";

import { PcbModel } from "./pcb/PcbModel";
import type { BoardData } from "@/lib/pcb-types";
import {
  BACKDROP_MAP,
  BACKDROPS,
  LIGHTING,
  LIGHTING_MAP,
  type ViewerSettings,
} from "./pcb/viewer-state";

interface Props {
  data: BoardData;
  settings: ViewerSettings;
}

/** Dev-only: `window.__cam(px, py, pz, tx, ty, tz)` for scripted camera moves. */
function DevCameraHook() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target?: THREE_Vec; update?: () => void } | null;
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__cam = (
      px: number, py: number, pz: number, tx = 0, ty = 0, tz = 0,
    ) => {
      camera.position.set(px, py, pz);
      controls?.target?.set(tx, ty, tz);
      controls?.update?.();
    };
  }, [camera, controls]);
  return null;
}
interface THREE_Vec { set: (x: number, y: number, z: number) => void }

export function Viewer({ data, settings }: Props) {
  const backdrop = BACKDROP_MAP[settings.backdrop] ?? BACKDROPS[0];
  const rig = LIGHTING_MAP[settings.lighting] ?? LIGHTING[0];

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [-42, 52, 46], fov: 32, near: 0.5, far: 2000 }}
      gl={{ antialias: true }}
      style={{ background: backdrop.css, transition: "background 400ms ease" }}
    >
      <DevCameraHook />
      <PcbModel data={data} visibility={settings.visibility} explode={settings.explode} />

      {/* procedural environment (no network fetches); keyed so a rig change rebuilds the map */}
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

      <EffectComposer>
        <Bloom mipmapBlur intensity={0.35} luminanceThreshold={1.05} luminanceSmoothing={0.2} />
        <Vignette eskil={false} offset={0.18} darkness={backdrop.vignette} />
      </EffectComposer>
    </Canvas>
  );
}
