// Builds the static datasets the app ships with, from public (OSINT) sources:
//  - HYG star database v4.4 (CC BY-SA 4.0)      https://codeberg.org/astronexus/hyg
//  - NASA Exoplanet Archive, pscomppars table    https://exoplanetarchive.ipac.caltech.edu
//  - Solar System Scope planet textures (CC BY 4.0) https://www.solarsystemscope.com/textures/
//
// Output (public/):
//  data/stars.bin        Float32 [x, y, z, absMag, colorIndex] per star, light-years, galactic frame
//  data/stars-meta.json  per-star [name, designation, spectral, hip, constellation]
//  data/exoplanets.json  exoplanet systems keyed by star index
//  textures/*.webp       planet textures
//
// Run: npm run data   (raw downloads are cached in .cache/)

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache");
const OUT_DATA = path.join(ROOT, "public", "data");
const OUT_TEX = path.join(ROOT, "public", "textures");
for (const d of [CACHE, OUT_DATA, OUT_TEX]) fs.mkdirSync(d, { recursive: true });

const PC_TO_LY = 3.261563777;

async function cached(name, url) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  console.log(`  downloading ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": "milkyway-3d data builder" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

// ---------- coordinate frames ----------
// Equatorial J2000 -> Galactic (IAU, Hipparcos convention)
const EQ_TO_GAL = [
  [-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];
// Galactic (x->GC, y->rotation, z->NGP) to three.js (x->GC, y->NGP, z->-rotation)
function eqToScene(x, y, z) {
  const gx = EQ_TO_GAL[0][0] * x + EQ_TO_GAL[0][1] * y + EQ_TO_GAL[0][2] * z;
  const gy = EQ_TO_GAL[1][0] * x + EQ_TO_GAL[1][1] * y + EQ_TO_GAL[1][2] * z;
  const gz = EQ_TO_GAL[2][0] * x + EQ_TO_GAL[2][1] * y + EQ_TO_GAL[2][2] * z;
  return [gx, gz, -gy];
}

// ---------- CSV ----------
function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const GREEK = {
  Alp: "α", Bet: "β", Gam: "γ", Del: "δ", Eps: "ε", Zet: "ζ", Eta: "η", The: "θ", Iot: "ι", Kap: "κ",
  Lam: "λ", Mu: "μ", Nu: "ν", Xi: "ξ", Omi: "ο", Pi: "π", Rho: "ρ", Sig: "σ", Tau: "τ", Ups: "υ",
  Phi: "φ", Chi: "χ", Psi: "ψ", Ome: "ω",
};
function designation(bayer, flam, con) {
  if (!con) return "";
  if (bayer) {
    const [b, n] = bayer.split("-");
    return `${GREEK[b] ?? b}${n ? superscript(n) : ""} ${con}`;
  }
  if (flam) return `${flam} ${con}`;
  return "";
}
function superscript(n) {
  const s = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  return [...n].map((d) => s[+d] ?? d).join("");
}

// B-V colour index from effective temperature (inverse of Ballesteros 2012)
function bvFromTeff(t) {
  if (!t) return 0.65;
  // solve T = 4600 (1/(0.92 bv + 1.7) + 1/(0.92 bv + 0.62)) by bisection
  let lo = -0.4, hi = 2.0;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    const tm = 4600 * (1 / (0.92 * m + 1.7) + 1 / (0.92 * m + 0.62));
    if (tm > t) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

async function main() {
  console.log("1/4 star catalogue (HYG v4.4)");
  const hygFile = await cached("hyg_v44.csv.gz", "https://codeberg.org/astronexus/hyg/media/branch/main/data/hyg/CURRENT/hyg_v44.csv.gz");
  const lines = zlib.gunzipSync(fs.readFileSync(hygFile)).toString("utf8").split(/\r?\n/);
  const header = parseCSVLine(lines[0]);
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const all = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const r = parseCSVLine(lines[i]);
    const dist = parseFloat(r[col.dist]);
    if (!(dist >= 0) || dist >= 100000) continue; // unknown distance
    all.push({
      id: +r[col.id],
      hip: r[col.hip] ? +r[col.hip] : 0,
      hd: r[col.hd] ? +r[col.hd] : 0,
      proper: r[col.proper],
      ra: parseFloat(r[col.ra]) * 15, // hours -> deg
      dec: parseFloat(r[col.dec]),
      dist,
      mag: parseFloat(r[col.mag]),
      absmag: parseFloat(r[col.absmag]),
      spect: r[col.spect],
      ci: r[col.ci] === "" ? NaN : parseFloat(r[col.ci]),
      x: parseFloat(r[col.x]), y: parseFloat(r[col.y]), z: parseFloat(r[col.z]),
      desig: designation(r[col.bayer], r[col.flam], r[col.con]) || r[col.gl] || (r[col.hd] ? `HD ${r[col.hd]}` : ""),
      con: r[col.con],
    });
  }
  console.log(`  ${all.length} stars with distances`);

  console.log("2/4 exoplanets (NASA Exoplanet Archive)");
  const q =
    "select pl_name,hostname,hip_name,hd_name,sy_dist,sy_vmag,sy_pnum,st_spectype,st_teff,st_rad,st_mass," +
    "pl_orbsmax,pl_rade,pl_bmasse,pl_orbper,pl_orbeccen,pl_eqt,disc_year,discoverymethod,ra,dec from pscomppars where sy_dist<1500";
  const exoFile = await cached(
    "exoplanets.json",
    `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?format=json&query=${encodeURIComponent(q)}`,
  );
  const exo = JSON.parse(fs.readFileSync(exoFile, "utf8"));
  const hosts = new Map();
  for (const p of exo) {
    if (!hosts.has(p.hostname)) hosts.set(p.hostname, { ...p, planets: [] });
    hosts.get(p.hostname).planets.push(p);
  }
  console.log(`  ${exo.length} planets around ${hosts.size} host stars`);

  // match hosts to HYG stars: HIP -> HD -> position + distance
  const byHip = new Map(), byHd = new Map(), grid = new Map();
  const key = (ra, dec) => `${Math.floor(ra)}:${Math.floor(dec + 90)}`;
  for (const s of all) {
    if (s.hip) byHip.set(s.hip, s);
    if (s.hd) byHd.set(s.hd, s);
    const k = key(s.ra, s.dec);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(s);
  }
  const num = (s) => (s ? parseInt(String(s).replace(/\D+/g, " ").trim().split(" ")[0], 10) : 0);
  const hostOf = new Map(); // hyg id -> host
  const extra = [];
  for (const h of hosts.values()) {
    let star = byHip.get(num(h.hip_name)) ?? (/^HD \d+$/.test(h.hd_name ?? "") ? byHd.get(num(h.hd_name)) : undefined);
    if (!star) {
      let best = null, bestD = 0.01; // degrees
      for (let dr = -1; dr <= 1; dr++)
        for (let dd = -1; dd <= 1; dd++) {
          for (const s of grid.get(`${Math.floor(h.ra) + dr}:${Math.floor(h.dec + 90) + dd}`) ?? []) {
            const d = Math.hypot((s.ra - h.ra) * Math.cos((h.dec * Math.PI) / 180), s.dec - h.dec);
            if (d < bestD && Math.abs(s.dist - h.sy_dist) / h.sy_dist < 0.25) { best = s; bestD = d; }
          }
        }
      star = best;
    }
    if (star) { if (!hostOf.has(star.id)) hostOf.set(star.id, h); continue; }
    if (h.sy_dist > 300) continue; // keep the unmatched ones that are reasonably near
    const ra = (h.ra * Math.PI) / 180, dec = (h.dec * Math.PI) / 180;
    const d = h.sy_dist;
    const vmag = h.sy_vmag ?? 15;
    const s = {
      id: -1 - extra.length, hip: 0, hd: 0, proper: "", ra: h.ra, dec: h.dec, dist: d, mag: vmag,
      absmag: vmag - 5 * Math.log10(d / 10), spect: h.st_spectype ?? "", ci: bvFromTeff(h.st_teff),
      x: d * Math.cos(dec) * Math.cos(ra), y: d * Math.cos(dec) * Math.sin(ra), z: d * Math.sin(dec),
      desig: h.hostname, con: "",
    };
    extra.push(s);
    hostOf.set(s.id, h);
  }
  console.log(`  matched ${hostOf.size - extra.length} hosts to HYG, added ${extra.length} unmatched hosts`);

  console.log("3/4 selecting & encoding stars");
  const chosen = [...all, ...extra].filter(
    (s) => s.id === 0 || s.mag <= 7.5 || s.dist <= 50 || s.proper || hostOf.has(s.id),
  );
  // brightest first, so the client can cheaply take "top N" subsets
  chosen.sort((a, b) => (a.id === 0 ? -1 : b.id === 0 ? 1 : a.mag - b.mag));
  const bin = new Float32Array(chosen.length * 5);
  const meta = [];
  const exoOut = {};
  chosen.forEach((s, i) => {
    const [x, y, z] = eqToScene(s.x, s.y, s.z);
    bin.set([x * PC_TO_LY, y * PC_TO_LY, z * PC_TO_LY, s.absmag, Number.isFinite(s.ci) ? s.ci : 0.65], i * 5);
    meta.push([s.proper, s.desig, s.spect, s.hip, s.con]);
    const h = hostOf.get(s.id);
    if (h) {
      exoOut[i] = {
        host: h.hostname,
        st: { teff: h.st_teff, rad: h.st_rad, mass: h.st_mass, spect: h.st_spectype },
        planets: h.planets
          .sort((a, b) => (a.pl_orbsmax ?? 1e9) - (b.pl_orbsmax ?? 1e9))
          .map((p) => ({
            name: p.pl_name, a: p.pl_orbsmax, r: p.pl_rade, m: p.pl_bmasse, per: p.pl_orbper,
            e: p.pl_orbeccen, teq: p.pl_eqt, year: p.disc_year, method: p.discoverymethod,
          })),
      };
    }
  });
  fs.writeFileSync(path.join(OUT_DATA, "stars.bin"), Buffer.from(bin.buffer));
  fs.writeFileSync(path.join(OUT_DATA, "stars-meta.json"), JSON.stringify(meta));
  fs.writeFileSync(path.join(OUT_DATA, "exoplanets.json"), JSON.stringify(exoOut));
  console.log(`  ${chosen.length} stars (${(bin.byteLength / 1024).toFixed(0)} KB), ${Object.keys(exoOut).length} exoplanet systems`);

  console.log("4/4 planet textures (Solar System Scope, CC BY 4.0)");
  const tex = [
    ["2k_sun.jpg", "sun", 1024], ["2k_mercury.jpg", "mercury", 1024], ["2k_venus_atmosphere.jpg", "venus", 1024],
    ["2k_earth_daymap.jpg", "earth", 2048], ["2k_earth_nightmap.jpg", "earth_night", 2048],
    ["2k_earth_clouds.jpg", "earth_clouds", 1536], ["2k_moon.jpg", "moon", 1024], ["2k_mars.jpg", "mars", 2048],
    ["2k_jupiter.jpg", "jupiter", 2048], ["2k_saturn.jpg", "saturn", 1024], ["2k_saturn_ring_alpha.png", "saturn_ring", 1024],
    ["2k_uranus.jpg", "uranus", 1024], ["2k_neptune.jpg", "neptune", 1024],
  ];
  for (const [src, name, w] of tex) {
    const file = await cached(src, `https://www.solarsystemscope.com/textures/download/${src}`);
    const out = path.join(OUT_TEX, `${name}.webp`);
    const img = sharp(file).resize({ width: w });
    await (name === "saturn_ring" ? img.webp({ quality: 85, alphaQuality: 90 }) : img.webp({ quality: 80 })).toFile(out);
    console.log(`  ${name}.webp ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
