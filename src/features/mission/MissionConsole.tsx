"use client";
import { useEffect, useState } from "react";
import { loadMission } from "./load-mission";
import type { MissionData } from "./types";
import { TerrainFallback } from "../terrain/TerrainFallback";
import { ProjectShell } from "../../components/ProjectShell";
import { useRoom } from "../session/RoomProvider";
import { boardLocation, canUseObservedTerrain } from "./mission-location";
import { LimitedPlanningState } from "./LimitedPlanningState";
import { MarswalkConsole } from "./MarswalkConsole";
export function MissionConsole() {
  const { snapshot, restoringRoom, connection } = useRoom();
  const launchedRoom = snapshot?.status === "launched" ? snapshot : null;
  const location = boardLocation(
    launchedRoom?.mission?.datasetId ?? launchedRoom?.missionId ?? null,
  );
  const expectedDatasetId =
    !restoringRoom && launchedRoom && canUseObservedTerrain(location)
      ? location.coverage.datasetId
      : null;
  const [mission, setMission] = useState<MissionData | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!expectedDatasetId) return;
    let active = true;
    loadMission("/data/jezero", fetch, expectedDatasetId)
      .then((m) => {
        if (active) setMission(m);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [attempt, expectedDatasetId]);
  return (
    <ProjectShell current="field">
      <main className="scanner-console">
        {restoringRoom ? (
          <section className="initial-state">
            <div className="loading" role="status">
              {connection === "offline"
                ? "Crew connection unavailable. Retrying…"
                : "Restoring crew session…"}
            </div>
          </section>
        ) : !expectedDatasetId && launchedRoom ? (
          <LimitedPlanningState location={location} room={launchedRoom} />
        ) : mission && mission.datasetId === expectedDatasetId ? (
          <MarswalkConsole key={mission.datasetId} mission={mission} />
        ) : (
          <section className="initial-state">
            {error ? (
              <>
                <TerrainFallback reason={error} />
                <button
                  className="retry"
                  onClick={() => {
                    setError("");
                    setAttempt((a) => a + 1);
                  }}
                >
                  Retry dataset
                </button>
              </>
            ) : (
              <div className="loading" role="status">
                Loading Jezero observations…
              </div>
            )}
          </section>
        )}
      </main>
    </ProjectShell>
  );
}
