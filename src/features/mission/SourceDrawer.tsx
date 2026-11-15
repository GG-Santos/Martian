import type { Manifest } from "./types";
import { X } from "lucide-react";
export function SourceDrawer({
  manifest,
  onClose,
}: {
  manifest: Manifest;
  onClose: () => void;
}) {
  return (
    <aside
      className="source-drawer"
      aria-label="Sources and assumptions"
      id="source-drawer"
      popover="auto"
    >
      <div className="drawer-heading">
        <h2>Sources & assumptions</h2>
        <button aria-label="Close sources" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p>
        This is a planning demonstration, using archival observations. The
        habitat, field stations, and excursion are hypothetical.
      </p>
      <h3>What the estimates mean</h3>
      <p>
        Time = horizontal route distance ÷ walking speed + dwell per included
        stop. Defaults: 0.5 m/s, 120 minutes total, 10 minutes per stop. The
        return leg is included. Adjust these values in the mission panel.
      </p>
      <p>
        Amber route segments exceed a <strong>15° demo slope threshold</strong>.
        This is not an established spacesuit mobility limit. No oxygen, energy,
        radiation dose, or weather is modeled. Straight segments require human
        obstacle assessment.
      </p>
      {manifest.layers.map((l) => (
        <section key={l.id}>
          <h3>
            {l.id === "slope"
              ? "Topography & derived slope"
              : l.id === "thermal"
                ? "Thermal context"
                : "Optical imagery"}
          </h3>
          <p>
            {l.mission} / {l.instrument}
            <br />
            <code>{l.productId}</code>
          </p>
          <dl>
            <dt>Status</dt>
            <dd>{l.status}</dd>
            <dt>Source scale</dt>
            <dd>
              {l.nativeResolutionM.toFixed(l.nativeResolutionM < 2 ? 2 : 0)}{" "}
              m/pixel
            </dd>
            <dt>Display/analysis scale</dt>
            <dd>{l.outputResolutionM} m sampling</dd>
            <dt>Values</dt>
            <dd>{l.units}</dd>
            <dt>Acquired</dt>
            <dd>{l.acquired || "Date not provided"}</dd>
            <dt>Credit</dt>
            <dd>{l.credit}</dd>
          </dl>
          {l.dateNote && <p>{l.dateNote}</p>}
          <a href={l.reference} target="_blank" rel="noreferrer">
            View source and reuse information
          </a>
        </section>
      ))}
      <h3>Crew and hazard scenarios</h3>
      <p>
        Four simulated crew follow the edited route in two directions. Enlarged
        human figures and the habitat are map symbols. Terrain-derived slope
        zones use an illustrative 15° threshold. Loose sand, rockfall and dust
        are labeled scenarios. The science atlas includes regional, rover-target
        and Mars-context records with their own observation locations.
      </p>
      <h3>Registration & limitations</h3>
      <p>
        {manifest.processing}. Vertical datum: {manifest.verticalDatum}. A 2048
        m patch. Display relief is adjustable from 1× to 5×, with 4 m geometry
        an optional 1 m site detail tile, and an 8 m fallback. Route analysis
        uses the 8 m grid at true scale, so small hazards are unresolved. THEMIS
        retains ~100 m source pixels; relative IR brightness does not measure
        temperature or identify composition.
      </p>
      <p>
        The rover panorama is regional context, credited
        NASA/JPL-Caltech/ASU/MSSS; it is not an image of these field stations.
      </p>
      <a href="/data/jezero/manifest.json" target="_blank" rel="noreferrer">
        Read the complete dataset manifest
      </a>
    </aside>
  );
}
