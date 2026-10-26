// Physical data: NASA NSSDCA Planetary Fact Sheet (D. R. Williams, updated 2025-03)
//   https://nssdc.gsfc.nasa.gov/planetary/factsheet/
// Rotation/pole models: IAU WGCCRE 2015 report (Archinal et al. 2018)
// Moon data: NASA/JPL Solar System Dynamics planetary satellite mean elements

export interface Fact {
  label: string;
  value: string;
}

export interface PlanetDef {
  id: string;
  name: string;
  kind: "planet" | "dwarf planet";
  radiusKm: number;
  color: string;
  texture?: string;
  nightTexture?: string;
  cloudTexture?: string;
  ring?: { innerKm: number; outerKm: number; texture: string };
  atmosphere?: { color: string; strength: number };
  /** IAU north pole (RA, Dec) in degrees and prime meridian W = w0 + wd * d (days from J2000) */
  pole: [number, number];
  w0: number;
  wd: number;
  wiki: string;
  summary: string;
  facts: Fact[];
}

export const SUN = {
  id: "sun",
  name: "Sun",
  radiusKm: 695_700,
  pole: [286.13, 63.87] as [number, number],
  w0: 84.176,
  wd: 14.1844,
  wiki: "Sun",
  summary:
    "A G2V main-sequence star that holds 99.86% of the Solar System's mass. It orbits the Galactic Centre at ~230 km/s inside the Orion Spur, completing one lap every ~230 million years.",
  facts: [
    { label: "Type", value: "G2V yellow dwarf" },
    { label: "Mass", value: "1.989 × 10³⁰ kg" },
    { label: "Radius", value: "695,700 km" },
    { label: "Surface temperature", value: "5,772 K" },
    { label: "Core temperature", value: "~15.7 million K" },
    { label: "Luminosity", value: "3.828 × 10²⁶ W" },
    { label: "Age", value: "~4.6 billion years" },
    { label: "Rotation (equator)", value: "25.4 days" },
    { label: "Distance to Galactic Centre", value: "26,670 ly" },
    { label: "Galactic orbit speed", value: "~230 km/s" },
  ],
};

