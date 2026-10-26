"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { ARMS, DEEP_SKY, R0 } from "@/data/galaxy";
import { MOONS, PLANETS, SPACECRAFT, SUN } from "@/data/solarSystem";
import { bodyPos } from "@/lib/ephemeris";
import { exoPlanetPosition, exoSemiMajorAU, starRadiusLy } from "@/lib/exo";
import { getBody } from "@/lib/registry";
import { catalog, exo, meta, starName } from "@/lib/stars";
import { telemetry, useApp } from "@/lib/store";
import { clock } from "@/lib/time";
import { AU, KM } from "@/lib/units";
import { overlay } from "@/lib/overlay";
import { DISK_OUT, RS, S2_A, SGRA_POS } from "@/lib/sgra";
import { shared } from "./shared";
import { STAR_LIMIT_MAG, STAR_NEAR_FADE } from "./StarField";

// Labels are plain DOM nodes positioned with transforms each frame. Nodes are
// pooled by id and only touched when something actually changed.


interface Item {
  id: string;
  text: string;
  cls: string;
  pos: Vector3;
  opacity: number;
  /** physical radius (ly): the label hides once the body's disc fills the view */
  radius?: number;
}

// lower = placed first and wins collisions
const PRIO: Record<string, number> = { here: 0, sun: 1, planet: 1, dwarf: 2, moon: 2, exo: 2, craft: 3, dso: 3, arm: 3, star: 4, ring: 5 };
export const RING_RADII = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
interface Node {
  el: HTMLDivElement;
  x: number;
  y: number;
  o: number;
  text: string;
  shown: boolean;
}

const v = new Vector3();
const PLANET_A: Record<string, number> = { mercury: 0.387, venus: 0.723, earth: 1, mars: 1.524, jupiter: 5.203, saturn: 9.537, uranus: 19.19, neptune: 30.07, pluto: 39.48 };
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function project(camera: PerspectiveCamera, pos: Vector3, w: number, h: number): [number, number] | null {
  v.copy(pos).project(camera);
  if (v.z > 1 || v.z < -1) return null;
  return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
}

/** Apparent magnitude of catalogue star i seen from point p. */
function appMag(i: number, p: Vector3) {
  const c = catalog!;
  const dx = c.pos[i * 3] - p.x, dy = c.pos[i * 3 + 1] - p.y, dz = c.pos[i * 3 + 2] - p.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return { m: c.absMag[i] + 5 * Math.log10(d / 32.6156), d };
}

