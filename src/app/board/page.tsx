"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Plus, Search, TriangleAlert } from "lucide-react";
import { ProjectShell } from "../../components/ProjectShell";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { SelectField } from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import { Card, CardDescription, CardFooter, CardHeader } from "../../components/ui/card";
import { Alert } from "../../components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../../components/ui/empty";
import type { Quest, QuestInput } from "../../features/quests/quest-types";
import type { LocalPoint } from "../../features/mission/types";
import { QuestSectorMap, boardLocation } from "./QuestSectorMap";
import "./board.css";

const list = (value: FormDataEntryValue | null) => String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

function QuestForm({ submit, cancel, missionId }: { submit: (input: QuestInput) => void; cancel: () => void; missionId: string | null }) {
  const [east, setEast] = useState("");
  const [north, setNorth] = useState("");
  const pin: LocalPoint | null = east !== "" && north !== "" && Number(east) >= 0 && Number(east) <= 2048 && Number(north) >= 0 && Number(north) <= 2048 ? { x: Number(east), y: Number(north) } : null;
  const place = (point: LocalPoint) => { setEast(String(point.x)); setNorth(String(point.y)); };
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    submit({
      title: text("title"), description: text("description"), hypothesis: text("hypothesis"),
      point: { x: Number(data.get("x")), y: Number(data.get("y")) },
      equipment: list(data.get("equipment")), hazards: list(data.get("hazards")),
      recommendedCrewSize: Number(data.get("crew")), durationMin: Number(data.get("duration")),
      difficulty: text("difficulty") as QuestInput["difficulty"],
      expectedObservations: text("observations"), completionCriteria: text("criteria"),
    });
  }
  return <form className="board-form" onSubmit={onSubmit}>
    <div className="board-form-head"><div><span className="board-eyebrow">NEW FIELD TASK</span><h2>Post a scientific quest</h2></div><Button type="button" variant="ghost" onClick={cancel}>Close</Button></div>
    <div className="board-pin-workspace"><QuestSectorMap missionId={missionId} point={pin} onPointChange={place} /><div className="board-pin-details"><span className="board-eyebrow">01 / LOCATION</span><h3>Place a field pin</h3><p id="quest-pin-guidance">Click the sector map or enter local east and north meters. Arrow keys move a focused map pin by 8 m; hold Shift for 64 m.</p><strong>{pin ? `${pin.x} E / ${pin.y} N m` : "No location selected"}</strong><small>Pin is a proposed field location. {boardLocation(missionId).provenance}. Terrain and route safety must be reviewed separately.</small></div></div>
    <div className="board-form-grid">
      <label className="board-wide">Title<Input name="title" required maxLength={100} placeholder="Survey the southern ridge" /></label>
      <label className="board-wide">Description<Textarea name="description" required maxLength={500} rows={2} placeholder="What should the crew do?" /></label>
      <label className="board-wide">Scientific objective or hypothesis<Textarea name="hypothesis" required maxLength={500} rows={2} placeholder="The exposed layer records a change in sediment transport." /></label>
      <label>Map X (m)<Input name="x" type="number" min={0} max={2048} step="any" required placeholder="820" value={east} onChange={(event) => setEast(event.target.value)} /></label>
      <label>Map Y (m)<Input name="y" type="number" min={0} max={2048} step="any" required placeholder="1050" value={north} onChange={(event) => setNorth(event.target.value)} /></label>
      <label>Recommended crew size<SelectField name="crew" defaultValue="2"><option value="1">1 astronaut</option><option value="2">2 astronauts</option><option value="3">3 astronauts</option><option value="4">4 astronauts</option><option value="5">5 astronauts</option></SelectField></label>
      <label>Estimated duration (min)<Input name="duration" type="number" min={1} max={1440} required defaultValue={45} /></label>
      <label>Difficulty<SelectField name="difficulty" defaultValue="moderate"><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></SelectField></label>
      <label>Required equipment<Input name="equipment" placeholder="camera, sample kit" /></label>
      <label className="board-wide">Potential hazards<Input name="hazards" placeholder="loose ground, low visibility" /></label>
      <label className="board-wide">Expected observations<Textarea name="observations" required maxLength={500} rows={2} placeholder="Images, field sketch, measurements" /></label>
      <label className="board-wide">Completion criteria<Textarea name="criteria" required maxLength={500} rows={2} placeholder="Record two geolocated images and one field note" /></label>
    </div><div className="board-form-actions"><Button type="button" variant="ghost" onClick={cancel}>Cancel</Button><Button type="submit">Submit quest</Button></div>
  </form>;
}

