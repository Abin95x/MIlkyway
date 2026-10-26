"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending, BufferAttribute, ClampToEdgeWrapping, BufferGeometry, Color, DoubleSide, Group, Line, LineBasicMaterial, Mesh,
  Points, PlaneGeometry, RingGeometry, ShaderMaterial, SphereGeometry, Vector3,
} from "three";
import { MOONS, PLANETS, SUN, type MoonDef, type PlanetDef } from "@/data/solarSystem";
import { bodyPos, bodyRot, moonOrbit, planetOrbit } from "@/lib/ephemeris";
import { ECL_TO_SCENE4 } from "@/lib/frames";
import { ELEMENTS, J2000 } from "@/lib/kepler";
import { telemetry, useApp } from "@/lib/store";
import { clock } from "@/lib/time";
import { AU, KM } from "@/lib/units";
import { createPlanetMaterial, createRingMaterial, createSunMaterial, setMaterialTexture } from "./materials";
import { CULL_BEHIND, GLOW_FRAG, GLOW_VERT, loadTexture, shared } from "./shared";
import { STAR_NEAR_FADE } from "./StarField";

const SPHERE_HI = new SphereGeometry(1, 96, 64);
const SPHERE_LO = new SphereGeometry(1, 48, 32);
const QUAD = new PlaneGeometry(2, 2);
const v1 = new Vector3();
const v2 = new Vector3();

/** Pixel radius of a sphere of `radius` at the camera distance from `pos`. */
function pixelRadius(cam: Vector3, pos: Vector3, radius: number) {
  return (radius * shared.uPxScale.value) / Math.max(cam.distanceTo(pos), radius);
}

// ----------------------------------------------------------------------------
// Sun

function Sun() {
  const mesh = useRef<Mesh>(null);
  const glow = useRef<Mesh>(null);
  const mat = useMemo(() => createSunMaterial(), []);
  const glowMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: { uSize: { value: 1 }, uColor: { value: new Color(1.0, 0.72, 0.38) }, uOpacity: { value: 1 }, uCore: { value: 0.1 }, uHollow: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );
  const texRequested = useRef(false);
  const R = SUN.radiusKm * KM;

  useFrame(({ camera }) => {
    const m = mesh.current!, g = glow.current!;
    m.quaternion.setFromRotationMatrix(bodyRot.sun);
    const d = camera.position.length();
    const px = pixelRadius(camera.position, bodyPos.sun, R);
    m.visible = px > 0.4;
    if (!texRequested.current && px > 3) {
      texRequested.current = true;
      loadTexture("sun").then((t) => setMaterialTexture(mat, "uMap", t));
    }
    mat.uniforms.uTime.value = shared.uTime.value;
    const worldPerPx = d / shared.uPxScale.value;
    const size = Math.max(R * 4.2, worldPerPx * 70 * shared.uDpr.value);
    glowMat.uniforms.uSize.value = size;
    glowMat.uniforms.uCore.value = Math.min(0.95, R / size);
    glowMat.uniforms.uHollow.value = smooth(2, 6, px);
    glowMat.uniforms.uOpacity.value = 1 - smooth(STAR_NEAR_FADE[0], STAR_NEAR_FADE[1], d);
    g.visible = glowMat.uniforms.uOpacity.value > 0.01;
  });

  return (
    <group>
      <mesh ref={mesh} geometry={SPHERE_HI} material={mat} scale={R} />
      <mesh ref={glow} geometry={QUAD} material={glowMat} frustumCulled={false} renderOrder={6} />
    </group>
  );
}

export function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ----------------------------------------------------------------------------
// Planets & moons

