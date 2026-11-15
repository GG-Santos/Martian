import {
  Camera,
  Flame,
  Mountain,
  Wind,
  ScanLine,
  Layers,
  Atom,
  FlaskConical,
} from "lucide-react";
import type { ScienceCategory } from "./science-atlas";
const categories = [
  { id: "optical", name: "Optical", icon: Camera, scope: "Surface layer" },
  { id: "thermal", name: "Thermal", icon: Flame, scope: "Surface layer" },
  {
    id: "topographic",
    name: "Topographic",
    icon: Mountain,
    scope: "Surface layer",
  },
  {
    id: "atmospheric",
    name: "Atmospheric",
    icon: Wind,
    scope: "Rover archive",
  },
  {
    id: "spectral",
    name: "Spectral",
    icon: ScanLine,
    scope: "Regional evidence",
  },
  {
    id: "geophysical",
    name: "Geophysical",
    icon: Layers,
    scope: "Regional evidence",
  },
  { id: "radiation", name: "Radiation", icon: Atom, scope: "Mars context" },
  {
    id: "chemical",
    name: "Chemical",
    icon: FlaskConical,
    scope: "Rover target",
  },
] as const;
export function ScienceAtlasPanel({
  selected,
  onSelect,
}: {
  selected: ScienceCategory;
  onSelect: (id: ScienceCategory) => void;
}) {
  return (
    <nav className="science-atlas" aria-label="Science atlas">
      <h2>Science atlas</h2>
      {categories.map((c) => (
        <button
          key={c.id}
          aria-pressed={selected === c.id}
          onClick={() => onSelect(c.id)}
        >
          <c.icon size={16} />
          <span>
            <strong>{c.name}</strong>
            <small>{c.scope}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}
