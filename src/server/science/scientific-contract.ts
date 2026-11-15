import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, "Expected SHA-256");
const coordinateSchema = z.object({
  longitude: z.number().finite().min(-180).max(360),
  latitude: z.number().finite().min(-90).max(90),
});

export const scientificMeasurementSchema = z
  .object({
    wavelength: z.number().finite().positive().optional(),
    value: z.number().finite(),
    units: z.string().min(1),
    valid: z.boolean().optional(),
    component: z.string().min(1).optional(),
    element: z.string().min(1).optional(),
    uncertainty: z.number().finite().nonnegative().nullable().optional(),
    uncertaintyAvailable: z.boolean().optional(),
    coordinate: coordinateSchema.optional(),
  })
  .passthrough();

const adapterArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.enum(["quantitative-crism", "quantitative-pixl"]),
  product: z.object({
    productId: z.string().min(1),
    versionId: z.string().min(1),
    instrument: z.string().min(1),
    units: z.string().min(1),
    nodata: z.union([z.number(), z.string()]),
    coordinateSystem: z.string().min(1),
    processingLevel: z.string().min(1),
    bounds: z
      .object({
        west: z.number(),
        east: z.number(),
        south: z.number(),
        north: z.number(),
      })
      .nullable(),
    observation: z.object({
      start: z.string().nullable().optional(),
      end: z.string().nullable().optional(),
      sol: z.string().nullable().optional(),
    }),
  }),
  source: z.object({
    url: z
      .string()
      .url()
      .refine((value) => value.startsWith("https://")),
    labelSha256: sha256Schema,
    dataSha256: sha256Schema,
  }),
  measurements: z.object({
    count: z.number().int().nonnegative(),
    path: z.string().min(1),
  }),
  quality: z.record(z.string(), z.unknown()),
  limitations: z.array(z.string().min(1)),
});

export const scientificDatasetOptionsSchema = z.object({
  datasetId: z.string().min(1),
  version: z.string().min(1),
  measurementType: z.string().min(1),
  classification: z.enum(["observed", "derived", "contextual", "simulated"]),
  validationStatus: z.enum(["staged-unapproved", "approved"]),
  coordinates: coordinateSchema.nullable().default(null),
});

export type ScientificMeasurement = z.infer<typeof scientificMeasurementSchema>;
export type ScientificDataset = {
  datasetId: string;
  version: string;
  productId: string;
  instrument: string;
  measurementType: string;
  units: string;
  sourceUrl: string;
  coordinates: { longitude: number; latitude: number } | null;
  observationTime: {
    start: string | null;
    end: string | null;
    sol: string | null;
  };
  validationStatus: "staged-unapproved" | "approved";
  classification: "observed" | "derived" | "contextual" | "simulated";
  limitations: string[];
  quality: Record<string, unknown>;
  source: { labelSha256: string; dataSha256: string };
  nodata: number | string;
  coordinateSystem: string;
  measurements: ScientificMeasurement[];
};

export class ScientificDatasetNotFoundError extends Error {}
export class ScientificDatasetNotApprovedError extends Error {}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      freeze(child);
  }
  return value;
}

