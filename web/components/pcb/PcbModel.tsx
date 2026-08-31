"use client";

/**
 * The board itself, assembled from composable stack elements. Every physical
 * element (each copper layer, each dielectric slab, masks, silks, via
 * barrels, components) is its own group so visibility can be toggled
 * independently, and each carries an explode slot for the exploded view.
 */
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Component, Suspense, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

import {
  dielectricShapes,
  extrudeMultiPolygon,
  extrudeShapes,
  slotBarrelGeometry,
  viaBarrels,
} from "@/lib/build-geometry";
import { computeStack, type BoardData, type CopperLayerName } from "@/lib/pcb-types";
import { createMaterials } from "./materials";
import type { LayerVisibility } from "./viewer-state";

const EXPLODE_GAP = 3.4; // mm of extra separation per slot at full explode

interface Props {
  data: BoardData;
  visibility: LayerVisibility;
  explode: number; // 0..1 target; animated internally
}

const COPPER_ORDER: CopperLayerName[] = ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"];

export function PcbModel({ data, visibility, explode }: Props) {
  const cx = (data.bbox.minX + data.bbox.maxX) / 2;
  const cy = (data.bbox.minY + data.bbox.maxY) / 2;

  const stack = useMemo(() => computeStack(data), [data]);
  const materials = useMemo(() => createMaterials(), []);

  const geo = useMemo(() => {
    const dielShapes = dielectricShapes(data, cx, cy);
    const copper = {} as Record<
      CopperLayerName,
      { covered: THREE.ExtrudeGeometry; exposed: THREE.ExtrudeGeometry | null }
    >;
    for (const layer of COPPER_ORDER) {
      const slot = stack.copper[layer];
      const t = slot.y1 - slot.y0;
      copper[layer] = {
        covered: extrudeMultiPolygon(data.copper[layer].covered, t, cx, cy),
        exposed:
          data.copper[layer].exposed.length > 0
            ? extrudeMultiPolygon(data.copper[layer].exposed, t, cx, cy)
            : null,
      };
    }
    return {
      copper,
      mask: {
        F: extrudeMultiPolygon(data.mask.F, stack.mask.F.y1 - stack.mask.F.y0, cx, cy),
        B: extrudeMultiPolygon(data.mask.B, stack.mask.B.y1 - stack.mask.B.y0, cx, cy),
      },
      silk: {
        F: extrudeMultiPolygon(data.silk.F, stack.silk.F.y1 - stack.silk.F.y0, cx, cy),
        B: extrudeMultiPolygon(data.silk.B, stack.silk.B.y1 - stack.silk.B.y0, cx, cy),
      },
      dielectric: stack.dielectric.map((d) =>
        extrudeShapes(dielShapes, d.slot.y1 - d.slot.y0),
      ),
      barrels: viaBarrels(data, cx, cy),
      slotBarrels: slotBarrelGeometry(data, cx, cy, stack.total),
    };
  }, [data, stack, cx, cy]);

  /**
   * Explode slots: stack elements sorted bottom→top, one slot step apart,
   * with the core slab pinned at slot 0. Components ride one step beyond
   * their side's silkscreen.
   */
  const slots = useMemo(() => {
    const entries: { key: string; y: number; tie: number }[] = [
      { key: "silk-B", y: stack.silk.B.y0, tie: 0 },
      { key: "mask-B", y: stack.mask.B.y0, tie: -1 }, // below B.Cu in explode order
      { key: "cu-B.Cu", y: stack.copper["B.Cu"].y0, tie: 0 },
      { key: "cu-In2.Cu", y: stack.copper["In2.Cu"].y0, tie: 0 },
      { key: "cu-In1.Cu", y: stack.copper["In1.Cu"].y0, tie: 0 },
      { key: "cu-F.Cu", y: stack.copper["F.Cu"].y0, tie: 0 },
      { key: "mask-F", y: stack.mask.F.y0, tie: 1 }, // above F.Cu
      { key: "silk-F", y: stack.silk.F.y0, tie: 0 },
      ...stack.dielectric.map((d, i) => ({ key: `diel-${i}`, y: d.slot.y0, tie: 0 })),
    ];
    entries.sort((a, b) => a.y - b.y || a.tie - b.tie);
    const coreIdx = entries.findIndex(
      (e) => e.key === `diel-${stack.dielectric.findIndex((d) => d.type === "core")}`,
    );
    const map = new Map<string, number>();
    entries.forEach((e, i) => map.set(e.key, i - coreIdx));
    map.set("comp-F", (map.get("silk-F") ?? 0) + 1.4);
    map.set("comp-B", (map.get("silk-B") ?? 0) - 1.4);
    return map;
  }, [stack]);

  const explodeRef = useRef(0);
  const parts = useRef<Map<string, { obj: THREE.Group; slot: number; baseY: number }>>(
    new Map(),
  );
  const barrelGroup = useRef<THREE.Group>(null);

  const register = (key: string, baseY: number) => (obj: THREE.Group | null) => {
    if (obj) parts.current.set(key, { obj, slot: slots.get(key) ?? 0, baseY });
    else parts.current.delete(key);
  };

  useFrame((_, dt) => {
    explodeRef.current = THREE.MathUtils.damp(explodeRef.current, explode, 7, dt);
    const e = explodeRef.current * EXPLODE_GAP;
    for (const { obj, slot, baseY } of parts.current.values()) {
      obj.position.y = baseY + slot * e;
    }
    if (barrelGroup.current) {
      // Barrels stretch to keep connecting the exploded B.Cu and F.Cu layers.
      const sB = (slots.get("cu-B.Cu") ?? 0) * e;
      const sF = (slots.get("cu-F.Cu") ?? 0) * e;
      barrelGroup.current.position.y = sB;
      barrelGroup.current.scale.y = (stack.total + (sF - sB)) / stack.total;
    }
    // Stretched barrels go slightly translucent so they don't read as solid
    // rods obscuring the separated layers.
    materials.barrel.opacity = 1 - explodeRef.current * 0.45;
  });

  return (
    <group>
      {stack.dielectric.map((d, i) => (
        <group key={d.name} ref={register(`diel-${i}`, d.slot.y0)} visible={visibility.dielectric}>
          <mesh
            geometry={geo.dielectric[i]}
            material={d.type === "core" ? materials.core : materials.prepreg}
          />
        </group>
      ))}

      {COPPER_ORDER.map((layer) => {
        const outer = layer === "F.Cu" || layer === "B.Cu";
        const vis = {
          "F.Cu": visibility.cuF,
          "In1.Cu": visibility.cuIn1,
          "In2.Cu": visibility.cuIn2,
          "B.Cu": visibility.cuB,
        }[layer];
        return (
          <group
            key={layer}
            ref={register(`cu-${layer}`, stack.copper[layer].y0)}
            visible={vis}
          >
            <mesh
              geometry={geo.copper[layer].covered}
              material={outer ? materials.copperCovered : materials.copperInner}
            />
            {geo.copper[layer].exposed && (
              <mesh geometry={geo.copper[layer].exposed!} material={materials.goldExposed} />
            )}
          </group>
        );
      })}

      <group ref={register("mask-F", stack.mask.F.y0)} visible={visibility.maskF}>
        <mesh geometry={geo.mask.F} material={materials.mask} renderOrder={2} />
      </group>
      <group ref={register("mask-B", stack.mask.B.y0)} visible={visibility.maskB}>
        <mesh geometry={geo.mask.B} material={materials.mask} renderOrder={2} />
      </group>

      <group ref={register("silk-F", stack.silk.F.y0)} visible={visibility.silkF}>
        <mesh geometry={geo.silk.F} material={materials.silk} />
      </group>
      <group ref={register("silk-B", stack.silk.B.y0)} visible={visibility.silkB}>
        <mesh geometry={geo.silk.B} material={materials.silk} />
      </group>

      <group ref={barrelGroup} visible={visibility.vias}>
        <Barrels barrels={geo.barrels} height={stack.total} material={materials.barrel} />
        {geo.slotBarrels && <mesh geometry={geo.slotBarrels} material={materials.barrel} />}
      </group>

      <ComponentsErrorBoundary>
        <Suspense fallback={null}>
          <Components
            cx={cx}
            cy={cy}
            boardTotal={stack.total}
            visible={visibility.components}
            registerTop={register("comp-F", 0)}
            registerBottom={register("comp-B", 0)}
          />
        </Suspense>
      </ComponentsErrorBoundary>
    </group>
  );
}

