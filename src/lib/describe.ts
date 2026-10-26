import { Vector3 } from "three";
import { ARMS, DEEP_SKY, GALAXY_FACTS, GALAXY_SUMMARY } from "@/data/galaxy";
import { MOONS, PLANETS, SPACECRAFT, SUN, type Fact } from "@/data/solarSystem";
import { bodyPos } from "./ephemeris";
import { exoSemiMajorAU } from "./exo";
import { sceneToGalactic } from "./frames";
import { getBody } from "./registry";
import { S2_A, SGRA_POS } from "./sgra";
import {
  catalog, constellationName, exo, meta, spectralClass, starDesignation, starName, starPhysics, starPosition,
} from "./stars";
import { AU, KM, fmtDistance, fmtFixed, fmtLightTime, fmtNum, LY_PER_PC } from "./units";

// Builds the info-panel content for any body id. Static facts come from the
// curated datasets; "live" rows are recomputed from the current simulation.

export interface LinkItem {
  id: string;
  label: string;
  note?: string;
}

export interface Description {
  title: string;
  kicker: string;
  summary?: string;
  facts: Fact[];
  live?: () => Fact[];
  links?: { title: string; items: LinkItem[] };
  wiki?: string[];
  wikiAccept?: (s: { extract: string }) => boolean;
  accent: string;
}

const isStarArticle = (s: { extract: string }) => /\b(star|binary|system|dwarf|giant|supergiant)\b/i.test(s.extract);

function liveSolar(id: string): Fact[] {
  const p = bodyPos[id];
  if (!p) return [];
  const rows: Fact[] = [];
  const dSun = p.length();
  if (id !== "sun") rows.push({ label: "Distance from Sun (now)", value: `${fmtFixed(dSun / AU, 3)} AU` });
  if (id !== "earth") {
    const dE = p.distanceTo(bodyPos.earth);
    rows.push({ label: "Distance from Earth (now)", value: dE / AU > 0.05 ? `${fmtFixed(dE / AU, 3)} AU` : fmtDistance(dE) });
    rows.push({ label: "Light time from Earth", value: fmtLightTime(dE) });
  }
  return rows;
}

function nearestStars(n: number): LinkItem[] {
  if (!catalog) return [];
  const list: { i: number; d: number }[] = [];
  for (let i = 1; i < catalog.count; i++) {
    const d = Math.hypot(catalog.pos[i * 3], catalog.pos[i * 3 + 1], catalog.pos[i * 3 + 2]);
    if (d < 16) list.push({ i, d });
  }
  list.sort((a, b) => a.d - b.d);
  return list.slice(0, n).map(({ i, d }) => ({ id: `star:${i}`, label: starName(i), note: `${fmtFixed(d, 2)} ly` }));
}

