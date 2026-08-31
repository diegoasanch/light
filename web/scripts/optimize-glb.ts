/**
 * Optimize the kicad-cli component GLB for the viewer.
 *
 *   pnpm tsx scripts/optimize-glb.ts            # rewrites public/pcb/components.glb
 *
 * kicad-cli exports OpenCASCADE tessellation as one primitive per CAD face —
 * ~8,000 draw calls averaging a few triangles each, which is CPU-bound draw
 * overhead on any device. The viewer only ever needs two draw units (top-side
 * and bottom-side components, so the exploded view can carry each side away
 * separately), so this pass:
 *
 *   1. classifies every component node by bounding-box center against the
 *      board mid-plane (same rule PcbModel uses at runtime),
 *   2. flattens + joins each side's primitives per material,
 *   3. welds duplicate vertices and prunes unused data,
 *   4. re-wraps the result as scene → [top, bottom] nodes.
 *
 * The runtime keeps working unchanged: it still just classifies the scene's
 * children by bbox center — there are simply 2 of them now instead of ~150.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Document, getBounds, NodeIO } from "@gltf-transform/core";
import { dedup, flatten, join as joinPrims, mergeDocuments, prune, weld } from "@gltf-transform/functions";

/** Keep only one side's component nodes, then collapse it to few primitives. */
async function sideDoc(
  io: NodeIO,
  glb: Uint8Array,
  midY: number,
  keepBottom: boolean,
): Promise<Document> {
  const doc = await io.readBinary(glb);
  const scene = doc.getRoot().listScenes()[0];
  // Unwrap the exporter's bare identity wrapper chain to the refdes level.
  let level = scene.listChildren();
  while (level.length === 1 && level[0].listChildren().length > 0 && !level[0].getMesh()) {
    level = level[0].listChildren();
  }
  for (const node of level) {
    const b = getBounds(node);
    const centerY = (b.min[1] + b.max[1]) / 2;
    if (centerY < midY !== keepBottom) node.dispose();
  }
  await doc.transform(flatten(), joinPrims({ keepNamed: false }), weld(), dedup(), prune());
  return doc;
}

export async function optimizeGlb(glbPath: string, midYMeters: number): Promise<void> {
  const io = new NodeIO();
  const raw = new Uint8Array(readFileSync(glbPath));

  const doc = await sideDoc(io, raw, midYMeters, false);
  const bottomDoc = await sideDoc(io, raw, midYMeters, true);
  mergeDocuments(doc, bottomDoc);

  // Re-wrap both sides under named nodes in a single scene.
  const root = doc.getRoot();
  const [sceneTop, sceneBottom] = root.listScenes();
  for (const [name, scene] of [
    ["top", sceneTop],
    ["bottom", sceneBottom],
  ] as const) {
    const wrapper = doc.createNode(name);
    for (const child of scene.listChildren()) wrapper.addChild(child);
    sceneTop.addChild(wrapper);
  }
  sceneBottom.dispose();
  await doc.transform(dedup(), prune());

  const before = raw.byteLength;
  const out = await io.writeBinary(doc);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(glbPath, out);

  let prims = 0;
  for (const mesh of root.listMeshes()) prims += mesh.listPrimitives().length;
  console.log(
    `  optimized: ${(before / 1e6).toFixed(2)} MB → ${(out.byteLength / 1e6).toFixed(2)} MB, ${prims} draw calls`,
  );
}

// CLI: optimize the committed GLB in place, mid-plane from board.json.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const board = JSON.parse(readFileSync(join(webDir, "public", "pcb", "board.json"), "utf8"));
  const midY = board.meta.boardThickness / 2 / 1000; // GLB is in meters
  optimizeGlb(join(webDir, "public", "pcb", "components.glb"), midY).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
