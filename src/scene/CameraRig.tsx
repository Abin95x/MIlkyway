"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { bodyPos, updateEphemeris } from "@/lib/ephemeris";
import { ECLIPTIC_NORTH, GALACTIC_NORTH } from "@/lib/frames";
import { getBody, type Body } from "@/lib/registry";
import { SGRA_VIEW_DIR } from "@/lib/sgra";
import { telemetry, useApp } from "@/lib/store";
import { clock } from "@/lib/time";
import { shared } from "./shared";

// One continuous camera from Earth's surface to beyond the Milky Way.
// Distance is handled in log-space so every scroll notch zooms by the same
// factor whether you're 1,000 km or 100,000 light-years from the target.

const MAX_DIST = 600_000;
const tmpA = new Vector3();
const tmpB = new Vector3();
const axis = new Vector3();

// --- smooth fly-to ------------------------------------------------------------
// Van Wijk & Nuij, "Smooth and efficient zooming and panning" (2003): the
// optimal joint pan+zoom path. On-screen motion has constant perceived speed,
// so the camera rises before travelling and descends on arrival, instead of
// whipping the target across the screen at close range.

const RHO = 1.35; // curvature: higher = rise further out before travelling
const VIEW_K = 2 * Math.tan((50 * Math.PI) / 360); // view width per unit distance (fov 50°)

interface ZoomPath {
  S: number; // total path length
  w: (s: number) => number; // view width at s
  u: (s: number) => number; // distance travelled along the line at s
}

function zoomPath(w0: number, w1: number, u1: number): ZoomPath {
  if (u1 < 1e-6 * Math.min(w0, w1)) {
    const k = w1 < w0 ? -1 : 1;
    return { S: Math.abs(Math.log(w1 / w0)) / RHO, w: (s) => w0 * Math.exp(k * RHO * s), u: () => 0 };
  }
  const r2 = RHO * RHO, r4 = r2 * r2;
  const b0 = (w1 * w1 - w0 * w0 + r4 * u1 * u1) / (2 * w0 * r2 * u1);
  const b1 = (w1 * w1 - w0 * w0 - r4 * u1 * u1) / (2 * w1 * r2 * u1);
  // ln(-b + sqrt(b²+1)) == -asinh(b), without the catastrophic cancellation
  const r0 = -Math.asinh(b0), r1 = -Math.asinh(b1);
  const c0 = Math.cosh(r0), t0 = Math.tanh(r0);
  return {
    S: (r1 - r0) / RHO,
    w: (s) => (w0 * c0) / Math.cosh(RHO * s + r0),
    u: (s) => ((w0 * c0) / r2) * (Math.tanh(RHO * s + r0) - t0),
  };
}

interface Flight {
  t: number;
  dur: number;
  from: Vector3;
  u1: number;
  path: ZoomPath;
  dirQ: Quaternion | null; // rotation fromDir → toDir
  fromDir: Vector3;
  upFrom: Vector3;
  upTo: Vector3;
  upQ: Quaternion;
}

/** zero velocity and acceleration at both ends */
const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const qIdentity = new Quaternion();
const qTmp = new Quaternion();

function contextUp(b: Body | undefined, dist: number) {
  if (b?.upVector && dist < 0.02) return b.upVector;
  return b?.up === "ecliptic" && dist < 0.5 ? ECLIPTIC_NORTH : GALACTIC_NORTH;
}

function minDistance(b: Body) {
  return b.radius > 0 ? b.radius * 1.08 : 30;
}

