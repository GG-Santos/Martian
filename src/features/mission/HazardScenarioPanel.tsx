import { useId, useState } from "react";
import type { DustFrame, DustScenarioSelection } from "../hazards/dust-scenario";
import { SimulationTimeline } from "./SimulationTimeline";
import { advanceSimulationClock, type SimulationClockAction, type SimulationState } from "./simulation-clock";

export type ScenarioCommand = SimulationClockAction
  | { type: "select-scenario"; scenarioId: string | null }
  | { type: "set-season"; startLs: number };

const modeledLabels: Record<string, string> = {
  "modeled-low-v1": "Modeled · low",
  "modeled-central-v1": "Modeled · central",
  "modeled-high-v1": "Modeled · high",
};

function SeasonInput({ startLs, onApply }: { startLs: number; onApply: (value: number) => void }) {
  const [value, setValue] = useState(String(startLs));
  const degrees = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(degrees) && degrees >= 0 && degrees < 360;
  return (
    <form className="simulation-season" onSubmit={(event) => {
      event.preventDefault();
      if (valid && degrees !== startLs) onApply(degrees);
    }}>
      <label>Solar longitude Ls (°)
        <input type="number" min="0" step="any" required value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <button type="submit" disabled={!valid || degrees === startLs}>Apply season</button>
    </form>
  );
}

export function HazardScenarioPanel({ selection, frame, state, loading, disabled, playbackAvailable, onCommand }: {
  selection: DustScenarioSelection;
  frame: DustFrame | null;
  state: SimulationState;
  loading: boolean;
  disabled: boolean;
  playbackAvailable: boolean;
  onCommand: (command: ScenarioCommand) => void;
}) {
  const headingId = useId();
  const selectId = useId();
  const scenario = selection.scenarios.find(({ id }) => id === state.scenarioId);
  const durationSol = scenario?.frames.at(-1)?.elapsedSol ?? 0;
  const controlsDisabled = disabled || selection.status === "unavailable";
  const frameLabel = scenario?.source === "modeled" ? "Modeled dust envelope"
    : frame?.observed ? "Historical replay · Measured"
      : "Historical replay · Interpolated";
  function clockAction(action: SimulationClockAction) {
    if (controlsDisabled || !scenario) return;
    if (action.type === "step" && (!Number.isFinite(action.deltaSol) || action.deltaSol <= 0)) return;
    const next = advanceSimulationClock(state, action, durationSol);
    if (next.elapsedSol !== state.elapsedSol || next.playing !== state.playing) onCommand(action);
  }
  return (
    <section className="hazard-scenario" aria-labelledby={headingId}>
      <h3 id={headingId}>Dust scenario</h3>
      <p>Estimate route exposure from the selected departure time.</p>
      {selection.status === "unavailable" && <p role="status">{loading ? "Verifying dust catalog…" : "Dust catalog unavailable. Scenario controls are paused."}</p>}
      <fieldset disabled={controlsDisabled}>
        <SeasonInput key={state.startLs} startLs={state.startLs} onApply={(startLs) => onCommand({ type: "set-season", startLs })} />
        <label htmlFor={selectId}>Dust scenario</label>
        <select id={selectId} value={scenario?.id ?? ""} onChange={(event) => {
          const id = event.target.value;
          if (id === "" || selection.scenarios.some((candidate) => candidate.id === id)) {
            onCommand({ type: "select-scenario", scenarioId: id || null });
          }
        }}>
          <option value="">No dust scenario</option>
          {selection.scenarios.map(({ id, source, sourceRecords }) => (
            <option value={id} key={id}>{source === "historical"
              ? "Historical replay · " + sourceRecords[0]?.acquisitionRange[0].slice(0, 10)
              : modeledLabels[id] ?? "Modeled dust"}</option>
          ))}
        </select>
      </fieldset>
      {frame && scenario && (
        <div className="simulation-frame" data-testid="dust-frame">
          <strong>{frameLabel}</strong>
          <small>Column optical depth {frame.opacityRange.map((value) => value.toFixed(2)).join("–")}
            {" · "}{frame.regional ? "Regional footprint" : "Illustrative footprint"} · {frame.radiusKm.toFixed(2)} km radius</small>
          {frame.observed && <small>Acquired {frame.acquisitionUtc} · mission sol {frame.acquisitionSol}</small>}
          {scenario.source === "historical" && <small>Footprint and exposure are derived from regional measurements.</small>}
        </div>
      )}
      {scenario && !playbackAvailable && <small>Automatic playback requires the captain to be connected.</small>}
      <SimulationTimeline elapsedSol={state.elapsedSol} durationSol={durationSol} playing={state.playing}
        disabled={controlsDisabled || !scenario} playbackAvailable={playbackAvailable} onStep={(deltaSol) => clockAction({ type: "step", deltaSol })}
        onPlay={() => clockAction({ type: "play" })} onPause={() => clockAction({ type: "pause" })}
        onReset={() => clockAction({ type: "reset" })} />
      {scenario && <details className="simulation-provenance">
        <summary>Scenario sources and assumptions</summary>
        <p>Confidence: {scenario.uncertainty.confidence}</p>
        {scenario.sourceRecords.map((source) => (
          <p key={source.id}><a href={source.url}>{source.productId}</a> · {source.acquisitionRange.join(" to ")}
            {source.nativeResolutionKm && " · " + source.nativeResolutionKm.join("–") + " km native resolution"}. {source.processing}</p>
        ))}
        {scenario.assumptions.map((assumption) => <p key={assumption}>{assumption}</p>)}
      </details>}
    </section>
  );
}
