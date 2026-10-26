"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { Color, Mesh, NoToneMapping, SphereGeometry } from "three";
import { catalog, loadStarMeta, loadStars, type StarCatalog } from "@/lib/stars";
import { telemetry, useApp } from "@/lib/store";
import { CameraRig } from "./CameraRig";
import { FocusedStar } from "./FocusedStar";
import { Galaxy } from "./Galaxy";
import { Labels, Picker } from "./Overlay";
import { loadTexture, shared } from "./shared";
import { BlackHoleRenderer, S2Star } from "./BlackHole";
import { createPlanetMaterial, createStarMaterial } from "./materials";
import { ScaleRings } from "./ScaleRings";
import { SolarSystem } from "./SolarSystem";
import { StarField } from "./StarField";

/** Lowers the pixel ratio when the frame rate drops, raises it again when there is headroom. */
function AdaptiveQuality({ maxDpr }: { maxDpr: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const gl = useThree((s) => s.gl);
  const acc = useRef({ frames: 0, time: 0, dpr: Math.min(maxDpr, 1.5), cool: 0 });

  useEffect(() => {
    const ctx = gl.getContext();
    const range = ctx.getParameter(ctx.ALIASED_POINT_SIZE_RANGE) as Float32Array;
    shared.uMaxPoint.value = range?.[1] ?? 256;
  }, [gl]);

  useFrame((_, dt) => {
    const a = acc.current;
    a.frames++;
    a.time += dt;
    if (a.time < 1.5) return;
    const fps = a.frames / a.time;
    telemetry.fps = fps;
    a.frames = 0;
    a.time = 0;
    if (a.cool-- > 0) return;
    let next = a.dpr;
    if (fps < 40 && a.dpr > 0.75) next = Math.max(0.75, a.dpr - 0.25);
    else if (fps > 58 && a.dpr < maxDpr) next = Math.min(maxDpr, a.dpr + 0.25);
    if (next !== a.dpr) {
      a.dpr = next;
      a.cool = 2;
      setDpr(next);
    }
  });
  return null;
}

/**
 * Compiles shaders that are first needed mid-flight (star surfaces) and
 * uploads planet textures during idle time, so arriving anywhere doesn't hitch.
 */
function Warmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const ready = useApp((s) => s.ready);
  useEffect(() => {
    const mesh = new Mesh(new SphereGeometry(1, 8, 8), createStarMaterial(new Color(1, 1, 1)));
    const mesh2 = new Mesh(mesh.geometry, createPlanetMaterial({ color: "#888" }));
    mesh.frustumCulled = mesh2.frustumCulled = false;
    scene.add(mesh, mesh2);
    gl.compile(scene, camera);
    scene.remove(mesh, mesh2);
    // keep the materials alive in three's program cache only; geometry can go
    mesh.geometry.dispose();
  }, [gl, scene, camera]);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const names = ["earth", "earth_clouds", "earth_night", "moon", "sun", "mars", "jupiter", "saturn", "saturn_ring", "venus", "mercury", "uranus", "neptune"];
    (async () => {
      await new Promise((r) => setTimeout(r, 1500));
      for (const n of names) {
        if (!alive) return;
        const t = await loadTexture(n);
        if (!alive) return;
        gl.initTexture(t); // GPU upload now, not when the planet first appears
        await new Promise((r) => setTimeout(r, 120));
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, gl]);
  return null;
}

export default function Scene() {
  const [stars, setStars] = useState<StarCatalog | null>(catalog);
  const [quality] = useState(() => {
    if (typeof navigator === "undefined") return 1;
    const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const cores = navigator.hardwareConcurrency ?? 4;
    return mobile ? 0.45 : cores <= 4 ? 0.7 : 1;
  });
  const [maxDpr] = useState(() => (typeof window === "undefined" ? 1.5 : Math.min(2, window.devicePixelRatio || 1)));

  useEffect(() => {
    let alive = true;
    loadStars()
      .then((c) => {
        if (!alive) return;
        setStars(c);
        useApp.getState().set({ ready: true });
        return loadStarMeta();
      })
      .then(() => alive && useApp.getState().set({ metaReady: true }))
      .catch((e) => console.error("star data failed to load", e));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Canvas
      className="scene-canvas"
      dpr={Math.min(maxDpr, 1.5)}
      gl={{ antialias: true, alpha: false, stencil: false, powerPreference: "high-performance", toneMapping: NoToneMapping }}
      camera={{ fov: 50, near: 1, far: 3e6, position: [0, 0, 1] }}
      onCreated={({ gl }) => gl.setClearColor("#010103")}
    >
      <CameraRig />
      <AdaptiveQuality maxDpr={maxDpr} />
      <Galaxy quality={quality} />
      {stars && <StarField catalog={stars} />}
      <SolarSystem />
      <FocusedStar />
      <ScaleRings />
      <S2Star />
      <Warmup />
      <BlackHoleRenderer />
      <Labels />
      <Picker />
    </Canvas>
  );
}
