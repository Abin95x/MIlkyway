"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Line, LineBasicMaterial, Matrix3, Mesh, OrthographicCamera,
  PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget,
} from "three";
import {
  DISK_IN, DISK_N, DISK_OUT, DISK_U, DISK_V, RS, S2, S2_A, SGRA_POS, s2AtEccentricAnomaly, s2Offset, yearFromJd,
} from "@/lib/sgra";
import { useApp } from "@/lib/store";
import { clock } from "@/lib/time";
import { KM } from "@/lib/units";
import { GLOW_FRAG, GLOW_VERT, shared } from "./shared";

// Sagittarius A*, ray traced.
//
// When the hole's neighbourhood covers more than a couple of pixels, the scene
// is rendered into a texture and a full-screen pass integrates every view ray
// through the Schwarzschild metric (units of Rs, photon acceleration
// a = −1.5·h²·r̂/r⁴, h = |r × v|). Rays that fall below the horizon are black,
// rays crossing the disk plane between the ISCO and the outer edge pick up a
// Doppler-boosted, gravitationally redshifted blackbody colour, and rays that
// escape sample the rendered scene in their final direction — so the galaxy
// behind is lensed, including the Einstein ring and the photon ring.
// Far away (impact parameter > 40 Rs) the weak-field deflection 2Rs/b is used.

