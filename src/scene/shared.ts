import { RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from "three";

/** Uniform objects shared by reference across materials; updated once per frame by CameraRig. */
export const shared = {
  /** pixels per (world unit at distance 1): drawingBufferHeight / (2·tan(fov/2)) */
  uPxScale: { value: 800 },
  uDpr: { value: 1 },
  uMaxPoint: { value: 256 },
  uTime: { value: 0 },
};

const loader = new TextureLoader();
const cache = new Map<string, Promise<Texture>>();

/** Loads /textures/<name>.webp once and caches it. */
export function loadTexture(name: string, maxAnisotropy = 8): Promise<Texture> {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(`/textures/${name}.webp`).then((t) => {
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = maxAnisotropy;
      t.wrapS = RepeatWrapping;
      return t;
    });
    cache.set(name, p);
  }
  return p;
}

/** Vertex snippet that sends points behind the camera off-screen. */
export const CULL_BEHIND = /* glsl */ `
  if (mv.z >= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
`;

/** Billboard glow: quad of `uSize` world units centred on the object origin. */
export const GLOW_VERT = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = uv * 2.0 - 1.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

export const GLOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uCore; // core radius in quad units (0..1)
  uniform float uHollow; // 1 = the body itself is drawn; only render outside it
  varying vec2 vUv;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float core = smoothstep(uCore * 1.15, uCore * 0.85, r);
    float halo = exp(-r * 5.0) * 0.9 + exp(-r * 14.0) * 0.6;
    float rays = pow(max(0.0, 1.0 - abs(vUv.x * vUv.y) * 60.0), 6.0) * (1.0 - r) * 0.35;
    float a = max(core, halo + rays) * uOpacity * (1.0 - smoothstep(0.85, 1.0, r));
    a *= mix(1.0, smoothstep(uCore * 0.92, uCore * 1.04, r), uHollow);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), clamp(core + halo * 0.4, 0.0, 1.0)) * a, 1.0);
  }
`;
