"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import type { Manifest } from "../mission/types";
import { loadOptionalAsset } from "../mission/load-mission";
import type { ScienceEvidenceRecord } from "./science-atlas";
import { sciencePresentation } from "./science-presentation";
import "./science-views.css";

export function ScienceEvidence({
  record,
  manifest,
}: {
  record: ScienceEvidenceRecord;
  manifest: Manifest;
}) {
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const requestKey = `${record.asset}:${manifest.assets[record.asset]}:${attempt}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    url: string | null;
  } | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const presentation = sciencePresentation[record.category];
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    void loadOptionalAsset("/data/jezero", record.asset, manifest, fetch).then(
      (bytes) => {
        if (!active) return;
        if (bytes)
          url = URL.createObjectURL(new Blob([bytes], { type: "image/webp" }));
        setLoaded({ key: requestKey, url: url ?? null });
      },
    );
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [record.asset, manifest, requestKey]);
  const current = loaded?.key === requestKey ? loaded : null;
  const failed = current && (!current.url || failedImage === requestKey);
  const setScale = (value: number) => {
    setZoom(Math.max(1, Math.min(4, value)));
    if (value <= 1) frame.current?.scrollTo({ left: 0, top: 0 });
  };
  return (
    <section
      className={`science-reference science-reference--${record.category}`}
      aria-label={`${record.category} evidence`}
    >
      <header className="science-reference-heading">
        <div>
          <h2>{presentation.title}</h2>
          <p>{presentation.kind}</p>
        </div>
        <span className="science-scope">{record.scope}</span>
      </header>
      <p className="science-coverage">{presentation.coverage}</p>
      <div className="science-reference-layout">
        <figure className="science-figure">
          <div className="science-figure-toolbar">
            <strong>{record.productId}</strong>
            <div role="group" aria-label="Evidence image zoom">
              <button
                aria-label="Zoom out evidence"
                disabled={zoom <= 1}
                onClick={() => setScale(zoom - 0.5)}
              >
                <ZoomOut size={16} />
              </button>
              <span>{zoom.toFixed(1)}×</span>
              <button
                aria-label="Zoom in evidence"
                disabled={zoom >= 4}
                onClick={() => setScale(zoom + 0.5)}
              >
                <ZoomIn size={16} />
              </button>
              <button
                aria-label="Fit evidence image"
                onClick={() => setScale(1)}
              >
                <RotateCcw size={15} /> Fit
              </button>
            </div>
          </div>
          <div
            className="science-image-viewport"
            ref={frame}
            tabIndex={0}
            role="group"
            aria-label={`${record.category} source visualization; use zoom controls then drag or scroll to inspect`}
            onKeyDown={(event) => {
              if (event.key === "+" || event.key === "=") {
                event.preventDefault();
                setScale(zoom + 0.5);
              }
              if (event.key === "-") {
                event.preventDefault();
                setScale(zoom - 0.5);
              }
            }}
            onPointerDown={(event) => {
              if (zoom <= 1) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                left: event.currentTarget.scrollLeft,
                top: event.currentTarget.scrollTop,
              };
            }}
            onPointerMove={(event) => {
              const d = drag.current;
              if (d) {
                event.currentTarget.scrollLeft = d.left - (event.clientX - d.x);
                event.currentTarget.scrollTop = d.top - (event.clientY - d.y);
              }
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            {current?.url && !failed ? (
              <div
                className="science-image-canvas"
                style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
              >
                <img
                  key={requestKey}
                  src={current.url}
                  alt={record.imageAlt}
                  data-science-category={record.category}
                  draggable={false}
                  onError={() => setFailedImage(requestKey)}
                />
              </div>
            ) : (
              <div className="science-empty" role="status">
                <p>
                  {failed
                    ? "The source image could not be verified or displayed."
                    : "Verifying the packaged source image…"}
                </p>
                {failed && (
                  <button onClick={() => setAttempt((value) => value + 1)}>
                    Retry source image
                  </button>
                )}
              </div>
            )}
          </div>
          <figcaption>
            {record.credit}
            <small>
              Original axes, annotation and scale bars are preserved. Zoom to
              read source detail.
            </small>
          </figcaption>
        </figure>
        <aside className="science-reference-data">
          <h3>Reading this view</h3>
          <p>{presentation.use}</p>
          {presentation.swatches && (
            <ul className="science-swatches">
              {presentation.swatches.map((item) => (
                <li key={item.label}>
                  <i style={{ background: item.color }} />
                  {item.label}
                </li>
              ))}
            </ul>
          )}
          <dl>
            {record.key.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
      <p className="science-limitation">{presentation.limitation}</p>
      <details className="science-provenance">
        <summary>Data representation and provenance</summary>
        <dl className="science-source-fields">
          <div>
            <dt>Instrument</dt>
            <dd>{record.instrument}</dd>
          </div>
          <div>
            <dt>Measurement location</dt>
            <dd>{record.location}</dd>
          </div>
          <div>
            <dt>Observation / publication</dt>
            <dd>
              {record.observationTime ?? record.dateNote ?? "Not supplied"}
            </dd>
          </div>
          <div>
            <dt>Values / axes</dt>
            <dd>{record.units}</dd>
          </div>
          <div>
            <dt>Representation</dt>
            <dd>
              Published figure; machine-readable numerical samples are not
              bundled for this product.
            </dd>
          </div>
        </dl>
        <p>{record.explanation}</p>
      </details>
      <a
        className="science-source-link"
        href={record.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        Original NASA science product <ExternalLink size={13} />
      </a>
    </section>
  );
}
