"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock3, MapPin, Users } from "lucide-react";
import { ProjectShell } from "../../../components/ProjectShell";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import { Alert } from "../../../components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../../../components/ui/empty";
import type { Quest } from "../../../features/quests/quest-types";
import "../board.css";

export default function QuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  useEffect(() => {
    fetch("/api/quests").then(async response => {
      if (!response.ok) throw new Error();
      const quests: Quest[] = await response.json();
      const found = quests.find(item => item.id === id);
      setQuest(found ?? null); setState(found ? "ready" : "missing");
    }).catch(() => setState("error"));
  }, [id]);
  return <ProjectShell current="board"><main className="board-page quest-brief-page">
    <Button variant="ghost" className="catalog-back" render={<Link href="/board" />}><ArrowLeft data-icon="inline-start" /> Back to quests</Button>
    {state === "loading" && <p className="brief-message">Loading quest…</p>}
    {state === "error" && <Alert variant="destructive" className="brief-message">Could not load this quest. Refresh to try again.</Alert>}
    {state === "missing" && <Empty className="brief-message"><EmptyHeader><EmptyTitle>Quest not found</EmptyTitle><EmptyDescription>Return to the board to browse available quests.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" render={<Link href="/board" />}>Back to quests</Button></EmptyContent></Empty>}
    {quest && <>
      <header className="brief-heading"><div className="quest-tags"><Badge variant="outline">{quest.source === "built-in" ? "Bundled objective" : "Crew proposal"}</Badge><Badge variant="outline">{quest.difficulty}</Badge></div><h1>{quest.title}</h1><p>{quest.description}</p></header>
      <div className="brief-layout"><div className="brief-content"><section><h2>Mission brief</h2><p>{quest.description}</p><h3>Scientific objective</h3><p>{quest.hypothesis}</p></section><section><h2>Field outcomes</h2><h3>Expected observations</h3><p>{quest.expectedObservations}</p><h3>Completion criteria</h3><p>{quest.completionCriteria}</p></section></div>
      <aside className="brief-sidebar"><Card className="brief-requirements"><CardHeader><h2>Requirements</h2></CardHeader><CardContent><dl><div><dt><Users size={16} /> Recommended crew</dt><dd>{quest.recommendedCrewSize} {quest.recommendedCrewSize === 1 ? "astronaut" : "astronauts"}</dd></div><div><dt><Clock3 size={16} /> Estimated duration</dt><dd>{quest.durationMin} minutes</dd></div><div><dt><MapPin size={16} /> Proposed location</dt><dd>Jezero Crater<br />{quest.point.x} E / {quest.point.y} N m</dd></div></dl><h3>Equipment</h3><p>{quest.equipment.length ? quest.equipment.join(", ") : "None listed"}</p><h3>Potential hazards</h3><p>{quest.hazards.length ? quest.hazards.join(", ") : "None listed; inspect locally"}</p></CardContent></Card><p className="brief-provenance">{quest.provenance}</p></aside></div>
    </>}
  </main></ProjectShell>;
}
