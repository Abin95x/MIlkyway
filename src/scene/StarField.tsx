"use client";

import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from "three";
import type { StarCatalog } from "@/lib/stars";
import { CULL_BEHIND, shared } from "./shared";

// Real stars (HYG catalogue). Brightness is physically based: every frame the
// shader recomputes each star's apparent magnitude from the camera position,
// so stars brighten as you fly towards them and the Sun becomes a faint dot
// when seen from Alpha Centauri.

export const STAR_LIMIT_MAG = 6.8;
/** distance (ly) below which a star's point sprite fades out (the 3D body takes over) */
export const STAR_NEAR_FADE: [number, number] = [0.0003, 0.003];

const VERT = /* glsl */ `
  uniform float uDpr;
  uniform float uLimitMag;
  uniform vec2 uNearFade;
  attribute float aAbsMag;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vCore;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    ${CULL_BEHIND}
    float d = length(mv.xyz);
    float m = aAbsMag + 5.0 * log2(d / 32.6156) * 0.30103;
    float flux = exp2(-1.3287712 * (m - uLimitMag));
    float a = clamp(flux, 0.0, 1.0) * smoothstep(uNearFade.x, uNearFade.y, d);
    if (a < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    float size = clamp(2.2 * pow(flux, 0.22), 2.0, 72.0) * uDpr;
    gl_PointSize = size;
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAlpha = a;
    vCore = 2.4 * uDpr / size; // fraction of the sprite that is the stellar disc
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vCore;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r = length(c);
    if (r > 1.0) discard;
    float core = exp(-pow(r / vCore, 2.0) * 1.6);
    float glow = exp(-r * 6.0) * 0.55 + exp(-r * 2.5) * 0.12;
    float f = max(core, glow) * (1.0 - r * r);
    vec3 col = mix(vColor, vec3(1.0), core * 0.55);
    gl_FragColor = vec4(col * f * vAlpha, 1.0);
  }
`;

export function StarField({ catalog }: { catalog: StarCatalog }) {
  const { geo, mat } = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(catalog.pos, 3));
    geo.setAttribute("aAbsMag", new BufferAttribute(catalog.absMag, 1));
    geo.setAttribute("aColor", new BufferAttribute(catalog.color, 3));
    const mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uDpr: shared.uDpr,
        uLimitMag: { value: STAR_LIMIT_MAG },
        uNearFade: { value: STAR_NEAR_FADE },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { geo, mat };
  }, [catalog]);

  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={4} />;
}
