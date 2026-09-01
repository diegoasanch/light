import * as THREE from "three";

/**
 * Bake a copper layer into a tangent-space normal map for the solder mask.
 *
 * Real solder mask is sprayed over the copper, so its surface rises ~35µm
 * wherever a trace runs underneath. Displacing the mask sheet for real would
 * need sub-0.1mm tessellation (millions of vertices), and a live SDF shader
 * would pay per pixel per frame. Instead the copper geometry is rendered
 * top-down into a heightfield once, blurred (mask slumps over edges rather
 * than stepping), and turned into a normal map the standard material samples.
 * Everything here runs once per bake (at load, or when the mask-depth params
 * change); the per-frame cost is only the mask material's normal-map lookups.
 */

const MAX_TEXTURE_DIM = 1024;

export interface CopperBakeParams {
  /**
   * Slope exaggeration — real 35µm ridges would be invisible at board scale.
   * 0 renders a flat mask.
   */
  strength: number;
  /**
   * Gaussian σ (in texels) of the 7-tap slump blur: how much the mask's own
   * body rounds the copper step instead of following it exactly.
   */
  blurSigma: number;
}

/**
 * One-sided weights of a normalized 7-tap Gaussian: w[i] ∝ exp(-i²/2σ²),
 * scaled so w[0] + 2·(w[1] + w[2] + w[3]) = 1.
 */
function gaussianWeights(sigma: number): number[] {
  const s = Math.max(sigma, 1e-3);
  const raw = [0, 1, 2, 3].map((i) => Math.exp(-(i * i) / (2 * s * s)));
  const norm = raw[0] + 2 * (raw[1] + raw[2] + raw[3]);
  return raw.map((w) => w / norm);
}

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D src;
  uniform vec2 dir;
  uniform float weights[4];
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(src, vUv).rgb * weights[0];
    for (int i = 1; i < 4; i++) {
      c += texture2D(src, vUv + dir * float(i)).rgb * weights[i];
      c += texture2D(src, vUv - dir * float(i)).rgb * weights[i];
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

const NORMAL_FRAG = /* glsl */ `
  uniform sampler2D src;
  uniform vec2 texel;
  uniform float strength;
  varying vec2 vUv;
  void main() {
    float hl = texture2D(src, vUv - vec2(texel.x, 0.0)).r;
    float hr = texture2D(src, vUv + vec2(texel.x, 0.0)).r;
    float hd = texture2D(src, vUv - vec2(0.0, texel.y)).r;
    float hu = texture2D(src, vUv + vec2(0.0, texel.y)).r;
    vec3 n = normalize(vec3((hl - hr) * strength, (hd - hu) * strength, 1.0));
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }
`;

export interface CopperBake {
  texture: THREE.Texture;
  dispose(): void;
}

export function bakeCopperNormalMap(
  gl: THREE.WebGLRenderer,
  geometries: THREE.BufferGeometry[],
  boardW: number,
  boardH: number,
  params: CopperBakeParams,
): CopperBake {
  const aspect = boardW / boardH;
  const texW = Math.round(aspect >= 1 ? MAX_TEXTURE_DIM : MAX_TEXTURE_DIM * aspect);
  const texH = Math.round(aspect >= 1 ? MAX_TEXTURE_DIM / aspect : MAX_TEXTURE_DIM);

  const height = new THREE.WebGLRenderTarget(texW, texH, { depthBuffer: false });
  const pong = new THREE.WebGLRenderTarget(texW, texH, { depthBuffer: false });
  const normal = new THREE.WebGLRenderTarget(texW, texH, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  normal.texture.anisotropy = gl.capabilities.getMaxAnisotropy();

  // 1. Copper silhouette: white geometry on black, orthographic top-down.
  const bakeScene = new THREE.Scene();
  bakeScene.background = new THREE.Color(0x000000);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  for (const g of geometries) bakeScene.add(new THREE.Mesh(g, white));
  const camera = new THREE.OrthographicCamera(
    -boardW / 2, boardW / 2, boardH / 2, -boardH / 2, 0.1, 200,
  );
  camera.position.set(0, 100, 0);
  camera.up.set(0, 0, -1); // screen-up = −z ⇒ uv = (x/w + ½, ½ − z/h); see remapUvsToBoardPlane
  camera.lookAt(0, 0, 0);

  const prevTarget = gl.getRenderTarget();
  gl.setRenderTarget(height);
  gl.render(bakeScene, camera);

  // 2. Separable blur (the slump), then height → tangent-space normal.
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const pass = (mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(quadGeo, mat));
    gl.setRenderTarget(target);
    gl.render(scene, quadCam);
  };
  const blur = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: BLUR_FRAG,
    uniforms: {
      src: { value: height.texture },
      dir: { value: new THREE.Vector2(1 / texW, 0) },
      weights: { value: gaussianWeights(params.blurSigma) },
    },
  });
  pass(blur, pong);
  blur.uniforms.src.value = pong.texture;
  blur.uniforms.dir.value = new THREE.Vector2(0, 1 / texH);
  pass(blur, height);
  const toNormal = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: NORMAL_FRAG,
    uniforms: {
      src: { value: height.texture },
      texel: { value: new THREE.Vector2(1 / texW, 1 / texH) },
      strength: { value: params.strength },
    },
  });
  pass(toNormal, normal);
  gl.setRenderTarget(prevTarget);

  white.dispose();
  blur.dispose();
  toNormal.dispose();
  quadGeo.dispose();
  height.dispose();
  pong.dispose();

  return { texture: normal.texture, dispose: () => normal.dispose() };
}
