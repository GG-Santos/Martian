"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ProjectShell } from "../../components/ProjectShell";
import { useRoom } from "./RoomProvider";

export function LaunchedCrewGuard({ children }: { children: ReactNode }) {
  const { snapshot, memberId, restoringRoom, connection } = useRoom();
  const router = useRouter();
  const admitted = snapshot?.status === "launched"
    && !!memberId && snapshot.members.some((member) => member.id === memberId);

  useEffect(() => {
    if (!restoringRoom && !admitted) router.replace("/crew");
  }, [restoringRoom, admitted, router]);

  if (!restoringRoom && admitted) return children;

  return (
    <ProjectShell current="field">
      <main className="scanner-console">
        <section className="initial-state">
          <div className="loading" role="status">
            {restoringRoom
              ? connection === "offline" ? "Crew connection unavailable. Retrying…" : "Restoring crew session…"
              : "Returning to crew preparation…"}
          </div>
        </section>
      </main>
    </ProjectShell>
  );
}