export function Labels() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const nodes = useRef(new Map<string, Node>());
  const starPick = useRef<{ t: number; list: number[] }>({ t: 0, list: [] });
  // UI panels act as obstacles so labels never sit underneath them
  const obstacles = useRef<{ t: number; rects: number[] }>({ t: 0, rects: [] });
  const named = useMemo(() => ({ list: [] as number[], ready: false }), []);
  const fixedPos = useMemo(() => {
    const m = new Map<string, Vector3>();
    for (const d of DEEP_SKY) m.set(`dso:${d.id}`, getBody(`dso:${d.id}`)!.position(new Vector3()));
    for (const a of ARMS) m.set(`arm:${a.id}`, getBody(`arm:${a.id}`)!.position(new Vector3()));
    return m;
  }, []);

  useEffect(() => {
    const root = overlay.root;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
      if (t?.dataset.id) useApp.getState().flyTo(t.dataset.id);
    };
    root.addEventListener("click", onClick);
    const map = nodes.current;
    return () => {
      root.removeEventListener("click", onClick);
      for (const n of map.values()) n.el.remove();
      map.clear();
    };
  }, []);

  useFrame(() => {
    const root = overlay.root;
    if (!root) return;
    const app = useApp.getState();
    const items: Item[] = [];
    const cam = camera.position;
    const pxScale = shared.uPxScale.value / shared.uDpr.value; // CSS pixels
    const dSun = cam.length();
    const focusStar = /^(?:star|exo):(\d+)/.exec(app.focus);
    const fsi = focusStar ? +focusStar[1] : -1;

    if (app.labels) {
      // --- Solar System --------------------------------------------------------
      if (dSun < 3) {
        items.push({ id: "sun", text: "Sun", cls: "sun", pos: bodyPos.sun, opacity: 1 - smooth(0.6, 2, dSun), radius: SUN.radiusKm * KM });
        const focusBody = getBody(app.focus);
        const closeUp = focusBody && (focusBody.kind === "planet" || focusBody.kind === "moon" || focusBody.kind === "dwarf planet")
          ? smooth(1e6 * KM, 1e7 * KM, telemetry.distToFocus) : 1;
        for (const p of PLANETS) {
          const a = PLANET_A[p.id] * AU;
          const px = (a * pxScale) / Math.max(dSun, a * 0.02);
          let o = smooth(22, 48, px) * closeUp;
          if (app.focus === p.id || app.selected === p.id) o = Math.max(o, 0.95);
          if (o > 0.01) items.push({ id: p.id, text: p.name, cls: p.kind === "planet" ? "planet" : "dwarf", pos: bodyPos[p.id], opacity: o, radius: p.radiusKm * KM });
        }
        for (const m of MOONS) {
          const parent = bodyPos[m.parent];
          const a = m.aKm * KM;
          const px = (a * pxScale) / Math.max(cam.distanceTo(parent), a * 0.02);
          let o = smooth(26, 60, px);
          if (app.focus === m.id || app.selected === m.id) o = Math.max(o, 0.95);
          if (o > 0.01) items.push({ id: m.id, text: m.name, cls: "moon", pos: bodyPos[m.id], opacity: o, radius: m.radiusKm * KM });
        }
        for (const s of SPACECRAFT) {
          const px = (bodyPos[s.id].length() * pxScale) / Math.max(dSun, 1e-9);
          const o = smooth(30, 60, px) * (1 - smooth(0.02, 0.06, dSun));
          if (o > 0.01) items.push({ id: s.id, text: s.name, cls: "craft", pos: bodyPos[s.id], opacity: o });
        }
      }

      // --- exoplanets of the visited star ----------------------------------------
      if (fsi > 0 && exo?.[fsi]) {
        const sys = exo[fsi];
        sys.planets.forEach((p, k) => {
          const a = (exoSemiMajorAU(fsi, p) ?? 0) * AU;
          if (!a) return;
          const pos = exoPlanetPosition(fsi, k, clock.jd, new Vector3());
          const px = (a * pxScale) / Math.max(cam.distanceTo(pos), a * 0.02);
          const o = smooth(24, 50, px);
          if (o > 0.01) items.push({ id: `exo:${fsi}:${k}`, text: p.name, cls: "exo", pos, opacity: o });
        });
      }

      // --- named stars ---------------------------------------------------------------
      if (catalog && meta && dSun > 0.008 && dSun < 6000) {
        if (!named.ready) {
          for (let i = 1; i < catalog.count; i++) if (meta[i]?.[0] || exo?.[i]) named.list.push(i);
          named.ready = true;
        }
        const now = performance.now();
        if (now - starPick.current.t > 250) {
          starPick.current.t = now;
          const cand: { i: number; m: number }[] = [];
          for (const i of named.list) {
            const { m, d } = appMag(i, cam);
            if (d < STAR_NEAR_FADE[0]) continue;
            const isHost = !meta[i]?.[0];
            if (m > (isHost ? 3.5 : 5)) continue;
            // only stars inside the view frustum compete for a label
            v.set(catalog.pos[i * 3], catalog.pos[i * 3 + 1], catalog.pos[i * 3 + 2]).project(camera);
            if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 0.98 || Math.abs(v.y) > 0.96) continue;
            cand.push({ i, m: isHost ? m + 1.2 : m });
          }
          cand.sort((a, b) => a.m - b.m);
          starPick.current.list = cand.slice(0, 24).map((c) => c.i);
          if (dSun > 0.008 && dSun < 6000 && catalog.count) {
            // the Sun itself, seen from interstellar space
            const sm = appMag(0, cam).m;
            if (dSun > 0.05 && sm < STAR_LIMIT_MAG) starPick.current.list.push(0);
          }
        }
        const list = starPick.current.list.slice();
        if (fsi > 0 && !list.includes(fsi)) list.push(fsi);
        const sel = app.selected?.startsWith("star:") ? +app.selected.slice(5) : -1;
        if (sel > 0 && !list.includes(sel)) list.push(sel);
        for (const i of list) {
          const p = new Vector3(catalog.pos[i * 3], catalog.pos[i * 3 + 1], catalog.pos[i * 3 + 2]);
          const fade = smooth(STAR_NEAR_FADE[0], STAR_NEAR_FADE[1] * 3, p.distanceTo(cam));
          const n = exo?.[i]?.planets.length ?? 0;
          const hosts = n ? ` · ${n} planet${n > 1 ? "s" : ""}` : "";
          items.push({
            id: i === 0 ? "sun" : `star:${i}`, text: (i === 0 ? "Sun" : starName(i)) + hosts, cls: i === 0 ? "sun" : "star", pos: p,
            opacity: Math.max(0.15, fade) * (i === fsi ? 1 : 0.92), radius: i === fsi ? starRadiusLy(i) : undefined,
          });
        }
      }

      // --- distance rings around the Sun (galactic plane) --------------------------------
      if (app.orbits && dSun > 0.3 && dSun < 9000) {
        // label each ring on the side facing the camera's right
        const right = v.set(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0;
        if (right.lengthSq() > 1e-6) {
          right.normalize();
          for (const r of RING_RADII) {
            const o = ringOpacity(r, dSun, pxScale);
            if (o > 0.05) items.push({ id: `ring:${r}`, text: `${r.toLocaleString()} ly`, cls: "ring", pos: right.clone().multiplyScalar(r), opacity: o * 1.6 });
          }
        }
      }

      // --- galaxy scale ------------------------------------------------------------------
      const dGC = cam.distanceTo(v.set(R0, 0, 0));
      if (dSun > 2500) {
        items.push({ id: "local", text: "Sun · you are here", cls: "here", pos: new Vector3(), opacity: smooth(2500, 6000, dSun) });
      }
      if (dSun > 300) {
        for (const d of DEEP_SKY) {
          const p = fixedPos.get(`dso:${d.id}`)!;
          const dd = cam.distanceTo(p);
          const far = d.distLy > 100_000;
          let o = far ? smooth(30_000, 80_000, dSun) : smooth(300, 900, dSun) * (1 - smooth(60_000, 160_000, dd));
          // nearby objects crowd around the Sun in the galaxy overview
          if (!far && d.distLy < 12_000) o *= 1 - smooth(22_000, 45_000, dSun);
          if (d.id === "sgra") o = Math.max(o * 0.6, smooth(3000, 9000, dSun) * (1 - smooth(200_000, 400_000, dGC)));
          if (app.selected === `dso:${d.id}`) o = Math.max(o, 0.9);
          if (o > 0.01) items.push({ id: `dso:${d.id}`, text: d.name, cls: "dso", pos: p, opacity: o, radius: d.id === "sgra" ? DISK_OUT * RS : undefined });
        }
        // the star S2 orbiting Sgr A*
        const dBH = cam.distanceTo(SGRA_POS);
        const s2px = (S2_A * pxScale) / Math.max(dBH, 1e-12);
        if (s2px > 20) {
          const p = getBody("s2")!.position(new Vector3());
          items.push({ id: "s2", text: "S2", cls: "star", pos: p, opacity: smooth(20, 50, s2px) });
        }
      }
      if (dGC > 22_000 && dSun > 15_000) {
        for (const a of ARMS) {
          const o = smooth(15_000, 40_000, dSun) * (a.major ? 1 : 0.8);
          items.push({ id: `arm:${a.id}`, text: a.name, cls: "arm", pos: fixedPos.get(`arm:${a.id}`)!, opacity: o });
        }
      }
    }

    // --- DOM diff -------------------------------------------------------------------
    const seen = new Set<string>();
    const w = size.width, h = size.height;
    const prio = (it: Item) => (it.id === app.focus || it.id === app.selected ? -1 : (PRIO[it.cls] ?? 5));
    items.sort((a, b) => prio(a) - prio(b));
    const now = performance.now();
    if (now - obstacles.current.t > 400) {
      obstacles.current.t = now;
      const rects: number[] = [];
      const canvasRect = root.getBoundingClientRect();
      for (const el of document.querySelectorAll(".info, .dock, .timebar, .search, .brand h1")) {
        const r = el.getBoundingClientRect();
        if (r.width) rects.push(r.left - canvasRect.left, r.top - canvasRect.top, r.right - canvasRect.left, r.bottom - canvasRect.top);
      }
      obstacles.current.rects = rects;
    }
    const placed: number[] = obstacles.current.rects.slice();
    for (const it of items) {
      const key = it.id + "|" + it.cls;
      if (seen.has(key)) continue;
      const s = project(camera, it.pos, w, h);
      if (!s || s[0] < -50 || s[0] > w + 50 || s[1] < -20 || s[1] > h + 20) continue;
      if (it.radius) {
        const rpx = (it.radius * pxScale) / Math.max(cam.distanceTo(it.pos), it.radius);
        it.opacity *= 1 - smooth(16, 34, rpx);
      }
      if (it.opacity < 0.03) continue;
      // skip labels that would overlap one already placed
      const x0 = s[0] - 6, y0 = s[1] - 9, x1 = x0 + it.text.length * 6.6 + 20, y1 = s[1] + 9;
      let hit = false;
      for (let k = 0; k < placed.length && !hit; k += 4) {
        hit = x0 < placed[k + 2] && x1 > placed[k] && y0 < placed[k + 3] && y1 > placed[k + 1];
      }
      if (hit && (prio(it) >= 0 || k0(placed, x0, y0, x1, y1, obstacles.current.rects.length))) continue;
      placed.push(x0, y0, x1, y1);
      seen.add(key);
      let n = nodes.current.get(key);
      if (!n) {
        const el = document.createElement("div");
        el.className = `lbl lbl-${it.cls}`;
        if (it.cls !== "ring") el.dataset.id = it.id;
        el.innerHTML = "<i></i><span></span>";
        root.appendChild(el);
        n = { el, x: -1, y: -1, o: -1, text: "", shown: true };
        nodes.current.set(key, n);
      }
      if (n.text !== it.text) {
        n.text = it.text;
        n.el.lastElementChild!.textContent = it.text;
      }
      const x = Math.round(s[0] * 2) / 2, y = Math.round(s[1] * 2) / 2;
      if (x !== n.x || y !== n.y) {
        n.x = x;
        n.y = y;
        n.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      const o = Math.round(it.opacity * 50) / 50;
      if (o !== n.o) {
        n.o = o;
        n.el.style.opacity = String(o);
      }
      if (!n.shown) {
        n.shown = true;
        n.el.style.display = "";
      }
      n.el.classList.toggle("is-focus", it.id === app.focus || it.id === app.selected);
    }
    for (const [key, n] of nodes.current) {
      if (!seen.has(key) && n.shown) {
        n.shown = false;
        n.el.style.display = "none";
      }
    }
  });

  return null;
}

