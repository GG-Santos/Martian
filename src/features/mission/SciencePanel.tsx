import { useRef, useState } from "react";
import { FlaskConical, ArrowUpRight } from "lucide-react";
import type { ScienceStop, StopId } from "./types";
import { useConsoleMotion } from "./use-console-motion";
export function SciencePanel({
  stops,
  selectedStopId,
  includedStopIds,
  onSelect,
  onInclude,
}: {
  stops: ScienceStop[];
  selectedStopId: StopId;
  includedStopIds: StopId[];
  onSelect: (id: StopId) => void;
  onInclude: (id: StopId, include: boolean) => void;
}) {
  const stop = stops.find((s) => s.id === selectedStopId)!;
  const ref = useRef<HTMLDivElement>(null);
  useConsoleMotion(ref, stop.id);
  return (
    <section className="science-panel">
      <h2>
        <FlaskConical size={16} />
        Science stations
      </h2>
      <p className="fine">Three questions worth a closer look.</p>
      <div className="stop-tabs" role="group" aria-label="Science stops">
        {stops.map((s) => (
          <button
            key={s.id}
            aria-label={`${s.id} ${s.title}`}
            aria-pressed={s.id === selectedStopId}
            onClick={() => onSelect(s.id)}
          >
            <strong>{s.id}</strong>
            <span>{s.title}</span>
          </button>
        ))}
      </div>
      <div ref={ref} className="stop-detail">
        <h3>{stop.question}</h3>
        <p>{stop.context}</p>
        <ContextImage key={stop.id} stop={stop} />
        <label className="include-stop">
          <input
            type="checkbox"
            aria-label={`Include stop ${stop.id}`}
            checked={includedStopIds.includes(stop.id)}
            onChange={(e) => onInclude(stop.id, e.target.checked)}
          />
          Include this science stop
        </label>
        <a
          className="science-reference"
          href={stop.references[0]}
          target="_blank"
          rel="noreferrer"
        >
          Jezero science context <ArrowUpRight size={12} />
        </a>
      </div>
    </section>
  );
}
export function ContextImage({ stop }: { stop: ScienceStop }) {
  const [failed, setFailed] = useState(false);
  return stop.image && !failed ? (
    <figure>
      <img
        src={`/data/jezero/${stop.image}`}
        alt="Perseverance panorama of Jezero's delta, shown as regional context"
        onError={() => setFailed(true)}
      />
      <figcaption>
        Regional context · Not this station
        <br />
        {stop.imageCredit}
      </figcaption>
    </figure>
  ) : (
    <p className="fine">
      Regional image unavailable. Science context and source remain accessible.
    </p>
  );
}
