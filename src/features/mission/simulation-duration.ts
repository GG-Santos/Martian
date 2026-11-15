import dustEventData from "../../../public/data/jezero/dust-events.json" with { type: "json" };
import { matchesDustEvent, parseDustEvents } from "../hazards/dust-scenario.ts";
import { modeledDustDurationSol, modeledDustScenarioIds } from "../hazards/dust-simulation.ts";
import { canonicalCrewRegionId } from "../crew/crew-hazard-scenario.ts";
import type { SimulationState } from "./simulation-clock.ts";

const dustEvents = parseDustEvents(dustEventData);

export function simulationDuration(missionId: string | null, simulation: SimulationState): number | null {
  if (simulation.scenarioId === null) return 0;
  const locationId = canonicalCrewRegionId(missionId ?? "");
  if (locationId !== "jezero") return null;
  const historical = dustEvents.events.filter((event) => matchesDustEvent(event, locationId, simulation.startLs));
  if (historical.length) {
    return historical.find((event) => event.id === simulation.scenarioId)?.frames.at(-1)?.elapsedSol ?? null;
  }
  return modeledDustScenarioIds.includes(simulation.scenarioId) ? modeledDustDurationSol : null;
}