function Sphere({ def, isMoon }: { def: PlanetDef | MoonDef; isMoon?: boolean }) {
  const mesh = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const R = def.radiusKm * KM;
  const planet = isMoon ? undefined : (def as PlanetDef);
  const mat = useMemo(
    () => createPlanetMaterial({ color: def.color, atmosphere: planet?.atmosphere, ambient: isMoon ? 0.02 : 0.03 }),
    [def, planet, isMoon],
  );
  const ring = useMemo(() => {
    if (!planet?.ring) return null;
    const inner = planet.ring.innerKm / planet.ring.outerKm;
    const geo = new RingGeometry(inner, 1, 160, 1).rotateX(-Math.PI / 2);
    return { geo, mat: createRingMaterial(inner), scale: planet.ring.outerKm / planet.radiusKm };
  }, [planet]);
  const texState = useRef(0);

  useEffect(() => () => { mat.dispose(); ring?.geo.dispose(); ring?.mat.dispose(); }, [mat, ring]);

  useFrame(({ camera }) => {
    const m = mesh.current!;
    const pos = bodyPos[def.id];
    m.position.copy(pos);
    m.quaternion.setFromRotationMatrix(bodyRot[def.id]);
    const px = pixelRadius(camera.position, pos, ring ? R * ring.scale : R);
    m.visible = px > 0.35;
    if (!m.visible) return;
    m.geometry = px > 60 ? SPHERE_HI : SPHERE_LO;
    const sunDir = v1.copy(pos).negate().normalize();
    mat.uniforms.uSunDir.value.copy(sunDir);
    if (planet?.cloudTexture) mat.uniforms.uCloudShift.value = ((clock.jd - J2000) * 0.02) % 1;

    // stream textures only once the body is a few pixels wide
    if (texState.current === 0 && px > 4) {
      texState.current = 1;
      const tex = "texture" in def ? def.texture : undefined;
      if (tex) loadTexture(tex).then((t) => setMaterialTexture(mat, "uMap", t));
      if (planet?.nightTexture) loadTexture(planet.nightTexture).then((t) => setMaterialTexture(mat, "uNight", t));
      if (planet?.cloudTexture) loadTexture(planet.cloudTexture).then((t) => setMaterialTexture(mat, "uClouds", t));
      if (planet?.ring) loadTexture(planet.ring.texture).then((t) => { t.wrapS = ClampToEdgeWrapping; ring!.mat.uniforms.uMap.value = t; ring!.mat.uniforms.uHasMap.value = 1; });
    }
    if (ring && ringRef.current) {
      ring.mat.uniforms.uSunDir.value.copy(sunDir);
      // sun direction in the planet's body frame
      v2.copy(sunDir).applyQuaternion(m.quaternion.clone().invert());
      ring.mat.uniforms.uSunDirLocal.value.copy(v2);
      ring.mat.uniforms.uOuterScale.value = ring.scale;
    }
  });

  return (
    <mesh ref={mesh} geometry={SPHERE_LO} material={mat} scale={R}>
      {ring && <mesh ref={ringRef} geometry={ring.geo} material={ring.mat} scale={ring.scale} renderOrder={7} />}
    </mesh>
  );
}

// ----------------------------------------------------------------------------
// Orbits

function useLine(points: Float32Array, color: string, opacity: number) {
  return useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(points, 3));
    const mat = new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending });
    const line = new Line(geo, mat);
    line.frustumCulled = false;
    return line;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function PlanetOrbit({ def }: { def: PlanetDef }) {
  const line = useLine(planetOrbit(def.id, clock.jd), def.color, 0.5);
  const builtAt = useRef(clock.jd);
  const a = ELEMENTS[def.id].near.base[0] * AU;
  useEffect(() => () => { line.geometry.dispose(); (line.material as LineBasicMaterial).dispose(); }, [line]);
  useFrame(({ camera }) => {
    const show = useApp.getState().orbits;
    const mat = line.material as LineBasicMaterial;
    const px = (a * shared.uPxScale.value) / Math.max(camera.position.length(), a * 0.05);
    // close to a body the other orbits just slice across the view
    const nearSun = useApp.getState().focus === "sun";
    const close = nearSun ? smooth(2e7 * KM, 8e7 * KM, telemetry.distToFocus) : smooth(3e5 * KM, 3e6 * KM, telemetry.distToFocus);
    mat.opacity = show ? 0.45 * smooth(14, 60, px) * close : 0;
    line.visible = mat.opacity > 0.01;
    // the orbit itself drifts slowly (precession); rebuild every ~5 simulated years
    if (Math.abs(clock.jd - builtAt.current) > 1800) {
      builtAt.current = clock.jd;
      const attr = line.geometry.getAttribute("position") as BufferAttribute;
      (attr.array as Float32Array).set(planetOrbit(def.id, clock.jd));
      attr.needsUpdate = true;
    }
  });
  return <primitive object={line} />;
}

