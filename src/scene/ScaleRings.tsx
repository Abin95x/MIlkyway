"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, LineBasicMaterial, LineLoop } from "three";
import { useApp } from "@/lib/store";
import { RING_RADII, ringOpacity } from "./Overlay";
import { shared } from "./shared";

/** Concentric distance rings around the Sun in the galactic plane, for a sense of scale between the stars. */
export function ScaleRings() {
  const rings = useMemo(() => {
    const n = 192;
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.set([Math.cos(t), 0, Math.sin(t)], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pts, 3));
    return RING_RADII.map((r) => {
      const line = new LineLoop(geo, new LineBasicMaterial({ color: "#7f9cd6", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
      line.scale.setScalar(r);
      line.frustumCulled = false;
      return { r, line };
    });
  }, []);

  useFrame(({ camera }) => {
    const show = useApp.getState().orbits;
    const d = camera.position.length();
    const pxScale = shared.uPxScale.value / shared.uDpr.value;
    for (const { r, line } of rings) {
      const o = show ? ringOpacity(r, d, pxScale) * 0.32 : 0;
      (line.material as LineBasicMaterial).opacity = o;
      line.visible = o > 0.004;
    }
  });

  return (
    <group>
      {rings.map(({ r, line }) => (
        <primitive key={r} object={line} />
      ))}
    </group>
  );
}