/** Nice viewing direction for a body (camera sits at target + dir * distance). */
function preferredDir(b: Body, current: Vector3): Vector3 | null {
  if (b.id === "galaxy") return new Vector3(-0.42, 0.78, 0.46).normalize();
  if (b.id === "dso:sgra") return SGRA_VIEW_DIR.clone();
  if (b.id === "solar") return new Vector3().copy(ECLIPTIC_NORTH).multiplyScalar(0.62).add(new Vector3(-0.5, 0, 0.6)).normalize();
  if (b.kind === "planet" || b.kind === "moon" || b.kind === "dwarf planet") {
    if (b.id.startsWith("exo:")) return null;
    // look at the day side, slightly from above, with the terminator in view
    const toSun = tmpA.copy(bodyPos[b.id]).negate().normalize();
    const side = tmpB.crossVectors(ECLIPTIC_NORTH, toSun).normalize();
    return new Vector3().copy(toSun).multiplyScalar(0.45).addScaledVector(side, 0.86).addScaledVector(ECLIPTIC_NORTH, 0.2).normalize();
  }
  void current;
  return null;
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const viewport = useThree((s) => s.viewport);

  const st = useRef({
    focus: "galaxy",
    nonce: -1,
    target: new Vector3(26_670, 0, 0),
    dir: new Vector3(-0.42, 0.78, 0.46).normalize(),
    up: new Vector3(0, 1, 0),
    logD: Math.log(170_000),
    logGoal: Math.log(105_000),
    pendYaw: 0,
    pendPitch: 0,
    flight: null as Flight | null,
  });

  // --- input ----------------------------------------------------------------
  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    const pointers = new Map<number, { x: number; y: number; pan: boolean }>();
    let pinchDist = 0;

    const zoomBy = (delta: number) => {
      if (s.flight) return;
      const b = getBody(s.focus);
      const lo = Math.log(b ? minDistance(b) : 1e-11);
      s.logGoal = Math.min(Math.log(MAX_DIST), Math.max(lo, s.logGoal + delta));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1;
      const dy = Math.max(-300, Math.min(300, e.deltaY * scale));
      zoomBy(dy * (e.ctrlKey ? 0.008 : 0.0024));
    };
    // panning moves the orbit centre, which releases the camera from the body it follows
    const pan = (dx: number, dy: number) => {
      if (s.flight || (!dx && !dy)) return;
      if (s.focus !== "free") {
        s.focus = "free";
        useApp.getState().release();
      }
      const worldPerPx = (Math.exp(s.logD) * VIEW_K) / Math.max(1, el.clientHeight);
      tmpA.set(1, 0, 0).applyQuaternion(camera.quaternion);
      tmpB.set(0, 1, 0).applyQuaternion(camera.quaternion);
      s.target.addScaledVector(tmpA, -dx * worldPerPx).addScaledVector(tmpB, dy * worldPerPx);
    };
    const onContext = (e: Event) => e.preventDefault();
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.button === 2 || e.shiftKey });
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 1) {
        if (p.pan) pan(dx, dy);
        else {
          s.pendYaw -= dx * 0.0055;
          s.pendPitch -= dy * 0.0055;
        }
      } else if (pointers.size === 2) {
        // two fingers: pinch to zoom, move together to pan
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) zoomBy(Math.log(pinchDist / d) * 2.2);
        pinchDist = d;
        pan(dx / 2, dy / 2);
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      if (e.key === "+" || e.key === "=") zoomBy(-0.5);
      else if (e.key === "-" || e.key === "_") zoomBy(0.5);
      else if (e.key === "ArrowLeft") s.pendYaw += 0.25;
      else if (e.key === "ArrowRight") s.pendYaw -= 0.25;
      else if (e.key === "ArrowUp") s.pendPitch += 0.2;
      else if (e.key === "ArrowDown") s.pendPitch -= 0.2;
      else if ((e.key === "r" || e.key === "R" || e.key === "Home") && !e.ctrlKey && !e.metaKey) useApp.getState().reset();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey);
    };
  }, [gl, camera]);

  // --- simulation clock runs first ------------------------------------------
  useFrame((_, dt) => {
    clock.tick(Math.min(dt, 0.1));
    shared.uTime.value += Math.min(dt, 0.1);
  }, -3);

  // --- ephemeris: every body's position for this frame -------------------------
  useFrame(() => updateEphemeris(clock.jd), -2);

  // --- camera ------------------------------------------------------------------
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const s = st.current;
    const app = useApp.getState();

    if (app.flyNonce !== s.nonce) {
      const body = getBody(app.focus);
      if (body) {
        s.nonce = app.flyNonce;
        s.focus = app.focus;
        const to = body.position(tmpA);
        const u1 = to.distanceTo(s.target);
        const d0 = Math.exp(s.logD);
        const d1 = Math.max(body.viewDist, minDistance(body));
        const path = zoomPath(d0 * VIEW_K, d1 * VIEW_K, u1);
        const toDir = preferredDir(body, s.dir);
        const upTo = contextUp(body, d1).clone();
        s.flight = {
          t: 0,
          dur: Math.min(6, Math.max(1.1, 0.7 + path.S * 0.26)),
          from: s.target.clone(),
          u1,
          path,
          dirQ: toDir ? new Quaternion().setFromUnitVectors(s.dir, toDir) : null,
          fromDir: s.dir.clone(),
          upFrom: s.up.clone(),
          upTo,
          upQ: new Quaternion().setFromUnitVectors(s.up, upTo),
        };
        // a new flight cancels any leftover drag momentum
        s.pendYaw = 0;
        s.pendPitch = 0;
      } else if (!app.focus.startsWith("star:") && !app.focus.startsWith("exo:")) {
        s.nonce = app.flyNonce; // unknown id; stars/exoplanets wait for their catalogue to load
      }
    }

    // released from the UI ("Release" button): stay where we are, stop tracking
    if (app.focus === "free" && s.focus !== "free" && app.flyNonce === s.nonce) {
      s.focus = "free";
      s.flight = null;
      s.logGoal = s.logD;
    }

    const body = s.focus === "free" ? undefined : getBody(s.focus);
    const goal = body ? body.position(tmpA) : tmpA.copy(s.target);

    if (s.flight) {
      const f = s.flight;
      f.t += dt / f.dur;
      const t = Math.min(1, f.t);
      const e = smootherstep(t);
      const sPath = f.path.S * e;
      // the destination may be moving (planets): interpolate towards where it is now
      const k = f.u1 > 0 ? Math.min(1, f.path.u(sPath) / f.u1) : 1;
      s.target.lerpVectors(f.from, goal, t >= 1 ? 1 : k);
      s.logD = Math.log(f.path.w(sPath) / VIEW_K);
      if (f.dirQ) s.dir.copy(f.fromDir).applyQuaternion(qTmp.slerpQuaternions(qIdentity, f.dirQ, e)).normalize();
      s.up.copy(f.upFrom).applyQuaternion(qTmp.slerpQuaternions(qIdentity, f.upQ, e)).normalize();
      if (t >= 1) {
        s.flight = null;
        s.logGoal = s.logD;
      }
    } else {
      s.target.copy(goal);
      s.logD += (s.logGoal - s.logD) * (1 - Math.exp(-dt * 7));
    }

    // orientation: smoothly adopt the up axis of the current context (the flight handles its own)
    if (!s.flight && s.focus !== "free") s.up.lerp(contextUp(body, Math.exp(s.logD)), 1 - Math.exp(-dt * 2.5)).normalize();

    // damped rotation
    const k = 1 - Math.exp(-dt * 10);
    const yaw = s.pendYaw * k;
    const pitch = s.pendPitch * k;
    s.pendYaw -= yaw;
    s.pendPitch -= pitch;
    if (yaw) s.dir.applyAxisAngle(s.up, yaw);
    if (pitch) {
      axis.crossVectors(s.up, s.dir).normalize();
      const before = s.dir.clone();
      s.dir.applyAxisAngle(axis, -pitch);
      if (Math.abs(s.dir.dot(s.up)) > 0.995) s.dir.copy(before);
    }

    // never look straight along the up axis (lookAt would spin)
    const dUp = s.dir.dot(s.up);
    if (Math.abs(dUp) > 0.997) {
      axis.crossVectors(s.up, Math.abs(s.up.x) < 0.9 ? tmpB.set(1, 0, 0) : tmpB.set(0, 0, 1)).normalize();
      s.dir.addScaledVector(axis, 0.08).normalize();
    }

    const dist = Math.exp(s.logD);
    camera.position.copy(s.target).addScaledVector(s.dir, dist);
    camera.up.copy(s.up);
    camera.lookAt(s.target);
    camera.near = Math.max(dist * 0.002, 1e-14);
    camera.far = Math.max(dist * 100, 3e6);
    camera.updateProjectionMatrix();

    const dpr = viewport.dpr;
    shared.uDpr.value = dpr;
    shared.uPxScale.value = (size.height * dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    telemetry.distToFocus = dist;
    telemetry.distToSun = camera.position.length();
  }, -1);

  return null;
}
