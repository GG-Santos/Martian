"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { Search, TriangleAlert, Users, Clock3, X, FileText, Crosshair, FlaskConical, BriefcaseBusiness, Eye, ListChecks } from "lucide-react";
import { Riffle } from "@lucasmarkes/hairline/react";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { SelectField } from "../../components/ui/select";
import { CrewStepActions } from "./CrewStepActions";
import type { Quest } from "../../features/quests/quest-types";

export function CrewMissionBoard({ selectedId, onSelect, onAccept, onBack, timeline, backLabel = "Back to details", continueLabel = "Accept mission" }: {
  selectedId: string | null;
  onSelect: (quest: Quest) => void;
  onAccept: (quest: Quest) => void;
  onBack: () => void;
  timeline: ReactNode;
  backLabel?: string;
  continueLabel?: string;
}) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalogWarning, setCatalogWarning] = useState("");
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [duration, setDuration] = useState("all");
  const [briefDismissed, setBriefDismissed] = useState(!selectedId);
  useEffect(() => {
    let active = true;
    fetch("/api/quests").then(async response => {
      if (!response.ok) throw new Error("The mission catalog could not be loaded. Refresh to try again.");
      const result: unknown = await response.json();
      if (!Array.isArray(result)) throw new Error("The mission catalog returned an invalid response.");
      if (active) {
        if (response.headers.get("x-mission-catalog-status") === "bundled-fallback") {
          setCatalogWarning("Saved crew proposals are unavailable right now. Bundled missions remain available.");
        }
        setQuests(result.filter((quest): quest is Quest => Boolean(quest && typeof quest === "object" && typeof quest.id === "string" && quest.status === "published")));
      }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "The mission catalog could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const selected = useMemo(() => briefDismissed ? null : quests.find(quest => quest.id === selectedId) ?? null, [briefDismissed, quests, selectedId]);
  const filtered = useMemo(() => quests.filter(quest =>
    (difficulty === "all" || quest.difficulty === difficulty) &&
    (duration === "all" || (duration === "short" ? quest.durationMin <= 45 : quest.durationMin > 45)) &&
    `${quest.title} ${quest.description} ${quest.hypothesis}`.toLowerCase().includes(query.trim().toLowerCase())
  ), [quests, difficulty, duration, query]);
  const clearFilters = () => { setQuery(""); setDifficulty("all"); setDuration("all"); };
  return <section className="crew-setup-board" aria-label="Mission selection">
    {error && <Alert variant="destructive" role="alert">{error}</Alert>}
    {catalogWarning && <Alert role="status">{catalogWarning}</Alert>}
    {loading ? <p className="crew-catalog-state" role="status">Loading available missions…</p>
      : !quests.length ? <div className="crew-mission-empty"><span className="eyebrow">MISSION BOARD</span><h2>No published missions</h2><p>Submit a quest first, then return here to choose it.</p><Button type="button" onClick={() => window.location.assign("/board?submit=1")}>Submit a Quest</Button></div>
        : <div className="crew-mission-layout">
          <article className="crew-mission-brief" aria-live="polite">
            <div className="crew-mission-brief-content">{selected ? <>
              <div className="crew-mission-detail-top"><span className="eyebrow">MISSION BRIEF</span><Button className="crew-mission-close" type="button" variant="ghost" size="icon" aria-label="Close mission brief" onClick={() => setBriefDismissed(true)}><X size={18} /></Button></div>
              <h1 className="crew-mission-title">{selected.title}</h1>
              <p className="crew-mission-description">{selected.description}</p>
              <div className="crew-mission-location-layout">
                <section className="crew-mission-map-column" aria-label="Proposed mission location">
                  <div className="crew-mission-location-map" role="img" aria-label={`Proposed location in the Jezero crater sector at ${selected.point.x} meters east and ${selected.point.y} meters north}`}>
                    <Image src="/data/jezero/optical.webp" alt="" fill sizes="(max-width: 900px) 90vw, 40vw" /><span aria-hidden="true" style={{ left: `${selected.point.x / 2048 * 100}%`, top: `${(1 - selected.point.y / 2048) * 100}%` }}><Crosshair size={12} /></span><small>JEZERO CRATER · {selected.point.x} m E · {selected.point.y} m N</small>
                  </div>
                  <div className="crew-mission-requirements"><dl>
                    <div><dt><Users size={16} aria-hidden="true" /> Recommended crew</dt><dd>{selected.recommendedCrewSize} {selected.recommendedCrewSize === 1 ? "astronaut" : "astronauts"}</dd></div>
                    <div><dt><Clock3 size={16} aria-hidden="true" /> Estimated duration</dt><dd>{selected.durationMin} minutes</dd></div>
                  </dl></div>
                </section>
                <aside className="crew-mission-field-context" aria-label="Mission field context">
                  <section className="crew-mission-context-section crew-mission-objective-summary"><h2><FlaskConical size={16} aria-hidden="true" />Objective</h2><p>{selected.hypothesis}</p></section>
                  <section className="crew-mission-context-section"><h3><BriefcaseBusiness size={16} aria-hidden="true" />Equipment</h3><p>{selected.equipment.length ? selected.equipment.join(", ") : "None listed"}</p></section>
                  <section className="crew-mission-context-section"><h3><Eye size={16} aria-hidden="true" />Expected observations</h3><p>{selected.expectedObservations}</p></section>
                  <section className="crew-mission-context-section"><h3><ListChecks size={16} aria-hidden="true" />Completion criteria</h3><p>{selected.completionCriteria}</p></section>
                  {selected.hazards.length > 0 && <section className="crew-mission-context-section"><h3><TriangleAlert size={16} aria-hidden="true" />Mission note</h3><p>{selected.hazards.join(", ")}</p></section>}
                </aside>
              </div>
            </> : <div className="crew-mission-default"><div className="crew-mission-empty"><div className="crew-mission-intro"><span>CREW ASSEMBLY</span><h1 id="crew-mission-heading">Choose a mission</h1><p className="crew-mission-provenance"><TriangleAlert size={15} aria-hidden="true" /><span>These investigations are proposals, not verified safe field sites. Review terrain and hazards before travel.</span></p></div><Riffle className="crew-linework crew-mission-riffle" intensity={0.18} theme="dark" label="A fine ripple across a field of tiles" /></div></div>}</div>
            <div className="crew-mission-editor-timeline">{timeline}</div>
          </article>
          <section className="crew-mission-catalog" aria-label="Mission catalog">
            <div className="crew-mission-tools">
              <div className="crew-mission-filters">
                <label className="crew-mission-search"><Search size={16} aria-hidden="true" /><Input aria-label="Search missions" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search missions" /></label>
                <div className={`crew-mission-filter${difficulty !== "all" ? " is-active" : ""}`}>
                  <SelectField aria-label="Filter by difficulty" value={difficulty} onChange={event => setDifficulty(event.target.value)}><option value="all">Any difficulty</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></SelectField>
                  {difficulty !== "all" && <Button className="crew-mission-filter-clear" type="button" variant="ghost" size="icon" aria-label="Clear difficulty filter" onClick={() => setDifficulty("all")}><X size={14} /></Button>}
                </div>
                <div className={`crew-mission-filter${duration !== "all" ? " is-active" : ""}`}>
                  <SelectField aria-label="Filter by duration" value={duration} onChange={event => setDuration(event.target.value)}><option value="all">Any duration</option><option value="short">45 min or less</option><option value="long">Over 45 min</option></SelectField>
                  {duration !== "all" && <Button className="crew-mission-filter-clear" type="button" variant="ghost" size="icon" aria-label="Clear duration filter" onClick={() => setDuration("all")}><X size={14} /></Button>}
                </div>
              </div>
            </div>
            {filtered.length ? <div className="crew-mission-grid" aria-label="Available missions">{filtered.map(quest => <button key={quest.id} type="button" aria-pressed={selectedId === quest.id} className="crew-mission-option quest-tile" onClick={() => { setBriefDismissed(false); onSelect(quest); }}>
              <div className="quest-tags"><Badge variant="outline">{quest.source === "built-in" ? "Bundled objective" : "Crew proposal"}</Badge><Badge variant="outline">{quest.difficulty}</Badge></div>
              <h2>{quest.title}</h2><p>{quest.description}</p>
              <div className="quest-tile-footer"><span>{quest.durationMin} min · {quest.recommendedCrewSize} crew</span><FileText size={17} aria-hidden="true" /></div>
            </button>)}</div> : <div className="crew-mission-no-results"><h2>No matching missions</h2><p>Try another search or filter.</p><Button type="button" variant="link" onClick={clearFilters}>Clear filters</Button></div>}
            <CrewStepActions className="crew-mission-actions" backLabel={backLabel} continueLabel={continueLabel} onBack={onBack} onContinue={() => selected && onAccept(selected)} disabled={!selected || loading || Boolean(error)} />
          </section>
        </div>}
  </section>;
}