export const PLANETS: PlanetDef[] = [
  {
    id: "mercury", name: "Mercury", kind: "planet", radiusKm: 2439.5, color: "#9b948c", texture: "mercury",
    pole: [281.0103, 61.4155], w0: 329.5988, wd: 6.1385108, wiki: "Mercury_(planet)",
    summary: "The smallest planet and closest to the Sun. It has almost no atmosphere, so its surface swings from 430 °C in daylight to −180 °C at night.",
    facts: [
      { label: "Mass", value: "0.330 × 10²⁴ kg" }, { label: "Diameter", value: "4,879 km" },
      { label: "Gravity", value: "3.7 m/s²" }, { label: "Length of day", value: "4,222.6 h" },
      { label: "Orbital period", value: "88.0 days" }, { label: "Mean temperature", value: "167 °C" },
      { label: "Moons", value: "0" }, { label: "Orbital eccentricity", value: "0.206" },
    ],
  },
  {
    id: "venus", name: "Venus", kind: "planet", radiusKm: 6051.8, color: "#e3c18b", texture: "venus",
    atmosphere: { color: "#f5d9a0", strength: 0.9 },
    pole: [272.76, 67.16], w0: 160.2, wd: -1.4813688, wiki: "Venus",
    summary: "Shrouded in sulfuric-acid clouds over a 92-bar CO₂ atmosphere, Venus is the hottest planet. It spins backwards, very slowly.",
    facts: [
      { label: "Mass", value: "4.87 × 10²⁴ kg" }, { label: "Diameter", value: "12,104 km" },
      { label: "Gravity", value: "8.9 m/s²" }, { label: "Length of day", value: "2,802 h" },
      { label: "Orbital period", value: "224.7 days" }, { label: "Mean temperature", value: "464 °C" },
      { label: "Surface pressure", value: "92 bar" }, { label: "Moons", value: "0" },
    ],
  },
  {
    id: "earth", name: "Earth", kind: "planet", radiusKm: 6371.0, color: "#4b7bd1", texture: "earth",
    nightTexture: "earth_night", cloudTexture: "earth_clouds", atmosphere: { color: "#6fa8ff", strength: 1.0 },
    pole: [0, 90], w0: 190.147, wd: 360.9856235, wiki: "Earth",
    summary: "Our home: the only world known to host life, with liquid-water oceans covering 71% of its surface and a nitrogen–oxygen atmosphere.",
    facts: [
      { label: "Mass", value: "5.97 × 10²⁴ kg" }, { label: "Diameter", value: "12,756 km" },
      { label: "Gravity", value: "9.8 m/s²" }, { label: "Length of day", value: "24.0 h" },
      { label: "Orbital period", value: "365.2 days" }, { label: "Mean temperature", value: "15 °C" },
      { label: "Axial tilt", value: "23.4°" }, { label: "Moons", value: "1" },
    ],
  },
  {
    id: "mars", name: "Mars", kind: "planet", radiusKm: 3389.5, color: "#c1623d", texture: "mars",
    atmosphere: { color: "#e0a07a", strength: 0.35 },
    pole: [317.68143, 52.8865], w0: 176.63, wd: 350.89198226, wiki: "Mars",
    summary: "A cold desert world with the tallest volcano (Olympus Mons) and the longest canyon (Valles Marineris) in the Solar System.",
    facts: [
      { label: "Mass", value: "0.642 × 10²⁴ kg" }, { label: "Diameter", value: "6,792 km" },
      { label: "Gravity", value: "3.7 m/s²" }, { label: "Length of day", value: "24.7 h" },
      { label: "Orbital period", value: "687.0 days" }, { label: "Mean temperature", value: "−65 °C" },
      { label: "Axial tilt", value: "25.2°" }, { label: "Moons", value: "2" },
    ],
  },
  {
    id: "jupiter", name: "Jupiter", kind: "planet", radiusKm: 69911, color: "#d2b48c", texture: "jupiter",
    atmosphere: { color: "#f0d9b5", strength: 0.4 },
    pole: [268.056595, 64.495303], w0: 284.95, wd: 870.536, wiki: "Jupiter",
    summary: "The largest planet — more than twice as massive as all the others combined. Its Great Red Spot is a storm larger than Earth.",
    facts: [
      { label: "Mass", value: "1,898 × 10²⁴ kg" }, { label: "Diameter", value: "142,984 km" },
      { label: "Gravity", value: "23.1 m/s²" }, { label: "Length of day", value: "9.9 h" },
      { label: "Orbital period", value: "4,331 days" }, { label: "Mean temperature", value: "−110 °C" },
      { label: "Moons", value: "95" }, { label: "Rings", value: "Yes (faint)" },
    ],
  },
  {
    id: "saturn", name: "Saturn", kind: "planet", radiusKm: 58232, color: "#e3d3a1", texture: "saturn",
    ring: { innerKm: 74_500, outerKm: 140_220, texture: "saturn_ring" }, atmosphere: { color: "#f3e3b5", strength: 0.35 },
    pole: [40.589, 83.537], w0: 38.9, wd: 810.7939024, wiki: "Saturn",
    summary: "The ringed giant. Its main rings span 280,000 km yet are mostly only ~10 m thick, made of water-ice fragments.",
    facts: [
      { label: "Mass", value: "568 × 10²⁴ kg" }, { label: "Diameter", value: "120,536 km" },
      { label: "Density", value: "687 kg/m³ (would float)" }, { label: "Length of day", value: "10.7 h" },
      { label: "Orbital period", value: "10,747 days" }, { label: "Mean temperature", value: "−140 °C" },
      { label: "Moons", value: "274" }, { label: "Rings", value: "Yes" },
    ],
  },
  {
    id: "uranus", name: "Uranus", kind: "planet", radiusKm: 25362, color: "#9fd7e0", texture: "uranus",
    atmosphere: { color: "#bdf0ff", strength: 0.5 },
    pole: [257.311, -15.175], w0: 203.81, wd: -501.1600928, wiki: "Uranus",
    summary: "An ice giant tipped on its side (97.8° tilt), so each pole gets 42 years of continuous sunlight followed by 42 years of darkness.",
    facts: [
      { label: "Mass", value: "86.8 × 10²⁴ kg" }, { label: "Diameter", value: "51,118 km" },
      { label: "Gravity", value: "8.7 m/s²" }, { label: "Length of day", value: "17.2 h" },
      { label: "Orbital period", value: "30,589 days" }, { label: "Mean temperature", value: "−195 °C" },
      { label: "Axial tilt", value: "97.8°" }, { label: "Moons", value: "28" },
    ],
  },
  {
    id: "neptune", name: "Neptune", kind: "planet", radiusKm: 24622, color: "#4f6fe0", texture: "neptune",
    atmosphere: { color: "#7d9bff", strength: 0.5 },
    pole: [299.36, 43.46], w0: 249.978, wd: 541.1397757, wiki: "Neptune",
    summary: "The windiest world, with supersonic storms reaching 2,100 km/h. It was found by mathematics before it was seen (1846).",
    facts: [
      { label: "Mass", value: "102 × 10²⁴ kg" }, { label: "Diameter", value: "49,528 km" },
      { label: "Gravity", value: "11.0 m/s²" }, { label: "Length of day", value: "16.1 h" },
      { label: "Orbital period", value: "59,800 days" }, { label: "Mean temperature", value: "−200 °C" },
      { label: "Moons", value: "16" }, { label: "Rings", value: "Yes (faint)" },
    ],
  },
  {
    id: "pluto", name: "Pluto", kind: "dwarf planet", radiusKm: 1188, color: "#c9b199",
    pole: [132.993, -6.163], w0: 302.695, wd: 56.3625225, wiki: "Pluto",
    summary: "A Kuiper Belt dwarf planet with a nitrogen-ice heart (Sputnik Planitia), visited by New Horizons in 2015.",
    facts: [
      { label: "Mass", value: "0.0130 × 10²⁴ kg" }, { label: "Diameter", value: "2,376 km" },
      { label: "Gravity", value: "0.7 m/s²" }, { label: "Length of day", value: "153.3 h" },
      { label: "Orbital period", value: "90,560 days" }, { label: "Mean temperature", value: "−225 °C" },
      { label: "Orbital eccentricity", value: "0.244" }, { label: "Moons", value: "5" },
    ],
  },
];