/**
 * A missing or corrupt components.glb should degrade to a bare board, not
 * take down the whole canvas (Suspense only covers the pending state — load
 * errors propagate as render errors).
 */
class ComponentsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("components.glb failed to load — rendering bare board", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Barrels({
  barrels,
  height,
  material,
}: {
  barrels: { x: number; z: number; radius: number }[];
  height: number;
  material: THREE.Material;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    g.translate(0, 0.5, 0); // base sits at y = 0, top at y = 1
    return g;
  }, []);
  const setInstances = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    const m = new THREE.Matrix4();
    barrels.forEach((b, i) => {
      m.makeScale(b.radius, height, b.radius);
      m.setPosition(b.x, 0, b.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return (
    <instancedMesh
      ref={setInstances}
      args={[geometry, material, barrels.length]}
      frustumCulled={false}
    />
  );
}

/**
 * The kicad-cli GLB: meters, y-up, x/z = kicad x/y, origin at the KiCad page
 * origin with y = 0 on the board's bottom face — scaled ×1000 into mm and
 * recentered, it drops straight onto the extruded board. Top- and
 * bottom-side components are split so the exploded view carries each side
 * away from the board in its own direction.
 */
function Components({
  cx,
  cy,
  boardTotal,
  visible,
  registerTop,
  registerBottom,
}: {
  cx: number;
  cy: number;
  boardTotal: number;
  visible: boolean;
  registerTop: (obj: THREE.Group | null) => void;
  registerBottom: (obj: THREE.Group | null) => void;
}) {
  const { scene } = useGLTF("/pcb/components.glb");
  const { top, bottom } = useMemo(() => {
    const top = new THREE.Group();
    const bottom = new THREE.Group();
    const mid = boardTotal / 2 / 1000; // GLB is in meters
    // The exporter nests every per-component node under a single bare
    // identity node — unwrap such wrappers to reach the refdes level.
    let level: THREE.Object3D[] = scene.children;
    while (
      level.length === 1 &&
      level[0].children.length > 0 &&
      !(level[0] as THREE.Mesh).isMesh &&
      level[0].position.lengthSq() === 0 &&
      level[0].quaternion.w === 1
    ) {
      level = level[0].children;
    }
    // Classify by bounding-box center: top-side bodies live above the board
    // mid-plane, bottom-side bodies below — robust against per-model offsets
    // and baked orientation corrections in the node transforms.
    const box = new THREE.Box3();
    for (const child of level) {
      box.setFromObject(child);
      const centerY = box.isEmpty() ? mid : (box.min.y + box.max.y) / 2;
      (centerY < mid ? bottom : top).add(child.clone(true));
    }
    // Tame the GLB materials' specular response: glossy connector plastics
    // (UART/DEBUG shells) and the radio shield otherwise catch the large
    // overhead lightformers as blown-out glare under the brighter rigs.
    const seen = new Set<THREE.Material>();
    for (const grp of [top, bottom]) {
      grp.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const std = mat as THREE.MeshStandardMaterial;
          if (!std.isMeshStandardMaterial || seen.has(std)) continue;
          seen.add(std);
          if (std.metalness > 0.5) {
            std.envMapIntensity = 0.8;
            std.roughness = Math.max(std.roughness, 0.35);
          } else {
            std.envMapIntensity = 0.55;
            std.roughness = Math.max(std.roughness, 0.5);
          }
        }
      });
    }
    return { top, bottom };
  }, [scene, boardTotal]);

  return (
    <group visible={visible}>
      <group ref={registerTop}>
        <group scale={1000} position={[-cx, 0, -cy]}>
          <primitive object={top} />
        </group>
      </group>
      <group ref={registerBottom}>
        <group scale={1000} position={[-cx, 0, -cy]}>
          <primitive object={bottom} />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload("/pcb/components.glb");
