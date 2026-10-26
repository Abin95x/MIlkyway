import { Vector3 } from "three";
import { J2000 } from "./kepler";
import { exo, starPhysics, starPosition, type ExoPlanet } from "./stars";
import { AU, KM } from "./units";

// Exoplanet systems from the NASA Exoplanet Archive. Orbit orientation and
// orbital phase are generally unknown, so each system gets a deterministic
// orientation; sizes and orbit radii are the catalogued values.

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function exoSemiMajorAU(starIndex: number, p: ExoPlanet): number | null {
  if (p.a) return p.a;
  if (!p.per) return null;
  const mass = exo?.[starIndex]?.st.mass ?? 1;
  const years = p.per / 365.25;
  return Math.cbrt(mass * years * years);
}

export function exoRadiusKm(p: ExoPlanet): number {
  if (p.r) return p.r * 6371;
  if (p.m) return Math.min(13, Math.pow(p.m, p.m < 2 ? 0.28 : 0.55)) * 6371;
  return 6371;
}

const axes = new Map<number, { n: Vector3; u: Vector3; v: Vector3 }>();
export function exoPlane(starIndex: number) {
  let ax = axes.get(starIndex);
  if (!ax) {
    const tilt = (hash(starIndex) - 0.5) * 1.2;
    const turn = hash(starIndex + 7) * Math.PI * 2;
    const n = new Vector3(Math.sin(tilt) * Math.cos(turn), Math.cos(tilt), Math.sin(tilt) * Math.sin(turn)).normalize();
    const u = new Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize();
    const v = new Vector3().crossVectors(n, u);
    ax = { n, u, v };
    axes.set(starIndex, ax);
  }
  return ax;
}

export function exoPlanetPosition(starIndex: number, k: number, jd: number, out: Vector3): Vector3 {
  const sys = exo?.[starIndex];
  const p = sys?.planets[k];
  starPosition(starIndex, out);
  if (!p) return out;
  const a = (exoSemiMajorAU(starIndex, p) ?? 0) * AU;
  const per = p.per ?? 365.25 * Math.sqrt(Math.pow((a / AU), 3) / (sys!.st.mass ?? 1));
  const th = hash(starIndex * 31 + k) * Math.PI * 2 + (2 * Math.PI * (jd - J2000)) / per;
  const { u, v } = exoPlane(starIndex);
  return out.addScaledVector(u, Math.cos(th) * a).addScaledVector(v, -Math.sin(th) * a);
}

export function exoSystemExtent(starIndex: number): number {
  const sys = exo?.[starIndex];
  if (!sys) return 0;
  let max = 0;
  for (const p of sys.planets) max = Math.max(max, exoSemiMajorAU(starIndex, p) ?? 0);
  return max * AU;
}

export function starRadiusLy(i: number) {
  return starPhysics(i).radius * 695_700 * KM;
}
