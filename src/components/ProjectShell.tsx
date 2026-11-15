import Link from "next/link";
import { ProjectNav } from "./ProjectNav";

export function ProjectShell({
  current,
  children,
  crewExitAction,
  onCrewExit,
}: {
  current: "home" | "crew" | "board" | "field";
  children: React.ReactNode;
  crewExitAction?: "leave" | "disband";
  onCrewExit?: () => void;
}) {
  return (
    <div className={`project-shell${current === "home" ? " project-shell--home" : ""}${current === "field" ? " project-shell--field" : ""}`}>
      <header className="project-header">
        <Link href="/" className="project-brand"><img src="/images/locations/space-apps-logo.svg" alt="NASA Space Apps" /><span className="project-brand-copy"><strong>EARTH APPS</strong><small>© 2026</small></span></Link>
        <ProjectNav current={current} crewExitAction={crewExitAction} onCrewExit={onCrewExit} />
      </header>
      <div className="project-content">{children}</div>
    </div>
  );
}
