import { Matrix3, Matrix4, Vector3 } from "three";

// Scene frame = galactic frame re-labelled for three.js:
//   +X towards the Galactic Centre, +Y towards the North Galactic Pole,
//   -Z towards galactic longitude 90° (direction of Galactic rotation).

const DEG = Math.PI / 180;

// Equatorial (ICRS/J2000) -> Galactic, Hipparcos convention
const EQ_TO_GAL = new Matrix3().set(
  -0.0548755604162154, -0.873437090234885, -0.4838350155487132,
  0.4941094278755837, -0.4448296299600112, 0.7469822444972189,
  -0.8676661490190047, -0.1980763734312015, 0.4559837761750669,
);
const GAL_TO_SCENE = new Matrix3().set(1, 0, 0, 0, 0, 1, 0, -1, 0);
export const EQ_TO_SCENE = new Matrix3().multiplyMatrices(GAL_TO_SCENE, EQ_TO_GAL);

const OBLIQUITY = 23.43928 * DEG;
const ECL_TO_EQ = new Matrix3().set(
  1, 0, 0,
  0, Math.cos(OBLIQUITY), -Math.sin(OBLIQUITY),
  0, Math.sin(OBLIQUITY), Math.cos(OBLIQUITY),
);
export const ECL_TO_SCENE = new Matrix3().multiplyMatrices(EQ_TO_SCENE, ECL_TO_EQ);
export const ECL_TO_SCENE4 = new Matrix4().setFromMatrix3(ECL_TO_SCENE);

export const GALACTIC_NORTH = new Vector3(0, 1, 0);
export const ECLIPTIC_NORTH = new Vector3(0, 0, 1).applyMatrix3(ECL_TO_SCENE).normalize();
export const EQUATORIAL_NORTH = new Vector3(0, 0, 1).applyMatrix3(EQ_TO_SCENE).normalize();

/** Unit vector (or scaled by dist) in scene frame from RA/Dec in degrees. */
export function radecToScene(raDeg: number, decDeg: number, dist = 1, out = new Vector3()): Vector3 {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  out.set(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
  return out.applyMatrix3(EQ_TO_SCENE).multiplyScalar(dist);
}

export function eclipticToScene(v: Vector3): Vector3 {
  return v.applyMatrix3(ECL_TO_SCENE);
}

/** Galactic longitude/latitude in degrees for a scene-frame vector. */
export function sceneToGalactic(v: Vector3): { l: number; b: number } {
  const gx = v.x, gy = -v.z, gz = v.y;
  const r = Math.hypot(gx, gy, gz) || 1;
  let l = Math.atan2(gy, gx) / DEG;
  if (l < 0) l += 360;
  return { l, b: Math.asin(gz / r) / DEG };
}

/**
 * IAU body-fixed frame. Returns a rotation matrix whose local +Y is the north
 * pole and local +X the prime meridian (longitude 0), matching three.js
 * SphereGeometry UVs (u = 0.5 on +X, east towards -Z).
 */
export function iauBodyMatrix(poleRA: number, poleDec: number, wDeg: number, out = new Matrix4()): Matrix4 {
  const pole = radecToScene(poleRA, poleDec);
  const node = radecToScene(poleRA + 90, 0); // ascending node of the body equator on the ICRF equator
  const q2 = new Vector3().crossVectors(pole, node);
  const w = wDeg * DEG;
  const x = node.multiplyScalar(Math.cos(w)).addScaledVector(q2, Math.sin(w)).normalize();
  const z = new Vector3().crossVectors(x, pole);
  return out.makeBasis(x, pole, z);
}