export function describe(id: string): Description | null {
  if (id === "galaxy") {
    return {
      title: "Milky Way", kicker: "Barred spiral galaxy", summary: GALAXY_SUMMARY, facts: GALAXY_FACTS, accent: "#ffcf8a",
      wiki: ["Milky Way"],
      links: { title: "Explore", items: [{ id: "dso:sgra", label: "Sagittarius A*", note: "central black hole" }, ...ARMS.map((a) => ({ id: `arm:${a.id}`, label: a.name })), { id: "local", label: "Solar Neighbourhood", note: "you are here" }] },
    };
  }
  if (id === "local") {
    let within = 0;
    if (catalog) for (let i = 1; i < catalog.count; i++) if (Math.hypot(catalog.pos[i * 3], catalog.pos[i * 3 + 1], catalog.pos[i * 3 + 2]) < 20) within++;
    return {
      title: "Solar Neighbourhood", kicker: "Local Bubble · Orion Spur",
      summary: "The stars within a few dozen light-years of the Sun. Distances and brightness come from the HYG database (Hipparcos + Gliese); point sizes are what you'd see from the camera's position.",
      facts: [
        { label: "Catalogued stars within 20 ly", value: String(within) },
        { label: "Nearest star", value: "Proxima Centauri, 4.24 ly" },
        { label: "Local Bubble size", value: "~1,000 ly cavity of hot gas" },
        { label: "Local Interstellar Cloud", value: "~30 ly across, Sun inside" },
        { label: "Stars rendered", value: catalog ? catalog.count.toLocaleString() : "…" },
      ],
      links: { title: "Nearest stars", items: nearestStars(12) },
      accent: "#9cc4ff", wiki: ["Solar neighborhood"],
    };
  }
  if (id === "solar") {
    return {
      title: "Solar System", kicker: "Planetary system of the Sun",
      summary: "Eight planets, five recognised dwarf planets and millions of small bodies, bound to the Sun. Positions use JPL Keplerian elements for the simulated date.",
      facts: [
        { label: "Age", value: "4.568 billion years" }, { label: "Planets", value: "8" },
        { label: "Known moons", value: "~430" }, { label: "Heliopause", value: "~120 AU" },
        { label: "Oort cloud", value: "2,000 – 100,000 AU" }, { label: "Position", value: "26,670 ly from the Galactic Centre" },
      ],
      links: { title: "Bodies", items: [{ id: "sun", label: "Sun" }, ...PLANETS.map((p) => ({ id: p.id, label: p.name, note: p.kind === "dwarf planet" ? "dwarf" : undefined })), ...SPACECRAFT.map((s) => ({ id: s.id, label: s.name, note: "spacecraft" }))] },
      accent: "#ffcf8a", wiki: ["Solar System"],
    };
  }
  if (id === "sun") {
    return { title: "Sun", kicker: "G2V star · our star", summary: SUN.summary, facts: SUN.facts, live: () => liveSolar("sun"), accent: "#ffb45c", wiki: [SUN.wiki] };
  }
  const planet = PLANETS.find((p) => p.id === id);
  if (planet) {
    const moons = MOONS.filter((m) => m.parent === id);
    return {
      title: planet.name, kicker: planet.kind === "planet" ? "Planet" : "Dwarf planet", summary: planet.summary, facts: planet.facts,
      live: () => liveSolar(id), accent: planet.color, wiki: [planet.wiki],
      links: moons.length ? { title: "Major moons", items: moons.map((m) => ({ id: m.id, label: m.name })) } : undefined,
    };
  }
  const moon = MOONS.find((m) => m.id === id);
  if (moon) {
    const parent = PLANETS.find((p) => p.id === moon.parent)!;
    return {
      title: moon.name, kicker: `Moon of ${parent.name}`, summary: moon.summary,
      facts: [
        { label: "Diameter", value: `${fmtFixed(moon.radiusKm * 2, 0)} km` },
        { label: "Orbit radius", value: `${moon.aKm.toLocaleString()} km` },
        { label: "Orbital period", value: `${fmtFixed(Math.abs(moon.periodDays), 2)} days${moon.periodDays < 0 ? " (retrograde)" : ""}` },
        { label: "Rotation", value: "Tidally locked" },
      ],
      live: () => {
        const d = bodyPos[moon.id].distanceTo(bodyPos[moon.parent]);
        const rows = liveSolar(moon.id).filter((r) => !(moon.parent === "earth" && r.label.startsWith("Distance from Earth")));
        return [{ label: `Distance from ${parent.name} (now)`, value: `${fmtFixed(d / KM, 0)} km` }, ...rows];
      },
      accent: moon.color, wiki: [moon.wiki],
      links: { title: "Parent", items: [{ id: parent.id, label: parent.name }] },
    };
  }
  const craft = SPACECRAFT.find((s) => s.id === id);
  if (craft) {
    return {
      title: craft.name, kicker: "Spacecraft · interstellar space", summary: craft.summary,
      facts: [{ label: "Speed (vs Sun)", value: `${fmtFixed(craft.auPerYear * 4.74, 1)} km/s` }, { label: "Position", value: "Extrapolated from NASA/JPL status" }],
      live: () => [...liveSolar(craft.id)], accent: "#c8d6ff", wiki: [craft.wiki],
    };
  }
  if (id === "s2") {
    return {
      title: "S2 (S0-2)", kicker: "Star orbiting Sagittarius A*",
      summary: "A hot B-type star on a 16-year orbit around the Galactic Centre black hole. Tracking it proved Sgr A* is a black hole (Nobel Prize 2020) and its 2018 periapsis showed Einstein's gravitational redshift and precession.",
      facts: [
        { label: "Orbital period", value: "16.05 years" },
        { label: "Semi-major axis", value: `${fmtNum(S2_A / AU)} AU` },
        { label: "Eccentricity", value: "0.885" },
        { label: "Closest approach", value: "~120 AU (2018), ~7,700 km/s" },
        { label: "Next periapsis", value: "~2034" },
        { label: "Mass", value: "~14 M☉" },
        { label: "Elements", value: "GRAVITY Collaboration 2020" },
      ],
      live: () => [{ label: "Distance from Sgr A* (now)", value: `${fmtNum(getBody("s2")!.position(new Vector3()).distanceTo(SGRA_POS) / AU)} AU` }],
      accent: "#bcd2ff", wiki: ["S2 (star)"],
      links: { title: "Orbits", items: [{ id: "dso:sgra", label: "Sagittarius A*" }] },
    };
  }
  if (id.startsWith("dso:")) {
    const d = DEEP_SKY.find((x) => `dso:${x.id}` === id);
    if (!d) return null;
    const links = d.id === "sgra" ? { title: "Nearby", items: [{ id: "s2", label: "S2", note: "16-yr orbit" }] } : undefined;
    return { title: d.name, kicker: d.kind, summary: d.summary, facts: d.facts, accent: d.color, wiki: [d.wiki], links };
  }
  if (id.startsWith("arm:")) {
    const a = ARMS.find((x) => `arm:${x.id}` === id);
    if (!a) return null;
    return {
      title: a.name, kicker: a.major ? "Major spiral arm" : "Spiral arm / spur", summary: a.summary,
      facts: [{ label: "Pitch angle (model)", value: `${a.pitch}°` }, { label: "Radius toward Sun's azimuth", value: `${fmtFixed(a.r0 * 3.26156, 1)} kly from centre` }, { label: "Model", value: "Reid et al. 2019 (maser parallaxes)" }],
      accent: "#9cc4ff", wiki: [a.name.replace(/ \(.*\)/, "").replace("–", "-")],
    };
  }
  if (id.startsWith("exo:")) {
    const [, si, ki] = id.split(":");
    const i = +si;
    const p = exo?.[i]?.planets[+ki];
    if (!p) return null;
    const a = exoSemiMajorAU(i, p);
    const facts: Fact[] = [
      { label: "Host star", value: exo![i].host },
      { label: "Discovered", value: `${p.year} · ${p.method}` },
    ];
    if (p.r) facts.push({ label: "Radius", value: `${fmtFixed(p.r, 2)} R⊕` });
    if (p.m) facts.push({ label: "Mass", value: `${fmtNum(p.m)} M⊕${p.m > 100 ? ` (${fmtFixed(p.m / 317.8, 2)} MJ)` : ""}` });
    if (a) facts.push({ label: "Orbit radius", value: `${fmtFixed(a, 4)} AU${p.a ? "" : " (from period)"}` });
    if (p.per) facts.push({ label: "Orbital period", value: p.per > 1000 ? `${fmtFixed(p.per / 365.25, 1)} years` : `${fmtFixed(p.per, 2)} days` });
    if (p.e != null) facts.push({ label: "Eccentricity", value: fmtFixed(p.e, 3) });
    if (p.teq) facts.push({ label: "Equilibrium temp.", value: `${fmtFixed(p.teq, 0)} K (${fmtFixed(p.teq - 273.15, 0)} °C)` });
    const habitable = p.teq && p.teq > 180 && p.teq < 320 && (p.r ?? 1) < 2.5;
    return {
      title: p.name, kicker: habitable ? "Exoplanet · temperate, rocky-size" : "Exoplanet",
      summary: "Data: NASA Exoplanet Archive (Planetary Systems Composite). Orbit orientation and phase are illustrative.",
      facts, accent: "#7fb0ff", wiki: [p.name],
      links: { title: "System", items: [{ id: `star:${i}`, label: exo![i].host }, ...exo![i].planets.map((q, k) => ({ id: `exo:${i}:${k}`, label: q.name }))] },
    };
  }
  if (id.startsWith("star:")) {
    const i = +id.slice(5);
    if (!catalog || !(i > 0 && i < catalog.count)) return null;
    const phys = starPhysics(i);
    const pos = starPosition(i, new Vector3());
    const gal = sceneToGalactic(pos);
    const sys = exo?.[i];
    const name = starName(i);
    const spect = spectralClass(i);
    const facts: Fact[] = [
      { label: "Distance from Sun", value: `${fmtNum(phys.distLy)} ly (${fmtNum(phys.distLy / LY_PER_PC)} pc)` },
      { label: "Light left it in", value: `${fmtYear(new Date().getFullYear() - phys.distLy)}` },
      { label: "Spectral type", value: spect || "—" },
      { label: "Apparent magnitude", value: fmtFixed(phys.appMag, 2) + (phys.appMag < 6.5 ? " (naked eye)" : "") },
      { label: "Absolute magnitude", value: fmtFixed(phys.absMag, 2) },
      { label: "Luminosity (bolometric)", value: `${fmtNum(phys.lum)} L☉` },
      { label: "Temperature", value: `${fmtFixed(Math.round(phys.teff / 10) * 10, 0)} K` },
      { label: "Radius", value: `${fmtNum(phys.radius)} R☉${sys?.st.rad ? "" : " (est.)"}` },
    ];
    if (phys.mass) facts.push({ label: "Mass", value: `${fmtNum(phys.mass)} M☉` });
    const con = constellationName(i);
    if (con) facts.push({ label: "Constellation", value: con });
    facts.push({ label: "Galactic coords", value: `l ${fmtFixed(gal.l, 2)}°, b ${fmtFixed(gal.b, 2)}°` });
    const proper = meta?.[i]?.[0];
    const titles = [proper && `${proper} (star)`, proper, sys?.host].filter(Boolean) as string[];
    return {
      title: name, kicker: [starDesignation(i), spect && classLabel(spect)].filter(Boolean).join(" · ") || "Star",
      summary: sys ? `Hosts ${sys.planets.length} known exoplanet${sys.planets.length > 1 ? "s" : ""}.` : undefined,
      facts, accent: rgbHex(i), wiki: titles, wikiAccept: isStarArticle,
      links: sys ? { title: "Exoplanets", items: sys.planets.map((p, k) => ({ id: `exo:${i}:${k}`, label: p.name, note: p.r ? `${fmtFixed(p.r, 1)} R⊕` : p.m ? `${fmtNum(p.m)} M⊕` : undefined })) } : undefined,
    };
  }
  return getBody(id) ? { title: getBody(id)!.name, kicker: "", facts: [], accent: "#fff" } : null;
}

function fmtYear(y: number) {
  const r = Math.round(y);
  if (r > 0) return `${r} AD`;
  return `${Math.abs(r).toLocaleString()} BC`;
}

function classLabel(spect: string) {
  const c = spect.trim()[0]?.toUpperCase();
  const lum = /(Ia|Ib|III|II|IV|V)/.exec(spect)?.[1];
  const color = { O: "blue", B: "blue-white", A: "white", F: "yellow-white", G: "yellow", K: "orange", M: "red" }[c as "O"];
  const size = lum ? { Ia: "supergiant", Ib: "supergiant", II: "bright giant", III: "giant", IV: "subgiant", V: "dwarf" }[lum] : "";
  if (spect.startsWith("D")) return "white dwarf";
  return [color, size].filter(Boolean).join(" ");
}

function rgbHex(i: number) {
  const c = catalog!.color;
  const h = (x: number) => Math.round(Math.min(1, x) * 255).toString(16).padStart(2, "0");
  return `#${h(c[i * 3])}${h(c[i * 3 + 1])}${h(c[i * 3 + 2])}`;
}
