"use client";
import { useMemo, useEffect, useCallback } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { highlightedCopper, netColor } from "@/lib/net-colors";
import { selectedPlating } from "@/lib/selected-plating";
import { extrudeMultiPolygon, slotBarrelGeometry } from "@/lib/build-geometry";
import {
  computeStack,
  type BoardData,
  type CopperLayerName,
} from "@/lib/pcb-types";
import type { Selection } from "@/lib/selection";

function colorGeometry(geometry: THREE.BufferGeometry, color: THREE.Color) {
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Batch by copper layer, retaining triangle ranges for exact net picking. */
export function NetHighlight({
  data,
  nets,
  onSelect,
}: {
  data: BoardData;
  nets: Set<number>;
  onSelect: (s: Selection) => void;
}) {
  const colors = useMemo(
    () =>
      new Map(
        data.connectivity.nets.map((n) => [
          n.id,
          new THREE.Color(netColor(n.name)),
        ]),
      ),
    [data],
  );
  const stack = useMemo(() => computeStack(data), [data]);
  const cx = (data.bbox.minX + data.bbox.maxX) / 2,
    cy = (data.bbox.minY + data.bbox.maxY) / 2;
  const selected = useMemo(
    () => data.connectivity.nets.filter((n) => nets.has(n.id)),
    [data, nets],
  );
  // Reuse tessellation while moving between components on the same nets.
  // Bound the cache so inspecting the board cannot retain every copper mesh.
  const geometryCache = useMemo(() => new Map<string, THREE.BufferGeometry>(), [data]);
  useEffect(() => () => {
    geometryCache.forEach((geometry) => geometry.dispose());
    geometryCache.clear();
  }, [geometryCache]);
  const layers = useMemo(
    () =>
      (Object.keys(stack.copper) as CopperLayerName[]).flatMap((layer) => {
        const sources: THREE.BufferGeometry[] = [];
        const ranges: { end: number; id: number }[] = [];
        let end = 0;
        for (const net of selected) {
          const routed = highlightedCopper(net)?.[layer] ?? [];
          if (!routed.length) continue;
          const key = `${net.id}:${layer}`;
          let g = geometryCache.get(key);
          if (!g) {
            g = extrudeMultiPolygon(
              routed,
              stack.copper[layer].y1 - stack.copper[layer].y0,
              cx, cy,
            );
            colorGeometry(g, colors.get(net.id)!);
          }
          geometryCache.delete(key);
          geometryCache.set(key, g);
          if (geometryCache.size > 32) {
            const oldest = geometryCache.keys().next().value!;
            geometryCache.get(oldest)!.dispose();
            geometryCache.delete(oldest);
          }
          end += (g.index?.count ?? g.attributes.position.count) / 3;
          ranges.push({ end, id: net.id });
          sources.push(g);
        }
        if (!sources.length) return [];
        const geometry = mergeGeometries(sources)!;
        return [{ layer, geometry, ranges }];
      }),
    [selected, stack, cx, cy, colors, geometryCache],
  );
  useEffect(() => () => layers.forEach((x) => x.geometry.dispose()), [layers]);
  const plating = useMemo(() => selectedPlating(data, nets), [data, nets]);
  const vias = plating.round;
  const slots = useMemo(
    () =>
      [...new Set(plating.slots.map((s) => s.net))].flatMap((net) => {
        const geometry = slotBarrelGeometry(
          {
            ...data,
            holes: {
              ...data.holes,
              slots: plating.slots.filter((s) => s.net === net),
            },
          },
          cx,
          cy,
          stack.total,
        );
        if (geometry) colorGeometry(geometry, colors.get(net)!);
        return geometry ? [{ net, geometry }] : [];
      }),
    [data, plating, cx, cy, stack, colors],
  );
  useEffect(() => () => slots.forEach((s) => s.geometry.dispose()), [slots]);
  const barrel = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
    colorGeometry(g, new THREE.Color(1, 1, 1));
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        // A slope-scaled bias on near-edge-on via/trace walls can pull
        // fragments through opaque packages. Only separate coincident copper
        // by a constant depth unit; retain physical occlusion at every angle.
        polygonOffsetFactor: 0,
        polygonOffsetUnits: -1,
        depthTest: true,
        depthWrite: true,
      }),
    [],
  );
  useEffect(
    () => () => {
      barrel.dispose();
      material.dispose();
    },
    [barrel, material],
  );
  const instances = useCallback(
    (mesh: THREE.InstancedMesh | null) => {
      if (!mesh) return;
      const m = new THREE.Matrix4();
      vias.forEach((v, i) => {
        m.makeScale(v.diameter / 2, stack.total, v.diameter / 2);
        m.setPosition(v.x - cx, stack.total / 2, v.y - cy);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, colors.get(v.net)!);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    [vias, stack, cx, cy, colors],
  );
  return (
    <group>
      {layers.map((x) => (
        <mesh
          key={x.layer}
          geometry={x.geometry}
          material={material}
          position={[0, stack.copper[x.layer].y0, 0]}
          renderOrder={5}
          onClick={(e) => {
            const range = x.ranges.find((r) => (e.faceIndex ?? -1) < r.end);
            if (range) {
              e.stopPropagation();
              onSelect({ kind: "net", id: range.id });
            }
          }}
        />
      ))}
      {slots.map((s) => (
        <mesh
          key={`slot:${s.net}`}
          geometry={s.geometry}
          material={material}
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ kind: "net", id: s.net });
          }}
        />
      ))}
      {vias.length > 0 && (
        <instancedMesh
          key={vias.length}
          ref={instances}
          args={[barrel, material, vias.length]}
          frustumCulled={false}
          onClick={(e) => {
            if (e.instanceId !== undefined) {
              e.stopPropagation();
              onSelect({ kind: "net", id: vias[e.instanceId].net });
            }
          }}
        />
      )}
    </group>
  );
}
