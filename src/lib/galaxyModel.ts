import { ARMS, BAR, KPC, R0, armRadius, galactoToScene } from "@/data/galaxy";

// Procedural particle model of the Milky Way, generated once on the client.
// Three layers: point-like star clouds, soft haze (diffuse light) and dust.

export interface ParticleLayer {
  count: number;
  position: Float32Array;
  color: Float32Array;
  size: Float32Array; // world size in ly
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Builder {
  count = 0;
  position: Float32Array;
  color: Float32Array;
  size: Float32Array;
  constructor(public capacity: number, private hole: number) {
    this.position = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
  }
  push(x: number, y: number, z: number, r: number, g: number, b: number, s: number) {
    if (this.count >= this.capacity) return;
    if (x * x + y * y + z * z < this.hole * this.hole) return; // local stars come from the real catalogue
    const i = this.count++;
    this.position[i * 3] = x;
    this.position[i * 3 + 1] = y;
    this.position[i * 3 + 2] = z;
    this.color[i * 3] = r;
    this.color[i * 3 + 1] = g;
    this.color[i * 3 + 2] = b;
    this.size[i] = s;
  }
  done(): ParticleLayer {
    return {
      count: this.count,
      position: this.position.subarray(0, this.count * 3),
      color: this.color.subarray(0, this.count * 3),
      size: this.size.subarray(0, this.count),
    };
  }
}

export function buildGalaxy(quality = 1) {
  const rand = rng(20261026);
  const gauss = () => {
    const u = Math.max(1e-9, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const laplace = (scale: number) => (rand() < 0.5 ? -1 : 1) * -Math.log(Math.max(1e-9, rand())) * scale;

  const barAz = (BAR.angleDeg * Math.PI) / 180;
  const ux = -Math.cos(barAz), uz = -Math.sin(barAz); // bar major axis (towards near end)
  const vx = -uz, vz = ux; // in-plane minor axis

  const nStars = Math.round(150_000 * quality);
  const nHaze = Math.round(7_000 * quality);
  const nDust = Math.round(5_000 * quality);
  const stars = new Builder(nStars + 200, 1600);
  const haze = new Builder(nHaze, 1300);
  const dust = new Builder(Math.round(nDust * 1.15), 900);

  const totalWeight = ARMS.reduce((s, a) => s + a.weight, 0);
  const pickArm = () => {
    let r = rand() * totalWeight;
    for (const a of ARMS) if ((r -= a.weight) <= 0) return a;
    return ARMS[0];
  };
  // weight ∝ arc length × exponential disk surface density
  const armSample = (arm: (typeof ARMS)[number]) => {
    for (let tries = 0; tries < 30; tries++) {
      const az = arm.from + rand() * (arm.to - arm.from);
      const r = armRadius(arm, az);
      const w = r * Math.exp(-r / 3.2);
      if (rand() * 3.2 * Math.exp(-1) * 1.05 < w) return { az, r };
    }
    return { az: 0, r: arm.r0 };
  };

  // --- bar + bulge -------------------------------------------------------
  const bulgeColor = (k: number): [number, number, number] => [1.0, 0.78 + 0.12 * k, 0.5 + 0.2 * k];
  const addBar = (b: Builder, n: number, size: () => number, bright: number) => {
    for (let i = 0; i < n; i++) {
      const a = gauss() * 1.5 * KPC, c = gauss() * 0.5 * KPC, h = gauss() * 0.33 * KPC;
      const k = rand();
      const [r, g, bl] = bulgeColor(k);
      b.push(R0 + a * ux + c * vx, h, a * uz + c * vz, r * bright, g * bright, bl * bright, size());
    }
  };
  const addBulge = (b: Builder, n: number, size: () => number, bright: number) => {
    for (let i = 0; i < n; i++) {
      const s = 0.55 * KPC;
      const k = rand();
      const [r, g, bl] = bulgeColor(k);
      b.push(R0 + gauss() * s, gauss() * s * 0.65, gauss() * s, r * bright, g * bright, bl * bright, size());
    }
  };
  // --- smooth old disk ----------------------------------------------------
  const addDisk = (b: Builder, n: number, size: () => number, bright: number, height: number) => {
    for (let i = 0; i < n; i++) {
      const r = -2.6 * Math.log(Math.max(1e-9, rand() * rand()));
      if (r > 16 || r < 0.8) { i--; continue; }
      const az = rand() * 360;
      const [x, , z] = galactoToScene(r, az);
      const k = rand();
      b.push(x, laplace(height * KPC), z, (0.95 + 0.05 * k) * bright, (0.85 + 0.08 * k) * bright, (0.72 + 0.15 * k) * bright, size());
    }
  };
  // --- spiral arms ----------------------------------------------------------
  const addArms = (b: Builder, n: number, size: () => number, bright: number, height: number, hii: number) => {
    for (let i = 0; i < n; i++) {
      const arm = pickArm();
      const { az, r } = armSample(arm);
      const rr = r + gauss() * arm.width;
      const [x, , z] = galactoToScene(rr, az + gauss() * 1.2);
      const y = gauss() * height * KPC;
      if (rand() < hii) {
        // H II region knot: a small pink cluster
        const m = 4 + Math.floor(rand() * 6);
        for (let j = 0; j < m; j++) {
          b.push(x + gauss() * 60, y + gauss() * 30, z + gauss() * 60, 1.0 * bright, 0.42 * bright, 0.58 * bright, size() * 0.8);
        }
        i += m - 1;
        continue;
      }
      const k = rand();
      const white = 0.55 + 0.45 * k;
      b.push(x, y, z, (0.6 + 0.4 * white) * bright, (0.72 + 0.26 * white) * bright, 1.0 * bright, size());
    }
  };
  // --- halo globular clusters ---------------------------------------------
  const addHalo = (b: Builder, n: number) => {
    for (let i = 0; i < n; i++) {
      const r = Math.abs(gauss()) * 5 * KPC + 1 * KPC;
      const u = rand() * 2 - 1, t = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      b.push(R0 + r * s * Math.cos(t), r * u, r * s * Math.sin(t), 1, 0.88, 0.7, 90);
    }
  };

  const sStar = () => 45 + rand() * 70;
  addBar(stars, Math.round(nStars * 0.17), sStar, 1.0);
  addBulge(stars, Math.round(nStars * 0.1), sStar, 1.0);
  addDisk(stars, Math.round(nStars * 0.27), sStar, 0.75, 0.25);
  addArms(stars, Math.round(nStars * 0.45), sStar, 1.0, 0.09, 0.03);
  addHalo(stars, 160);

  const sHaze = () => 550 + rand() * 650;
  addBar(haze, Math.round(nHaze * 0.16), () => 900 + rand() * 900, 1.0);
  addBulge(haze, Math.round(nHaze * 0.1), () => 900 + rand() * 700, 1.0);
  addDisk(haze, Math.round(nHaze * 0.3), sHaze, 0.7, 0.18);
  addArms(haze, Math.round(nHaze * 0.44), sHaze, 0.9, 0.07, 0.012);

  // dust lanes hug the inner (concave) edge of the arms
  for (let i = 0; i < nDust; i++) {
    const arm = ARMS[Math.floor(rand() * 4)]; // major + minor arms, not the spur
    const { az, r } = armSample(arm);
    const rr = r - arm.width * 0.9 + gauss() * arm.width * 0.45;
    const [x, , z] = galactoToScene(rr, az + gauss() * 1.5);
    const k = 0.6 + rand() * 0.4;
    dust.push(x, gauss() * 0.05 * KPC, z, 0.22 * k, 0.3 * k, 0.42 * k, 280 + rand() * 420);
  }
  // central dust ring around the bar
  for (let i = 0; i < nDust * 0.12; i++) {
    const t = rand() * Math.PI * 2;
    const r = (1.2 + gauss() * 0.25) * KPC;
    dust.push(R0 + r * Math.cos(t), gauss() * 40, r * Math.sin(t), 0.25, 0.32, 0.45, 260 + rand() * 300);
  }

  return { stars: stars.done(), haze: haze.done(), dust: dust.done() };
}