// ----------------------------------------------------------------------------
// Picking: click selects & flies; hover shows a tooltip for stars

interface Hit {
  id: string;
  name: string;
  score: number;
}

export function Picker() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    let lastHover = 0;

    const pick = (cx: number, cy: number): Hit | null => {
      const rect = el.getBoundingClientRect();
      const x = cx - rect.left, y = cy - rect.top;
      const w = rect.width, h = rect.height;
      const pxScale = shared.uPxScale.value / shared.uDpr.value;
      const cam = camera.position;
      let best: Hit | null = null;
      const consider = (id: string, name: string, pos: Vector3, radius: number, slop: number, bonus = 0) => {
        const s = project(camera, pos, w, h);
        if (!s) return;
        const rpx = (radius * pxScale) / Math.max(cam.distanceTo(pos), radius);
        const dist = Math.hypot(s[0] - x, s[1] - y);
        if (dist > Math.max(rpx, slop)) return;
        const score = dist - bonus - Math.min(rpx, 200);
        if (!best || score < best.score) best = { id, name, score };
      };

      // solid bodies first
      if (cam.length() < 3) {
        consider("sun", "Sun", bodyPos.sun, SUN.radiusKm * KM, 10, 2);
        for (const p of PLANETS) consider(p.id, p.name, bodyPos[p.id], p.radiusKm * KM, 9, 3);
        for (const m of MOONS) {
          const px = (m.aKm * KM * pxScale) / Math.max(cam.distanceTo(bodyPos[m.parent]), 1e-12);
          if (px > 14) consider(m.id, m.name, bodyPos[m.id], m.radiusKm * KM, 8, 1);
        }
        for (const s of SPACECRAFT) consider(s.id, s.name, bodyPos[s.id], 0, 7);
      }
      if (cam.distanceTo(SGRA_POS) < 0.5) {
        consider("dso:sgra", "Sagittarius A*", SGRA_POS, 3 * RS, 10, 2);
        consider("s2", "S2", getBody("s2")!.position(new Vector3()), 0, 9, 1);
      }
      const app = useApp.getState();
      const fm = /^(?:star|exo):(\d+)/.exec(app.focus);
      if (fm && exo?.[+fm[1]]) {
        const si = +fm[1];
        exo[si].planets.forEach((p, k) => {
          const pos = exoPlanetPosition(si, k, clock.jd, new Vector3());
          consider(`exo:${si}:${k}`, p.name, pos, 0, 9, 2);
        });
      }
      if (best) return best;

      // stars: screen-space search weighted by brightness (as currently seen)
      if (catalog) {
        const c = catalog;
        let bestScore = Infinity, bestI = -1;
        for (let i = 0; i < c.count; i++) {
          v.set(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]);
          const d = v.distanceTo(cam);
          if (d < STAR_NEAR_FADE[0]) continue;
          const m = c.absMag[i] + 5 * Math.log10(d / 32.6156);
          if (m > STAR_LIMIT_MAG + 0.4) continue;
          const s = project(camera, v, w, h);
          if (!s) continue;
          const dist = Math.hypot(s[0] - x, s[1] - y);
          if (dist > 12) continue;
          const score = dist + m * 1.2;
          if (score < bestScore) {
            bestScore = score;
            bestI = i;
          }
        }
        if (bestI >= 0) return { id: bestI === 0 ? "sun" : `star:${bestI}`, name: bestI === 0 ? "Sun" : starName(bestI), score: bestScore };
      }
      return null;
    };

    const onDown = (e: PointerEvent) => {
      down = e.button === 0 && !e.shiftKey ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 500;
      down = null;
      if (moved > 5 || !quick) return;
      const hit = pick(e.clientX, e.clientY);
      if (hit) useApp.getState().flyTo(hit.id);
    };
    const onMove = (e: PointerEvent) => {
      if (down || e.pointerType !== "mouse") return;
      const now = performance.now();
      if (now - lastHover < 60) return;
      lastHover = now;
      const hit = pick(e.clientX, e.clientY);
      el.style.cursor = hit ? "pointer" : "grab";
      const tip = overlay.tip;
      if (!tip) return;
      if (hit) {
        tip.textContent = hit.name;
        tip.style.transform = `translate3d(${e.clientX + 14}px, ${e.clientY + 12}px, 0)`;
        tip.style.opacity = "1";
      } else tip.style.opacity = "0";
      telemetry.hover = hit ? { id: hit.id, name: hit.name, x: e.clientX, y: e.clientY } : null;
    };
    const onLeave = () => {
      if (overlay.tip) overlay.tip.style.opacity = "0";
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.style.cursor = "grab";
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [camera, gl]);

  return null;
}

/** Fade for a distance ring of radius r (ly) seen from distance d: only rings of a useful on-screen size show. */
export function ringOpacity(r: number, d: number, pxScale: number) {
  const px = (r * pxScale) / Math.max(d, r * 0.3);
  return smooth(50, 110, px) * (1 - smooth(500, 900, px)) * smooth(0.3, 1.5, d);
}

/** true when the rect overlaps one of the first `n/4` rects (the UI obstacles) */
function k0(placed: number[], x0: number, y0: number, x1: number, y1: number, n: number) {
  for (let k = 0; k < n; k += 4) if (x0 < placed[k + 2] && x1 > placed[k] && y0 < placed[k + 3] && y1 > placed[k + 1]) return true;
  return false;
}