export function scientificDatasetFromAdapterArtifact(
  artifact: unknown,
  options: z.input<typeof scientificDatasetOptionsSchema>,
  measurementRecords?: unknown,
): ScientificDataset {
  const parsed = adapterArtifactSchema.parse(artifact);
  const config = scientificDatasetOptionsSchema.parse(options);
  const expectedType = config.datasetId.toLowerCase().includes("pixl")
    ? "quantitative-pixl"
    : config.datasetId.toLowerCase().includes("crism")
      ? "quantitative-crism"
      : null;
  if (expectedType !== parsed.artifactType) {
    throw new Error("Dataset identifier does not match adapter artifact type");
  }
  const instrument =
    parsed.artifactType === "quantitative-crism" ? "CRISM" : "PIXL";
  if (!parsed.product.instrument.toUpperCase().includes(instrument)) {
    throw new Error("Instrument does not match adapter artifact type");
  }
  if (
    config.validationStatus === "approved" &&
    parsed.quality.checksumVerified !== true
  ) {
    throw new Error(
      "Approved scientific datasets require verified source checksums",
    );
  }
  const rawMeasurements = measurementRecords;
  if (
    !Array.isArray(rawMeasurements) ||
    rawMeasurements.length !== parsed.measurements.count
  ) {
    throw new Error("Adapter measurement count does not match the artifact");
  }
  const measurements = rawMeasurements.map((item) =>
    scientificMeasurementSchema.parse(item),
  );
  for (const measurement of measurements) {
    if (measurement.units !== parsed.product.units)
      throw new Error("Measurement units do not match the source product");
    if (instrument === "CRISM" && measurement.wavelength === undefined)
      throw new Error("CRISM measurements require a wavelength");
    if (instrument === "PIXL" && !measurement.element)
      throw new Error("PIXL measurements require an element identity");
    if (
      measurement.value === parsed.product.nodata &&
      measurement.valid !== false
    )
      throw new Error("No-data measurements must be marked invalid");
    if (
      measurement.uncertaintyAvailable === true &&
      measurement.uncertainty == null
    )
      throw new Error("Available uncertainty requires a numeric value");
    if (measurement.coordinate) {
      const bounds = parsed.product.bounds;
      if (
        !bounds ||
        measurement.coordinate.longitude < bounds.west ||
        measurement.coordinate.longitude > bounds.east ||
        measurement.coordinate.latitude < bounds.south ||
        measurement.coordinate.latitude > bounds.north
      ) {
        throw new Error(
          "Measurement coordinates lie outside declared product bounds",
        );
      }
    }
  }
  const result: ScientificDataset = {
    datasetId: config.datasetId,
    version: config.version,
    productId: parsed.product.productId,
    instrument: parsed.product.instrument,
    measurementType: config.measurementType,
    units: parsed.product.units,
    sourceUrl: parsed.source.url,
    coordinates: config.coordinates,
    observationTime: {
      start: parsed.product.observation.start ?? null,
      end: parsed.product.observation.end ?? null,
      sol: parsed.product.observation.sol ?? null,
    },
    validationStatus: config.validationStatus,
    classification: config.classification,
    limitations: [...parsed.limitations],
    quality: {
      ...parsed.quality,
      sourceArtifactSchemaVersion: parsed.schemaVersion,
    },
    source: { ...parsed.source },
    nodata: parsed.product.nodata,
    coordinateSystem: parsed.product.coordinateSystem,
    measurements,
  };
  return freeze(structuredClone(result));
}

export interface ReadOnlyScientificDatasetRepository {
  get(
    datasetId: string,
    version: string,
    options?: { allowStaged?: boolean },
  ): ScientificDataset;
  list(options?: { allowStaged?: boolean }): ScientificDataset[];
}

export class InMemoryScientificDatasetRepository implements ReadOnlyScientificDatasetRepository {
  private readonly datasets: ReadonlyMap<string, ScientificDataset>;

  constructor(datasets: ScientificDataset[]) {
    const entries = datasets.map(
      (dataset) =>
        [
          JSON.stringify([dataset.datasetId, dataset.version]),
          freeze(structuredClone(dataset)),
        ] as const,
    );
    if (new Set(entries.map(([key]) => key)).size !== entries.length)
      throw new Error("Duplicate scientific dataset version");
    this.datasets = new Map(entries);
  }

  get(
    datasetId: string,
    version: string,
    options: { allowStaged?: boolean } = {},
  ): ScientificDataset {
    const dataset = this.datasets.get(JSON.stringify([datasetId, version]));
    if (!dataset)
      throw new ScientificDatasetNotFoundError(
        "Scientific dataset was not found",
      );
    if (!options.allowStaged && dataset.validationStatus !== "approved") {
      throw new ScientificDatasetNotApprovedError(
        "Scientific dataset is staged and not approved for production",
      );
    }
    return dataset;
  }

  list(options: { allowStaged?: boolean } = {}): ScientificDataset[] {
    return [...this.datasets.values()].filter(
      (dataset) =>
        options.allowStaged || dataset.validationStatus === "approved",
    );
  }
}