export interface MoonDef {
  id: string;
  name: string;
  parent: string;
  radiusKm: number;
  aKm: number;
  periodDays: number; // negative = retrograde
  color: string;
  texture?: string;
  phase: number; // mean longitude at J2000 (deg, illustrative except for the Moon)
  wiki: string;
  summary: string;
}

export const MOONS: MoonDef[] = [
  { id: "moon", name: "Moon", parent: "earth", radiusKm: 1737.4, aKm: 384_400, periodDays: 27.3217, color: "#bdbab4", texture: "moon", phase: 0, wiki: "Moon",
    summary: "Earth's only natural satellite, probably formed from debris of a giant impact 4.5 billion years ago. Twelve humans have walked on it." },
  { id: "phobos", name: "Phobos", parent: "mars", radiusKm: 11.1, aKm: 9_376, periodDays: 0.31891, color: "#8a7f73", phase: 35, wiki: "Phobos_(moon)",
    summary: "Mars' larger moon, spiralling inward ~1.8 m per century; it will break apart in ~50 million years." },
  { id: "deimos", name: "Deimos", parent: "mars", radiusKm: 6.2, aKm: 23_463, periodDays: 1.26244, color: "#9a8f80", phase: 190, wiki: "Deimos_(moon)",
    summary: "The smaller, outer moon of Mars — likely a captured asteroid or a fragment from an ancient impact." },
  { id: "io", name: "Io", parent: "jupiter", radiusKm: 1821.6, aKm: 421_700, periodDays: 1.769, color: "#e8d36a", phase: 10, wiki: "Io_(moon)",
    summary: "The most volcanically active body in the Solar System, with 400+ active volcanoes driven by tidal heating." },
  { id: "europa", name: "Europa", parent: "jupiter", radiusKm: 1560.8, aKm: 671_034, periodDays: 3.551, color: "#d9cdb8", phase: 120, wiki: "Europa_(moon)",
    summary: "An icy shell over a global salt-water ocean — one of the best places to look for life beyond Earth." },
  { id: "ganymede", name: "Ganymede", parent: "jupiter", radiusKm: 2634.1, aKm: 1_070_412, periodDays: 7.155, color: "#a89c8c", phase: 230, wiki: "Ganymede_(moon)",
    summary: "The largest moon in the Solar System — bigger than Mercury — and the only moon with its own magnetic field." },
  { id: "callisto", name: "Callisto", parent: "jupiter", radiusKm: 2410.3, aKm: 1_882_709, periodDays: 16.689, color: "#6f665d", phase: 300, wiki: "Callisto_(moon)",
    summary: "The most heavily cratered object known; its ancient surface has barely changed in 4 billion years." },
  { id: "titan", name: "Titan", parent: "saturn", radiusKm: 2574.7, aKm: 1_221_870, periodDays: 15.945, color: "#d8a85a", phase: 60, wiki: "Titan_(moon)",
    summary: "The only moon with a thick atmosphere, plus lakes of liquid methane. NASA's Dragonfly rotorcraft is headed there." },
  { id: "enceladus", name: "Enceladus", parent: "saturn", radiusKm: 252.1, aKm: 237_948, periodDays: 1.37, color: "#f4f6f8", phase: 140, wiki: "Enceladus",
    summary: "Geysers of water ice erupt from its south pole, feeding Saturn's E ring from a hidden ocean." },
  { id: "rhea", name: "Rhea", parent: "saturn", radiusKm: 763.8, aKm: 527_108, periodDays: 4.518, color: "#cfcac2", phase: 250, wiki: "Rhea_(moon)",
    summary: "Saturn's second-largest moon, an icy, heavily cratered world." },
  { id: "iapetus", name: "Iapetus", parent: "saturn", radiusKm: 734.5, aKm: 3_560_820, periodDays: 79.32, color: "#8c8274", phase: 330, wiki: "Iapetus_(moon)",
    summary: "Famous for its two-tone colouring — one hemisphere is as dark as coal, the other bright as snow." },
  { id: "titania", name: "Titania", parent: "uranus", radiusKm: 788.4, aKm: 435_910, periodDays: 8.706, color: "#b9aea3", phase: 80, wiki: "Titania_(moon)",
    summary: "The largest moon of Uranus, marked by huge fault canyons." },
  { id: "oberon", name: "Oberon", parent: "uranus", radiusKm: 761.4, aKm: 583_520, periodDays: 13.463, color: "#a49688", phase: 200, wiki: "Oberon_(moon)",
    summary: "The outermost major moon of Uranus, old and heavily cratered." },
  { id: "triton", name: "Triton", parent: "neptune", radiusKm: 1353.4, aKm: 354_759, periodDays: -5.877, color: "#d6c9c2", phase: 160, wiki: "Triton_(moon)",
    summary: "Orbits backwards — a captured Kuiper Belt object with nitrogen geysers." },
  { id: "charon", name: "Charon", parent: "pluto", radiusKm: 606, aKm: 19_591, periodDays: 6.387, color: "#a59c95", phase: 0, wiki: "Charon_(moon)",
    summary: "Half Pluto's size; the two are mutually tidally locked, always showing each other the same face." },
];

/** Spacecraft positions: linear extrapolation from NASA/JPL mission status (approximate). */
export const SPACECRAFT = [
  {
    id: "voyager1", name: "Voyager 1", raDeg: 258.3, decDeg: 12.1, auAt2024: 162.7, auPerYear: 3.58, wiki: "Voyager_1",
    summary: "Launched 1977; crossed the heliopause in 2012, becoming the first human-made object in interstellar space. Most distant spacecraft from Earth.",
  },
  {
    id: "voyager2", name: "Voyager 2", raDeg: 302.6, decDeg: -58.1, auAt2024: 136.0, auPerYear: 3.25, wiki: "Voyager_2",
    summary: "Launched 1977; the only spacecraft to visit Uranus and Neptune. Entered interstellar space in 2018.",
  },
];
