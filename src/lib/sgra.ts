import { Vector3 } from "three";
import { radecToScene } from "./frames";
import { AU, KM, R_SUN_KM } from "./units";

// Sagittarius A* — the supermassive black hole at the Galactic Centre.
//   Position: VLBA (Petrov et al. 2011), RA 17h45m40.036s, Dec −29°00′28.17″
//   Mass:     4.297 × 10⁶ M☉ (GRAVITY Collaboration 2022)
//   Disk:     EHT 2022 favours a low inclination (≲ 30–50°) to our line of sight
//   S2 orbit: GRAVITY Collaboration 2020, A&A 636, L5

export const SGRA = {
  ra: 266.41683,
  dec: -29.00781,
  distLy: 26_670,
  massSun: 4.297e6,
};

/** Schwarzschild radius in ly: 2GM/c² = 2.9532 km per solar mass */
export const RS = 2.95325 * SGRA.massSun * KM;
export const RS_KM = RS / KM;
export const DISK_IN = 3; // ISCO of a non-spinning hole, in Rs
export const DISK_OUT = 14;

export const SGRA_POS = radecToScene(SGRA.ra, SGRA.dec, SGRA.distLy);

/** Unit vectors at Sgr A*: line of sight (away from us), sky north, sky east. */
const los = SGRA_POS.clone().normalize();
const north = radecToScene(SGRA.ra, SGRA.dec + 0.01).sub(radecToScene(SGRA.ra, SGRA.dec)).normalize();
const east = radecToScene(SGRA.ra + 0.01, SGRA.dec).sub(radecToScene(SGRA.ra, SGRA.dec)).normalize();

/** Disk normal: tilted 30° from the direction to Earth. */
const gNorth = new Vector3(0, 1, 0).addScaledVector(los, -los.y).normalize();
export const DISK_N = los.clone().negate().multiplyScalar(Math.cos(Math.PI / 6)).addScaledVector(gNorth, Math.sin(Math.PI / 6)).normalize();
export const DISK_U = new Vector3().crossVectors(gNorth, DISK_N).normalize();
export const DISK_V = new Vector3().crossVectors(DISK_N, DISK_U).normalize();

/** Camera direction for a nearly edge-on (≈10° above the disk) "Interstellar" view. */
export const SGRA_VIEW_DIR = DISK_N.clone().multiplyScalar(Math.sin((10 * Math.PI) / 180)).addScaledVector(DISK_V, Math.cos((10 * Math.PI) / 180)).normalize();

// ---- S2 ------------------------------------------------------------------------
export const S2 = {
  aArcsec: 0.1254,
  e: 0.88466,
  iDeg: 134.567,
  omegaDeg: 66.263, // argument of periapsis ω
  nodeDeg: 228.171, // Ω
  tPeri: 2018.379, // decimal year
  periodYr: 16.0455,
  radiusKm: 6.1 * R_SUN_KM, // ~B0–2.5 V star, ~14 M☉
};
export const S2_A = S2.aArcsec * (SGRA.distLy / 3.261563777) * AU; // arcsec × pc = AU

/** Offset of S2 from Sgr A* (ly) at the given decimal year. */
export function s2Offset(year: number, out = new Vector3()): Vector3 {
  const M = (2 * Math.PI * (year - S2.tPeri)) / S2.periodYr;
  let E = M;
  for (let k = 0; k < 12; k++) E -= (E - S2.e * Math.sin(E) - M) / (1 - S2.e * Math.cos(E));
  return s2AtEccentricAnomaly(E, out);
}

export function s2AtEccentricAnomaly(E: number, out = new Vector3()): Vector3 {
  const e = S2.e;
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = S2_A * (1 - e * Math.cos(E));
  const DEG = Math.PI / 180;
  const w = S2.omegaDeg * DEG + nu, O = S2.nodeDeg * DEG, i = S2.iDeg * DEG;
  // Thiele–Innes: x towards north, y towards east, z along the line of sight
  const x = r * (Math.cos(w) * Math.cos(O) - Math.sin(w) * Math.sin(O) * Math.cos(i));
  const y = r * (Math.cos(w) * Math.sin(O) + Math.sin(w) * Math.cos(O) * Math.cos(i));
  const z = r * Math.sin(w) * Math.sin(i);
  return out.copy(north).multiplyScalar(x).addScaledVector(east, y).addScaledVector(los, z);
}

export const yearFromJd = (jd: number) => 2000 + (jd - 2451545) / 365.25;
