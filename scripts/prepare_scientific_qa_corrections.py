"""Create versioned, non-destructive scientific QA correction outputs."""

from __future__ import annotations

import csv
import hashlib
import json
import sys
import zipfile
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "earthapps staging" / "nasa_qa_corrections_v1"
CRISM_ZIP = ROOT / "earthapps staging/earthapps_nasa_crism_verified.zip"
sys.path.insert(0, str(ROOT))

from scripts.pds_remaining_adapter import validate_rad, validate_stage
from scripts.scientific_qa_corrections import corrected_crism_manifest, validate_archive_checksums


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    if OUT.exists():
        raise SystemExit(f"Refusing to overwrite existing output: {OUT}")
    OUT.mkdir(parents=True)

    with zipfile.ZipFile(CRISM_ZIP) as archive:
        original_manifest = json.loads(archive.read("crism_manifest.json"))
        corrected = corrected_crism_manifest(original_manifest, archive.namelist())
        checksum_results = validate_archive_checksums(CRISM_ZIP, corrected)
    (OUT / "crism_manifest_archive_relative.json").write_text(json.dumps(corrected, indent=2) + "\n", encoding="utf-8")
    (OUT / "crism_checksum_validation.json").write_text(json.dumps({"archive": str(CRISM_ZIP), "results": checksum_results, "allMatch": all(item["match"] for item in checksum_results)}, indent=2) + "\n", encoding="utf-8")

    remaining_stage = ROOT / "earthapps staging/nasa_phase_remaining_v1"
    remaining_report = validate_stage(remaining_stage)
    (OUT / "meda_themis_rad_validation.json").write_text(json.dumps(remaining_report, indent=2) + "\n", encoding="utf-8")

    rad_data = remaining_stage / "rad_sol420/RAD_RDR_2013_284_02_54_0420_V00.TXT"
    rad_label = remaining_stage / "rad_sol420/RAD_RDR_2013_284_02_54_0420_V00.LBL"
    rad_report = validate_rad(rad_data, rad_label)
    (OUT / "rad_observations.json").write_text(json.dumps(rad_report, indent=2) + "\n", encoding="utf-8")

    meda_ps = remaining_stage / "meda_sol180/WE__0180___________CAL_PS__________________P03.CSV"
    ps_result = remaining_report["meda"][1]
    if len(ps_result["sclkGaps"]) != 11:
        raise ValueError(f"Expected 11 verified Sol 180 pressure gaps, found {len(ps_result['sclkGaps'])}")
    (OUT / "meda_sol180_quality.json").write_text(json.dumps({
        "source": str(meda_ps),
        "pressureRows": ps_result["rows"],
        "pressureMissingPrimaryValues": ps_result["missingValues"]["BAROCAP1_PRESSURE"],
        "verifiedPressureGaps": ps_result["sclkGaps"],
        "interpolation": "not performed",
        "windMissingPrimaryValues": remaining_report["meda"][2]["missingValues"]["BOOM1_HORIZONTAL_WIND_SPEED"],
        "windQualityFlags": remaining_report["meda"][2]["qualityFlags"],
    }, indent=2) + "\n", encoding="utf-8")

    rimfax_root = ROOT / "earthapps staging/nasa_final_verification_v1/rimfax_sol10"
    radargram = json.loads((rimfax_root / "radargram.json").read_text())
    with (rimfax_root / "rimfax_calibrated_00010.csv").open(newline="", encoding="utf-8") as stream:
        source_rows = list(csv.DictReader(stream))
    active = [row for row in source_rows if row.get("record_type") == "0"]
    if len(active) != 40 or len(radargram["rows"]) != 40:
        raise ValueError("RIMFAX active trace count mismatch")
    groups = []
    start = 0
    while start < len(active):
        config = active[start]["config_id"]
        same = [row for row in active if row["config_id"] == config]
        group_rows = radargram["rows"][start:start + len(same)]
        groups.append({
            "configId": config,
            "rowStart": start,
            "rowEndExclusive": start + len(same),
            "traceCount": len(same),
            "sampleCount": len(group_rows[0]["samples"]),
            "sampleTimeIncrementNs": float(active[start]["sample_time_increment"]),
            "twoWayTimeEndNs": (len(group_rows[0]["samples"]) - 1) * float(active[start]["sample_time_increment"]),
            "startFrequencyMHz": float(active[start]["start_frequency"]),
            "stopFrequencyMHz": float(active[start]["stop_frequency"]),
        })
        start += len(same)
    if [group["traceCount"] for group in groups] != [10, 10, 10, 10]:
        raise ValueError("Unexpected RIMFAX acquisition group sizes")
    rimfax_metadata = {"classification": "JEZERO_REGIONAL", "depthConversion": "not performed", "traceCount": 40, "sampleCounts": [16384], "groups": groups}
    (OUT / "rimfax_visualization_metadata.json").write_text(json.dumps(rimfax_metadata, indent=2) + "\n", encoding="utf-8")

    fig, axes = plt.subplots(2, 2, figsize=(14, 8), constrained_layout=True)
    for axis, group in zip(axes.flat, groups):
        rows = np.asarray([row["samples"] for row in radargram["rows"][group["rowStart"]:group["rowEndExclusive"]]])
        end_ns = group["twoWayTimeEndNs"]
        axis.imshow(rows, aspect="auto", cmap="gray", extent=(0, end_ns, group["traceCount"], 0))
        axis.set_title(f"Config {group['configId']}: Δt={group['sampleTimeIncrementNs']} ns")
        axis.set_xlabel("Two-way travel time (ns)")
        axis.set_ylabel("Trace within group")
    fig.suptitle("RIMFAX Sol 10 calibrated traces — time domain only; no depth conversion")
    fig.savefig(OUT / "rimfax_calibrated_time_groups.png", dpi=140)
    plt.close(fig)

    (OUT / "README.md").write_text("""# Earthapps scientific QA corrections v1

This directory contains non-destructive correction outputs. Original ZIP files,
NASA source measurements, public assets, and existing manifests were not
overwritten.

- `crism_manifest_archive_relative.json` fixes only checksum key paths to exact
  archive-relative paths; hashes and measurements are unchanged.
- `rad_observations.json` parses all 65 Dose B and Dose E observations and QC
  flags. The classification remains `NON_JEZERO_CONTEXT`.
- `meda_sol180_quality.json` preserves missing wind values, quality flags, and
  the 11 observed SCLK pressure gaps. No interpolation is performed.
- `rimfax_visualization_metadata.json` records four acquisition groups and
  their calibrated sample-time increments. The plot uses two-way travel time;
  it does not infer physical depth.

CRISM geographic registration and THEMIS pixel-level coverage remain unresolved.
MEDA Sol 119 raw products remain unavailable and were not downloaded.
""", encoding="utf-8")

    checksums = []
    for path in sorted(p for p in OUT.rglob("*") if p.is_file()):
        checksums.append(f"{sha256(path)}  {path.relative_to(OUT)}")
    (OUT / "SHA256SUMS").write_text("\n".join(checksums) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), "files": sum(1 for p in OUT.rglob("*") if p.is_file()), "crismChecksums": len(checksum_results), "radObservations": rad_report["observationCount"], "medaPressureGaps": len(ps_result["sclkGaps"]), "rimfaxGroups": len(groups)}, indent=2))


if __name__ == "__main__":
    main()
