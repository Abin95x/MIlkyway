import { Vector3 } from "three";

// Keplerian elements from E.M. Standish, "Approximate Positions of the Planets"
// (JPL Solar System Dynamics) https://ssd.jpl.nasa.gov/planets/approx_pos.html
// Table 1 (1800-2050) and Table 2a/2b (3000 BC – 3000 AD).

export const J2000 = 2451545.0;
const DEG = Math.PI / 180;

/** [a, e, I, L, longPeri, longNode] and their rates per Julian century, + optional Table 2b terms */
export interface Elements {
  base: [number, number, number, number, number, number];
  rate: [number, number, number, number, number, number];
  extra?: [number, number, number, number]; // b, c, s, f
}
export interface ElementSet {
  near: Elements; // 1800-2050
  far: Elements; // 3000 BC – 3000 AD
}

const el = (base: Elements["base"], rate: Elements["rate"], extra?: Elements["extra"]): Elements => ({ base, rate, extra });

export const ELEMENTS: Record<string, ElementSet> = {
  mercury: {
    near: el([0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]),
    far: el([0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819], [0, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182]),
  },
  venus: {
    near: el([0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]),
    far: el([0.72332102, 0.00676399, 3.39777545, 181.9797085, 131.76755713, 76.67261496], [-0.00000026, -0.00005107, 0.00043494, 58517.8156026, 0.05679648, -0.27274174]),
  },
  earth: {
    near: el([1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]),
    far: el([1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389], [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.3179526, -0.24123856]),
  },
  mars: {
    near: el([1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]),
    far: el([1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984], [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431]),
  },
  jupiter: {
    near: el([5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]),
    far: el([5.20248019, 0.0485359, 1.29861416, 34.33479152, 14.27495244, 100.29282654], [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619], [-0.00012452, 0.0606406, -0.35635438, 38.35125]),
  },
  saturn: {
    near: el([9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]),
    far: el([9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702], [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002], [0.00025899, -0.13434469, 0.87320147, 38.35125]),
  },
  uranus: {
    near: el([19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]),
    far: el([19.18797948, 0.0468574, 0.77298127, 314.20276625, 172.43404441, 73.96250215], [-0.00020455, -0.0000155, -0.00180155, 428.49512595, 0.09266985, 0.05739699], [0.00058331, -0.97731848, 0.17689245, 7.67025]),
  },
  neptune: {
    near: el([30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]),
    far: el([30.06952752, 0.00895439, 1.7700552, 304.22289287, 46.68158724, 131.78635853], [0.00006447, 0.00000818, 0.000224, 218.46515314, 0.01009938, -0.00606302], [-0.00041348, 0.68346318, -0.10162547, 7.67025]),
  },
  // Pluto: from the original (pre-2006) edition of the same JPL table
  pluto: {
    near: el([39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684], [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482]),
    far: el([39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684], [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482]),
  },
};

export interface OrbitState {
  a: number; e: number; I: number; w: number; node: number; M: number;
}

export function elementsAt(set: ElementSet, jd: number): OrbitState {
  const T = (jd - J2000) / 36525;
  const useNear = T >= -2 && T <= 0.5; // 1800 – 2050
  const { base, rate, extra } = useNear ? set.near : set.far;
  const a = base[0] + rate[0] * T;
  const e = base[1] + rate[1] * T;
  const I = (base[2] + rate[2] * T) * DEG;
  const L = base[3] + rate[3] * T;
  const wbar = base[4] + rate[4] * T;
  const node = (base[5] + rate[5] * T) * DEG;
  let M = L - wbar;
  if (!useNear && extra) {
    const [b, c, s, f] = extra;
    M += b * T * T + c * Math.cos(f * T * DEG) + s * Math.sin(f * T * DEG);
  }
  M = ((((M + 180) % 360) + 360) % 360) - 180;
  return { a, e, I, w: wbar * DEG - node, node, M: M * DEG };
}

function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/** Position in the orbital plane -> heliocentric ecliptic J2000 (AU). */
function toEcliptic(o: OrbitState, xp: number, yp: number, out: Vector3): Vector3 {
  const cw = Math.cos(o.w), sw = Math.sin(o.w);
  const cO = Math.cos(o.node), sO = Math.sin(o.node);
  const cI = Math.cos(o.I), sI = Math.sin(o.I);
  return out.set(
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  );
}

/** Heliocentric ecliptic J2000 position in AU. */
export function heliocentric(set: ElementSet, jd: number, out = new Vector3()): Vector3 {
  const o = elementsAt(set, jd);
  const E = solveKepler(o.M, o.e);
  return toEcliptic(o, o.a * (Math.cos(E) - o.e), o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E), out);
}

/** Closed orbit polyline (ecliptic AU), flattened xyz, sampled densely near perihelion. */
export function orbitPath(set: ElementSet, jd: number, segments = 360): Float32Array {
  const o = elementsAt(set, jd);
  const out = new Float32Array((segments + 1) * 3);
  const v = new Vector3();
  const b = o.a * Math.sqrt(1 - o.e * o.e);
  for (let i = 0; i <= segments; i++) {
    const E = (i / segments) * Math.PI * 2;
    toEcliptic(o, o.a * (Math.cos(E) - o.e), b * Math.sin(E), v);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

/**
 * Geocentric Moon position (ecliptic, km), low-precision series from
 * Meeus / Astronomical Almanac (≈0.3° accuracy) — enough for correct phases.
 */
export function moonGeocentric(jd: number, out = new Vector3()): Vector3 {
  const d = jd - J2000;
  const L = (218.316 + 13.176396 * d) * DEG;
  const M = (134.963 + 13.064993 * d) * DEG;
  const F = (93.272 + 13.22935 * d) * DEG;
  const lon = L + 6.289 * DEG * Math.sin(M);
  const lat = 5.128 * DEG * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M);
  return out.set(dist * Math.cos(lat) * Math.cos(lon), dist * Math.cos(lat) * Math.sin(lon), dist * Math.sin(lat));
}
