import { Vector3 } from "three";
import { ARMS, DEEP_SKY, R0, armRadius, galactoToScene } from "@/data/galaxy";
import { MOONS, PLANETS, SPACECRAFT } from "@/data/solarSystem";
import { bodyPos } from "./ephemeris";
import { radecToScene } from "./frames";
import { exoPlanetPosition, exoRadiusKm, exoSystemExtent } from "./exo";
import { catalog, exo, starName, starPhysics, starPosition } from "./stars";
import { DISK_N, RS, S2, SGRA_POS, s2Offset, yearFromJd } from "./sgra";
import { clock } from "./time";
import { AU, KM, R_SUN_KM } from "./units";

export type BodyKind =
  | "galaxy" | "region" | "sun" | "planet" | "dwarf planet" | "moon" | "star" | "deepsky" | "arm" | "spacecraft";

export interface Body {
  id: string;
  name: string;
  kind: BodyKind;
  parent?: string;
  /** physical radius in ly (sets minimum zoom distance) */
  radius: number;
  /** default framing distance in ly */
  viewDist: number;
  up: "galactic" | "ecliptic";
  /** optional custom up axis used when close (e.g. a black hole's disk normal) */
  upVector?: Vector3;
  position(out: Vector3): Vector3;
}

const fixed = (v: Vector3) => (out: Vector3) => out.copy(v);
const live = (id: string) => (out: Vector3) => out.copy(bodyPos[id]);

const bodies = new Map<string, Body>();
const add = (b: Body) => bodies.set(b.id, b);

add({ id: "galaxy", name: "Milky Way", kind: "galaxy", radius: 0, viewDist: 105_000, up: "galactic", position: fixed(new Vector3(R0, 0, 0)) });
add({ id: "local", name: "Solar Neighbourhood", kind: "region", parent: "galaxy", radius: R_SUN_KM * KM, viewDist: 38, up: "galactic", position: fixed(new Vector3()) });
add({ id: "solar", name: "Solar System", kind: "region", parent: "local", radius: R_SUN_KM * KM, viewDist: 75 * AU, up: "ecliptic", position: fixed(new Vector3()) });
add({ id: "sun", name: "Sun", kind: "sun", parent: "solar", radius: R_SUN_KM * KM, viewDist: R_SUN_KM * KM * 4.5, up: "ecliptic", position: live("sun") });

for (const p of PLANETS) {
  const r = p.radiusKm * KM;
  add({ id: p.id, name: p.name, kind: p.kind, parent: "solar", radius: r, viewDist: r * (p.ring ? 7 : 4.2), up: "ecliptic", position: live(p.id) });
}
for (const m of MOONS) {
  const r = m.radiusKm * KM;
  add({ id: m.id, name: m.name, kind: "moon", parent: m.parent, radius: r, viewDist: Math.max(r * 4.5, 60 * KM), up: "ecliptic", position: live(m.id) });
}
for (const s of SPACECRAFT) {
  add({ id: s.id, name: s.name, kind: "spacecraft", parent: "solar", radius: 0.01 * KM, viewDist: 2 * AU, up: "ecliptic", position: live(s.id) });
}
for (const d of DEEP_SKY) {
  const v = radecToScene(d.ra, d.dec, d.distLy);
  const outer = d.distLy > 100_000;
  if (d.id === "sgra") {
    add({ id: "dso:sgra", name: d.name, kind: "deepsky", parent: "galaxy", radius: 6 * RS, viewDist: 30 * RS, up: "galactic", upVector: DISK_N, position: fixed(SGRA_POS) });
    continue;
  }
  add({ id: `dso:${d.id}`, name: d.name, kind: "deepsky", parent: "galaxy", radius: 0, viewDist: outer ? 60_000 : 1500, up: "galactic", position: fixed(v) });
}
add({
  id: "s2", name: "S2", kind: "star", parent: "dso:sgra", radius: S2.radiusKm * KM, viewDist: 300 * AU, up: "galactic", upVector: DISK_N,
  position: (out) => s2Offset(yearFromJd(clock.jd), out).add(SGRA_POS),
});
for (const a of ARMS) {
  const [x, y, z] = galactoToScene(armRadius(a, a.labelAt), a.labelAt);
  add({ id: `arm:${a.id}`, name: a.name, kind: "arm", parent: "galaxy", radius: 0, viewDist: 40_000, up: "galactic", position: fixed(new Vector3(x, y, z)) });
}

const starCache = new Map<number, Body>();
function starBody(i: number): Body | undefined {
  if (!catalog || !Number.isInteger(i) || i < 0 || i >= catalog.count) return undefined;
  if (i === 0) return bodies.get("sun");
  let b = starCache.get(i);
  if (!b) {
    const r = starPhysics(i).radius * R_SUN_KM * KM;
    const v = starPosition(i);
    b = { id: `star:${i}`, name: "", kind: "star", parent: "local", radius: r, viewDist: 0, up: "galactic", position: fixed(v) };
    starCache.set(i, b);
  }
  // names and planetary systems arrive after the metadata loads
  b.name = starName(i);
  const extent = exoSystemExtent(i);
  b.viewDist = extent > 0 ? Math.max(b.radius * 8, extent * 2.6) : Math.max(b.radius * 6, 0.05 * AU);
  return b;
}

function exoBody(id: string): Body | undefined {
  const [, si, ki] = id.split(":");
  const i = +si, k = +ki;
  const p = exo?.[i]?.planets[k];
  if (!p) return undefined;
  const r = exoRadiusKm(p) * KM;
  return {
    id, name: p.name, kind: "planet", parent: `star:${i}`, radius: r, viewDist: r * 4.5, up: "galactic",
    position: (out) => exoPlanetPosition(i, k, clock.jd, out),
  };
}

export function getBody(id: string): Body | undefined {
  if (id.startsWith("star:")) return starBody(+id.slice(5));
  if (id.startsWith("exo:")) return exoBody(id);
  return bodies.get(id);
}

export function allBodies(): Body[] {
  return [...bodies.values()];
}

export function ancestry(id: string): Body[] {
  const chain: Body[] = [];
  let b = getBody(id);
  while (b) {
    chain.unshift(b);
    b = b.parent ? getBody(b.parent) : undefined;
  }
  return chain;
}

