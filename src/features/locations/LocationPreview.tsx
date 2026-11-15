import type { Location } from "./catalog";
import "./location-preview.css";

export function LocationPreview({ location }: { location: Location }) {
  return <div className={`location-preview ${location.id}`} role="img" aria-label={`${location.name} archived orbital image`}>
    <span className="location-preview-grid" aria-hidden="true" />
  </div>;
}
