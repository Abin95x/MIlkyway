// Milky Way structure. Spiral-arm geometry follows the log-spiral fits of
// Reid et al. 2019 (ApJ 885, 131 — BeSSeL/VERA maser parallaxes), simplified to
// one pitch angle per arm. Sun–GC distance: GRAVITY Collaboration 2019 (8.178 kpc).
// Global properties: Wikipedia "Milky Way" infobox and references therein.

import type { Fact } from "./solarSystem";

export const KPC = 3261.56; // ly
export const R0 = 26_670; // ly, Sun -> Sgr A*

export interface ArmDef {
  id: string;
  name: string;
  /** galactocentric radius at azimuth 0 (towards Sun), kpc */
  r0: number;
  pitch: number; // degrees
  from: number; // azimuth range, degrees (positive = direction of rotation)
  to: number;
  weight: number;
  width: number; // kpc (1σ)
  major: boolean;
  labelAt: number; // azimuth for label
  summary: string;
}

export const ARMS: ArmDef[] = [
  { id: "scutum", name: "Scutum–Centaurus Arm", r0: 5.43, pitch: 13, from: -250, to: 95, weight: 0.29, width: 0.32, major: true, labelAt: -150,
    summary: "One of the two major arms, rich in old and young stars. It starts at the near end of the central bar and wraps around the far side of the Galaxy." },
  { id: "perseus", name: "Perseus Arm", r0: 10.07, pitch: 9.5, from: -150, to: 200, weight: 0.28, width: 0.34, major: true, labelAt: 35,
    summary: "The second major arm, ~6,400 ly outward from the Sun. It hosts the Double Cluster and Cassiopeia A." },
  { id: "norma", name: "Norma–Outer Arm", r0: 4.44, pitch: 10, from: -330, to: 40, weight: 0.17, width: 0.3, major: false, labelAt: -290,
    summary: "Begins near the bar inside the Sun's orbit and winds out past the Sun's orbit as the Outer Arm." },
  { id: "sagittarius", name: "Sagittarius–Carina Arm", r0: 6.87, pitch: 14, from: -110, to: 140, weight: 0.18, width: 0.28, major: false, labelAt: 70,
    summary: "The next arm inward from the Sun (~5,000 ly). Home to the Eagle, Lagoon and Carina nebulae." },
  { id: "local", name: "Orion–Cygnus Arm (Local Spur)", r0: 8.4, pitch: 11.4, from: -30, to: 40, weight: 0.08, width: 0.2, major: false, labelAt: -18,
    summary: "The minor arm or spur that contains the Sun, ~3,500 ly wide and ~10,000+ ly long. The Orion Nebula and many naked-eye stars lie in it." },
];

/** Galactocentric (radius kpc, azimuth deg) → scene coordinates in ly. */
export function galactoToScene(rKpc: number, azDeg: number, y = 0): [number, number, number] {
  const az = (azDeg * Math.PI) / 180;
  const r = rKpc * KPC * (8.178 / 8.15); // Reid et al. used R0 = 8.15 kpc
  return [R0 - r * Math.cos(az), y, -r * Math.sin(az)];
}

export function armRadius(arm: ArmDef, azDeg: number): number {
  return arm.r0 * Math.exp((-azDeg * Math.PI * Math.tan((arm.pitch * Math.PI) / 180)) / 180);
}

export const BAR = { halfLengthKpc: 4.5, angleDeg: 27 };

export const GALAXY_FACTS: Fact[] = [
  { label: "Type", value: "Barred spiral — SB(rs)bc" },
  { label: "Stellar disk diameter", value: "~87,400 ly (26.8 kpc)" },
  { label: "Stars", value: "100–400 billion" },
  { label: "Total mass", value: "~1.15 × 10¹² M☉ (incl. dark matter)" },
  { label: "Age", value: "~13.6 billion years" },
  { label: "Sun → Galactic Centre", value: "26,670 ly (8.178 kpc)" },
  { label: "Thin disk thickness", value: "~1,000 ly" },
  { label: "Sun's orbital speed", value: "~230 km/s" },
  { label: "Galactic year", value: "~230 million years" },
  { label: "Central black hole", value: "Sgr A*, 4.3 million M☉" },
  { label: "Known exoplanets", value: "6,000+ (NASA archive)" },
];

export const GALAXY_SUMMARY =
  "Our home galaxy: a barred spiral seen from the inside as the glowing band across the night sky. " +
  "The Sun sits ~26,700 light-years from the centre in a minor spur between the Sagittarius and Perseus arms.";

export interface DeepSkyDef {
  id: string;
  name: string;
  kind: string;
  ra: number;
  dec: number;
  distLy: number;
  color: string;
  wiki: string;
  summary: string;
  facts: Fact[];
}

