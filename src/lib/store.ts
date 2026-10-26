import { create } from "zustand";

export interface AppState {
  /** body the camera orbits/tracks; "free" = released, orbiting a fixed point */
  focus: string;
  /** bumps on every flyTo so re-selecting the same body re-frames it */
  flyNonce: number;
  /** body shown in the info panel */
  selected: string | null;
  ready: boolean;
  metaReady: boolean;
  labels: boolean;
  orbits: boolean;
  /** details panel visible at all (stays hidden while browsing when off) */
  details: boolean;
  speedIndex: number;
  sourcesOpen: boolean;
  flyTo: (id: string, select?: boolean) => void;
  /** stop tracking the current body; the camera keeps orbiting the point it was looking at */
  release: () => void;
  /** back to the starting galaxy overview */
  reset: () => void;
  select: (id: string | null) => void;
  set: (patch: Partial<AppState>) => void;
}

export const useApp = create<AppState>((set) => ({
  focus: "galaxy",
  flyNonce: 0,
  selected: "galaxy",
  ready: false,
  metaReady: false,
  labels: true,
  orbits: true,
  details: true,
  speedIndex: 1,
  sourcesOpen: false,
  flyTo: (id, select = true) =>
    set((s) => ({ focus: id, flyNonce: s.flyNonce + 1, selected: select ? id : s.selected })),
  release: () => set((s) => (s.focus === "free" ? s : { focus: "free" })),
  reset: () => set((s) => ({ focus: "galaxy", flyNonce: s.flyNonce + 1, selected: "galaxy" })),
  select: (id) => set({ selected: id }),
  set: (patch) => set(patch),
}));

/** Per-frame numbers for the HUD, written by the render loop and polled by the UI. */
export const telemetry = {
  distToFocus: 0,
  distToSun: 0,
  fps: 60,
  hover: null as null | { id: string; name: string; x: number; y: number },
};
