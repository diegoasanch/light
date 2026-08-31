import * as THREE from "three";

/**
 * Fab-matched palette: JLC blue mask over ENIG gold, white silk — tuned
 * against photos of the assembled rev-1 boards (see kicad/README.md).
 */
export const PALETTE = {
  maskBlue: "#0a4494",
  maskBlueDark: "#062f6b",
  goldEnig: "#cfa94f",
  copper: "#b06a36",
  silk: "#eef1f4",
  fr4Core: "#8e8163",
  fr4Prepreg: "#a4966f",
  barrel: "#b8933f",
} as const;

export function createMaterials() {
  const goldExposed = new THREE.MeshPhysicalMaterial({
    color: PALETTE.goldEnig,
    metalness: 1,
    roughness: 0.28,
    envMapIntensity: 1.35,
  });
  const copperCovered = new THREE.MeshPhysicalMaterial({
    color: PALETTE.copper,
    metalness: 1,
    roughness: 0.38,
    envMapIntensity: 1.15,
  });
  const copperInner = new THREE.MeshPhysicalMaterial({
    color: PALETTE.copper,
    metalness: 1,
    roughness: 0.45,
    envMapIntensity: 1.0,
  });
  const mask = new THREE.MeshPhysicalMaterial({
    color: PALETTE.maskBlue,
    metalness: 0.05,
    roughness: 0.32,
    clearcoat: 0.65,
    clearcoatRoughness: 0.25,
    transparent: true,
    opacity: 0.9,
    envMapIntensity: 0.8,
  });
  const silk = new THREE.MeshStandardMaterial({
    color: PALETTE.silk,
    metalness: 0,
    roughness: 0.62,
  });
  const core = new THREE.MeshStandardMaterial({
    color: PALETTE.fr4Core,
    metalness: 0,
    roughness: 0.88,
  });
  const prepreg = new THREE.MeshStandardMaterial({
    color: PALETTE.fr4Prepreg,
    metalness: 0,
    roughness: 0.85,
  });
  const barrel = new THREE.MeshPhysicalMaterial({
    color: PALETTE.barrel,
    metalness: 1,
    roughness: 0.38,
    side: THREE.DoubleSide,
    envMapIntensity: 0.9,
    // opacity is animated with the exploded view (see PcbModel's useFrame)
    transparent: true,
    opacity: 1,
  });
  return { goldExposed, copperCovered, copperInner, mask, silk, core, prepreg, barrel };
}

export type PcbMaterials = ReturnType<typeof createMaterials>;