// Positions: SIMBAD J2000 coordinates; distances from the cited Wikipedia articles
export const DEEP_SKY: DeepSkyDef[] = [
  { id: "sgra", name: "Sagittarius A*", kind: "Supermassive black hole", ra: 266.41683, dec: -29.00781, distLy: 26_670, color: "#ffb26b", wiki: "Sagittarius_A*",
    summary: "The 4.3-million-solar-mass black hole at the dynamical centre of the Milky Way, imaged by the Event Horizon Telescope in 2022. Rendered here by tracing light rays through the Schwarzschild metric: the dark shadow, the thin photon ring, the lensed galaxy behind it and the Doppler-brightened side of the disk are real relativistic effects. The bright disk itself is stylised — the real Sgr A* is a dim, starving black hole.",
    facts: [
      { label: "Mass", value: "4.297 × 10⁶ M☉ (GRAVITY 2022)" },
      { label: "Schwarzschild radius", value: "12.7 million km (0.085 AU)" },
      { label: "Shadow diameter", value: "~51.8 µas (≈ 5.2 Rs)" },
      { label: "Photon sphere", value: "1.5 Rs" },
      { label: "Innermost stable orbit", value: "3 Rs (non-spinning)" },
      { label: "Distance", value: "26,670 ly" },
      { label: "Accretion rate", value: "~10⁻⁸ M☉/yr (very faint)" },
      { label: "Imaged", value: "Event Horizon Telescope, 2022" },
    ] },
  { id: "orion", name: "Orion Nebula (M42)", kind: "Star-forming region", ra: 83.822, dec: -5.391, distLy: 1344, color: "#ff7aa8", wiki: "Orion_Nebula",
    summary: "The closest region of massive star formation to Earth, visible to the naked eye in Orion's sword.",
    facts: [{ label: "Distance", value: "1,344 ly" }, { label: "Diameter", value: "~24 ly" }, { label: "Mass", value: "~2,000 M☉" }] },
  { id: "pleiades", name: "Pleiades (M45)", kind: "Open star cluster", ra: 56.75, dec: 24.117, distLy: 444, color: "#8fb8ff", wiki: "Pleiades",
    summary: "The Seven Sisters: a young (~100 Myr) cluster of hot blue stars wrapped in a reflection nebula.",
    facts: [{ label: "Distance", value: "444 ly" }, { label: "Age", value: "~100 million years" }, { label: "Members", value: "1,000+" }] },
  { id: "crab", name: "Crab Nebula (M1)", kind: "Supernova remnant", ra: 83.633, dec: 22.015, distLy: 6500, color: "#ff9f6b", wiki: "Crab_Nebula",
    summary: "The remnant of the supernova recorded by Chinese astronomers in 1054 AD, powered by a pulsar spinning 30 times per second.",
    facts: [{ label: "Distance", value: "~6,500 ly" }, { label: "Supernova", value: "1054 AD" }, { label: "Pulsar period", value: "33 ms" }] },
  { id: "eagle", name: "Eagle Nebula (M16)", kind: "Star-forming region", ra: 274.7, dec: -13.807, distLy: 5700, color: "#ff8fb0", wiki: "Eagle_Nebula",
    summary: "Home of the 'Pillars of Creation', columns of cold gas sculpted by the radiation of young massive stars.",
    facts: [{ label: "Distance", value: "~5,700 ly" }, { label: "Arm", value: "Sagittarius–Carina" }] },
  { id: "lagoon", name: "Lagoon Nebula (M8)", kind: "Star-forming region", ra: 270.904, dec: -24.387, distLy: 4100, color: "#ff7f9e", wiki: "Lagoon_Nebula",
    summary: "A giant interstellar cloud in Sagittarius, one of only two star-forming nebulae faintly visible to the naked eye from mid-northern latitudes.",
    facts: [{ label: "Distance", value: "~4,100 ly" }, { label: "Size", value: "110 × 50 ly" }] },
  { id: "carina", name: "Carina Nebula", kind: "Star-forming region", ra: 161.265, dec: -59.867, distLy: 8500, color: "#ff8c7a", wiki: "Carina_Nebula",
    summary: "One of the largest diffuse nebulae in our sky, home to the unstable hypergiant Eta Carinae.",
    facts: [{ label: "Distance", value: "~8,500 ly" }, { label: "Notable star", value: "η Carinae" }] },
  { id: "cygx1", name: "Cygnus X-1", kind: "Black hole binary", ra: 299.59, dec: 35.202, distLy: 7200, color: "#b4a0ff", wiki: "Cygnus_X-1",
    summary: "The first source widely accepted to be a black hole, a 21 M☉ object feeding from a blue supergiant companion.",
    facts: [{ label: "Distance", value: "~7,200 ly" }, { label: "Black hole mass", value: "~21 M☉" }] },
  { id: "omegacen", name: "Omega Centauri", kind: "Globular cluster", ra: 201.697, dec: -47.48, distLy: 17_090, color: "#ffd59a", wiki: "Omega_Centauri",
    summary: "The Milky Way's largest globular cluster — ~10 million stars, possibly the stripped core of a dwarf galaxy.",
    facts: [{ label: "Distance", value: "~17,090 ly" }, { label: "Stars", value: "~10 million" }, { label: "Diameter", value: "~150 ly" }] },
];

