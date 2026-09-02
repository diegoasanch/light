/**
 * Sync the KiCad board into the web viewer's data files.
 *
 *   pnpm sync-pcb
 *
 * Produces:
 *   public/pcb/board.json      — all board geometry (see scripts/extract_board.py)
 *   public/pcb/components.glb  — component 3D models placed on the board
 *
 * Both artifacts are built in a temp directory and validated before they
 * replace the committed files, so a failed sync never leaves broken outputs.
 *
 * Requires a local KiCad install (kicad-cli + its bundled Python with pcbnew).
 * Override autodetected paths with env vars KICAD_CLI / KICAD_PYTHON /
 * KICAD_3DMODEL_DIR if KiCad lives somewhere unusual.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { optimizeGlb } from "./optimize-glb";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = resolve(webDir, "..");
const boardPath = join(repoDir, "kicad", "light.kicad_pcb");
const outDir = join(webDir, "public", "pcb");

const KICAD_APP = "/Applications/KiCad/KiCad.app/Contents";
const kicadCli = process.env.KICAD_CLI ?? `${KICAD_APP}/MacOS/kicad-cli`;
const kicadPython =
  process.env.KICAD_PYTHON ??
  `${KICAD_APP}/Frameworks/Python.framework/Versions/Current/bin/python3`;
const stockModelDir =
  process.env.KICAD_3DMODEL_DIR ?? `${KICAD_APP}/SharedSupport/3dmodels`;

/** Run a command; returns stdout+stderr combined (kicad-cli warns on stderr). */
function run(cmd: string, args: string[]): string {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`${cmd} exited ${res.status}:\n${res.stdout}\n${res.stderr}`);
  }
  return `${res.stdout}\n${res.stderr}`;
}

for (const [name, path] of [
  ["board", boardPath],
  ["kicad-cli", kicadCli],
  ["KiCad python", kicadPython],
  ["KiCad 3D model dir", stockModelDir],
] as const) {
  if (!existsSync(path)) {
    console.error(`✗ ${name} not found at ${path}`);
    process.exit(1);
  }
}
mkdirSync(outDir, { recursive: true });

const tmp = mkdtempSync(join(tmpdir(), "light-pcb-"));
let failure: string | null = null;

try {
  await sync();
} catch (e) {
  failure = e instanceof Error ? e.message : String(e);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
if (failure) {
  console.error(`✗ ${failure}`);
  process.exit(1);
}

async function sync() {
  // -------------------------------------------------------------- board.json
  console.log("→ extracting board geometry (pcbnew)…");
  const tmpJson = join(tmp, "board.json");
  const res = spawnSync(
    kicadPython,
    [join(webDir, "scripts", "extract_board.py"), boardPath, tmpJson],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    const stderr = (res.stderr ?? "")
      .split("\n")
      .filter((l) => !l.includes("Fontconfig") && !l.includes("wxApp"))
      .join("\n");
    throw new Error(`geometry extraction failed:\n${res.stdout}\n${stderr}`);
  }
  process.stdout.write(res.stdout.replace(/^/gm, "  "));

  const board = JSON.parse(readFileSync(tmpJson, "utf8"));
  const emptyLayers = Object.entries(board.copper)
    .filter(([, v]) => (v as { covered: unknown[] }).covered.length === 0)
    .map(([k]) => k);
  if (emptyLayers.length > 0) {
    throw new Error(`copper layers came out empty: ${emptyLayers.join(", ")}`);
  }

  // ---------------------------------------------------------- components.glb
  // kicad-cli's GLB exporter does not resolve legacy 3D-model path variables
  // (${KICAD9_3DMODEL_DIR}) and only imports STEP/IGES, so rewrite every model
  // reference to a resolved absolute .step path in a temp copy of the board
  // and export from that.
  console.log("→ exporting components.glb (kicad-cli)…");
  const vars: Record<string, string> = {
    KIPRJMOD: join(repoDir, "kicad"),
  };
  for (const legacy of ["KICAD6", "KICAD7", "KICAD8", "KICAD9", "KICAD10"]) {
    vars[`${legacy}_3DMODEL_DIR`] = stockModelDir;
  }

  const unresolved: string[] = [];
  const rewritten = readFileSync(boardPath, "utf8").replace(
    /\(model "([^"]+)"/g,
    (whole, path: string) => {
      let p = path.replace(/\$\{([A-Za-z0-9_]+)\}/g, (m, name: string) => vars[name] ?? m);
      if (p.includes("${")) {
        unresolved.push(`unknown path variable in ${path}`);
        return whole;
      }
      const step = p.replace(/\.wrl$/i, ".step");
      if (step !== p && existsSync(step)) {
        p = step;
      } else if (!existsSync(p)) {
        unresolved.push(`model file missing: ${p}`);
        return whole;
      }
      return `(model "${p}"`;
    },
  );
  if (unresolved.length > 0) {
    throw new Error(`model path resolution failed:\n  ${unresolved.join("\n  ")}`);
  }

  const tmpBoard = join(tmp, "light.kicad_pcb");
  writeFileSync(tmpBoard, rewritten);
  // The project file keeps kicad-cli from complaining about a missing project.
  const prj = boardPath.replace(/\.kicad_pcb$/, ".kicad_pro");
  if (existsSync(prj)) copyFileSync(prj, join(tmp, "light.kicad_pro"));

  const tmpGlb = join(tmp, "components.glb");
  const glbLog = run(kicadCli, [
    "pcb",
    "export",
    "glb",
    "--no-board-body",
    "--subst-models",
    "--no-dnp",
    "--no-unspecified",
    "--user-origin",
    "0x0mm",
    "-f",
    "-o",
    tmpGlb,
    tmpBoard,
  ]);
  const missing = glbLog.split("\n").filter((l) => l.includes("Could not add"));
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} components have no 3D model in the export:\n  ${missing.join("\n  ")}`,
    );
  }

  // The raw export is one primitive per CAD face (~8k draw calls) — collapse
  // it to per-material primitives split into top/bottom sides.
  console.log("→ optimizing components.glb (gltf-transform)…");
  await optimizeGlb(tmpGlb, board.meta.boardThickness / 2 / 1000);

  // ------------------------------------------- validated → move into place
  copyFileSync(tmpJson, join(outDir, "board.json"));
  copyFileSync(tmpGlb, join(outDir, "components.glb"));

  const { bbox } = board;
  const w = (bbox.maxX - bbox.minX).toFixed(2);
  const h = (bbox.maxY - bbox.minY).toFixed(2);
  const glbMb = (statSync(join(outDir, "components.glb")).size / 1e6).toFixed(2);
  const jsonMb = (statSync(join(outDir, "board.json")).size / 1e6).toFixed(2);
  console.log(
    `✓ board.json  ${jsonMb} MB — ${w}×${h} mm, ${board.counts.footprints} footprints, ${board.counts.vias} vias`,
  );
  console.log(`✓ components.glb  ${glbMb} MB`);
}
