"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Line, LineBasicMaterial, Mesh, PlaneGeometry,
  ShaderMaterial, SphereGeometry, Vector3,
} from "three";
import { exoPlane, exoPlanetPosition, exoRadiusKm, exoSemiMajorAU } from "@/lib/exo";
import { catalog, exo, starPhysics, starPosition } from "@/lib/stars";
import { useApp } from "@/lib/store";
import { clock } from "@/lib/time";
import { AU, KM, R_SUN_KM } from "@/lib/units";
import { createPlanetMaterial, createStarMaterial } from "./materials";
import { GLOW_FRAG, GLOW_VERT, shared } from "./shared";
import { smooth } from "./SolarSystem";
import { STAR_NEAR_FADE } from "./StarField";

const SPHERE = new SphereGeometry(1, 64, 48);
const QUAD = new PlaneGeometry(2, 2);
const tmp = new Vector3();

/** 3D star + its known exoplanets, rendered only for the star being visited. */
export function FocusedStar() {
  const focus = useApp((s) => s.focus);
  const metaReady = useApp((s) => s.metaReady);
  const index = useMemo(() => {
    const m = /^(?:star|exo):(\d+)/.exec(focus);
    return m ? +m[1] : -1;
  }, [focus]);
  if (index <= 0 || !catalog) return null;
  return <StarSystem key={`${index}:${metaReady}`} index={index} />;
}

function hotColor(teq: number | null, rEarth: number | null): string {
  if ((rEarth ?? 1) > 6) return teq && teq > 1000 ? "#e0a070" : "#d8c3a0";
  if (!teq) return "#8aa0b8";
  if (teq > 1000) return "#d86a3a";
  if (teq > 400) return "#c89070";
  if (teq > 200) return "#5f8fc0";
  return "#a8c4dc";
}

function StarSystem({ index }: { index: number }) {
  const mesh = useRef<Mesh>(null);
  const glow = useRef<Mesh>(null);
  const phys = useMemo(() => starPhysics(index), [index]);
  const R = phys.radius * R_SUN_KM * KM;
  const pos = useMemo(() => starPosition(index), [index]);
  const color = useMemo(() => new Color(catalog!.color[index * 3], catalog!.color[index * 3 + 1], catalog!.color[index * 3 + 2]), [index]);
  const mat = useMemo(() => createStarMaterial(color.clone().convertSRGBToLinear()), [color]);
  const glowMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: { uSize: { value: 1 }, uColor: { value: color }, uOpacity: { value: 1 }, uCore: { value: 0.1 }, uHollow: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [color],
  );

  const planets = useMemo(() => {
    const sys = exo?.[index];
    if (!sys) return [];
    const { u, v } = exoPlane(index);
    return sys.planets.flatMap((p, k) => {
      const a = exoSemiMajorAU(index, p);
      if (!a) return [];
      const radius = exoRadiusKm(p) * KM;
      const pts = new Float32Array(257 * 3);
      for (let i = 0; i <= 256; i++) {
        const t = (i / 256) * Math.PI * 2;
        tmp.set(0, 0, 0).addScaledVector(u, Math.cos(t) * a * AU).addScaledVector(v, Math.sin(t) * a * AU);
        pts.set([tmp.x, tmp.y, tmp.z], i * 3);
      }
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(pts, 3));
      const line = new Line(geo, new LineBasicMaterial({ color: "#7fb0ff", transparent: true, opacity: 0.4, depthWrite: false }));
      line.frustumCulled = false;
      line.position.copy(pos); // local vertices keep float32 precision far from the origin
      const pmat = createPlanetMaterial({ color: hotColor(p.teq, p.r), atmosphere: { color: "#9cc4ff", strength: 0.4 } });
      return [{ k, radius, line, mat: pmat, a: a * AU }];
    });
  }, [index, pos]);
  const planetMeshes = useRef<(Mesh | null)[]>([]);

  useEffect(
    () => () => {
      mat.dispose();
      glowMat.dispose();
      for (const p of planets) {
        p.line.geometry.dispose();
        (p.line.material as LineBasicMaterial).dispose();
        p.mat.dispose();
      }
    },
    [mat, glowMat, planets],
  );

  useFrame(({ camera }) => {
    const d = camera.position.distanceTo(pos);
    const m = mesh.current!;
    m.visible = (R * shared.uPxScale.value) / d > 0.4;
    mat.uniforms.uTime.value = shared.uTime.value;
    const worldPerPx = d / shared.uPxScale.value;
    const size = Math.max(R * 4, worldPerPx * 60 * shared.uDpr.value);
    glowMat.uniforms.uSize.value = size;
    glowMat.uniforms.uCore.value = Math.min(0.95, R / size);
    glowMat.uniforms.uHollow.value = smooth(2, 6, (R * shared.uPxScale.value) / d);
    glowMat.uniforms.uOpacity.value = 1 - smooth(STAR_NEAR_FADE[0], STAR_NEAR_FADE[1], d);
    glow.current!.visible = glowMat.uniforms.uOpacity.value > 0.01;

    const showOrbits = useApp.getState().orbits;
    planets.forEach((p, i) => {
      const pm = planetMeshes.current[i];
      if (!pm) return;
      exoPlanetPosition(index, p.k, clock.jd, pm.position);
      p.mat.uniforms.uSunDir.value.subVectors(pos, pm.position).normalize();
      pm.visible = (p.radius * shared.uPxScale.value) / camera.position.distanceTo(pm.position) > 0.3;
      const lm = p.line.material as LineBasicMaterial;
      lm.opacity = showOrbits ? 0.4 * smooth(12, 50, (p.a * shared.uPxScale.value) / Math.max(d, p.a * 0.05)) : 0;
      p.line.visible = lm.opacity > 0.01;
    });
  });

  return (
    <group>
      <mesh ref={mesh} geometry={SPHERE} material={mat} position={pos} scale={R} />
      <mesh ref={glow} geometry={QUAD} material={glowMat} position={pos} frustumCulled={false} renderOrder={6} />
      {planets.map((p, i) => (
        <group key={p.k}>
          <primitive object={p.line} />
          <mesh ref={(el) => { planetMeshes.current[i] = el; }} geometry={SPHERE} material={p.mat} scale={p.radius} />
        </group>
      ))}
    </group>
  );
}
