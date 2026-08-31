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
import type { ViewerSettings } from "./pcb/viewer-state";

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
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [-42, 52, 46], fov: 32, near: 0.5, far: 2000 }}
      gl={{ antialias: true }}
      style={{ background: "radial-gradient(120% 90% at 50% 20%, #0e101a 0%, #05070d 60%, #020307 100%)" }}
    >
      <DevCameraHook />
      <PcbModel data={data} visibility={settings.visibility} explode={settings.explode} />

      {/* studio-style procedural environment — no network fetches */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#06070c"]} />
        <Lightformer
          intensity={2.4}
          position={[0, 60, 0]}
          rotation-x={Math.PI / 2}
          scale={[110, 110, 1]}
          color="#e7ecff"
        />
        <Lightformer
          intensity={1.6}
          position={[-60, 25, -35]}
          rotation-y={Math.PI / 2.6}
          scale={[110, 14, 1]}
          color="#ffe9c4"
        />
        <Lightformer
          intensity={1.1}
          position={[62, 18, 30]}
          rotation-y={-Math.PI / 2.4}
          scale={[100, 10, 1]}
          color="#bcd2ff"
        />
        <Lightformer
          intensity={1.4}
          position={[0, -55, 40]}
          rotation-x={-Math.PI / 2.4}
          scale={[110, 60, 1]}
          color="#8fa8d8"
        />
        <Lightformer
          intensity={1.0}
          position={[30, -45, -40]}
          rotation-x={Math.PI / 1.7}
          scale={[90, 40, 1]}
          color="#ffe2b8"
        />
      </Environment>

      <directionalLight position={[-35, 60, 25]} intensity={0.7} color="#fff3dd" />
      <ambientLight intensity={0.12} />

      <ContactShadows
        position={[0, -14 - settings.explode * 18, 0]}
        opacity={0.55}
        scale={150}
        blur={2.4}
        far={44 + settings.explode * 22}
        resolution={512}
        color="#000208"
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
        <Vignette eskil={false} offset={0.18} darkness={0.72} />
      </EffectComposer>
    </Canvas>
  );
}
