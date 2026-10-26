// World unit: 1 light-year. The Sun sits at the origin, so the Solar System
// (tiny numbers) keeps full float precision while the galaxy uses large ones.

export const KM_PER_LY = 9.4607304725808e12;
export const KM_PER_AU = 149_597_870.7;
export const AU = KM_PER_AU / KM_PER_LY; // light-years per AU
export const KM = 1 / KM_PER_LY; // light-years per km
export const LY_PER_PC = 3.261563777;
export const R_SUN_KM = 695_700;
export const SECONDS_PER_DAY = 86_400;
export const DAYS_PER_YEAR = 365.25;

export function fmtNum(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e15 || a < 1e-3)) return n.toExponential(2).replace("e+", "e");
  return n.toLocaleString("en-US", { maximumSignificantDigits: Math.max(digits, Math.ceil(Math.log10(a + 1))) });
}

export function fmtFixed(n: number, max = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: max });
}

/** Human readable distance from a value in light-years. */
export function fmtDistance(ly: number): string {
  const km = ly * KM_PER_LY;
  if (km < 2e6) return `${fmtFixed(km, 0)} km`;
  const au = ly / AU;
  if (ly < 0.1) return `${fmtNum(au)} AU`;
  if (ly < 1e4) return `${fmtNum(ly)} ly`;
  if (ly < 1e6) return `${fmtNum(ly / 1000)} kly`;
  return `${fmtNum(ly / 1e6)} Mly`;
}

/** How long light takes to cross a distance given in light-years. */
export function fmtLightTime(ly: number): string {
  const s = ly * DAYS_PER_YEAR * SECONDS_PER_DAY;
  if (s < 1) return `${fmtFixed(s * 1000, 1)} ms`;
  if (s < 120) return `${fmtFixed(s, 1)} s`;
  if (s < 7200) return `${fmtFixed(s / 60, 1)} min`;
  if (s < 2 * 86400) return `${fmtFixed(s / 3600, 1)} h`;
  if (ly < 1) return `${fmtFixed(s / 86400, 1)} days`;
  return `${fmtNum(ly)} years`;
}