// IAU constellation abbreviations
export const CONSTELLATIONS: Record<string, string> = {
  And: "Andromeda", Ant: "Antlia", Aps: "Apus", Aqr: "Aquarius", Aql: "Aquila", Ara: "Ara", Ari: "Aries", Aur: "Auriga",
  Boo: "Boötes", Cae: "Caelum", Cam: "Camelopardalis", Cnc: "Cancer", CVn: "Canes Venatici", CMa: "Canis Major",
  CMi: "Canis Minor", Cap: "Capricornus", Car: "Carina", Cas: "Cassiopeia", Cen: "Centaurus", Cep: "Cepheus", Cet: "Cetus",
  Cha: "Chamaeleon", Cir: "Circinus", Col: "Columba", Com: "Coma Berenices", CrA: "Corona Australis", CrB: "Corona Borealis",
  Crv: "Corvus", Crt: "Crater", Cru: "Crux", Cyg: "Cygnus", Del: "Delphinus", Dor: "Dorado", Dra: "Draco", Equ: "Equuleus",
  Eri: "Eridanus", For: "Fornax", Gem: "Gemini", Gru: "Grus", Her: "Hercules", Hor: "Horologium", Hya: "Hydra", Hyi: "Hydrus",
  Ind: "Indus", Lac: "Lacerta", Leo: "Leo", LMi: "Leo Minor", Lep: "Lepus", Lib: "Libra", Lup: "Lupus", Lyn: "Lynx", Lyr: "Lyra",
  Men: "Mensa", Mic: "Microscopium", Mon: "Monoceros", Mus: "Musca", Nor: "Norma", Oct: "Octans", Oph: "Ophiuchus", Ori: "Orion",
  Pav: "Pavo", Peg: "Pegasus", Per: "Perseus", Phe: "Phoenix", Pic: "Pictor", Psc: "Pisces", PsA: "Piscis Austrinus",
  Pup: "Puppis", Pyx: "Pyxis", Ret: "Reticulum", Sge: "Sagitta", Sgr: "Sagittarius", Sco: "Scorpius", Scl: "Sculptor",
  Sct: "Scutum", Ser: "Serpens", Sex: "Sextans", Tau: "Taurus", Tel: "Telescopium", Tri: "Triangulum", TrA: "Triangulum Australe",
  Tuc: "Tucana", UMa: "Ursa Major", UMi: "Ursa Minor", Vel: "Vela", Vir: "Virgo", Vol: "Volans", Vul: "Vulpecula",
};

export const SOURCES = [
  { name: "HYG Star Database v4.4 (Hipparcos, Yale, Gliese)", url: "https://codeberg.org/astronexus/hyg", license: "CC BY-SA 4.0" },
  { name: "NASA Exoplanet Archive — Planetary Systems Composite", url: "https://exoplanetarchive.ipac.caltech.edu/", license: "Public (NASA/Caltech-IPAC)" },
  { name: "NASA NSSDCA Planetary Fact Sheet", url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/", license: "Public domain (NASA)" },
  { name: "JPL — Approximate Positions of the Planets (Standish)", url: "https://ssd.jpl.nasa.gov/planets/approx_pos.html", license: "Public (NASA/JPL)" },
  { name: "Reid et al. 2019, Trigonometric Parallaxes of High-mass Star-forming Regions", url: "https://doi.org/10.3847/1538-4357/ab4a11", license: "Spiral arm model" },
  { name: "GRAVITY Collaboration 2019 — distance to Sgr A*", url: "https://doi.org/10.1051/0004-6361/201935656", license: "R₀ = 8.178 kpc" },
  { name: "IAU WGCCRE 2015 rotational elements", url: "https://doi.org/10.1007/s10569-017-9805-5", license: "Planet pole & spin" },
  { name: "Solar System Scope textures", url: "https://www.solarsystemscope.com/textures/", license: "CC BY 4.0" },
  { name: "Wikipedia REST API (live summaries)", url: "https://en.wikipedia.org/api/rest_v1/", license: "CC BY-SA 4.0" },
];
