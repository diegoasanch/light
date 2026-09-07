/** Preserve reference designators while merging CAD faces within each component. */
import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { dedup, join, prune, weld } from "@gltf-transform/functions";
export async function optimizeGlb(path: string, _midY: number) {
  const io = new NodeIO();
  const doc = await io.readBinary(new Uint8Array(readFileSync(path)));

  await doc.transform(join({ keepMeshes: true }), weld(), dedup(), prune());
  await io.write(path, doc);
  return new Set(
    doc
      .getRoot()
      .listNodes()
      .map((n) => n.getName()),
  );
}
