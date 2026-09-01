import * as THREE from "three";

import { PALETTE } from "./palette";

export { PALETTE };

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
  // One mask material per side: each gets its own copper normal map baked at
  // load (see copper-bump.ts) so the sheet reads as draped over the traces.
  const maskParams: THREE.MeshPhysicalMaterialParameters = {
    color: PALETTE.maskBlue,
    metalness: 0,
    roughness: 0.34,
    clearcoat: 0.55,
    clearcoatRoughness: 0.3,
    transparent: true,
    opacity: 0.92,
    // Kept low: the studio env otherwise washes the deep fab blue out to
    // periwinkle — gloss comes from the clearcoat lobe instead.
    envMapIntensity: 0.35,
  };
  const maskF = new THREE.MeshPhysicalMaterial(maskParams);
  const maskB = new THREE.MeshPhysicalMaterial(maskParams);
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
  return { goldExposed, copperCovered, copperInner, maskF, maskB, silk, core, prepreg, barrel };
}

export type PcbMaterials = ReturnType<typeof createMaterials>;