function MoonOrbit({ def }: { def: MoonDef }) {
  const line = useLine(moonOrbit(def.id, clock.jd), "#9fb4d8", 0.35);
  const builtAt = useRef(clock.jd);
  const a = def.aKm * KM;
  useEffect(() => () => { line.geometry.dispose(); (line.material as LineBasicMaterial).dispose(); }, [line]);
  useFrame(({ camera }) => {
    const parent = bodyPos[def.parent];
    line.position.copy(parent);
    const mat = line.material as LineBasicMaterial;
    const px = (a * shared.uPxScale.value) / Math.max(camera.position.distanceTo(parent), a * 0.05);
    mat.opacity = useApp.getState().orbits ? 0.35 * smooth(18, 70, px) : 0;
    line.visible = mat.opacity > 0.01;
    if (def.id === "moon" && Math.abs(clock.jd - builtAt.current) > 2) {
      builtAt.current = clock.jd;
      const attr = line.geometry.getAttribute("position") as BufferAttribute;
      (attr.array as Float32Array).set(moonOrbit(def.id, clock.jd));
      attr.needsUpdate = true;
    }
  });
  return <primitive object={line} />;
}

// ----------------------------------------------------------------------------
// Small-body belts (animated Keplerian circles, computed on the GPU)

const BELT_VERT = /* glsl */ `
  uniform float uDays;
  uniform float uDpr;
  uniform float uOpacity;
  attribute vec4 aOrbit; // a [AU], inclination, node, phase
  attribute float aBright;
  varying float vAlpha;
  void main() {
    float a = aOrbit.x;
    float th = aOrbit.w + 0.01720209895 / (a * sqrt(a)) * uDays;
    vec3 p = vec3(cos(th) * a, sin(th) * a, 0.0);
    float ci = cos(aOrbit.y), si = sin(aOrbit.y);
    p = vec3(p.x, p.y * ci, p.y * si);
    float cn = cos(aOrbit.z), sn = sin(aOrbit.z);
    p = vec3(p.x * cn - p.y * sn, p.x * sn + p.y * cn, p.z);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    ${CULL_BEHIND}
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 1.6 * uDpr;
    vAlpha = uOpacity * aBright;
  }
`;
const BELT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float f = 1.0 - dot(c, c);
    if (f <= 0.0) discard;
    gl_FragColor = vec4(uColor * f * vAlpha, 1.0);
  }
