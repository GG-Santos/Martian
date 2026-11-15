export function ModelNotes() {
  return (
    <div className="walk-model-notes">
      <p>
        Archival NASA optical imagery, HiRISE stereo elevation and THEMIS
        infrared brightness are registered to this Jezero sector. IR brightness
        is a relative DN measurement, not surface temperature in °C. Other atlas
        products retain their regional or rover-target coverage.
      </p>
      <p>
        Educational rehearsal: bases, science objectives and hazard events are
        hypothetical. Walking starts at 0.5 m/s and slows with slope; dust
        crossings add 25% travel time. Oxygen uses 0.3 percentage points/min,
        battery 0.2/min; fieldwork uses 1.15× oxygen and 1.5× battery. Dust adds
        1.3× travel battery draw. The least supplied crew member sets the
        group’s starting budget. Return requires every science stop, arrival at
        base, and at least 20% oxygen and battery. This is not a validated
        spacesuit or safety model.
      </p>
      <p>
        <a href="/data/jezero/manifest.json" target="_blank" rel="noreferrer">
          Dataset provenance and instrument resolution
        </a>{" "}
        ·{" "}
        <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noreferrer">
          NASA Mars Trek
        </a>
      </p>
    </div>
  );
}
