"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { ArrowUpRight, UsersRound } from "lucide-react";
import { ProjectShell } from "../components/ProjectShell";
import { getMarsPoi } from "../features/locations/poi-catalog";
import { useRoom } from "../features/session/RoomProvider";
import { GlobeLoadingScreen } from "../features/mission-command/GlobeLoadingScreen";
import "../features/mission-command/mission-command.css";

const MarsGlobe = dynamic(() => import("../features/locations/MarsGlobe").then((module) => module.MarsGlobe), {
  ssr: false,
  loading: () => <div aria-hidden="true"><GlobeLoadingScreen visible /></div>,
});

export default function Home() {
  const [selected, setSelected] = useState("jezero");
  const [focusRequest, setFocusRequest] = useState(0);
  const [globeReady, setGlobeReady] = useState(false);
  const [loaderDismissed, setLoaderDismissed] = useState(false);
  const zoomRef = useRef<((direction: 1 | -1) => void) | null>(null);
  const { snapshot } = useRoom();
  const poi = getMarsPoi(selected);
  function select(id: string) { setSelected(id); setFocusRequest((value) => value + 1); }
  const markGlobeReady = useCallback(() => setGlobeReady(true), []);
  const markLoaderDismissed = useCallback(() => setLoaderDismissed(true), []);
  const pageInteractive = globeReady && loaderDismissed;

  return <ProjectShell current="home"><main className="mission-command-page">
    <h1 className="sr-only">Mission Command</h1>
    <div className="mission-command-globe" aria-label="Interactive Mars globe" inert={!pageInteractive}><MarsGlobe selected={selected} focusRequest={focusRequest} onSelect={select} onReady={markGlobeReady} topography={false} labels constellations zoomRef={zoomRef} showAllNames minDistance={5.5} offsetX={0.17} /></div>
    <GlobeLoadingScreen visible={!globeReady} onExitComplete={markLoaderDismissed} />
    <section className="mission-command-location" aria-live="polite" inert={!pageInteractive}><h2>{poi.name}</h2><p>{poi.fact}</p><a className="mission-command-source" href={poi.factSource} target="_blank" rel="noreferrer">Source: {poi.sourceLabel} <ArrowUpRight size={13}/></a></section>
    <section className="mission-command-actions" inert={!pageInteractive}><div className="mission-command-actions-main"><span className="mission-command-challenge-label">NASA SPACE APPS CHALLENGE 2026</span><h2>Interplanetary Survival Guide: Martian Map</h2><p>Future Mars crews need an integrated map for science and safe surface travel. The challenge calls for a local view of a Martian place or route that combines data from multiple NASA missions.</p><a className="mission-command-source" href="https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/" target="_blank" rel="noreferrer">Read the challenge <ArrowUpRight size={15}/></a>{snapshot?.status === "launched" ? <Link className="mission-command-primary" href="/scanner">Resume expedition <ArrowUpRight size={17}/></Link> : <Link className="mission-command-primary" href="/crew?location=jezero">Build your crew <UsersRound size={17}/></Link>}</div></section>
  </main></ProjectShell>;
}
