import type { StopId } from "./types";
export type ExpeditionObjective = {
  stopId: StopId;
  priority: "main" | "optional";
  title: string;
  why: string;
};
export const objectives: ExpeditionObjective[] = [
  {
    stopId: "A",
    priority: "main",
    title: "Survey the surface contact",
    why: "Compare textures on both sides of a proposed contact. Field sketches can reveal relationships that orbital pixels alone cannot resolve.",
  },
  {
    stopId: "B",
    priority: "optional",
    title: "Profile the ridge",
    why: "Trace a short relief transect and describe exposed material. Compare your observations with the orbital elevation profile.",
  },
  {
    stopId: "C",
    priority: "optional",
    title: "Compare the thermal pattern",
    why: "Look for differences between loose and coherent material. Daytime infrared brightness provides context, but does not establish temperature or composition.",
  },
];
