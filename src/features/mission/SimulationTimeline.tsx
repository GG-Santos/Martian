import { simulationStepSol } from "./simulation-clock";

type TimelineProps = {
  elapsedSol: number;
  durationSol: number;
  playing: boolean;
  disabled: boolean;
  playbackAvailable: boolean;
  onStep: (deltaSol: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
};

export function SimulationTimeline({
  elapsedSol, durationSol, playing, disabled, playbackAvailable, onStep, onPlay, onPause, onReset,
}: TimelineProps) {
  const atEnd = elapsedSol >= durationSol;
  return (
    <div className="simulation-timeline" aria-label="Mission clock" role="group">
      <div className="simulation-timeline-heading">
        <strong>Mission clock</strong>
        <span data-testid="simulation-time">{elapsedSol.toFixed(2)} / {durationSol.toFixed(2)} sols</span>
      </div>
      {durationSol > 0 && <progress aria-label="Scenario time elapsed" value={elapsedSol} max={durationSol} />}
      <div className="simulation-actions">
        <button type="button" disabled={disabled || (playing && playbackAvailable) || atEnd}
          onClick={() => onStep(Math.min(simulationStepSol, durationSol - elapsedSol))}>Step 0.5 sol</button>
        {playing
          ? <button type="button" disabled={disabled} onClick={onPause}>Pause simulation</button>
          : <button type="button" disabled={disabled || !playbackAvailable || atEnd} onClick={onPlay}>Play simulation</button>}
        <button type="button" disabled={disabled || (elapsedSol === 0 && !playing)} onClick={onReset}>Reset simulation</button>
      </div>
    </div>
  );
}
