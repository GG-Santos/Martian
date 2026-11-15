import { CloudFog, Flame, FlaskConical, Mountain, MoveUpRight, Radiation, Wind } from 'lucide-react';
import type { CrewHazardKind } from '../../features/crew/crew-hazard-scenario';

const icons = {
  heat: Flame,
  dust: Wind,
  chemical: FlaskConical,
  radiation: Radiation,
  slope: MoveUpRight,
  rockfall: Mountain,
  storm: CloudFog,
} satisfies Record<CrewHazardKind, typeof Flame>;

export function CrewHazardIcon({ kind, size = 14 }: { kind: CrewHazardKind; size?: number }) {
  const Icon = icons[kind];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" focusable="false" />;
}
