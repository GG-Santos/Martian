# Read-only scientific data contract

This contract is for validated scientific staging and future scanner integration.
It does not write to MongoDB and does not replace the bundled Jezero assets.

## Dataset identity

Each dataset is identified by `datasetId` and immutable `version`. The response
also carries the original NASA `productId`, instrument, measurement type, units,
source URL, observation time, checksums, quality metadata, coordinates when
independently verified, and scientific limitations.

The repository accepts adapter artifacts produced by
`scripts/pds_quantitative_adapter.py` and their `measurements.json` records.
Large arrays remain filesystem/object-storage artifacts; they are not stored in
MongoDB.

## Access policy

Datasets have one of these statuses:

- `staged-unapproved`: available only to explicitly opted-in validation code.
- `approved`: eligible for a production read-only consumer.

The repository rejects unknown dataset IDs, version mismatches, malformed
measurements, missing source metadata, and staged data requested without
`allowStaged: true`. It never mutates an artifact or dataset record.

Approved adapter artifacts must report verified source checksums. The contract
also checks instrument identity, measurement units, CRISM wavelengths, PIXL
element identity, no-data flags, uncertainty availability, and measurement
coordinates against the declared product bounds. Latitude must be within
-90 to 90 degrees; longitude supports Mars conventions from -180 to 360 degrees.
Missing coordinates remain unavailable and are never reported as validated.
Dataset versions must be unique. Returned records are independent, deeply frozen
copies, so constructing a repository does not freeze the caller's source data.

Example repository usage:

```ts
const dataset = repository.get(
  "crism-hrl000040ff-07-if183j-mtr3",
  "1.0",
  { allowStaged: true },
);
```

Example response shape:

```json
{
  "datasetId": "crism-hrl000040ff-07-if183j-mtr3",
  "version": "1.0",
  "productId": "urn:nasa:pds:mro_crism_mtrdr:data_mtrdr:hrl000040ff_07_if183j_mtr3",
  "instrument": "CRISM",
  "measurementType": "CRISM single-pixel I/F spectrum",
  "units": "I/F",
  "coordinates": null,
  "validationStatus": "staged-unapproved",
  "classification": "observed",
  "measurements": [
    { "wavelength": 436.13, "value": 0.0546, "units": "I/F", "valid": true }
  ]
}
```

The example value is illustrative contract shape only; consumers must use the
packaged adapter output for actual measurements.

## Current datasets

- CRISM: `hrl000040ff_07_if183j_mtr3`, 489 I/F measurements. It is a
  single-pixel spectrum and is not a regional mineral map.
- PIXL: `urn:nasa:pds:shumway_m2020_pixl_regolith:data:table_s3_oxides_bulksum`,
  11 source rows and 275 normalized oxide/trace-element measurements in wt%.
  The supplied table has no verified geographic coordinates.

Neither dataset is approved for live scanner exposure yet. Do not assign either
dataset to hypothetical mission stops.

## Frontend integration requirements

Before a route handler is added, the frontend team must approve:

1. Whether spectra are displayed as a graph, metadata, or evidence image.
2. Whether PIXL values are displayed by regolith component or element.
3. How missing coordinates, missing uncertainties, and staged status are shown.
4. How regional observations are distinguished from mission-stop data.

The existing `/data/jezero/science-atlas.json` contract remains unchanged and
continues to serve the current static evidence views.

## Sources and validation

CRISM source family: <https://pds-geosciences.wustl.edu/missions/mro/crism.htm>

PIXL derived collection:
<https://pds.nasa.gov/ds-view/pds/viewCollection.jsp?identifier=urn%3Anasa%3Ashumway_m2020_pixl_regolith%3Adata&version=1.0>

The adapter tests validate namespace parsing, product identity, checksums,
units, nodata, uncertainty handling, deterministic output, and rejection of
unsupported data. Source-cube reproduction and exact playable-grid registration
remain separate scientific validation requirements.
