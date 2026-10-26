import { ARMS, DEEP_SKY } from "@/data/galaxy";
import { MOONS, PLANETS, SPACECRAFT } from "@/data/solarSystem";
import { catalog, exo, meta } from "./stars";

export interface SearchEntry {
  id: string;
  name: string;
  alt: string;
  kind: string;
  rank: number;
}

let index: SearchEntry[] | null = null;
let builtWithMeta = false;

function build(): SearchEntry[] {
  const out: SearchEntry[] = [
    { id: "galaxy", name: "Milky Way", alt: "galaxy", kind: "Galaxy", rank: 0 },
    { id: "local", name: "Solar Neighbourhood", alt: "nearby stars local", kind: "Region", rank: 1 },
    { id: "solar", name: "Solar System", alt: "planets", kind: "Region", rank: 0 },
    { id: "sun", name: "Sun", alt: "sol", kind: "Star", rank: 0 },
    ...PLANETS.map((p) => ({ id: p.id, name: p.name, alt: "", kind: p.kind === "planet" ? "Planet" : "Dwarf planet", rank: 0 })),
    ...MOONS.map((m) => ({ id: m.id, name: m.name, alt: `moon ${m.parent}`, kind: "Moon", rank: 1 })),
    ...SPACECRAFT.map((s) => ({ id: s.id, name: s.name, alt: "spacecraft probe", kind: "Spacecraft", rank: 1 })),
    ...DEEP_SKY.map((d) => ({ id: `dso:${d.id}`, name: d.name, alt: d.id === "sgra" ? `${d.kind} galactic centre sgr a` : d.kind, kind: d.kind, rank: 1 })),
    { id: "s2", name: "S2", alt: "s0-2 star sagittarius", kind: "Star near Sgr A*", rank: 2 },
    ...ARMS.map((a) => ({ id: `arm:${a.id}`, name: a.name, alt: "spiral arm", kind: "Spiral arm", rank: 2 })),
  ];
  if (catalog && meta) {
    for (let i = 1; i < catalog.count; i++) {
      const m = meta[i];
      const sys = exo?.[i];
      if (!m) continue;
      if (m[0]) out.push({ id: `star:${i}`, name: m[0], alt: `${m[1]} ${m[3] ? "hip " + m[3] : ""}`, kind: "Star", rank: 2 });
      else if (sys) out.push({ id: `star:${i}`, name: sys.host, alt: m[1], kind: "Exoplanet host", rank: 3 });
      else if (m[1] && i < 3000) out.push({ id: `star:${i}`, name: m[1], alt: m[3] ? `hip ${m[3]}` : "", kind: "Star", rank: 4 });
      if (sys) sys.planets.forEach((p, k) => out.push({ id: `exo:${i}:${k}`, name: p.name, alt: "exoplanet", kind: "Exoplanet", rank: 4 }));
    }
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function search(q: string, limit = 9): SearchEntry[] {
  if (!index || (!builtWithMeta && meta)) {
    index = build();
    builtWithMeta = !!meta;
  }
  const n = norm(q.trim());
  if (!n) return [];
  const scored: { e: SearchEntry; s: number }[] = [];
  for (const e of index) {
    const name = norm(e.name);
    let s = -1;
    if (name === n) s = 0;
    else if (name.startsWith(n)) s = 1;
    else if (name.includes(" " + n)) s = 2;
    else if (name.includes(n)) s = 3;
    else if (norm(e.alt).includes(n)) s = 4;
    if (s >= 0) scored.push({ e, s: s * 10 + e.rank });
  }
  scored.sort((a, b) => a.s - b.s || a.e.name.length - b.e.name.length);
  return scored.slice(0, limit).map((x) => x.e);
}