const LENS_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uScene;
  uniform mat4 uProj;
  uniform mat3 uCamRot;
  uniform mat3 uViewRot;
  uniform vec3 uCam;      // camera position relative to the hole, in Rs
  uniform vec3 uDiskN;
  uniform vec3 uDiskU;
  uniform vec3 uDiskV;
  uniform float uDiskIn;
  uniform float uDiskOut;
  uniform float uTime;
  uniform float uDisk;    // disk brightness (0 = hide)
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.1 + 3.7; a *= 0.5; }
    return v;
  }

  vec3 blackbody(float t) {
    t = clamp(t, 1000.0, 40000.0) / 100.0;
    float r = t <= 66.0 ? 1.0 : clamp(1.292936 * pow(t - 60.0, -0.1332047), 0.0, 1.0);
    float g = t <= 66.0 ? clamp(0.3900816 * log(t) - 0.6318414, 0.0, 1.0) : clamp(1.1298909 * pow(t - 60.0, -0.0755148), 0.0, 1.0);
    float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432068 * log(t - 10.0) - 1.1962541, 0.0, 1.0));
    return vec3(r, g, b);
  }

  // directions behind the camera / off-screen: a faint procedural bulge sky
  vec3 sky(vec3 d) {
    vec3 a = abs(d);
    vec2 uv = a.x > a.y && a.x > a.z ? d.yz / a.x : (a.y > a.z ? d.xz / a.y : d.xy / a.z);
    vec2 cell = floor(uv * 180.0);
    float h = hash(cell + floor(d.zx * 3.0));
    float star = step(0.985, h) * pow(hash(cell + 7.3), 6.0) * 1.6;
    return vec3(0.05, 0.035, 0.022) + vec3(1.0, 0.9, 0.75) * star;
  }

  vec3 background(vec3 d) {
    vec3 dv = uViewRot * d;
    if (dv.z > -0.02) return sky(d);
    vec2 uv = vec2(uProj[0][0] * dv.x, uProj[1][1] * dv.y) / -dv.z * 0.5 + 0.5;
    vec2 edge = min(uv, 1.0 - uv);
    float inside = smoothstep(0.0, 0.04, min(edge.x, edge.y));
    vec3 scene = texture2D(uScene, clamp(uv, 0.001, 0.999)).rgb;
    return mix(sky(d), scene, inside);
  }

  vec4 disk(vec3 p, vec3 rayDir) {
    float r = length(p);
    float x = dot(p, uDiskU), y = dot(p, uDiskV);
    // differential (Keplerian) rotation of the gas texture
    float ang = uTime * 0.9 * pow(r, -1.5);
    float ca = cos(ang), sa = sin(ang);
    vec2 q = vec2(ca * x - sa * y, sa * x + ca * y);
    float phi = atan(q.y, q.x);
    float n = fbm(vec2(r * 1.7, 0.0) + vec2(cos(phi), sin(phi)) * r * 0.9);
    float streak = 0.55 + 0.9 * fbm(vec2(phi * 6.0 / 3.14159, r * 4.0));
    // relativistic Doppler beaming + gravitational redshift
    vec3 vdir = normalize(cross(uDiskN, p));
    float beta = min(sqrt(0.5 / (r - 1.0)), 0.95);
    float gamma = 1.0 / sqrt(1.0 - beta * beta);
    float g = sqrt(1.0 - 1.0 / r) / (gamma * (1.0 - beta * dot(vdir, -rayDir)));
    float temp = 9000.0 * pow(r / uDiskIn, -0.75) * g;
    float inten = pow(uDiskIn / r, 1.6) * pow(g, 3.0) * (0.45 + 0.8 * n) * streak;
    float fade = smoothstep(uDiskIn, uDiskIn + 0.6, r) * (1.0 - smoothstep(uDiskOut * 0.45, uDiskOut, r));
    float a = clamp(inten * fade * 1.1, 0.0, 1.0) * uDisk;
    return vec4(blackbody(temp) * inten * fade * 2.4 * uDisk, a);
  }

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    // ray from the focal terms only (un-projecting at a depth overflows float32 when far/near ~ 1e13)
    vec3 d = normalize(uCamRot * normalize(vec3(ndc.x / uProj[0][0], ndc.y / uProj[1][1], -1.0)));
    vec3 o = uCam;
    float tc = -dot(o, d);
    float b = length(cross(o, d));
    const float R = 40.0;

    if (b > R || (tc < 0.0 && length(o) > R)) {
      if (tc < 0.0) { gl_FragColor = vec4(texture2D(uScene, vUv).rgb, 1.0); return; }
      vec3 toHole = normalize(-(o + d * tc));
      gl_FragColor = vec4(background(normalize(d + toHole * (2.0 / b))), 1.0);
      return;
    }

    vec3 p = o;
    float lo = length(o);
    if (lo > R) p = o + d * (tc - sqrt(max(R * R - b * b, 0.0)));
    vec3 v = d;
    vec3 hv = cross(p, v);
    float h2 = dot(hv, hv);
    vec3 col = vec3(0.0);
    float alpha = 0.0;
    bool captured = false;

    for (int i = 0; i < 200; i++) {
      float r = length(p);
      if (r < 1.0) { captured = true; break; }
      if (r > max(R, lo) + 1.0 && dot(p, v) > 0.0) break;
      float h = clamp((r < 4.0 ? 0.035 : 0.09) * r, 0.015, 3.0);
      vec3 prev = p;
      float r2 = r * r;
      v += -1.5 * h2 * p / (r2 * r2 * r) * h;
      p += v * h;
      float s0 = dot(prev, uDiskN), s1 = dot(p, uDiskN);
      if (s0 * s1 < 0.0) {
        vec3 hit = mix(prev, p, s0 / (s0 - s1));
        float rh = length(hit);
        if (rh > uDiskIn && rh < uDiskOut) {
          vec4 dc = disk(hit, normalize(v));
          col += (1.0 - alpha) * dc.rgb;
          alpha += (1.0 - alpha) * dc.a;
          if (alpha > 0.98) break;
        }
      }
    }
    vec3 bg = captured ? vec3(0.0) : background(normalize(v));
    gl_FragColor = vec4(col + (1.0 - alpha) * bg, 1.0);
  }
