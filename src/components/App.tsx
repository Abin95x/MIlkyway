"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { telemetry, useApp } from "@/lib/store";
import { overlay } from "@/lib/overlay";
import { Hud } from "./ui/Bottom";
import { InfoPanel } from "./ui/InfoPanel";
import { Hint, KeyboardNav, Loader, SourcesDialog } from "./ui/Overlays";
import { TopBar } from "./ui/TopBar";

// WebGL scene is client-only and code-split from the UI shell
const Scene = dynamic(() => import("@/scene/Scene"), { ssr: false });

export default function App() {
  const labels = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    overlay.root = labels.current;
    overlay.tip = tip.current;
    // ?debug exposes the store for automated testing
    if (new URLSearchParams(location.search).has("debug")) {
      (window as unknown as Record<string, unknown>).__atlas = { useApp, telemetry };
    }
  }, []);

  return (
    <main className="app">
      <div className="stage">
        <Scene />
        <div ref={labels} className="labels" />
        <div ref={tip} className="tip" />
      </div>
      <TopBar />
      <InfoPanel />
      <Hud />
      <Hint />
      <Loader />
      <SourcesDialog />
      <KeyboardNav />
    </main>
  );
}
