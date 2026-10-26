import { Matrix4, Vector3 } from "three";
import { MOONS, PLANETS, SPACECRAFT, SUN } from "@/data/solarSystem";
import { ECL_TO_SCENE, iauBodyMatrix, radecToScene } from "./frames";
import { ELEMENTS, J2000, heliocentric, moonGeocentric, orbitPath } from "./kepler";
import { clock, msFromJd } from "./time";
import { AU, KM } from "./units";

// Live state of every Solar System body, in world units (ly), updated once per
// frame before anything reads it (camera rig, meshes, labels, picking).

export const bodyPos: Record<string, Vector3> = {};
export const bodyRot: Record<string, Matrix4> = {};
/** Body equatorial frame without spin (moon orbit planes) */
const eqFrame: Record<string, Matrix4> = {};

const DEG = Math.PI / 180;
const EARTH_MOON_MASS_RATIO = 0.0123000371;

for (const id of ["sun", ...PLANETS.map((p) => p.id), ...MOONS.map((m) => m.id), ...SPACECRAFT.map((s) => s.id)]) {
  bodyPos[id] = new Vector3();
  bodyRot[id] = new Matrix4();
}
bodyRot.sun = new Matrix4();
for (const p of PLANETS) eqFrame[p.id] = iauBodyMatrix(p.pole[0], p.pole[1], 0);

const tmp = new Vector3();
const tmp2 = new Vector3();
const basisX = new Vector3();
const basisY = new Vector3();
const basisZ = new Vector3();

export function moonLocalOffset(m: (typeof MOONS)[number], jd: number, out: Vector3): Vector3 {
  if (m.id === "moon") {
    return moonGeocentric(jd, out).applyMatrix3(ECL_TO_SCENE).multiplyScalar(KM);
  }
  const theta = (m.phase + (360 * (jd - J2000)) / m.periodDays) * DEG;
  out.set(Math.cos(theta) * m.aKm * KM, 0, -Math.sin(theta) * m.aKm * KM);
  return out.applyMatrix4(eqFrame[m.parent]);
}

export function updateEphemeris(jd: number) {
  const d = jd - J2000;
  bodyPos.sun.set(0, 0, 0);
  iauBodyMatrix(SUN.pole[0], SUN.pole[1], SUN.w0 + SUN.wd * d, bodyRot.sun);

  for (const p of PLANETS) {
    heliocentric(ELEMENTS[p.id], jd, tmp).applyMatrix3(ECL_TO_SCENE).multiplyScalar(AU);
    bodyPos[p.id].copy(tmp);
    iauBodyMatrix(p.pole[0], p.pole[1], p.w0 + p.wd * d, bodyRot[p.id]);
  }

  // JPL gives the Earth–Moon barycentre; split it into Earth and Moon
  const moonOff = moonGeocentric(jd, tmp2).applyMatrix3(ECL_TO_SCENE).multiplyScalar(KM);
  bodyPos.earth.addScaledVector(moonOff, -EARTH_MOON_MASS_RATIO / (1 + EARTH_MOON_MASS_RATIO));

  for (const m of MOONS) {
    const parent = bodyPos[m.parent];
    moonLocalOffset(m, jd, tmp).add(parent);
    bodyPos[m.id].copy(tmp);
    // tidally locked: prime meridian (local +X) faces the parent
    basisX.subVectors(parent, tmp).normalize();
    basisY.set(0, 1, 0).applyMatrix4(eqFrame[m.parent]);
    basisZ.crossVectors(basisX, basisY).normalize();
    basisY.crossVectors(basisZ, basisX).normalize();
    bodyRot[m.id].makeBasis(basisX, basisY, basisZ);
  }

  const years = (msFromJd(jd) - Date.UTC(2024, 0, 1)) / (365.25 * 86400000);
  for (const s of SPACECRAFT) {
    radecToScene(s.raDeg, s.decDeg, Math.max(0, s.auAt2024 + s.auPerYear * years) * AU, bodyPos[s.id]);
  }
}

export function planetOrbit(id: string, jd: number): Float32Array {
  const pts = orbitPath(ELEMENTS[id], jd, 512);
  for (let i = 0; i < pts.length; i += 3) {
    tmp.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix3(ECL_TO_SCENE).multiplyScalar(AU);
    pts[i] = tmp.x;
    pts[i + 1] = tmp.y;
    pts[i + 2] = tmp.z;
  }
  return pts;
}

/** Orbit polyline of a moon relative to its parent, in ly. */
export function moonOrbit(id: string, jd: number, segments = 256): Float32Array {
  const m = MOONS.find((x) => x.id === id)!;
  const pts = new Float32Array((segments + 1) * 3);
  const period = Math.abs(m.periodDays);
  for (let i = 0; i <= segments; i++) {
    moonLocalOffset(m, jd + (i / segments) * period, tmp);
    pts.set([tmp.x, tmp.y, tmp.z], i * 3);
  }
  return pts;
}

// valid positions before the first frame renders
updateEphemeris(clock.jd);
