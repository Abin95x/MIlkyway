"use client";

import { useEffect, useState } from "react";

// Live summaries from the Wikipedia REST API (CORS-enabled, no key needed).

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
  thumb?: string;
}

const cache = new Map<string, Promise<WikiSummary | null>>();

async function fetchSummary(title: string): Promise<WikiSummary | null> {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (j.type === "disambiguation" || !j.extract) return null;
  return { title: j.title, extract: j.extract, url: j.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title}`, thumb: j.thumbnail?.source };
}

/**
 * Tries each title in order and returns the first article that passes `accept`
 * (used to avoid e.g. the mythology article when looking up a star).
 */
export function wikiLookup(titles: string[], accept?: (s: WikiSummary) => boolean): Promise<WikiSummary | null> {
  const key = titles.join("|");
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      for (const t of titles) {
        try {
          const s = await fetchSummary(t);
          if (s && (!accept || accept(s))) return s;
        } catch {
          /* offline or blocked: fall through */
        }
      }
      return null;
    })();
    cache.set(key, p);
  }
  return p;
}

export function useWiki(titles: string[] | null, accept?: (s: WikiSummary) => boolean) {
  const key = titles?.join("|") ?? "";
  const [state, setState] = useState<{ key: string; data: WikiSummary | null; loading: boolean }>({ key: "", data: null, loading: false });
  useEffect(() => {
    if (!titles || !titles.length) return;
    let alive = true;
    setState({ key, data: null, loading: true });
    wikiLookup(titles, accept).then((data) => alive && setState({ key, data, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : { key, data: null, loading: !!titles?.length };
}
