import type { LocalPoint } from "../mission/types";

export type PositionedMember = { id: string; point?: LocalPoint | null };
export type ProximityAssessment = {
  components: string[][];
  linkedPairs: string[];
  missingIds: string[];
  affectedIds: string[];
  warning: boolean;
  radiusM: number;
  hysteresisM: number;
  label: "Illustrative crew proximity simulation";
};

/** Connected-network policy; a prior link persists through the 3 m boundary band. */
export function assessProximity(
  members: PositionedMember[],
  radiusM = 50,
  prior?: ProximityAssessment,
): ProximityAssessment {
  const radius = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 50;
  const hysteresisM = 3;
  const linkedPairs: string[] = [];
  const missingIds = members.filter(({ point }) => !point || ![point.x, point.y].every(Number.isFinite)).map(({ id }) => id);
  const missing = new Set(missingIds);
  const adjacency = new Map(members.map(({ id }) => [id, new Set<string>()]));
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const a = members[i], b = members[j];
    if (missing.has(a.id) || missing.has(b.id)) continue;
    const key = [a.id, b.id].sort().join("|");
    const wasLinked = prior?.linkedPairs.includes(key) ?? false;
    const distance = Math.hypot(a.point!.x - b.point!.x, a.point!.y - b.point!.y);
    const threshold = prior ? radius + (wasLinked ? hysteresisM : -hysteresisM) : radius;
    if (prior && !wasLinked ? distance < threshold : distance <= threshold) {
      linkedPairs.push(key);
      adjacency.get(a.id)!.add(b.id);
      adjacency.get(b.id)!.add(a.id);
    }
  }
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const member of members) {
    if (seen.has(member.id)) continue;
    const component: string[] = [], queue = [member.id];
    seen.add(member.id);
    for (const id of queue) {
      component.push(id);
      for (const neighbor of adjacency.get(id) ?? []) if (!seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component.sort());
  }
  components.sort((a, b) => a[0].localeCompare(b[0]));
  const warning = components.length > 1 || missingIds.length > 0;
  return {
    components, linkedPairs, missingIds,
    affectedIds: warning ? members.map(({ id }) => id).sort() : [],
    warning, radiusM: radius, hysteresisM,
    label: "Illustrative crew proximity simulation",
  };
}
