"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { describe } from "@/lib/describe";
import { useApp } from "@/lib/store";
import { useWiki } from "@/lib/wiki";

export function InfoPanel() {
  const selected = useApp((s) => s.selected);
  const focus = useApp((s) => s.focus);
  const metaReady = useApp((s) => s.metaReady);
  const ready = useApp((s) => s.ready);
  const flyTo = useApp((s) => s.flyTo);
  const details = useApp((s) => s.details);
  const set = useApp((s) => s.set);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // on phones the panel starts folded so the scene stays visible
    if (window.matchMedia("(max-width: 600px)").matches) setCollapsed(true);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const info = useMemo(() => (selected ? describe(selected) : null), [selected, metaReady, ready]);
  const wiki = useWiki(info?.wiki ?? null, info?.wikiAccept);

  // values that change with simulated time refresh at 4 Hz without re-rendering the panel
  const liveRef = useRef<HTMLDListElement>(null);
  useEffect(() => {
    if (!info?.live || collapsed) return;
    const el = liveRef.current;
    const tick = () => {
      if (!el) return;
      el.replaceChildren(
        ...info.live!().flatMap((r) => {
          const dt = document.createElement("dt");
          dt.textContent = r.label.replace(/ \(now\)$/, "");
          const dd = document.createElement("dd");
          dd.textContent = r.value;
          return [dt, dd];
        }),
      );
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [info, collapsed]);

  if (!details || !selected || !info) return null;
  const isCentre = focus === selected;

  return (
    <aside className={`info ${collapsed ? "is-collapsed" : ""}`} aria-label="Details">
      <header className="info-head">
        <p className="info-kind">
          <i style={{ background: info.accent }} aria-hidden />
          {info.kicker}
        </p>
        <h2>{info.title}</h2>
        <div className="info-tools">
          {isCentre ? (
            <span className="here">Centred here</span>
          ) : (
            <button className="go" onClick={() => flyTo(selected)}>
              Go there
            </button>
          )}
          <span className="spacer" />
          <button onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
            {collapsed ? "Expand" : "Collapse"}
          </button>
          <button onClick={() => set({ details: false })} title="Hide the details panel — turn it back on with Details or D">
            Hide
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="info-body">
          {info.summary && <p className="summary">{info.summary}</p>}

          {info.live && (
            <section>
              <h3>Right now</h3>
              <dl className="table live" ref={liveRef} />
            </section>
          )}

          {info.facts.length > 0 && (
            <section>
              <h3>Data</h3>
              <dl className="table">
                {info.facts.map((f) => (
                  <Fragment key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          )}

          {info.links && info.links.items.length > 0 && (
            <section>
              <h3>{info.links.title}</h3>
              <p className="refs">
                {info.links.items.map((l, i) => (
                  <Fragment key={l.id}>
                    {i > 0 && <span className="sep">, </span>}
                    <button onClick={() => flyTo(l.id)}>{l.label}</button>
                    {l.note && <span className="note"> ({l.note})</span>}
                  </Fragment>
                ))}
              </p>
            </section>
          )}

          {(wiki.loading || wiki.data) && (
            <section className="wiki">
              <h3>Encyclopedia</h3>
              {wiki.loading && <p className="muted">Loading…</p>}
              {wiki.data && (
                <>
                  {wiki.data.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={wiki.data.thumb} alt="" loading="lazy" decoding="async" />
                  )}
                  <p>{wiki.data.extract}</p>
                  <p className="source">
                    Wikipedia,{" "}
                    <a href={wiki.data.url} target="_blank" rel="noreferrer noopener">
                      “{wiki.data.title}”
                    </a>
                  </p>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
