"use client";

import { useMemo, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { CircleDot, Crosshair, MapPin, Tent } from "lucide-react";
import { CrewHazardIcon } from "../crew/CrewHazardIcon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import type { LocalPoint } from "../../features/mission/types";
import type { Quest } from "../../features/quests/quest-types";
import type { CrewBaseScenario, CrewSlopeGrid } from "../../features/crew/crew-hazard-scenario";
import { boardLocation } from "../../features/mission/mission-location";
export { boardLocation } from "../../features/mission/mission-location";

const sectorM = 2048;

export function QuestSectorMap({ missionId, point, onPointChange, quests = [], onQuestSelect, pinLabel = "quest location", focusPoint, mapClassName = "", showSlopeOverlay = false, slopeGrid, baseScenario, recommendedAreas = false }: {
  missionId: string | null;
  point?: LocalPoint | null;
  onPointChange?: (point: LocalPoint) => void;
  quests?: Quest[];
  onQuestSelect?: (quest: Quest) => void;
  pinLabel?: string;
  focusPoint?: LocalPoint;
  mapClassName?: string;
  showSlopeOverlay?: boolean;
  slopeGrid?: CrewSlopeGrid;
  baseScenario?: CrewBaseScenario;
  recommendedAreas?: boolean;
}) {
  const location = boardLocation(missionId);
  const variant = missionId === "gale" ? "gale" : missionId === "valles" ? "valles" : location.observed ? "jezero" : "grid";
  const placeFromPointer = (clientX: number, clientY: number, element: HTMLElement) => {
    const frame = element.closest(".quest-sector-frame") ?? element;
    const bounds = frame.getBoundingClientRect();
    onPointChange?.({
      x: Math.round(Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)) * sectorM),
      y: Math.round((1 - Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height))) * sectorM),
    });
  };
  const choose = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) return;
    placeFromPointer(event.clientX, event.clientY, event.currentTarget);
  };
  const keys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!onPointChange) return;
    const current = point ?? { x: 1024, y: 1024 };
    const step = event.shiftKey ? 64 : 8;
    const change: Record<string, LocalPoint> = {
      ArrowLeft: { x: Math.max(0, current.x - step), y: current.y },
      ArrowRight: { x: Math.min(sectorM, current.x + step), y: current.y },
      ArrowUp: { x: current.x, y: Math.min(sectorM, current.y + step) },
      ArrowDown: { x: current.x, y: Math.max(0, current.y - step) },
    };
    if (change[event.key]) { event.preventDefault(); onPointChange(change[event.key]); }
    if ((event.key === "Enter" || event.key === " ") && !point) { event.preventDefault(); onPointChange(current); }
  };
  const valid = (candidate: LocalPoint) => Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && candidate.x >= 0 && candidate.x <= sectorM && candidate.y >= 0 && candidate.y <= sectorM;
  const positionStyle = (candidate: LocalPoint) => ({ left: `${candidate.x / sectorM * 100}%`, top: `${(1 - candidate.y / sectorM) * 100}%` });
  const hazardCells = baseScenario?.zones.flatMap(zone => {
    const cells: { key: string; x: number; y: number; opacity: number; kind: string }[] = [];
    const gridSize = 32;
    for (let row = 0; row < gridSize; row += 1) for (let col = 0; col < gridSize; col += 1) {
      const x = (col + 0.5) * sectorM / gridSize;
      const y = sectorM - (row + 0.5) * sectorM / gridSize;
      const distance = Math.hypot((x - zone.center.x) / zone.radiusX, (y - zone.center.y) / zone.radiusY);
      if (distance < 1.35) cells.push({ key: `${zone.id}-${row}-${col}`, x: col, y: row, opacity: Math.max(0.08, (1 - distance / 1.35) * 0.56), kind: zone.kind });
    }
    return cells;
  }) ?? [];
  const slopeCells = useMemo(() => {
    if (!slopeGrid || slopeGrid.width <= 0 || slopeGrid.height <= 0 || slopeGrid.values.length !== slopeGrid.width * slopeGrid.height) return [];
    const cells: { key: string; col: number; row: number; maxSlope: number }[] = [];
    const gridSize = 32;
    for (let row = 0; row < gridSize; row += 1) for (let col = 0; col < gridSize; col += 1) {
      const fromRow = Math.floor(row * slopeGrid.height / gridSize);
      const toRow = Math.floor((row + 1) * slopeGrid.height / gridSize);
      const fromCol = Math.floor(col * slopeGrid.width / gridSize);
      const toCol = Math.floor((col + 1) * slopeGrid.width / gridSize);
      let maxSlope = 0;
      for (let sourceRow = fromRow; sourceRow < toRow; sourceRow += 1) for (let sourceCol = fromCol; sourceCol < toCol; sourceCol += 1) {
        const encoded = slopeGrid.values[sourceRow * slopeGrid.width + sourceCol];
        if (encoded !== 255) maxSlope = Math.max(maxSlope, encoded / 4);
      }
      if (maxSlope > 10) cells.push({ key: `slope-${row}-${col}`, col, row, maxSlope });
    }
    return cells;
  }, [slopeGrid]);
  const slopeClusters = useMemo(() => {
    if (slopeCells.length < 4) return [];
    const gridSize = 32;
    const cellsByIndex = new Map(slopeCells.map(cell => [cell.row * gridSize + cell.col, cell] as const));
    const visited = new Set<number>();
    const clusters: { key: string; left: number; top: number }[] = [];
    for (const cell of slopeCells) {
      const startIndex = cell.row * gridSize + cell.col;
      if (visited.has(startIndex)) continue;
      const pending = [startIndex];
      const group: typeof slopeCells = [];
      visited.add(startIndex);
      while (pending.length > 0) {
        const index = pending.pop()!;
        const member = cellsByIndex.get(index);
        if (!member) continue;
        group.push(member);
        const row = Math.floor(index / gridSize);
        const col = index % gridSize;
        const neighbors = [
          ...(col > 0 ? [index - 1] : []),
          ...(col < gridSize - 1 ? [index + 1] : []),
          ...(row > 0 ? [index - gridSize] : []),
          ...(row < gridSize - 1 ? [index + gridSize] : []),
        ];
        for (const neighbor of neighbors) {
          if (visited.has(neighbor) || !cellsByIndex.has(neighbor)) continue;
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
      if (group.length < 4) continue;
      const center = group.reduce((sum, member) => ({ col: sum.col + member.col + 0.5, row: sum.row + member.row + 0.5 }), { col: 0, row: 0 });
      clusters.push({ key: group[0].key, left: center.col / group.length / gridSize * 100, top: center.row / group.length / gridSize * 100 });
    }
    return clusters;
  }, [slopeCells]);
  return <div className={`quest-sector-map ${variant} ${mapClassName}`}>
    <div className="quest-sector-top"><div><span>SECTOR / 2.048 KM</span><strong>{location.name}</strong></div><small>{location.provenance}</small></div>
    <div className="quest-sector-frame">
      {slopeGrid && variant === "jezero" ? <div className="quest-sector-slope-grid" aria-hidden="true">{slopeCells.map(cell => <i key={cell.key} className="quest-sector-slope-cell" style={{ left: `${cell.col / 32 * 100}%`, top: `${cell.row / 32 * 100}%`, opacity: Math.min(0.78, 0.24 + Math.max(0, cell.maxSlope - 10) / 20 * 0.54) }} />)}</div> : showSlopeOverlay && variant === "jezero" && <span className="quest-sector-slope-overlay" aria-hidden="true" />}
      <TooltipProvider delay={350}>
        {hazardCells.length > 0 && <div className="quest-sector-hazard-grid" aria-hidden="true" style={{ "--hazard-grid-size": 32 } as CSSProperties}>{hazardCells.map(cell => <i key={cell.key} className={`quest-sector-hazard-cell quest-sector-hazard-cell--${cell.kind}`} style={{ left: `${cell.x / 32 * 100}%`, top: `${cell.y / 32 * 100}%`, opacity: cell.opacity }} />)}</div>}
        {slopeGrid && variant === "jezero" && slopeClusters.length > 0 && <div className="quest-sector-slope-clusters" aria-hidden="true">{slopeClusters.map(cluster => <span key={cluster.key} className="quest-sector-slope-cluster-marker" style={{ left: `${cluster.left}%`, top: `${cluster.top}%` }}><CrewHazardIcon kind="slope" size={12} /></span>)}</div>}
        {baseScenario?.zones.some(zone => zone.trajectory) && <svg className="quest-sector-hazard-trajectories" viewBox={`0 0 ${sectorM} ${sectorM}`} preserveAspectRatio="none" aria-hidden="true">{baseScenario.zones.map(zone => zone.trajectory && <g key={zone.id}><defs><marker id={`crew-hazard-arrow-${zone.id}`} className={`quest-sector-hazard-marker quest-sector-hazard-marker--${zone.kind}`} markerWidth="20" markerHeight="20" refX="15" refY="10" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 1 L18 10 L0 19 Z" /></marker></defs><line className={`quest-sector-hazard-trajectory quest-sector-hazard-trajectory--${zone.kind}`} x1={zone.trajectory.start.x} y1={sectorM - zone.trajectory.start.y} x2={zone.trajectory.end.x} y2={sectorM - zone.trajectory.end.y} markerEnd={`url(#crew-hazard-arrow-${zone.id})`} /></g>)}</svg>}
        {baseScenario?.zones.map(zone => <Tooltip key={zone.id}>
          <TooltipTrigger render={onPointChange
            ? <button type="button" className={`quest-sector-hazard-target quest-sector-hazard-target--${zone.kind}`} style={positionStyle(zone.center)} aria-label={`${zone.label} simulated hazard zone. Crew base placement is blocked here.`} onClick={event => { if (event.detail === 0) onPointChange(zone.center); else placeFromPointer(event.clientX, event.clientY, event.currentTarget); }}><CrewHazardIcon kind={zone.kind} size={15} /></button>
            : <span role="img" className={`quest-sector-hazard-target quest-sector-hazard-target--${zone.kind}`} style={positionStyle(zone.center)} aria-label={`${zone.label} simulated hazard zone`}><CrewHazardIcon kind={zone.kind} size={15} /></span>} />
          <TooltipContent>{zone.label} · simulated planning zone</TooltipContent>
        </Tooltip>)}
        {recommendedAreas && baseScenario?.recommendedAreas.map(area => <Tooltip key={area.id}>
          <TooltipTrigger render={<button type="button" className="quest-sector-recommendation" style={{ ...positionStyle(area.point), "--suggested-area-size": `${area.radiusM / sectorM * 200}%` } as CSSProperties} aria-label={`Suggested base area: ${area.label}, approximately ${area.radiusM} m radius`} onClick={() => onPointChange?.(area.point)}><Tent size={12} /></button>} />
          <TooltipContent>{area.label} · {baseScenario?.terrainScreened ? "slope-screened suggested area" : "illustrative suggested area"}</TooltipContent>
        </Tooltip>)}
        {focusPoint && valid(focusPoint) && <Tooltip>
          <TooltipTrigger render={onPointChange
            ? <button type="button" className="quest-sector-pin mission-focus" style={positionStyle(focusPoint)} aria-label="Mission point. Click to place the base here." onClick={() => onPointChange(focusPoint)}><CircleDot size={11} strokeWidth={2.25} aria-hidden="true" /></button>
            : <span className="quest-sector-pin mission-focus" style={positionStyle(focusPoint)} role="img" aria-label="Mission point"><CircleDot size={11} strokeWidth={2.25} aria-hidden="true" /></span>} />
          <TooltipContent>Mission point{onPointChange ? " · click to place the base here" : ""}</TooltipContent>
        </Tooltip>}
        {point && valid(point) && <Tooltip>
          <TooltipTrigger render={onPointChange
            ? <button type="button" className="quest-sector-pin selected" aria-label="Current crew base" onClick={() => onPointChange(point)} style={positionStyle(point)}><Crosshair size={14} aria-hidden="true" /></button>
            : <span className="quest-sector-pin selected" role="img" aria-label="Crew base" style={positionStyle(point)}><Crosshair size={14} aria-hidden="true" /></span>} />
          <TooltipContent>Current crew base</TooltipContent>
        </Tooltip>}
      </TooltipProvider>
      {onPointChange && <button type="button" className="quest-sector-hit" aria-label={`Choose ${pinLabel} on sector map`} aria-describedby="quest-pin-guidance" onClick={choose} onKeyDown={keys} title={`Click to place ${pinLabel}. Arrow keys adjust by 8 m; hold Shift for 64 m.`} />}
      {quests.filter((quest) => valid(quest.point) && quest.status !== "draft").map((quest, index) => <button type="button" className={`quest-sector-pin task status-${quest.status}`} key={quest.id} style={positionStyle(quest.point)} aria-label={`Locate quest ${quest.title} on board map`} title={`${quest.title} · ${quest.status}`} onClick={() => onQuestSelect?.(quest)}><MapPin size={13} /><span>{index + 1}</span></button>)}
      {mapClassName.includes("crew-base-sector-map") ? <div className="quest-sector-base-label"><strong>{location.name}</strong><span>{point ? `${Math.round(point.x)} m E · ${Math.round(point.y)} m N` : "Choose a proposed point"}</span></div> : <div className="quest-sector-axis"><span>N ↑</span><span>0—2048 m E / N</span></div>}
    </div>
  </div>;
}
