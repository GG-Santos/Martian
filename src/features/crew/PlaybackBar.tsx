import { Play, Pause, RotateCcw, Users } from "lucide-react";
import type { CrewPlayback } from "./use-crew-playback";
export function missionTime(seconds: number) {
  const n = Math.floor(seconds);
  return [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function PlaybackBar({ playback }: { playback: CrewPlayback }) {
  return (
    <section className="playback-bar" aria-label="Simulated crew playback">
      <div className="playback-controls">
        <Users size={16} />
        <span>CREW SIMULATION</span>
        <button
          disabled={playback.durationSec <= 0}
          aria-label={playback.playing ? "Pause expedition" : "Play expedition"}
          onClick={playback.playing ? playback.pause : playback.play}
        >
          {playback.playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          aria-label="Restart expedition"
          onClick={() => playback.restart()}
        >
          <RotateCcw size={15} />
        </button>
        <output data-testid="mission-clock">
          {missionTime(playback.timeSec)}
        </output>
        <select
          aria-label="Playback speed"
          value={playback.rate}
          onChange={(e) =>
            playback.setRate(Number(e.target.value) as 1 | 20 | 60)
          }
        >
          {[1, 20, 60].map((rate) => (
            <option key={rate} value={rate}>
              {rate}×
            </option>
          ))}
        </select>
      </div>
      <input
        aria-label="Mission time"
        type="range"
        min={0}
        max={playback.durationSec || 1}
        step={1}
        value={playback.timeSec}
        onChange={(e) => playback.seek(Number(e.target.value))}
      />
      <span className="playback-duration">
        {missionTime(playback.durationSec)}
      </span>
      {playback.resetReason && (
        <span role="status" className="playback-reason">
          {playback.resetReason}
        </span>
      )}
    </section>
  );
}
