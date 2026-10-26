// Simulation clock. Mutable singleton (not React state) so the render loop can
// advance it every frame without re-rendering components.

export const jdFromMs = (ms: number) => ms / 86_400_000 + 2440587.5;
export const msFromJd = (jd: number) => (jd - 2440587.5) * 86_400_000;

export const SPEEDS = [
  { label: "Paused", rate: 0 },
  { label: "Real time", rate: 1 },
  { label: "1 min/s", rate: 60 },
  { label: "1 hour/s", rate: 3600 },
  { label: "1 day/s", rate: 86400 },
  { label: "1 week/s", rate: 604800 },
  { label: "1 month/s", rate: 2629800 },
  { label: "1 year/s", rate: 31557600 },
] as const;

// Keep inside the validity window of the JPL element tables (3000 BC – 3000 AD)
const MIN_JD = jdFromMs(Date.UTC(-2999, 0, 1));
const MAX_JD = jdFromMs(Date.UTC(2999, 11, 31));

export const clock = {
  jd: jdFromMs(Date.now()),
  speedIndex: 1,
  get rate() {
    return SPEEDS[this.speedIndex].rate;
  },
  tick(dtSeconds: number) {
    this.jd = Math.min(MAX_JD, Math.max(MIN_JD, this.jd + (dtSeconds * this.rate) / 86400));
  },
  reset() {
    this.jd = jdFromMs(Date.now());
  },
};
