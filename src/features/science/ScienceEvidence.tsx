import { useEffect, useState } from "react";
import { Expand, ExternalLink } from "lucide-react";
import type { Manifest } from "../mission/types";
import { loadOptionalAsset } from "../mission/load-mission";
import type { ScienceEvidenceRecord } from "./science-atlas";
export function ScienceEvidence({
  record,
  manifest,
}: {
  record: ScienceEvidenceRecord;
  manifest: Manifest;
}) {
  const [image, setImage] = useState<string | null>(null),
    [failed, setFailed] = useState(false),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true,
      url: string | undefined;
    void loadOptionalAsset("/data/jezero", record.asset, manifest, fetch).then(
      (bytes) => {
        if (!active) return;
        if (!bytes) {
          setFailed(true);
          return;
        }
        url = URL.createObjectURL(new Blob([bytes], { type: "image/webp" }));
        setImage(url);
      },
    );
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [record.asset, manifest]);
  return (
    <section
      className={`science-evidence ${expanded ? "expanded" : ""}`}
      aria-label={`${record.category} evidence`}
    >
      <div className="evidence-heading">
        <h2>{record.title}</h2>
        <span>{record.scope}</span>
      </div>
      <p>{record.explanation}</p>
      {image ? (
        <figure>
          <div className="evidence-image-scroll">
            <img
              src={image}
              alt={record.imageAlt}
              onError={() => setFailed(true)}
              hidden={failed}
            />
          </div>
          <figcaption>{record.credit}</figcaption>
          <button
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <Expand size={15} />
            {expanded ? "Close enlarged image" : "Enlarge evidence image"}
          </button>
        </figure>
      ) : (
        <p className="fine" role="status">
          {failed
            ? "Evidence image unavailable. The source record remains accessible."
            : "Verifying local evidence image…"}
        </p>
      )}
      {failed && image && (
        <p role="status">
          Evidence image unavailable. The source record remains accessible.
        </p>
      )}
      <dl className="quest-stats">
        <div>
          <dt>Instrument</dt>
          <dd>{record.instrument}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{record.location}</dd>
        </div>
        <div>
          <dt>Observation</dt>
          <dd>
            {record.observationTime ?? record.dateNote ?? "Date unavailable"}
          </dd>
        </div>
        <div>
          <dt>Product</dt>
          <dd>{record.productId}</dd>
        </div>
        <div>
          <dt>Values / axes</dt>
          <dd>{record.units}</dd>
        </div>
      </dl>
      <h3>Reading the evidence</h3>
      <dl className="evidence-key">
        {record.key.map((k) => (
          <div key={k.label}>
            <dt>{k.label}</dt>
            <dd>{k.description}</dd>
          </div>
        ))}
      </dl>
      <a href={record.sourceUrl} target="_blank" rel="noreferrer">
        Original science source <ExternalLink size={12} />
      </a>
    </section>
  );
}
