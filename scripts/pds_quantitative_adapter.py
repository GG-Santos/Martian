"""Stage quantitative CRISM and PIXL PDS products without network access.

This adapter accepts a local PDS4 label and a local CSV or JSON measurement
file. It validates product identity, units, nodata, coordinates, uncertainty,
and checksums, then writes a deterministic, versioned staging artifact. It does
not download products and refuses to overwrite an existing output directory.

Raw PDS binary products are intentionally rejected until their label-specific
record layout is explicitly implemented. Treating an unknown binary layout as
scientific measurements would be unsafe.
"""

from __future__ import annotations

import csv
import argparse
import hashlib
import json
import math
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Iterable


class PdsQuantitativeValidationError(ValueError):
    """Raised when a product cannot be safely staged."""


CRISM_PRODUCT_PREFIXES = ("urn:nasa:pds:mro_crism_", "MROCR_")
PIXL_PRODUCT_PREFIXES = (
    "urn:nasa:pds:mars2020_pixl:",
    "urn:nasa:pds:shumway_m2020_pixl_regolith:",
    "PIXL-",
)
SUPPORTED_CRISM_PRODUCTS = {
    "urn:nasa:pds:mro_crism_mtrdr:data_mtrdr:hrl000040ff_07_if183j_mtr3",
}
SUPPORTED_PIXL_PRODUCTS = {
    "urn:nasa:pds:shumway_m2020_pixl_regolith:data:table_s3_oxides_bulksum",
}
ALLOWED_CRISM_UNITS = {"I/F", "reflectance I/F", "Lambert albedo", "unitless"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _all_text(root: ET.Element, *names: str) -> list[str]:
    wanted = {name.lower() for name in names}
    return [
        (element.text or "").strip()
        for element in root.iter()
        if _local_name(element.tag) in wanted and (element.text or "").strip()
    ]


def _first_text(root: ET.Element, *names: str) -> str | None:
    values = _all_text(root, *names)
    return values[0] if values else None


def _number(value: str | None, field: str) -> float:
    try:
        result = float(value) if value is not None else math.nan
    except ValueError as error:
        raise PdsQuantitativeValidationError(f"Invalid numeric value for {field}") from error
    if not math.isfinite(result):
        raise PdsQuantitativeValidationError(f"Invalid numeric value for {field}")
    return result


def _bounds(root: ET.Element) -> dict[str, float]:
    aliases = {
        "west": ("west_bound", "west", "minimum_longitude", "west_bounding_coordinate"),
        "east": ("east_bound", "east", "maximum_longitude", "east_bounding_coordinate"),
        "south": ("south_bound", "south", "minimum_latitude", "south_bounding_coordinate"),
        "north": ("north_bound", "north", "maximum_latitude", "north_bounding_coordinate"),
    }
    result = {key: _number(_first_text(root, *names), f"bounds.{key}") for key, names in aliases.items()}
    if not result["west"] < result["east"] or not result["south"] < result["north"]:
        raise PdsQuantitativeValidationError("Invalid spatial bounds")
    return result


def parse_pds4_label(label_path: Path, *, kind: str) -> dict[str, Any]:
    """Read the identity and scientific metadata needed by both adapters."""

    try:
        root = ET.parse(label_path).getroot()
    except (ET.ParseError, OSError) as error:
        raise PdsQuantitativeValidationError(f"Could not read PDS4 label: {label_path}") from error

    product_id = _first_text(root, "logical_identifier", "product_id", "productid")
    version_id = _first_text(root, "version_id", "versionid")
    instrument = _first_text(root, "instrument", "instrument_name")
    if not instrument:
        instrument_lids = [value for value in _all_text(root, "lid_reference") if ":instrument:" in value]
        if any("crism" in value.lower() for value in instrument_lids):
            instrument = "CRISM"
        elif any("pixl" in value.lower() for value in instrument_lids):
            instrument = "PIXL"
    if not instrument:
        observing_names = _all_text(root, "name")
        instrument = next((value for value in observing_names if "pixl" in value.lower()), None)
    units = _first_text(root, "unit", "units", "measurement_unit")
    nodata_text = _first_text(root, "missing_constant", "nodata", "nodata_value")
    coordinate_system = _first_text(root, "coordinate_system", "spatial_reference", "name_of_reference_system")
    processing_level = _first_text(root, "processing_level", "processing_level_id")
    start = _first_text(root, "start_date_time", "observation_start_time")
    end = _first_text(root, "stop_date_time", "observation_stop_time")
    sol = _first_text(root, "sol", "martian_sol")

    if not product_id:
        raise PdsQuantitativeValidationError("PDS4 label is missing logical_identifier")
    prefixes = CRISM_PRODUCT_PREFIXES if kind == "crism" else PIXL_PRODUCT_PREFIXES
    if not product_id.startswith(prefixes):
        raise PdsQuantitativeValidationError(f"Product identifier is not a supported {kind.upper()} product")
    if kind == "crism" and product_id not in SUPPORTED_CRISM_PRODUCTS and product_id.startswith("urn:nasa:pds:mro_crism_mtrdr:"):
        raise PdsQuantitativeValidationError(f"Product identifier is not an approved CRISM product: {product_id}")
    if kind == "pixl" and product_id not in SUPPORTED_PIXL_PRODUCTS and product_id.startswith("urn:nasa:pds:shumway_m2020_pixl_regolith:"):
        raise PdsQuantitativeValidationError(f"Product identifier is not an approved PIXL product: {product_id}")
    if not version_id:
        raise PdsQuantitativeValidationError("PDS4 label is missing version_id")
    if not instrument:
        raise PdsQuantitativeValidationError("PDS4 label is missing instrument metadata")
    if not units:
        if kind == "crism" and product_id in SUPPORTED_CRISM_PRODUCTS:
            units = "I/F"
        elif kind == "pixl" and product_id in SUPPORTED_PIXL_PRODUCTS:
            units = "wt%"
        else:
            raise PdsQuantitativeValidationError("PDS4 label is missing measurement units")
    if nodata_text is None:
        if kind == "pixl" and product_id in SUPPORTED_PIXL_PRODUCTS:
            nodata_text = "not supplied"
        else:
            raise PdsQuantitativeValidationError("PDS4 label is missing nodata metadata")
    if not coordinate_system:
        if kind == "crism" and product_id in SUPPORTED_CRISM_PRODUCTS:
            coordinate_system = "Mars 2000 equirectangular map projection"
        elif kind == "pixl" and product_id in SUPPORTED_PIXL_PRODUCTS:
            coordinate_system = "Mars geographic coordinates not supplied"
        else:
            raise PdsQuantitativeValidationError("PDS4 label is missing coordinate-system metadata")

    try:
        nodata: float | str = float(nodata_text)
    except ValueError:
        nodata = nodata_text

    try:
        bounds = _bounds(root)
    except PdsQuantitativeValidationError:
        if kind == "pixl" and product_id in SUPPORTED_PIXL_PRODUCTS:
            # The supplied PIXL table is not georeferenced. Do not invent a
            # footprint; coordinate validation is intentionally unavailable.
            bounds = None
        else:
            raise

    result = {
        "productId": product_id,
        "versionId": version_id,
        "instrument": instrument,
        "units": units,
        "nodata": nodata,
        "coordinateSystem": coordinate_system,
        "processingLevel": processing_level or "unspecified",
        "bounds": bounds,
        "observation": {"start": start, "end": end, "sol": sol},
        "sourceLabelType": "PDS4 XML",
    }
    if kind == "crism" and units not in ALLOWED_CRISM_UNITS:
        raise PdsQuantitativeValidationError(f"Unsupported CRISM units: {units}")
    return result


def _read_records(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".json":
        value = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(value, dict):
            value = value.get("measurements")
        if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
            raise PdsQuantitativeValidationError("JSON measurements must be an array of objects")
        return [dict(item) for item in value]
    if path.suffix.lower() != ".csv":
        raise PdsQuantitativeValidationError("Only CSV and JSON measurement products are supported; binary layout is not implemented")
    with path.open(newline="", encoding="utf-8") as stream:
        return [dict(row) for row in csv.DictReader(stream)]


def _coordinate(record: dict[str, Any], bounds: dict[str, float] | None, index: int) -> dict[str, float] | None:
    keys = ("longitude", "latitude")
    present = [record.get(key) not in (None, "") for key in keys]
    if not any(present):
        return None
    if not all(present):
        raise PdsQuantitativeValidationError(f"Measurement {index} has incomplete coordinates")
    longitude = _number(str(record["longitude"]), f"measurement[{index}].longitude")
    latitude = _number(str(record["latitude"]), f"measurement[{index}].latitude")
    if bounds is None:
        raise PdsQuantitativeValidationError(f"Measurement {index} has coordinates but no label bounds")
    if not bounds["west"] <= longitude <= bounds["east"] or not bounds["south"] <= latitude <= bounds["north"]:
        raise PdsQuantitativeValidationError(f"Measurement {index} is outside declared bounds")
    return {"longitude": longitude, "latitude": latitude}


def decode_crism(label: dict[str, Any], data_path: Path) -> list[dict[str, Any]]:
    records = _read_records(data_path)
    measurements = []
    for index, record in enumerate(records):
        wavelength_key = "wavelength" if record.get("wavelength") not in (None, "") else "wavelength_nm"
        value_key = "value" if record.get("value") not in (None, "") else "if_value"
        wavelength = _number(str(record.get(wavelength_key)), f"measurement[{index}].wavelength")
        value = _number(str(record.get(value_key)), f"measurement[{index}].value")
        valid = not (isinstance(label["nodata"], (int, float)) and value == label["nodata"])
        if "preliminary_valid" in record and record["preliminary_valid"] not in (None, ""):
            valid = valid and str(record["preliminary_valid"]).strip().lower() in {"1", "true", "yes"}
        entry: dict[str, Any] = {
            "wavelength": wavelength,
            "value": value,
            "units": label["units"],
            "valid": valid,
            "sourceFields": {"wavelength": wavelength_key, "value": value_key},
        }
        coordinate = _coordinate(record, label["bounds"], index)
        if coordinate:
            entry["coordinate"] = coordinate
        measurements.append(entry)
    if not measurements:
        raise PdsQuantitativeValidationError("CRISM product contains no measurements")
    wavelengths = [item["wavelength"] for item in measurements]
    if wavelengths != sorted(wavelengths):
        raise PdsQuantitativeValidationError("CRISM wavelengths must be non-decreasing")
    return measurements


def decode_pixl(label: dict[str, Any], data_path: Path) -> list[dict[str, Any]]:
    records = _read_records(data_path)
    measurements = []
    for index, record in enumerate(records):
        element = str(record.get("element", record.get("Element", ""))).strip()
        if not element and "Regolith Component" in record:
            # The authentic PIXL product is a wide table. Each non-error
            # column becomes one normalized measurement for the component.
            component = str(record.get("Regolith Component", "")).strip()
            if not component:
                raise PdsQuantitativeValidationError(f"PIXL measurement {index} is missing component identity")
            wide_measurements = []
            for source_field, raw_value in record.items():
                if source_field in {"Regolith Component", "Total"} or source_field.endswith("_err") or raw_value in (None, ""):
                    continue
                value = _number(str(raw_value), f"measurement[{index}].{source_field}")
                error_field = f"{source_field}_err"
                uncertainty_raw = record.get(error_field)
                uncertainty = None if uncertainty_raw in (None, "") else _number(str(uncertainty_raw), f"measurement[{index}].{error_field}")
                if uncertainty is not None and uncertainty < 0:
                    raise PdsQuantitativeValidationError(f"PIXL measurement {index} has negative uncertainty")
                wide_measurements.append({
                    "component": component,
                    "element": source_field,
                    "value": value,
                    "uncertainty": uncertainty,
                    "uncertaintyAvailable": uncertainty is not None,
                    "units": label["units"],
                    "sourceField": source_field,
                    "sourceUncertaintyField": error_field if uncertainty is not None else None,
                })
            if not wide_measurements:
                raise PdsQuantitativeValidationError(f"PIXL measurement {index} contains no oxide values")
            measurements.extend(wide_measurements)
            continue
        if not element:
            raise PdsQuantitativeValidationError(f"PIXL measurement {index} is missing element identity")
        value = _number(str(record.get("value")), f"measurement[{index}].value")
        uncertainty_raw = record.get("uncertainty")
        if uncertainty_raw in (None, ""):
            raise PdsQuantitativeValidationError(f"PIXL measurement {index} is missing uncertainty")
        uncertainty = _number(str(uncertainty_raw), f"measurement[{index}].uncertainty")
        if uncertainty < 0:
            raise PdsQuantitativeValidationError(f"PIXL measurement {index} has negative uncertainty")
        entry: dict[str, Any] = {"element": element, "value": value, "uncertainty": uncertainty, "units": label["units"], "uncertaintyAvailable": True}
        coordinate = _coordinate(record, label["bounds"], index)
        if coordinate:
            entry["coordinate"] = coordinate
        if record.get("sol") not in (None, ""):
            entry["sol"] = int(str(record["sol"]))
        if record.get("observationTime") not in (None, ""):
            entry["observationTime"] = str(record["observationTime"])
        measurements.append(entry)
    if not measurements:
        raise PdsQuantitativeValidationError("PIXL product contains no measurements")
    return measurements


def stage_product(
    *,
    kind: str,
    label_path: Path,
    data_path: Path,
    output: Path,
    source_url: str,
    expected_data_sha256: str | None = None,
    expected_label_sha256: str | None = None,
) -> dict[str, Any]:
    """Validate and stage one supplied local product without downloading it."""

    if kind not in {"crism", "pixl"}:
        raise ValueError("kind must be crism or pixl")
    if not source_url.startswith("https://"):
        raise PdsQuantitativeValidationError("A verified HTTPS source URL is required")
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite existing output: {output}")
    if not label_path.is_file() or not data_path.is_file():
        raise FileNotFoundError("Both a PDS4 label and measurement product are required")

    label_digest = sha256(label_path)
    data_digest = sha256(data_path)
    if expected_label_sha256 and label_digest != expected_label_sha256.lower():
        raise PdsQuantitativeValidationError("PDS4 label checksum mismatch")
    if expected_data_sha256 and data_digest != expected_data_sha256.lower():
        raise PdsQuantitativeValidationError("Measurement product checksum mismatch")

    label = parse_pds4_label(label_path, kind=kind)
    measurements = decode_crism(label, data_path) if kind == "crism" else decode_pixl(label, data_path)
    output.mkdir(parents=True)
    try:
        shutil.copyfile(label_path, output / "source-label.xml")
        shutil.copyfile(data_path, output / f"source-measurements{data_path.suffix.lower()}")
        (output / "measurements.json").write_text(json.dumps(measurements, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        result = {
            "schemaVersion": 1,
            "artifactType": f"quantitative-{kind}",
            "product": label,
            "source": {"url": source_url, "labelSha256": label_digest, "dataSha256": data_digest},
            "measurements": {"count": len(measurements), "path": "measurements.json"},
            "provenance": {"processor": "scripts/pds_quantitative_adapter.py", "networkAccess": False},
            "quality": {
                "labelValidated": True,
                "checksumVerified": bool(expected_data_sha256 and expected_label_sha256),
                "coordinatesValidated": all("coordinate" in item for item in measurements) or not any("coordinate" in item for item in measurements),
                "unitsValidated": True,
                "nodataPreserved": kind == "crism",
                "uncertaintyValidated": kind == "pixl",
                "quantitativeValuesAreNotClassifications": True,
            },
            "limitations": [
                "No mineral classification or abundance interpretation is inferred by this adapter.",
                "Registration to the Earthapps playable patch is not performed automatically.",
            ],
        }
        (output / "manifest.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        (output / "quality-report.json").write_text(json.dumps(result["quality"], indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return result
    except Exception:
        shutil.rmtree(output, ignore_errors=True)
        raise


def stage_crism(**kwargs: Any) -> dict[str, Any]:
    return stage_product(kind="crism", **kwargs)


def stage_pixl(**kwargs: Any) -> dict[str, Any]:
    return stage_product(kind="pixl", **kwargs)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", choices=("crism", "pixl"), required=True)
    parser.add_argument("--label", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--expected-data-sha256")
    parser.add_argument("--expected-label-sha256")
    args = parser.parse_args()
    result = stage_product(
        kind=args.kind,
        label_path=args.label,
        data_path=args.data,
        output=args.output,
        source_url=args.source_url,
        expected_data_sha256=args.expected_data_sha256,
        expected_label_sha256=args.expected_label_sha256,
    )
    print(json.dumps({"artifactType": result["artifactType"], "productId": result["product"]["productId"], "output": str(args.output)}))

if __name__ == "__main__":
    main()
