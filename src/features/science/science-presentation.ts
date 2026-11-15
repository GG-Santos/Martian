import type { EvidenceCategory } from "./science-atlas";

export const sciencePresentation: Record<
  EvidenceCategory,
  {
    title: string;
    kind: string;
    coverage: string;
    limitation: string;
    use: string;
    swatches?: { label: string; color: string }[];
  }
> = {
  spectral: {
    title: "Jezero mineral map",
    kind: "Regional spectral indicator map",
    coverage: "Regional Jezero mosaic · 10 km source scale bar",
    limitation:
      "The published mineral colors are qualitative indicators. A spectrum or mineral abundance cannot be read from these image pixels, and the mosaic is not registered to the local 2.048 km route grid.",
    use: "Use the regional pattern to frame questions about carbonate-bearing material and olivine-bearing sand before selecting local science targets.",
    swatches: [
      { label: "Carbonate-bearing material", color: "#75b59b" },
      { label: "Olivine-bearing sand", color: "#ce7164" },
    ],
  },
  geophysical: {
    title: "Artuby subsurface section",
    kind: "Orbital traverse + published radargram",
    coverage: "South Séítah / Artuby · observed rover traverse",
    limitation:
      "Radar two-way travel time is not depth without an assumed propagation model. The source's published depth axis is retained as part of its interpretation; this scanner does not calculate depth or extrapolate this section beneath your route.",
    use: "Compare the upper traverse with the lower radar reflections. The original red links connect subsurface reflectors to exposed layers along the observed rover track.",
  },
  radiation: {
    title: "Curiosity radiation record",
    kind: "Published absorbed dose-rate time series",
    coverage: "Gale crater · August 2012–June 2013 · Mars context",
    limitation:
      "This historical Gale record is not a Jezero radiation map or current space-weather forecast. Its µGy/day axis measures absorbed dose rate; it is not a suit dose limit or a measurement of the simulated crew's exposure.",
    use: "Read the background variability and the circled solar-particle event in the original plot. Numeric dose samples are not bundled, so the scanner does not invent a cursor dose or accumulated exposure.",
  },
  chemical: {
    title: "Dourbes chemical map",
    kind: "Optical target context + PIXL element map",
    coverage: "Dourbes rock target · 3 mm source scale bar",
    limitation:
      "This is a millimetre-scale measurement of one rock, not a geographic chemical layer. Element-map colors do not provide numerical concentrations or establish the chemistry at a hypothetical mission stop.",
    use: "Compare the two optical panels with the element map below. The original figure's mineral-association palette and target scale remain intact when zooming.",
    swatches: [
      { label: "Magnesium channel", color: "#557ded" },
      { label: "Silicon channel", color: "#df5d66" },
      { label: "Calcium channel", color: "#71ca8a" },
    ],
  },
};
