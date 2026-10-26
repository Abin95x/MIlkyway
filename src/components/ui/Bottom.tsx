"use client";

import { useEffect, useRef } from "react";
import { getBody } from "@/lib/registry";
import { telemetry, useApp } from "@/lib/store";
import { SPEEDS, clock, msFromJd } from "@/lib/time";
import { fmtDistance, fmtLightTime } from "@/lib/units";

const pad = (n: number) => String(n).padStart(2, "0");

function formatDate(jd: number) {
  const d = new Date(msFromJd(jd));
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getUTCFullYear();
  const year = y <= 0 ? `${1 - y} BC` : String(y);
  return `${year}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Keyboard time control: Space pause/resume, [ ] slower/faster, N back to now. */
function useTimeKeys() {
  const set = useApp((s) => s.set);
  useEffect(() => {
    const setSpeed = (i: number) => {
      const idx = Math.max(0, Math.min(SPEEDS.length - 1, i));
      clock.speedIndex = idx;
      set({ speedIndex: idx });
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpeed(clock.speedIndex === 0 ? 1 : 0);
      } else if (e.key === "]") setSpeed(clock.speedIndex + 1);
      else if (e.key === "[") setSpeed(clock.speedIndex - 1);
      else if (e.key === "n" || e.key === "N") {
        clock.reset();
        setSpeed(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [set]);
}

/** Bottom-right readout: distance to the centre, light time, simulated date. */
export function Hud() {
  const distRef = useRef<HTMLSpanElement>(null);
  const lightRef = useRef<HTMLSpanElement>(null);
  const dateRef = useRef<HTMLSpanElement>(null);
  const focus = useApp((s) => s.focus);
  const speedIndex = useApp((s) => s.speedIndex);
  const metaReady = useApp((s) => s.metaReady);
  const name = focus === "free" ? "centre" : (getBody(focus)?.name ?? "");
  void metaReady;
  useTimeKeys();

  useEffect(() => {
    const t = setInterval(() => {
      if (distRef.current) distRef.current.textContent = fmtDistance(telemetry.distToFocus);
      if (lightRef.current) lightRef.current.textContent = fmtLightTime(telemetry.distToFocus);
      if (dateRef.current) dateRef.current.textContent = formatDate(clock.jd);
    }, 120);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="hud" aria-live="off">
      <div>
        <span className="k">to {name}</span>
        <span ref={distRef} className="v" />
        <span className="k">· light</span>
        <span ref={lightRef} className="v dim" />
      </div>
      <div>
        <span ref={dateRef} className="v dim" />
        <span className="k">{speedIndex === 0 ? "· paused" : speedIndex === 1 ? "" : `· ${SPEEDS[speedIndex].label}`}</span>
      </div>
    </div>
  );
}