`;

const tmpV = new Vector3();
const m3 = new Matrix3();
const size = new Vector2();

/** Owns the frame: plain render normally, lensed composite near Sgr A*. */
export function BlackHoleRenderer() {
  const gl = useThree((s) => s.gl);
  const pass = useMemo(() => {
    const rt = new WebGLRenderTarget(1, 1, { depthBuffer: true });
    const mat = new ShaderMaterial({
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: LENS_FRAG,
      uniforms: {
        uScene: { value: rt.texture },
        uProj: { value: null },
        uCamRot: { value: new Matrix3() },
        uViewRot: { value: new Matrix3() },
        uCam: { value: new Vector3() },
        uDiskN: { value: DISK_N },
        uDiskU: { value: DISK_U },
        uDiskV: { value: DISK_V },
        uDiskIn: { value: DISK_IN },
        uDiskOut: { value: DISK_OUT },
        uTime: { value: 0 },
        uDisk: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const scene = new Scene();
    const quad = new Mesh(new PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    scene.add(quad);
    return { rt, mat, scene, cam: new OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  }, []);

  useEffect(() => {
    gl.compile(pass.scene, pass.cam); // compile up-front: no hitch when arriving
    return () => {
      pass.rt.dispose();
      pass.mat.dispose();
    };
  }, [gl, pass]);

  useFrame((state) => {
    const { scene, camera } = state;
    const cam = camera as PerspectiveCamera;
    const d = cam.position.distanceTo(SGRA_POS);
    // projected radius of the strong-lensing zone, in pixels
    const px = (40 * RS * shared.uPxScale.value) / Math.max(d, 1e-12);
    tmpV.copy(SGRA_POS).sub(cam.position);
    const inFront = tmpV.dot(cam.getWorldDirection(new Vector3())) > -40 * RS;
    if (px < 1.5 || !inFront) {
      gl.render(scene, camera);
      return;
    }
    gl.getDrawingBufferSize(size);
    if (pass.rt.width !== size.x || pass.rt.height !== size.y) pass.rt.setSize(size.x, size.y);
    gl.setRenderTarget(pass.rt);
    gl.render(scene, camera);
    gl.setRenderTarget(null);

    const u = pass.mat.uniforms;
    u.uProj.value = cam.projectionMatrix;
    u.uCamRot.value.setFromMatrix4(cam.matrixWorld);
    u.uViewRot.value.copy(m3.setFromMatrix4(cam.matrixWorld)).transpose();
    u.uCam.value.copy(cam.position).sub(SGRA_POS).divideScalar(RS);
    u.uTime.value = shared.uTime.value;
    gl.render(pass.scene, pass.cam);
  }, 1);

  return null;
}

/** The star S2 on its 16-year orbit around Sgr A* (true orbital elements). */
export function S2Star() {
  const glow = useRef<Mesh>(null);
  const { line, glowMat } = useMemo(() => {
    const n = 720;
    const pts = new Float32Array((n + 1) * 3);
    const v = new Vector3();
    for (let i = 0; i <= n; i++) {
      // sample in eccentric anomaly so the tight periapsis turn stays smooth
      s2AtEccentricAnomaly((i / n) * Math.PI * 2, v);
      pts.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pts, 3));
    const line = new Line(geo, new LineBasicMaterial({ color: "#8fb8ff", transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
    line.position.copy(SGRA_POS); // local vertices: full precision 26,670 ly from the origin
    line.frustumCulled = false;
    const glowMat = new ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      uniforms: { uSize: { value: 1 }, uColor: { value: new Color("#bcd2ff") }, uOpacity: { value: 1 }, uCore: { value: 0.12 }, uHollow: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { line, glowMat };
  }, []);

  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as LineBasicMaterial).dispose();
    glowMat.dispose();
  }, [line, glowMat]);

  useFrame(({ camera }) => {
    const g = glow.current!;
    s2Offset(yearFromJd(clock.jd), g.position).add(SGRA_POS);
    const d = camera.position.distanceTo(g.position);
    const pxOrbit = (S2_A * shared.uPxScale.value) / Math.max(camera.position.distanceTo(SGRA_POS), 1e-12);
    const vis = smooth(6, 30, pxOrbit);
    (line.material as LineBasicMaterial).opacity = useApp.getState().orbits ? 0.45 * vis : 0;
    line.visible = (line.material as LineBasicMaterial).opacity > 0.01;
    glowMat.uniforms.uSize.value = Math.max(S2.radiusKm * KM * 4, (d / shared.uPxScale.value) * 26 * shared.uDpr.value);
    glowMat.uniforms.uOpacity.value = vis;
    g.visible = vis > 0.01;
  });

  return (
    <group>
      <primitive object={line} />
      <mesh ref={glow} geometry={QUAD} material={glowMat} frustumCulled={false} renderOrder={6} />
    </group>
  );
}

const QUAD = new PlaneGeometry(2, 2);
function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
