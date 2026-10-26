"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ancestry } from "@/lib/registry";
import { search, type SearchEntry } from "@/lib/search";
import { useApp } from "@/lib/store";

function Breadcrumb() {
  const focus = useApp((s) => s.focus);
  const metaReady = useApp((s) => s.metaReady);
  const flyTo = useApp((s) => s.flyTo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chain = useMemo(() => ancestry(focus), [focus, metaReady]);
  if (focus === "free") return null;
  return (
    <nav className="crumbs" aria-label="Location">
      {chain.map((b, i) => (
        <span key={b.id}>
          {i > 0 && <span className="sep">›</span>}
          <button className={i === chain.length - 1 ? "is-current" : ""} onClick={() => flyTo(b.id)}>
            {b.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

function Search() {
  const flyTo = useApp((s) => s.flyTo);
  const metaReady = useApp((s) => s.metaReady);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const results = useMemo<SearchEntry[]>(() => search(q), [q, metaReady]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== input.current) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (r: SearchEntry) => {
    flyTo(r.id);
    setQ("");
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="search">
      <input
        ref={input}
        value={q}
        placeholder="Search…"
        aria-label="Search the galaxy"
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && results[active]) go(results[active]);
          else if (e.key === "Escape") { setQ(""); input.current?.blur(); }
        }}
      />
      {open && results.length > 0 && (
        <ul className="results panel" role="listbox">
          {results.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active}>
              <button className={i === active ? "is-active" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => go(r)} onMouseEnter={() => setActive(i)}>
                <span>{r.name}</span>
                <em>{r.kind}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What the camera is centred on, with release / reset. */
function CentreLine() {
  const focus = useApp((s) => s.focus);
  const metaReady = useApp((s) => s.metaReady);
  const release = useApp((s) => s.release);
  const reset = useApp((s) => s.reset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const name = useMemo(() => (focus === "free" ? "" : (ancestry(focus).at(-1)?.name ?? "")), [focus, metaReady]);
  return (
    <p className="centre-line">
      {focus === "free" ? (
        <span>Free camera — click any object to centre on it</span>
      ) : (
        <>
          <span>
            Centred on <b>{name}</b>
          </span>
          <button onClick={release} title="Stop following; right-drag or Shift-drag also pans freely">
            Release
          </button>
        </>
      )}
      <button onClick={reset} title="Back to the galaxy overview (R)">
        Reset view
      </button>
    </p>
  );
}

function FilterChip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button className={`filter ${on ? "is-on" : ""}`} aria-pressed={on} onClick={onClick} title={title}>
      <svg viewBox="0 0 12 12" aria-hidden>
        <path d="M2.5 6.2 5 8.6l4.5-5" />
      </svg>
      {children}
    </button>
  );
}

export function TopBar() {
  const labels = useApp((s) => s.labels);
  const orbits = useApp((s) => s.orbits);
  const details = useApp((s) => s.details);
  const set = useApp((s) => s.set);

  // remember the details preference; D toggles it
  useEffect(() => {
    try {
      if (localStorage.getItem("atlas.details") === "0") set({ details: false });
    } catch {}
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea") || e.ctrlKey || e.metaKey) return;
      if (e.key === "d" || e.key === "D") useApp.getState().set({ details: !useApp.getState().details });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [set]);
  useEffect(() => {
    try {
      localStorage.setItem("atlas.details", details ? "1" : "0");
    } catch {}
  }, [details]);
  return (
    <header className="topbar">
      <div className="brand">
        <h1>
          Milky Way <span>3D atlas</span>
        </h1>
        <Breadcrumb />
        <CentreLine />
      </div>
      <div className="top-right">
        <Search />
        <div className="toggles">
          <FilterChip on={labels} onClick={() => set({ labels: !labels })}>Labels</FilterChip>
          <FilterChip on={orbits} onClick={() => set({ orbits: !orbits })}>Orbits</FilterChip>
          <FilterChip on={details} onClick={() => set({ details: !details })} title="Show or hide the details panel (D)">Details</FilterChip>
          <button className="link-btn sources-link" onClick={() => set({ sourcesOpen: true })}>Sources</button>
        </div>
      </div>
    </header>
  );
}
