import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function ProjectNav({ current, crewExitAction, onCrewExit }: { current: "home" | "board" | "crew" | "field"; crewExitAction?: "leave" | "disband"; onCrewExit?: () => void }) {
  const destination = current === "home"
    ? { href: "/board?submit=1", label: "Submit a Quest" }
    : { href: "/", label: "Mission Command" };

  return (
    <nav className="project-nav" aria-label="Project navigation">
      {current === "crew" && crewExitAction && onCrewExit ? <button type="button" className="project-nav-action" onClick={onCrewExit}>
        {crewExitAction === "disband" ? "Disband Crew" : "Leave Crew"}
        <ArrowRight size={14} aria-hidden="true" focusable="false" />
      </button> : <Link href={destination.href}>
        {destination.label}
        <ArrowRight size={14} aria-hidden="true" focusable="false" />
      </Link>}
    </nav>
  );
}
