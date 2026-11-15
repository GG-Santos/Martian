"""Resumable, bounded verification of one CRISM BSQ pixel via HTTP ranges."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import struct
import tempfile
import urllib.request
import zipfile
from pathlib import Path


SOURCE_URL = (
    "https://pds-geosciences.wustl.edu/mro/"
    "mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/mtrdr/2007/2007_029/"
    "hrl000040ff/hrl000040ff_07_if183j_mtr3.img"
)
ZIP_PATH = Path("earthapps staging/earthapps_nasa_crism_verified.zip")
PRODUCT_ID = "hrl000040ff_07_if183j_mtr3"
LINES, SAMPLES, BANDS = 751, 455, 489
ROW, COLUMN = 442, 375
BYTES_PER_SAMPLE = 4
SOURCE_SIZE = 668_374_980
PLANE_BYTES = LINES * SAMPLES * BYTES_PER_SAMPLE
PIXEL_OFFSET = (ROW * SAMPLES + COLUMN) * BYTES_PER_SAMPLE


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False, encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        temporary = Path(stream.name)
    os.replace(temporary, path)


def staged_values() -> list[float]:
    with zipfile.ZipFile(ZIP_PATH) as archive:
        with archive.open("derived/crism_jezero_spectrum.csv") as stream:
            return [float(row["if_value"]) for row in csv.DictReader(line.decode() for line in stream)]


def validate_metadata() -> None:
    with zipfile.ZipFile(ZIP_PATH) as archive:
        label = archive.read("source/hrl000040ff_07_if183j_mtr3.lbl").decode("utf-8", "replace")
        header = archive.read("source/hrl000040ff_07_if183j_mtr3.hdr").decode("utf-8", "replace")
    if f'PRODUCT_ID                     = "{PRODUCT_ID.upper()}"' not in label:
        raise ValueError("Unexpected CRISM product ID")
    for key, expected in (("lines", "751"), ("samples", "455"), ("bands", "489"), ("interleave", "bsq"), ("data type", "4"), ("byte order", "0")):
        if not re.search(rf"^{re.escape(key)}\s*=\s*{re.escape(expected)}\s*$", header, re.IGNORECASE | re.MULTILINE):
            raise ValueError(f"Missing CRISM layout metadata: {key}={expected}")


def load_checkpoint(path: Path) -> dict:
    if not path.exists():
        return {"productId": PRODUCT_ID, "sourceUrl": SOURCE_URL, "completed": {}}
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("productId") != PRODUCT_ID or value.get("sourceUrl") != SOURCE_URL:
        raise ValueError("Checkpoint belongs to a different CRISM product")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=25)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 30:
        raise SystemExit("--batch-size must be between 1 and 30")
    validate_metadata()
    staged = staged_values()
    if len(staged) != BANDS:
        raise ValueError(f"Expected {BANDS} staged values, found {len(staged)}")
    args.stage.mkdir(parents=True, exist_ok=True)
    checkpoint_path = args.stage / "checkpoint.json"
    checkpoint = load_checkpoint(checkpoint_path)
    completed: dict[str, dict] = checkpoint.setdefault("completed", {})
    pending = [band for band in range(BANDS) if str(band + 1) not in completed]
    for band in pending[: args.batch_size]:
        start = band * PLANE_BYTES + PIXEL_OFFSET
        end = start + BYTES_PER_SAMPLE - 1
        request = urllib.request.Request(SOURCE_URL, headers={"Range": f"bytes={start}-{end}"})
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = response.read()
            status = response.status
            content_range = response.headers.get("Content-Range", "")
        expected_range = f"bytes {start}-{end}/{SOURCE_SIZE}"
        if status != 206 or content_range != expected_range or len(payload) != BYTES_PER_SAMPLE:
            raise RuntimeError(
                f"band {band + 1}: status={status}, content_range={content_range!r}, "
                f"expected={expected_range!r}, payload_bytes={len(payload)}"
            )
        source_value = struct.unpack("<f", payload)[0]
        staged_value = staged[band]
        completed[str(band + 1)] = {
            "band": band + 1,
            "byteStart": start,
            "byteEnd": end,
            "httpStatus": status,
            "contentRange": content_range,
            "payloadSha256": hashlib.sha256(payload).hexdigest(),
            "sourceValue": source_value,
            "stagedValue": staged_value,
            "difference": source_value - staged_value,
        }
        atomic_json(checkpoint_path, checkpoint)
    if len(completed) < BANDS:
        print(json.dumps({"verifiedThisBatch": min(args.batch_size, len(pending)), "totalVerified": len(completed), "remaining": BANDS - len(completed)}))
        return 0
    records = [completed[str(band)] for band in range(1, BANDS + 1)]
    returned_bytes = b"".join(struct.pack("<f", record["sourceValue"]) for record in records)
    staged_coordinate = None
    with zipfile.ZipFile(ZIP_PATH) as archive:
        manifest = json.loads(archive.read("crism_manifest.json"))
        staged_coordinate = {
            "latitudeDeg": float(manifest["latitudeDeg"]),
            "longitudeDeg": float(manifest["longitudeDeg"]),
        }
    report = {
        "productId": PRODUCT_ID,
        "sourceUrl": SOURCE_URL,
        "sourceCubeSizeBytes": SOURCE_SIZE,
        "pixel": {"row": ROW, "column": COLUMN, "indexConvention": "zero-based"},
        "layout": {"lines": LINES, "samples": SAMPLES, "bands": BANDS, "interleave": "BSQ", "sampleType": "little-endian float32", "planeBytes": PLANE_BYTES},
        "requests": BANDS,
        "requestBytesTotal": len(returned_bytes),
        "http": {
            "allStatus206": all(record["httpStatus"] == 206 for record in records),
            "allContentRangesExact": all(record["contentRange"] == f"bytes {record['byteStart']}-{record['byteEnd']}/{SOURCE_SIZE}" for record in records),
            "firstContentRange": records[0]["contentRange"],
            "lastContentRange": records[-1]["contentRange"],
        },
        "verifiedBands": len(records),
        "exactMatches": sum(record["difference"] == 0 for record in records),
        "maxAbsoluteDifference": max(abs(record["difference"]) for record in records),
        "meanAbsoluteDifference": sum(abs(record["difference"]) for record in records) / len(records),
        "differencesAbove1e-7": sum(abs(record["difference"]) > 1e-7 for record in records),
        "sourceSha256Of489ReturnedBytes": hashlib.sha256(returned_bytes).hexdigest(),
        "registration": {
            "stagedCoordinateLatitudeDeg": staged_coordinate["latitudeDeg"],
            "stagedCoordinateLongitudeDeg": staged_coordinate["longitudeDeg"],
            "independentSourceCubeGeographicRegistrationVerified": False,
        },
    }
    (args.stage / "source-values.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    atomic_json(args.stage / "verification-report.json", report)
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
