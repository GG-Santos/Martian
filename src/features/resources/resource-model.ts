import type { Hazard } from "../hazards/hazard-types";
import { routeHazardConflicts } from "../hazards/hazard-geometry";
import type { HeightGrid, RouteNode } from "../mission/types";
import { calculateRoute } from "../route/calculate-route";

export type CrewResources = { id: string; oxygen: number; battery: number; stamina: number; equipment: string[] };
export type MemberBudget = {
  id: string; oxygenCost: number; staminaCost: number;
  oxygenRemaining: number; staminaRemaining: number; missingEquipment: string[];
};
export type RouteEstimate = {
  feasible: boolean; reasons: string[]; perMember: MemberBudget[];
  limitingMemberId: string | null; distanceM: number; travelTimeMin: number;
  oxygenCost: number; staminaCost: number; exposureHazardIds: string[];
  returnMarginM: number; label: "Illustrative resource simulation";
};

export const equipmentForHazard: Partial<Record<Hazard["category"], string>> = {
  dust: "filter", rockfall: "helmet", sand: "traction",
};

/** Percent-point budgets: 0.06 oxygen and 0.09 stamina per meter, with terrain/exposure multipliers. */
export function estimateRoute(
  nodes: RouteNode[], grid: HeightGrid, hazards: Hazard[], crew: Omit<CrewResources, "battery">[],
): RouteEstimate {
  const route = calculateRoute(grid, nodes, { speedMps: 0.5, allowanceMin: 1_000_000, dwellMin: 0 });
  const conflicts = routeHazardConflicts(nodes, hazards);
  const exposureHazardIds = conflicts.map(({ hazardId }) => hazardId);
  const exposed = hazards.filter((h) => exposureHazardIds.includes(h.id));
  const reasons: string[] = [];
  if (!route.ok) reasons.push(route.error);
  if (!crew.length) reasons.push("No participating crew selected.");
  const distanceM = route.ok ? route.value.distanceM : 0;
  const travelTimeMin = route.ok ? route.value.durationMin : 0;
  const meanSlope = route.ok && route.value.samples.length
    ? route.value.samples.reduce((sum, sample) => sum + sample.slopeDeg, 0) / route.value.samples.length : 0;
  const difficulty = 1 + meanSlope / 30;
  const exposure = 1 + exposed.reduce((sum, h) => sum + (h.severity === "warning" ? 0.2 : 0.1), 0);
  const oxygenCost = distanceM * 0.06 * difficulty * exposure;
  const staminaCost = distanceM * 0.09 * difficulty * exposure;
  const end = nodes.at(-1)?.point, start = nodes[0]?.point;
  const returnMarginM = end && start ? Math.hypot(end.x - start.x, end.y - start.y) : 0;
  const reserveOxygen = returnMarginM * 0.06;
  const reserveStamina = returnMarginM * 0.09;
  const perMember = crew.map((member) => {
    const missingEquipment = [...new Set(exposed.map((h) => equipmentForHazard[h.category]).filter((name): name is string => !!name && !member.equipment.includes(name)))];
    const oxygenRemaining = member.oxygen - oxygenCost - reserveOxygen;
    const staminaRemaining = member.stamina - staminaCost - reserveStamina;
    if (!Number.isFinite(member.oxygen) || oxygenRemaining < 0) reasons.push(`${member.id} lacks oxygen for route and return reserve.`);
    if (!Number.isFinite(member.stamina) || staminaRemaining < 0) reasons.push(`${member.id} lacks stamina for route and return reserve.`);
    for (const equipment of missingEquipment) reasons.push(`${member.id} needs ${equipment} for exposure.`);
    return { id: member.id, oxygenCost, staminaCost, oxygenRemaining, staminaRemaining, missingEquipment };
  });
  const limitingMemberId = perMember.length ? [...perMember].sort((a, b) => Math.min(a.oxygenRemaining, a.staminaRemaining) - Math.min(b.oxygenRemaining, b.staminaRemaining))[0].id : null;
  return { feasible: reasons.length === 0, reasons, perMember, limitingMemberId, distanceM, travelTimeMin, oxygenCost, staminaCost, exposureHazardIds, returnMarginM, label: "Illustrative resource simulation" };
}
