"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, SubtractiveBlending } from "three";
import { R0 } from "@/data/galaxy";
import { buildGalaxy, type ParticleLayer } from "@/lib/galaxyModel";
import { CULL_BEHIND, shared } from "./shared";

const VERT = /* glsl */ `
  uniform float uPxScale;
  uniform float uDpr;
  uniform float uMinPx;
  uniform float uMaxPx;
  uniform float uGain;
  uniform float uGainScale;
  uniform vec2 uNearFade;
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    ${CULL_BEHIND}
    float d = -mv.z;
    float px = aSize * uPxScale / d;
    float minPx = uMinPx * uDpr;
    // energy-conserving: sub-pixel particles shrink in alpha, not size
    float a = uGain * uGainScale * min(1.0, (px * px) / (minPx * minPx));
    a *= smoothstep(uNearFade.x, uNearFade.y, d);
    if (a < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    gl_PointSize = clamp(px, minPx, uMaxPx * uDpr);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAlpha = a;
  }
`;

const FRAG_STAR = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    float f = exp(-r2 * 4.5);
    gl_FragColor = vec4(vColor * f * vAlpha, 1.0);
  }
`;

const FRAG_SOFT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    float f = exp(-r2 * 3.2) * (1.0 - r2);
    gl_FragColor = vec4(vColor * f * vAlpha, 1.0);
  }
`;

function geometryFor(layer: ParticleLayer) {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(layer.position, 3));
  g.setAttribute("aColor", new BufferAttribute(layer.color, 3));
  g.setAttribute("aSize", new BufferAttribute(layer.size, 1));
  g.computeBoundingSphere();
  return g;
}

function material(frag: string, opts: { minPx: number; maxPx: number; gain: number; near: [number, number]; dust?: boolean }) {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: frag,
    uniforms: {
      uPxScale: shared.uPxScale,
      uDpr: shared.uDpr,
      uMinPx: { value: opts.minPx },
      uMaxPx: { value: opts.maxPx },
      uGain: { value: opts.gain },
      uGainScale: { value: 1 },
      uNearFade: { value: opts.near },
    },
    transparent: true,
    depthWrite: false,
    blending: opts.dust ? SubtractiveBlending : AdditiveBlending,
    premultipliedAlpha: !!opts.dust, // dust darkens: dst *= (1 - src)
  });
}

export function Galaxy({ quality }: { quality: number }) {
  const parts = useMemo(() => {
    const g = buildGalaxy(quality);
    return {
      stars: { geo: geometryFor(g.stars), mat: material(FRAG_STAR, { minPx: 1.6, maxPx: 3, gain: 0.9, near: [40, 400] }) },
      haze: { geo: geometryFor(g.haze), mat: material(FRAG_SOFT, { minPx: 2, maxPx: 180, gain: 0.07, near: [300, 2500] }) },
      dust: { geo: geometryFor(g.dust), mat: material(FRAG_SOFT, { minPx: 2, maxPx: 160, gain: 0.32, near: [300, 2000], dust: true }) },
    };
  }, [quality]);

  useEffect(
    () => () => {
      for (const p of Object.values(parts)) {
        p.geo.dispose();
        p.mat.dispose();
      }
    },
    [parts],
  );

  // keep the point clamp in sync with the GPU limit
  useFrame(({ camera }) => {
    // seen from inside the disk the whole galaxy piles up along the line of sight
    const p = camera.position;
    const st = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const inside = (1 - st(2000, 25_000, Math.abs(p.y))) * (1 - st(45_000, 70_000, Math.hypot(p.x - R0, p.z)));
    parts.stars.mat.uniforms.uGainScale.value = 1 - 0.8 * inside;
    parts.haze.mat.uniforms.uGainScale.value = 1 - 0.6 * inside;
    parts.dust.mat.uniforms.uGainScale.value = 1 - 0.3 * inside;
    const max = shared.uMaxPoint.value;
    parts.haze.mat.uniforms.uMaxPx.value = Math.min(180, max);
    parts.dust.mat.uniforms.uMaxPx.value = Math.min(160, max);
  });

  return (
    <group>
      <points geometry={parts.haze.geo} material={parts.haze.mat} frustumCulled={false} renderOrder={1} />
      <points geometry={parts.stars.geo} material={parts.stars.mat} frustumCulled={false} renderOrder={2} />
      <points geometry={parts.dust.geo} material={parts.dust.mat} frustumCulled={false} renderOrder={3} />
    </group>
  );
}
