"use client";

import { useEffect, useRef, useState } from "react";
import { SOURCES } from "@/data/galaxy";
import { ancestry } from "@/lib/registry";
import { useApp } from "@/lib/store";

export function SourcesDialog() {
  const open = useApp((s) => s.sourcesOpen);
  const set = useApp((s) => s.set);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="panel sources" onClose={() => set({ sourcesOpen: false })} onClick={(e) => e.target === ref.current && set({ sourcesOpen: false })}>
      <h2>Open data sources</h2>
      <p className="muted">
        Every number in this atlas comes from public scientific catalogues. Star positions and brightness are real; the galaxy&apos;s
        overall shape is a particle model fitted to published spiral-arm measurements (we can&apos;t photograph the Milky Way from outside).
      </p>
      <ul>
        {SOURCES.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer noopener">{s.name}</a>
            <em>{s.license}</em>
          </li>
        ))}
      </ul>
      <h3>Controls</h3>
      <ul className="keys">
        <li><kbd>Drag</kbd> rotate · <kbd>Right-drag</kbd>/<kbd>Shift-drag</kbd>/two fingers pan · <kbd>Scroll</kbd>/<kbd>Pinch</kbd> zoom</li>
        <li><kbd>Click</kbd> centre on an object · <kbd>R</kbd> reset view · <kbd>D</kbd> details panel · <kbd>Esc</kbd> up one level · <kbd>/</kbd> search</li>
        <li><kbd>Space</kbd> pause time · <kbd>[</kbd> <kbd>]</kbd> slower / faster · <kbd>N</kbd> back to now</li>
      </ul>
      <form method="dialog">
        <button className="chip">Close</button>
      </form>
    </dialog>
  );
}

export function Loader() {
  const ready = useApp((s) => s.ready);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setGone(true), 900);
    return () => clearTimeout(t);
  }, [ready]);
  if (gone) return null;
  return (
    <div className={`loader ${ready ? "is-done" : ""}`} aria-hidden={ready}>
      <div className="loader-ring" role="progressbar" aria-label="Loading" />
    </div>
  );
}

/** Esc walks one level up the hierarchy (Earth → Solar System → Neighbourhood → Galaxy). */
export function KeyboardNav() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement)?.closest?.("input, textarea, dialog")) return;
      const { focus, flyTo, selected } = useApp.getState();
      if (focus === "free") return flyTo(selected ?? "galaxy", false);
      const chain = ancestry(focus);
      if (chain.length > 1) flyTo(chain[chain.length - 2].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

export function Hint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const hide = () => setShow(false);
    const t = setTimeout(hide, 12000);
    window.addEventListener("wheel", hide, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("wheel", hide);
    };
  }, []);
  if (!show) return null;
  return <div className="hint">Drag to rotate · right-drag to pan · scroll to zoom · click an object to centre on it · R to reset</div>;
}
