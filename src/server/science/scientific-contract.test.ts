import { describe, expect, it } from "vitest";
import {
  InMemoryScientificDatasetRepository,
  ScientificDatasetNotApprovedError,
  ScientificDatasetNotFoundError,
  scientificDatasetFromAdapterArtifact,
} from "./scientific-contract";

const crismArtifact = {
  schemaVersion: 1,
  artifactType: "quantitative-crism",
  product: {
    productId: "urn:nasa:pds:mro_crism_mtrdr:data_mtrdr:hrl000040ff_07_if183j_mtr3",
    versionId: "1.0",
    instrument: "CRISM",
    units: "I/F",
    nodata: 65535,
    coordinateSystem: "Mars map projection",
    processingLevel: "MTRDR",
    bounds: { west: 77.2, east: 77.6, south: 18.2, north: 18.8 },
    observation: { start: "2007-01-29T10:48:10Z", end: "2007-01-29T10:50:17Z", sol: null },
  },
  source: {
    url: "https://pds.example/crism",
    labelSha256: "a".repeat(64),
    dataSha256: "b".repeat(64),
  },
  measurements: { count: 1, path: "measurements.json" },
  quality: { checksumVerified: true },
  limitations: ["Single-pixel spectrum; no mineral classification."],
};

function dataset(status: "staged-unapproved" | "approved" = "staged-unapproved") {
  return scientificDatasetFromAdapterArtifact(
    crismArtifact,
    {
      datasetId: "crism-hrl000040ff-07-if183j-mtr3",
      version: "1.0",
      measurementType: "CRISM single-pixel I/F spectrum",
      classification: "observed",
      validationStatus: status,
    },
    [{ wavelength: 436.13, value: 0.1, units: "I/F", valid: true }],
  );
}

describe("read-only scientific dataset contract", () => {
  it("normalizes adapter metadata and measurements without coordinates by default", () => {
    const value = dataset();
    expect(value.productId).toContain("hrl000040ff_07_if183j_mtr3");
    expect(value.measurements).toHaveLength(1);
    expect(value.coordinates).toBeNull();
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("rejects unknown datasets and version mismatches", () => {
    const repository = new InMemoryScientificDatasetRepository([dataset("approved")]);
    expect(() => repository.get("unknown", "1.0")).toThrow(ScientificDatasetNotFoundError);
    expect(() => repository.get("crism-hrl000040ff-07-if183j-mtr3", "2.0")).toThrow(
      ScientificDatasetNotFoundError,
    );
  });

  it("does not expose staged data as production-ready", () => {
    const repository = new InMemoryScientificDatasetRepository([dataset()]);
    expect(() => repository.get("crism-hrl000040ff-07-if183j-mtr3", "1.0")).toThrow(
      ScientificDatasetNotApprovedError,
    );
    expect(repository.list()).toEqual([]);
    expect(repository.list({ allowStaged: true })).toHaveLength(1);
  });

  it("preserves explicitly verified coordinates and rejects malformed records", () => {
    const value = scientificDatasetFromAdapterArtifact(
      {
        ...crismArtifact,
      },
      {
        datasetId: "crism-hrl000040ff-07-if183j-mtr3",
        version: "1.0",
        measurementType: "CRISM single-pixel I/F spectrum",
        classification: "observed",
        validationStatus: "approved",
        coordinates: { longitude: 77.5112, latitude: 18.4637 },
      },
      [{ wavelength: 436.13, value: 0.1, units: "I/F" }],
    );
    expect(value.coordinates).toEqual({ longitude: 77.5112, latitude: 18.4637 });
    expect(() =>
      scientificDatasetFromAdapterArtifact(
        crismArtifact,
        {
          datasetId: "crism-hrl000040ff-07-if183j-mtr3",
          version: "1.0",
          measurementType: "spectrum",
          classification: "observed",
          validationStatus: "approved",
        },
        [{ value: "not numeric", units: "I/F" }],
      ),
    ).toThrow();
  });

  it("rejects conflicting dataset and adapter types", () => {
    expect(() =>
      scientificDatasetFromAdapterArtifact(crismArtifact, {
        datasetId: "pixl-table-s3-oxides",
        version: "1.0",
        measurementType: "oxide concentration",
        classification: "observed",
        validationStatus: "staged-unapproved",
      }),
    ).toThrow(/artifact type/);
  });
});