`;

function Belt({ count, aMin, aMax, maxInc, color, fadeFar, seed }: {
  count: number; aMin: number; aMax: number; maxInc: number; color: string; fadeFar: number; seed: number;
}) {
  const pts = useMemo(() => {
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const orbit = new Float32Array(count * 4);
    const bright = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Kirkwood-gap-ish clumping for the main belt via a bias toward the centre
      const t = (r() + r()) / 2;
      orbit.set([aMin + (aMax - aMin) * t, (r() - 0.5) * 2 * maxInc * (Math.PI / 180) * r(), r() * Math.PI * 2, r() * Math.PI * 2], i * 4);
      bright[i] = 0.35 + 0.65 * r();
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("aOrbit", new BufferAttribute(orbit, 4));
    geo.setAttribute("aBright", new BufferAttribute(bright, 1));
    const mat = new ShaderMaterial({
      vertexShader: BELT_VERT,
      fragmentShader: BELT_FRAG,
      uniforms: { uDays: { value: 0 }, uDpr: shared.uDpr, uOpacity: { value: 1 }, uColor: { value: new Color(color) } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const p = new Points(geo, mat);
    p.frustumCulled = false;
    return p;
  }, [count, aMin, aMax, maxInc, color, seed]);

  useEffect(() => () => { pts.geometry.dispose(); (pts.material as ShaderMaterial).dispose(); }, [pts]);

  useFrame(({ camera }) => {
    const mat = pts.material as ShaderMaterial;
    mat.uniforms.uDays.value = (clock.jd - J2000) % 3.6e6;
    const d = camera.position.length();
    const px = (aMax * AU * shared.uPxScale.value) / shared.uDpr.value / Math.max(d, 1e-12);
    mat.uniforms.uOpacity.value = 0.38 * (1 - smooth(fadeFar * 0.25, fadeFar, d)) * smooth(60, 260, px);
    pts.visible = mat.uniforms.uOpacity.value > 0.01;
  });

  return <primitive object={pts} />;
}

// ----------------------------------------------------------------------------
// Oort cloud & heliosphere

function OortCloud() {
  const pts = useMemo(() => {
    const n = 9000;
    const pos = new Float32Array(n * 3);
    let s = 42;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const rad = Math.exp(Math.log(2000) + (Math.log(100000) - Math.log(2000)) * Math.pow(r(), 0.7)) * AU;
      const u = r() * 2 - 1, t = r() * Math.PI * 2;
      const k = Math.sqrt(1 - u * u);
      // the inner (Hills) cloud is flattened towards the ecliptic
      const flat = rad < 20000 * AU ? 0.45 : 1;
      v1.set(k * Math.cos(t) * rad, k * Math.sin(t) * rad, u * rad * flat).applyMatrix4(ECL_TO_SCENE4);
      pos.set([v1.x, v1.y, v1.z], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    const mat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        uniform float uDpr;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          ${CULL_BEHIND}
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 1.5 * uDpr;
          vAlpha = uOpacity;
        }
      `,
      fragmentShader: BELT_FRAG.replace("uniform vec3 uColor;", "const vec3 uColor = vec3(0.55, 0.7, 1.0);"),
      uniforms: { uDpr: shared.uDpr, uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const p = new Points(geo, mat);
    p.frustumCulled = false;
    return p;
  }, []);
  useEffect(() => () => { pts.geometry.dispose(); (pts.material as ShaderMaterial).dispose(); }, [pts]);
  useFrame(({ camera }) => {
    const d = camera.position.length();
    const o = smooth(0.004, 0.04, d) * (1 - smooth(8, 40, d)) * 0.5;
    (pts.material as ShaderMaterial).uniforms.uOpacity.value = o;
    pts.visible = o > 0.005;
  });
  return <primitive object={pts} />;
}

function Heliosphere() {
  const mesh = useRef<Mesh>(null);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity; varying vec3 vN; varying vec3 vV;
          void main() {
            float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
            gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * f * uOpacity, 1.0);
          }
        `,
        uniforms: { uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    [],
  );
  useFrame(({ camera }) => {
    const d = camera.position.length();
    const o = smooth(180 * AU, 600 * AU, d) * (1 - smooth(0.05, 0.4, d)) * 0.6;
    mat.uniforms.uOpacity.value = o;
    mesh.current!.visible = o > 0.005;
  });
  return <mesh ref={mesh} geometry={SPHERE_LO} material={mat} scale={120 * AU} />;
}

// ----------------------------------------------------------------------------

export function SolarSystem() {
  const groupRef = useRef<Group>(null);
  useEffect(() => {
    const g = groupRef.current!;
    g.matrixAutoUpdate = false;
    g.matrix.copy(ECL_TO_SCENE4).scale(new Vector3(AU, AU, AU));
    g.updateMatrixWorld(true);
  }, []);

  return (
    <group>
      <Sun />
      {PLANETS.map((p) => (
        <Sphere key={p.id} def={p} />
      ))}
      {MOONS.map((m) => (
        <Sphere key={m.id} def={m} isMoon />
      ))}
      {PLANETS.map((p) => (
        <PlanetOrbit key={p.id} def={p} />
      ))}
      {MOONS.map((m) => (
        <MoonOrbit key={m.id} def={m} />
      ))}
      <group ref={groupRef}>
        <Belt count={9000} aMin={2.1} aMax={3.3} maxInc={18} color="#c8b89a" fadeFar={0.004} seed={7} />
        <Belt count={7000} aMin={30} aMax={50} maxInc={25} color="#9db7d6" fadeFar={0.03} seed={11} />
      </group>
      <OortCloud />
      <Heliosphere />
    </group>
  );
}
