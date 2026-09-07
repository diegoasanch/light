/**
 * Turn board.json multipolygons into three.js geometry.
 *
 * Scene mapping (matches kicad-cli's GLB export, so components drop in):
 *   three.x = kicad_x − centerX
 *   three.z = kicad_y − centerY
 *   three.y = height in the board stack (up), 0 = bottom mask outer face
 *
 * Shapes are built in the XY plane as (kicad_x, kicad_y), extruded along +z,
 * then rotated +90° about X — which maps shape-y onto scene +z and the
 * extrusion onto −y. A mesh extruded with depth t and positioned at y = yTop
 * therefore spans [yTop − t, yTop].
 */
import * as THREE from "three";
import type { BoardData, MultiPolygon, Pair, Polygon } from "./pcb-types";

function ringToPoints(ring: Pair[], cx: number, cy: number): THREE.Vector2[] {
  return ring.map(([x, y]) => new THREE.Vector2(x - cx, y - cy));
}

function polygonToShape(poly: Polygon, cx: number, cy: number): THREE.Shape {
  const shape = new THREE.Shape(ringToPoints(poly[0], cx, cy));
  for (let i = 1; i < poly.length; i++) {
    const hole = new THREE.Path(ringToPoints(poly[i], cx, cy));
    shape.holes.push(hole);
  }
  return shape;
}

export function multiPolygonToShapes(
  mp: MultiPolygon,
  cx: number,
  cy: number,
): THREE.Shape[] {
  return mp.map((poly) => polygonToShape(poly, cx, cy));
}

/** Extrude a multipolygon into a single geometry spanning z ∈ [-depth, 0] after orientation. */
export function extrudeMultiPolygon(
  mp: MultiPolygon,
  depth: number,
  cx: number,
  cy: number,
): THREE.ExtrudeGeometry {
  const shapes = multiPolygonToShapes(mp, cx, cy);
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: false,
  });
  // Shape plane (kicad x/y) → scene x/z, extrusion → −y (see module docs).
  geo.rotateX(Math.PI / 2);
  geo.translate(0, depth, 0); // spans [0, depth] so position.y = slab bottom
  geo.computeVertexNormals();
  // No board material samples a texture by default — dropping the generated
  // UVs saves ~25% of the (large) extruded vertex data. Layers that do need
  // UVs get purpose-built ones via remapUvsToBoardPlane.
  geo.deleteAttribute("uv");
  return geo;
}

/**
 * Replace extrusion UVs (raw shape coords) with board-plane UVs so a texture
 * baked top-down over the full board bbox maps 1:1 onto the surface:
 * u runs along +x, v along −z, matching the bake camera in copper-bump.ts.
 */
export function remapUvsToBoardPlane(geo: THREE.BufferGeometry, w: number, h: number) {
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[2 * i] = pos.getX(i) / w + 0.5;
    uv[2 * i + 1] = 0.5 - pos.getZ(i) / h;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * The dielectric cross-section: board outline with every through-hole drill
 * (vias, PTH, NPTH, slots) as a hole. Shared by all dielectric slabs.
 */
export function dielectricShapes(data: BoardData, cx: number, cy: number): THREE.Shape[] {
  const shapes = multiPolygonToShapes(data.outline, cx, cy);
  const host = shapes[0]; // single-outline board; holes attach to the first shape
  for (const [x, y, , drill] of data.vias) {
    host.holes.push(circlePath(x - cx, y - cy, drill / 2));
  }
  for (const [x, y, d] of data.holes.round) {
    host.holes.push(circlePath(x - cx, y - cy, d / 2));
  }
  for (const slot of data.holes.slots) {
    host.holes.push(capsulePath(slot.a, slot.b, slot.width, cx, cy));
  }
  return shapes;
}

function circlePath(x: number, y: number, r: number): THREE.Path {
  const p = new THREE.Path();
  p.absarc(x, y, r, 0, Math.PI * 2, false);
  return p;
}

function capsulePath(a: Pair, b: Pair, width: number, cx: number, cy: number): THREE.Path {
  const r = width / 2;
  const ax = a[0] - cx;
  const ay = a[1] - cy;
  const bx = b[0] - cx;
  const by = b[1] - cy;
  const ang = Math.atan2(by - ay, bx - ax);
  const p = new THREE.Path();
  p.absarc(bx, by, r, ang - Math.PI / 2, ang + Math.PI / 2, false);
  p.absarc(ax, ay, r, ang + Math.PI / 2, ang + (3 * Math.PI) / 2, false);
  p.closePath();
  return p;
}

export function extrudeShapes(
  shapes: THREE.Shape[],
  depth: number,
): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, depth, 0);
  geo.computeVertexNormals();
  geo.deleteAttribute("uv"); // see extrudeMultiPolygon
  return geo;
}

/**
 * Via barrels as one instanced-friendly merged tube set is overkill — a
 * single open-ended cylinder rendered via InstancedMesh covers all vias.
 * Returns per-instance transforms; the caller owns the InstancedMesh.
 */
export interface BarrelInstance {
  x: number; // scene x
  z: number; // scene z
  radius: number;
}

export function viaBarrels(data: BoardData, cx: number, cy: number): BarrelInstance[] {
  const out: BarrelInstance[] = [];
  for (const [x, y, , drill] of data.vias) {
    out.push({ x: x - cx, z: y - cy, radius: drill / 2 });
  }
  for (const [x, y, d, plated] of data.holes.round) {
    if (plated) out.push({ x: x - cx, z: y - cy, radius: d / 2 });
  }
  return out;
}

const SLOT_WALL = 0.035; // plating wall thickness for slot barrels, mm

/**
 * Plated slot holes get their barrel walls as extruded rings (a capsule with
 * a slightly smaller capsule hole) — instanced cylinders can't represent
 * them. Returns null when the board has no plated slots.
 */
export function slotBarrelGeometry(
  data: BoardData,
  cx: number,
  cy: number,
  height: number,
): THREE.ExtrudeGeometry | null {
  const shapes: THREE.Shape[] = [];
  for (const slot of data.holes.slots) {
    if (!slot.plated || slot.width <= SLOT_WALL * 2) continue;
    const outer = capsulePath(slot.a, slot.b, slot.width, cx, cy);
    const shape = new THREE.Shape(outer.getPoints(24));
    shape.holes.push(capsulePath(slot.a, slot.b, slot.width - SLOT_WALL * 2, cx, cy));
    shapes.push(shape);
  }
  if (shapes.length === 0) return null;
  return extrudeShapes(shapes, height);
}