export default function BoardPage() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [view, setView] = useState<"browse" | "submit">("browse");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("submit") === "1") setView("submit");
  }, []);
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [source, setSource] = useState("all");
  const [duration, setDuration] = useState("all");
  const hasFilters = Boolean(query.trim() || difficulty !== "all" || source !== "all" || duration !== "all");
  const clearFilters = () => { setQuery(""); setDifficulty("all"); setSource("all"); setDuration("all"); };
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/quests").then(async response => {
      if (!response.ok) throw new Error("Could not load the catalog. Please refresh and try again.");
      setQuests(await response.json());
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(() => quests.filter(quest =>
    (difficulty === "all" || quest.difficulty === difficulty) &&
    (source === "all" || quest.source === source) &&
    (duration === "all" || (duration === "short" ? quest.durationMin <= 45 : quest.durationMin > 45)) &&
    `${quest.title} ${quest.description} ${quest.hypothesis}`.toLowerCase().includes(query.toLowerCase())
  ), [quests, difficulty, source, duration, query]);
  async function submit(input: QuestInput) {
    setError("");
    try {
      const response = await fetch("/api/quests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save your quest.");
      setQuests(current => [...current, result]);
      setView("browse");

    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save your quest."); }
  }
  return <ProjectShell current="board"><main className="board-page catalog-page">
    {view === "submit" ? <>
      <Button type="button" variant="ghost" className="catalog-back" onClick={() => { setView("browse"); setError(""); }}><ArrowLeft data-icon="inline-start" /> Back to quests</Button>
      {error && <Alert className="board-error" variant="destructive">{error}</Alert>}
      <QuestForm missionId="jezero" cancel={() => setView("browse")} submit={submit} />
    </> : <>
      {error && <Alert className="board-error" variant="destructive">{error}</Alert>}
      <section className="quest-catalog" aria-label="Quest catalog">
        <div className="quest-catalog-tools"><div className="quest-filters"><label className="quest-search"><Search size={16} /><Input aria-label="Search quests" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search quests" /></label><SelectField aria-label="Filter by difficulty" value={difficulty} onChange={event => setDifficulty(event.target.value)}><option value="all">Any difficulty</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></SelectField><SelectField aria-label="Filter by duration" value={duration} onChange={event => setDuration(event.target.value)}><option value="all">Any duration</option><option value="short">45 min or less</option><option value="long">Over 45 min</option></SelectField><SelectField aria-label="Filter by source" value={source} onChange={event => setSource(event.target.value)}><option value="all">All sources</option><option value="built-in">Bundled objectives</option><option value="crew">Crew proposals</option></SelectField><Button onClick={() => setView("submit")}><Plus data-icon="inline-start" /> Submit quest</Button></div>{hasFilters && <div className="quest-filter-summary"><Button type="button" variant="link" size="sm" onClick={clearFilters}>Clear filters</Button></div>}</div>
        <div className="quest-grid">{filtered.map(quest => <Card className="quest-tile" render={<Link href={`/board/${encodeURIComponent(quest.id)}`} />} key={quest.id}>
          <CardHeader><div className="quest-tags"><Badge variant="outline">{quest.source === "built-in" ? "Bundled objective" : "Crew proposal"}</Badge><Badge variant="outline">{quest.difficulty}</Badge></div><h2>{quest.title}</h2></CardHeader><CardDescription>{quest.description}</CardDescription><CardFooter className="quest-tile-footer"><span>{quest.durationMin} min · {quest.recommendedCrewSize} crew</span><ArrowUpRight size={18} aria-hidden="true" /></CardFooter>
        </Card>)}</div>{!loading && !filtered.length && <Empty className="board-no-results"><EmptyHeader><EmptyTitle>No matching quests</EmptyTitle><EmptyDescription>Try another search or filter.</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" variant="link" onClick={clearFilters}>Clear filters</Button></EmptyContent></Empty>}
      </section><p className="board-footnote"><TriangleAlert aria-hidden="true" size={16} /> <span>These investigations are proposals, not verified safe field sites. Review terrain and hazards before travel.</span></p>
    </>}
  </main></ProjectShell>;
}
