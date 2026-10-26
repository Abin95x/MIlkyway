import { Vector3 } from "three";
import { CONSTELLATIONS } from "@/data/galaxy";
import { LY_PER_PC } from "./units";

// Star catalogue produced by scripts/build-data.mjs (HYG v4.4 + NASA exoplanet hosts).
// Sorted brightest-first (as seen from Earth); index 0 is the Sun.

export interface StarCatalog {
  count: number;
  /** scene positions in ly, xyz interleaved */
  pos: Float32Array;
  absMag: Float32Array;
  ci: Float32Array;
  color: Float32Array;
}

export type StarMeta = [name: string, designation: string, spectral: string, hip: number, constellation: string];

export interface ExoPlanet {
  name: string;
  a: number | null; // AU
  r: number | null; // Earth radii
  m: number | null; // Earth masses
  per: number | null; // days
  e: number | null;
  teq: number | null; // K
  year: number;
  method: string;
}
export interface ExoSystem {
  host: string;
  st: { teff: number | null; rad: number | null; mass: number | null; spect: string | null };
  planets: ExoPlanet[];
}

export let catalog: StarCatalog | null = null;
export let meta: StarMeta[] | null = null;
export let exo: Record<number, ExoSystem> | null = null;

/** Ballesteros (2012) B−V → effective temperature */
export function teffFromBV(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/** Blackbody temperature → approximate sRGB (Tanner Helland fit), 0..1 */
export function rgbFromTeff(t: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const k = Math.min(40000, Math.max(1000, t)) / 100;
  let r: number, g: number, b: number;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = 255;
  }
  out[0] = Math.min(255, Math.max(0, r)) / 255;
  out[1] = Math.min(255, Math.max(0, g)) / 255;
  out[2] = Math.min(255, Math.max(0, b)) / 255;
  return out;
}

let loading: Promise<StarCatalog> | null = null;
export function loadStars(): Promise<StarCatalog> {
  if (loading) return loading;
  loading = fetch("/data/stars.bin")
    .then((r) => {
      if (!r.ok) throw new Error(`stars.bin: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const raw = new Float32Array(buf);
      const count = raw.length / 5;
      const pos = new Float32Array(count * 3);
      const absMag = new Float32Array(count);
      const ci = new Float32Array(count);
      const color = new Float32Array(count * 3);
      const rgb: [number, number, number] = [0, 0, 0];
      for (let i = 0; i < count; i++) {
        pos[i * 3] = raw[i * 5];
        pos[i * 3 + 1] = raw[i * 5 + 1];
        pos[i * 3 + 2] = raw[i * 5 + 2];
        absMag[i] = raw[i * 5 + 3];
        ci[i] = raw[i * 5 + 4];
        rgbFromTeff(teffFromBV(ci[i]), rgb);
        color.set(rgb, i * 3);
      }
      catalog = { count, pos, absMag, ci, color };
      return catalog;
    });
  return loading;
}

let metaLoading: Promise<void> | null = null;
export function loadStarMeta(): Promise<void> {
  if (metaLoading) return metaLoading;
  metaLoading = Promise.all([
    fetch("/data/stars-meta.json").then((r) => r.json() as Promise<StarMeta[]>),
    fetch("/data/exoplanets.json").then((r) => r.json() as Promise<Record<number, ExoSystem>>),
  ]).then(([m, e]) => {
    meta = m;
    exo = e;
  });
  return metaLoading;
}

export function starPosition(i: number, out = new Vector3()): Vector3 {
  const p = catalog!.pos;
  return out.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
}

export function starName(i: number): string {
  if (i === 0) return "Sun";
  const m = meta?.[i];
  const host = exo?.[i]?.host;
  if (!m) return host ?? `Star #${i}`;
  return m[0] || m[1] || host || (m[3] ? `HIP ${m[3]}` : `Star #${i}`);
}

export function starDesignation(i: number): string {
  const m = meta?.[i];
  if (!m) return "";
  const parts = [m[0] ? m[1] : "", m[3] ? `HIP ${m[3]}` : ""].filter(Boolean);
  return parts.join(" · ");
}

export function constellationName(i: number): string {
  const c = meta?.[i]?.[4];
  return c ? (CONSTELLATIONS[c] ?? c) : "";
}

/**
 * Bolometric correction BC_V(Teff), Torres (2010) fit to Flower (1996).
 * Cool giants emit most light in the infrared, so V-band alone underestimates them.
 */
export function bolometricCorrection(teff: number): number {
  const lt = Math.log10(Math.min(40000, Math.max(3100, teff)));
  let bc: number;
  if (lt < 3.7) bc = -0.190537291496456e5 + 0.155144866764412e5 * lt - 0.421278819301717e4 * lt ** 2 + 0.381476328422343e3 * lt ** 3;
  else if (lt < 3.9) bc = -0.370510203809015e5 + 0.385672629965804e5 * lt - 0.150651486316025e5 * lt ** 2 + 0.261724637119416e4 * lt ** 3 - 0.170623810323864e3 * lt ** 4;
  else bc = -0.118115450538963e6 + 0.137145973583929e6 * lt - 0.636233812100225e5 * lt ** 2 + 0.147412923562646e5 * lt ** 3 - 0.170587278406872e4 * lt ** 4 + 0.78873172180499e2 * lt ** 5;
  return Math.max(-4.5, bc);
}

export interface StarPhysics {
  distLy: number;
  appMag: number; // from Earth
  absMag: number;
  lum: number; // L☉, bolometric
  teff: number; // K
  radius: number; // R☉
  mass: number | null; // M☉
}

export function starPhysics(i: number): StarPhysics {
  const c = catalog!;
  const p = starPosition(i);
  const distLy = p.length();
  const absMag = c.absMag[i];
  const sys = exo?.[i];
  const teff = sys?.st.teff ?? teffFromBV(c.ci[i]);
  const lum = Math.pow(10, -0.4 * (absMag + bolometricCorrection(teff) - 4.74));
  const radius = sys?.st.rad ?? Math.min(3000, Math.max(0.01, Math.sqrt(lum) * Math.pow(5772 / teff, 2)));
  const appMag = i === 0 ? -26.74 : absMag + 5 * Math.log10(distLy / LY_PER_PC / 10);
  return { distLy, appMag, absMag, lum, teff, radius, mass: sys?.st.mass ?? null };
}

export function spectralClass(i: number): string {
  return meta?.[i]?.[2] || exo?.[i]?.st.spect || "";
}
