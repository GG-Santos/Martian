"""Validate downloaded MEDA, THEMIS, and RAD staging products locally.

This module is intentionally read-only with respect to source products. It
does not download data, convert THEMIS DN values, or infer missing science.
It produces provenance and validation summaries suitable for isolated staging.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


class ScientificValidationError(ValueError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _text(root: ET.Element, name: str) -> list[str]:
    return [
        " ".join("".join(node.itertext()).split())
        for node in root.iter()
        if node.tag.rsplit("}", 1)[-1].lower() == name.lower()
        and "".join(node.itertext()).strip()
    ]


def _first(root: ET.Element, name: str, default: str | None = None) -> str | None:
    values = _text(root, name)
    return values[0] if values else default


def parse_label(path: Path) -> dict[str, Any]:
    root = ET.parse(path).getroot()
    return {
        "logicalIdentifier": _first(root, "logical_identifier"),
        "title": _first(root, "title"),
        "version": _first(root, "version_id"),
        "start": _first(root, "start_date_time"),
        "stop": _first(root, "stop_date_time"),
        "processingLevel": _first(root, "processing_level"),
        "units": _text(root, "unit"),
        "missing": _first(root, "missing_constant"),
    }


def _numeric_summary(values: list[float]) -> dict[str, Any]:
    finite = [value for value in values if math.isfinite(value)]
    if not finite:
        return {"count": 0, "finite": 0}
    return {
        "count": len(values),
        "finite": len(finite),
        "min": min(finite),
        "max": max(finite),
        "mean": sum(finite) / len(finite),
    }


def _missing_count(rows: list[dict[str, str]], name: str) -> int:
    return sum(1 for row in rows if row.get(name, "").strip() == "")


def _sclk_gaps(rows: list[dict[str, str]]) -> list[dict[str, int]]:
    values: list[tuple[int, int]] = []
    for index, row in enumerate(rows):
        raw = row.get("SCLK", "").strip()
        if raw:
            try:
                values.append((index, int(raw)))
            except ValueError as error:
                raise ScientificValidationError(f"Invalid MEDA SCLK at row {index}") from error
    gaps = []
    for (first_index, first), (second_index, second) in zip(values, values[1:]):
        elapsed = second - first
        if elapsed > 1:
            gaps.append({
                "beforeRow": first_index,
                "afterRow": second_index,
                "elapsedSeconds": elapsed,
                "missingOneHzSamples": elapsed - 1,
            })
    return gaps


def validate_meda(data: Path, label: Path, channel: str) -> dict[str, Any]:
    metadata = parse_label(label)
    rows: list[dict[str, str]]
    with data.open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    if not rows:
        raise ScientificValidationError(f"MEDA product is empty: {data.name}")
    required = {
        "ATS": ("SCLK", "LMST", "ATS_LOCAL_TEMP1"),
        "PS": ("SCLK", "LMST", "BAROCAP1_PRESSURE"),
        "WS": ("SCLK", "LMST", "BOOM1_HORIZONTAL_WIND_SPEED"),
    }[channel]
    missing = [name for name in required if name not in rows[0]]
    if missing:
        raise ScientificValidationError(f"MEDA {channel} missing fields: {missing}")
    summaries: dict[str, Any] = {}
    missing_values = {name: _missing_count(rows, name) for name in rows[0]}
    for name in rows[0]:
        values = []
        for row in rows:
            raw = row.get(name, "").strip()
            try:
                value = float(raw)
            except ValueError:
                continue
            if math.isfinite(value):
                values.append(value)
        if values and name not in {"SCLK"}:
            summaries[name] = _numeric_summary(values)
    result = {
        "kind": "MEDA",
        "channel": channel,
        "product": metadata,
        "rows": len(rows),
        "columns": list(rows[0]),
        "numeric": summaries,
        "missingValues": missing_values,
        "sclkGaps": _sclk_gaps(rows),
        "interpolation": "not performed",
        "sourceSha256": sha256(data),
        "labelSha256": sha256(label),
    }
    if channel == "WS":
        for field in ("BOOM1_ALG_STATE_STABLE", "BOOM2_ALG_STATE_STABLE", "ROVER_STILL"):
            if field not in rows[0]:
                raise ScientificValidationError(f"MEDA WS missing quality field: {field}")
            values = {row[field].strip() for row in rows if row[field].strip()}
            if not values <= {"0", "1"}:
                raise ScientificValidationError(f"MEDA WS quality field is not binary: {field}")
        result["qualityFlags"] = {
            field: {
                "validValues": [0, 1],
                "ones": sum(row[field].strip() == "1" for row in rows),
                "zeros": sum(row[field].strip() == "0" for row in rows),
            }
            for field in ("BOOM1_ALG_STATE_STABLE", "BOOM2_ALG_STATE_STABLE", "ROVER_STILL")
        }
    return result


def validate_themis(data: Path, label: Path) -> dict[str, Any]:
    metadata = parse_label(label)
    if metadata["logicalIdentifier"] != "urn:nasa:pds:ody.themis.sdp:data_irbtr:i98521009btr":
        raise ScientificValidationError("Unexpected THEMIS product identifier")
    label_text = label.read_text(encoding="utf-8")
    if "<data_type>UnsignedByte</data_type>" not in label_text:
        raise ScientificValidationError("THEMIS sample type is not the expected unsigned byte")
    if "<unit>Kelvin</unit>" not in label_text:
        raise ScientificValidationError("THEMIS brightness-temperature unit is missing")
    return {
        "kind": "THEMIS",
        "product": metadata,
        "bytes": data.stat().st_size,
        "declaredFileSize": 580800,
        "scalingFactor": 0.051,
        "valueOffsetKelvin": 205.272,
        "missingConstant": 0,
        "declaredBrightnessTemperatureKelvin": {"min": 205.272, "max": 218.279},
        "sourceSha256": sha256(data),
        "labelSha256": sha256(label),
    }


def validate_rad(data: Path, label: Path) -> dict[str, Any]:
    label_text = label.read_text(encoding="ascii", errors="replace")
    product = re.search(r"^PRODUCT_ID\s*=\s*\"?([^\"\s]+)", label_text, re.MULTILINE)
    dataset = re.search(r"^DATA_SET_ID\s*=\s*\"?([^\"\s]+)", label_text, re.MULTILINE)
    unit_values = sorted(set(re.findall(r'UNIT\s*=\s*"([^"]+)"', label_text)))
    if not product or product.group(1) != "RAD_RDR_2013_284_02_54_0420_V00":
        raise ScientificValidationError("Unexpected RAD product identifier")
    if not dataset or dataset.group(1) != "MSL-M-RAD-3-RDR-V1.0":
        raise ScientificValidationError("Unexpected RAD dataset identifier")
    if not unit_values:
        raise ScientificValidationError("RAD label has no measurement units")
    text = data.read_text(encoding="ascii", errors="replace")
    observation_blocks = {
        match.group(1): match.group(2)
        for match in re.finditer(r"\[OBSERVATION:\s*(\d+)\](.*?)(?=\n\[OBSERVATION:|\Z)", text, re.S)
    }
    dose_values: dict[str, dict[str, float | str | None]] = {}
    for detector in ("B", "E"):
        matches = list(re.finditer(rf"\[DOSIMETRY_TOTAL_DOSE_{detector}:\s*(\d+)\]\s*\n\s*([^\n]+)", text))
        if len(matches) != len(observation_blocks):
            raise ScientificValidationError(f"RAD Dose {detector} record count does not match observations")
        for match in matches:
            observation_id, raw = match.group(1), match.group(2).strip()
            if raw in {"", "N/A", "NA", "-9999", "-9999.0"}:
                value = None
            else:
                try:
                    value = float(raw)
                except ValueError as error:
                    raise ScientificValidationError(f"Malformed RAD Dose {detector} value for observation {observation_id}") from error
            dose_values.setdefault(observation_id, {})[f"dose{detector}"] = value
    observations = []
    for observation_id, block in sorted(observation_blocks.items(), key=lambda item: int(item[0])):
        quality = re.search(r"^QC=(\S+)", block, re.MULTILINE)
        observations.append({
            "observationId": observation_id,
            "doseB": dose_values[observation_id]["doseB"],
            "doseE": dose_values[observation_id]["doseE"],
            "unit": "microGray / Hour",
            "qc": quality.group(1) if quality else None,
        })
    return {
        "kind": "RAD",
        "productId": product.group(1),
        "datasetId": dataset.group(1),
        "startTime": "2013-284T02:54:40",
        "startSol": "0420",
        "units": unit_values,
        "context": "Gale Crater / Curiosity; not Jezero-local",
        "classification": "NON_JEZERO_CONTEXT",
        "observations": observations,
        "observationCount": len(observations),
        "doseBValidCount": sum(item["doseB"] is not None for item in observations),
        "doseEValidCount": sum(item["doseE"] is not None for item in observations),
        "qcValues": sorted({item["qc"] for item in observations if item["qc"] is not None}),
        "bytes": data.stat().st_size,
        "sourceSha256": sha256(data),
        "labelSha256": sha256(label),
    }


def validate_stage(root: Path) -> dict[str, Any]:
    meda = root / "meda_sol180"
    themis = root / "themis_i98521009btr"
    rad = root / "rad_sol420"
    return {
        "stage": "nasa_phase_remaining_v1",
        "scientificStatus": "staged-not-activated",
        "meda": [
            validate_meda(meda / f"WE__0180___________CAL_{name}{suffix}.{'CSV' if name != 'WS' else 'CSV'}", meda / f"WE__0180___________CAL_{name}{suffix}.xml", name)
            for name, suffix in [("ATS", "_________________P02"), ("PS", "__________________P03"), ("WS", "__________________P03")]
        ],
        "themis": validate_themis(themis / "I98521009BTR.IMG", themis / "I98521009BTR.xml"),
        "rad": validate_rad(rad / "RAD_RDR_2013_284_02_54_0420_V00.TXT", rad / "RAD_RDR_2013_284_02_54_0420_V00.LBL"),
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("stage", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(validate_stage(args.stage), indent=2) + "\n", encoding="utf-8")
