import { Color, DoubleSide, ShaderMaterial, Vector3, type Texture } from "three";

// Lit-by-the-Sun planet shader. Lighting is computed from a world-space sun
// direction uniform, so no three.js lights are needed and precision is kept
// even for Earth-sized bodies tens of AU from the origin.

const PLANET_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const PLANET_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uColor;
  uniform sampler2D uMap;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform float uHasMap;
  uniform float uHasNight;
  uniform float uHasClouds;
  uniform float uCloudShift;
  uniform vec3 uAtmoColor;
  uniform float uAtmo;
  uniform float uAmbient;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vec3 n = normalize(vNormalW);
    float ndl = dot(n, uSunDir);
    float lit = pow(clamp((ndl + 0.05) / 1.05, 0.0, 1.0), 1.15);
    float day = smoothstep(-0.12, 0.2, ndl);
    vec3 V0 = normalize(-vViewPos);
    float mu = max(dot(normalize(vNormalV), V0), 0.0);
    vec3 base = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : uColor;
    vec3 col = base * (lit + uAmbient) * (0.62 + 0.38 * sqrt(mu));
    float cloud = 0.0;
    if (uHasClouds > 0.5) {
      cloud = texture2D(uClouds, vUv + vec2(uCloudShift, 0.0)).r;
      col = mix(col, vec3(lit * 1.1 + uAmbient), cloud * 0.85);
    }
    if (uHasNight > 0.5) {
      vec3 lights = texture2D(uNight, vUv).rgb;
      col += lights * lights * (1.0 - day) * (1.0 - cloud) * 2.2;
    }
    vec3 V = normalize(-vViewPos);
    float fres = pow(1.0 - max(dot(normalize(vNormalV), V), 0.0), 2.5);
    col += uAtmoColor * fres * uAtmo * smoothstep(-0.35, 0.5, ndl) * 0.9;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface PlanetMaterialOptions {
  color: string;
  atmosphere?: { color: string; strength: number };
  ambient?: number;
}

export function createPlanetMaterial(opts: PlanetMaterialOptions) {
  return new ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    uniforms: {
      uSunDir: { value: new Vector3(1, 0, 0) },
      uColor: { value: new Color(opts.color).convertSRGBToLinear() },
      uMap: { value: null },
      uNight: { value: null },
      uClouds: { value: null },
      uHasMap: { value: 0 },
      uHasNight: { value: 0 },
      uHasClouds: { value: 0 },
      uCloudShift: { value: 0 },
      uAtmoColor: { value: new Color(opts.atmosphere?.color ?? "#000000").convertSRGBToLinear() },
      uAtmo: { value: opts.atmosphere?.strength ?? 0 },
      uAmbient: { value: opts.ambient ?? 0.025 },
    },
  });
}

export function setMaterialTexture(mat: ShaderMaterial, slot: "uMap" | "uNight" | "uClouds", tex: Texture) {
  mat.uniforms[slot].value = tex;
  const flag = slot === "uMap" ? "uHasMap" : slot === "uNight" ? "uHasNight" : "uHasClouds";
  mat.uniforms[flag].value = 1;
}

// --- Sun ------------------------------------------------------------------
export function createSunMaterial() {
  return new ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uHasMap;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      void main() {
        vec3 V = normalize(-vViewPos);
        float mu = max(dot(normalize(vNormalV), V), 0.0);
        float limb = 0.35 + 0.65 * pow(mu, 0.55); // limb darkening
        vec2 uv = vUv + vec2(uTime * 0.0004, 0.0);
        vec3 tex = uHasMap > 0.5 ? texture2D(uMap, uv).rgb : vec3(1.0, 0.75, 0.35);
        float flicker = 0.92 + 0.08 * sin(uTime * 0.7 + vUv.x * 40.0) * sin(uTime * 0.5 + vUv.y * 30.0);
        vec3 col = tex * vec3(1.6, 1.25, 0.9) * limb * flicker + vec3(1.0, 0.55, 0.2) * pow(1.0 - mu, 3.0) * 0.6;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    uniforms: { uMap: { value: null }, uHasMap: { value: 0 }, uTime: { value: 0 } },
  });
}

// --- generic star surface (focused stars) ------------------------------------
export function createStarMaterial(color: Color) {
  return new ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec3 V = normalize(-vViewPos);
        float mu = max(dot(normalize(vNormalV), V), 0.0);
        float limb = 0.3 + 0.7 * pow(mu, 0.6);
        vec2 p = vUv * vec2(60.0, 30.0);
        float g = noise(p + uTime * 0.05) * 0.5 + noise(p * 2.3 - uTime * 0.08) * 0.3 + noise(p * 5.1) * 0.2;
        float l = dot(uColor, vec3(0.299, 0.587, 0.114));
        vec3 tint = clamp(mix(vec3(l), uColor, 1.6), 0.0, 1.0); // boost saturation
        vec3 col = mix(tint, vec3(1.0), 0.18 * mu) * limb * (0.72 + 0.45 * g);
        gl_FragColor = vec4(col * 1.05, 1.0);
        #include <colorspace_fragment>
      }
    `,
    uniforms: { uColor: { value: color }, uTime: { value: 0 } },
  });
}

// --- Saturn's rings, with the planet's shadow ---------------------------------
export function createRingMaterial(innerFrac: number) {
  return new ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vNormalW;
      void main() {
        vLocal = position;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uHasMap;
      uniform vec3 uSunDir;      // world
      uniform vec3 uSunDirLocal; // ring/planet local, planet radius = 1
      uniform float uInner;
      uniform float uOuterScale;
      varying vec3 vLocal;
      varying vec3 vNormalW;
      void main() {
        float r = length(vLocal.xz);
        float u = (r - uInner) / (1.0 - uInner);
        vec4 tex = uHasMap > 0.5 ? texture2D(uMap, vec2(u, 0.5)) : vec4(0.85, 0.78, 0.65, 0.6 * step(0.0, u) * step(u, 1.0));
        // planet shadow (planet is a unit sphere in this space; rings scaled by outer radius)
        vec3 p = vLocal * uOuterScale;
        float along = dot(p, uSunDirLocal);
        float perp = length(p - along * uSunDirLocal);
        float shadow = (along < 0.0 && perp < 1.0) ? 0.08 : 1.0;
        float lit = 0.35 + 0.65 * abs(dot(normalize(vNormalW), uSunDir));
        gl_FragColor = vec4(tex.rgb * lit * shadow, tex.a);
        #include <colorspace_fragment>
      }
    `,
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uSunDir: { value: new Vector3() },
      uSunDirLocal: { value: new Vector3() },
      uInner: { value: innerFrac },
      uOuterScale: { value: 1 },
    },
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
  });
}
