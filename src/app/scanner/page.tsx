import { MissionConsole } from "../../features/mission/MissionConsole";
import { LaunchedCrewGuard } from "../../features/session/LaunchedCrewGuard";

export default function ScannerPage() {
  return <LaunchedCrewGuard><MissionConsole /></LaunchedCrewGuard>;
}
