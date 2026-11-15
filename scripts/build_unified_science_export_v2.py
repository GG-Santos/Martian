"""Build Unified NASA Analysis V2 from the validated V1 export and QA outputs."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
V1 = ROOT / "earthapps staging/colab_unified_nasa_v1"
QA = ROOT / "earthapps staging/nasa_qa_corrections_v1"
OUT = ROOT / "earthapps staging/colab_unified_nasa_v2"
ZIP_OUT = ROOT / "earthapps staging/earthapps_unified_nasa_analysis_v2.zip"
sys.path.insert(0, str(ROOT))

from analysis.io import load_jezero
from analysis.route_terrain import analyze_route
from analysis.terrain_metrics import local_relief, quality_report
from scripts.build_unified_science_export import (
    ANALYSIS_FILES,
    CRISM_FILES,
    CRISM_VERIFICATION_FILES,
    JEZERO_FILES,
    MEDA_FILES,
    PIXL_FILES,
    RAD_FILES,
    RIMFAX_FILES,
    SCRIPT_FILES,
    THEMIS_FILES,
)
from scripts.export_builder_utils import (
    assert_no_private_names,
    copy_allowlist,
    deterministic_zip,
    sha256,
    verify_checksums,
    verify_sha256sums,
)

V1_EXPORT_FILES = (
    "README.md", "crism-spectrum.png", "earthapps_unified_nasa_analysis.ipynb", "provenance.json", "rimfax-radargram.png",
    "route-analysis.json", "scientific-overview.png", "scientific-results-summary.md", "terrain-summary.json",
    *(f"analysis/{name}" for name in ANALYSIS_FILES),
    *(f"scripts/{name}" for name in SCRIPT_FILES),
    *(f"data/jezero/{name}" for name in JEZERO_FILES),
    "data/nasa/meda_sol119_reference.json",
    *(f"data/nasa/meda_sol180/{name}" for name in MEDA_FILES),
    *(f"data/nasa/themis/{name}" for name in THEMIS_FILES),
    *(f"data/nasa/rad_sol420/{name}" for name in RAD_FILES),
    *(f"data/nasa/rimfax/{name}" for name in RIMFAX_FILES),
    *(f"data/nasa/crism_source_verification/{name}" for name in CRISM_VERIFICATION_FILES),
    *(f"data/nasa/crism/{name}" for name in CRISM_FILES),
    *(f"data/nasa/pixl/{name}" for name in PIXL_FILES),
)


def notebook(path: Path) -> None:
    cells = [
        {"cell_type": "markdown", "metadata": {}, "source": [
            "# Earthapps unified NASA scientific analysis V2\n",
            "This offline notebook reproduces the validated Earthapps analyses and the approved scientific QA corrections. No NASA data is downloaded.\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "from pathlib import Path\nimport csv, json, hashlib, zipfile\nimport numpy as np\nimport matplotlib.pyplot as plt\nfrom analysis.io import load_jezero\nfrom analysis.route_terrain import analyze_route\nfrom analysis.terrain_metrics import local_relief, quality_report\nROOT = Path.cwd()\nDATA = ROOT / 'data'\nQA = ROOT / 'qa_corrections'\njezero = load_jezero(DATA / 'jezero', verify_hashes=True)\nprint('dataset:', jezero.manifest['datasetId'])\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "terrain = quality_report(jezero)\nmission = json.loads((DATA / 'jezero/mission.json').read_text())\nroute = analyze_route(jezero, [(n['point']['x'], n['point']['y']) for n in mission['presetNodes']], route_label='Earthapps preset route')\nroughness_8m = local_relief(jezero.heights_m, radius_cells=1)\nprint(json.dumps({'terrain': terrain, 'routeTotals': route['totals'], 'roughnessConvention': '3x3 local elevation range on 257x257 8m analysis grid', 'roughnessMeanM': float(np.nanmean(roughness_8m))}, indent=2))\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "fig, axes = plt.subplots(1, 3, figsize=(15, 4))\naxes[0].imshow(jezero.heights_m, cmap='terrain'); axes[0].set_title('HiRISE elevation (m)')\naxes[1].imshow(jezero.slope_deg, cmap='magma'); axes[1].set_title('Derived slope (deg)')\naxes[2].imshow(roughness_8m, cmap='viridis'); axes[2].set_title('8m local relief roughness (m)')\nplt.tight_layout(); plt.show()\nprint('relief asset grid:', jezero.relief_grid.__dict__)\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "crism = json.loads((DATA / 'nasa/crism/crism_manifest_archive_relative.json').read_text())\nchecks = []\nfor name, expected in crism['checksums'].items():\n    path = DATA / 'nasa/crism' / name\n    actual = hashlib.sha256(path.read_bytes()).hexdigest()\n    checks.append(actual == expected)\nrows = list(csv.DictReader((DATA / 'nasa/crism/derived/crism_jezero_spectrum.csv').open()))\nplt.figure(figsize=(10, 4)); plt.plot([float(r['wavelength_nm']) for r in rows], [float(r['if_value']) for r in rows]); plt.xlabel('Wavelength (nm)'); plt.ylabel('I/F'); plt.title('CRISM verified spectrum'); plt.show()\nprint('CRISM checksums:', all(checks), 'bands:', len(rows), 'classification: LOCATION_UNVERIFIED')\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "pixl = list(csv.DictReader((DATA / 'nasa/pixl/table_s3_oxides_bulksum.csv').open()))\noxide = [k for k in pixl[0] if k not in {'Regolith Component', 'Total'} and not k.endswith('_err')]\nmeans = [np.mean([float(row[k]) for row in pixl]) for k in oxide]\nplt.figure(figsize=(12, 4)); plt.bar(oxide, means); plt.xticks(rotation=75, ha='right'); plt.ylabel('Mean wt%'); plt.title('PIXL normalized oxide measurements'); plt.tight_layout(); plt.show()\nprint('PIXL rows:', len(pixl), 'normalized measurements:', len(pixl) * len(oxide), 'coordinates: unavailable')\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "themis = DATA / 'nasa/themis/I98521009BTR.IMG'\nraw = themis.read_bytes()\nheader_bytes = 2240\nimage = np.frombuffer(raw[header_bytes:], dtype=np.uint8).reshape(1808, 320)\nvalid = image != 0\ntemperature_k = np.where(valid, image * 0.051 + 205.272, np.nan)\nplt.figure(figsize=(9, 5)); plt.imshow(temperature_k, cmap='inferno'); plt.colorbar(label='Brightness temperature (K)'); plt.title('THEMIS calibrated-derived temperature; DN 0 masked'); plt.show()\nprint('header bytes skipped:', header_bytes, 'image shape:', image.shape, 'valid pixels:', int(valid.sum()), 'classification: PLAYABLE_AREA_CANDIDATE')\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "def meda_series(path, column):\n    with path.open(newline='') as stream: rows = list(csv.DictReader(stream))\n    x = np.arange(len(rows)); y = np.array([float(r[column]) if r.get(column, '').strip() else np.nan for r in rows])\n    return x, y\nats = DATA / 'nasa/meda_sol180/WE__0180___________CAL_ATS_________________P02.CSV'\nps = DATA / 'nasa/meda_sol180/WE__0180___________CAL_PS__________________P03.CSV'\nws = DATA / 'nasa/meda_sol180/WE__0180___________CAL_WS__________________P03.CSV'\nfig, axes = plt.subplots(3, 1, figsize=(12, 9), sharex=False)\nfor ax, path, col, title, unit in [(axes[0], ats, 'ATS_LOCAL_TEMP1', 'MEDA Sol 180 air temperature', 'K'), (axes[1], ps, 'BAROCAP1_PRESSURE', 'MEDA Sol 180 pressure', 'Pa'), (axes[2], ws, 'BOOM1_HORIZONTAL_WIND_SPEED', 'MEDA Sol 180 horizontal wind', 'm/s')]:\n    x, y = meda_series(path, col); ax.plot(x, y, linewidth=.5); ax.set_title(title); ax.set_ylabel(unit)\naxes[-1].set_xlabel('Source row index; gaps are not interpolated'); plt.tight_layout(); plt.show()\nmeda_quality = json.loads((QA / 'meda_sol180_quality.json').read_text())\nprint('pressure rows:', meda_quality['pressureRows'], 'verified pressure gaps:', len(meda_quality['verifiedPressureGaps']), 'missing wind values:', meda_quality['windMissingPrimaryValues'])\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "rad = json.loads((QA / 'rad_observations.json').read_text())\nobs = rad['observations']\nplt.figure(figsize=(11, 4)); plt.plot([int(o['observationId']) for o in obs], [o['doseB'] for o in obs], label='Dose B'); plt.plot([int(o['observationId']) for o in obs], [o['doseE'] for o in obs], label='Dose E'); plt.xlabel('Observation ID'); plt.ylabel('microGray / Hour'); plt.title('RAD Sol 420 dose context — Gale Crater'); plt.legend(); plt.show()\nprint('RAD observations:', rad['observationCount'], 'classification:', rad['classification'])\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "radar = json.loads((DATA / 'nasa/rimfax/radargram.json').read_text())\nmeta = json.loads((QA / 'rimfax_visualization_metadata.json').read_text())\nfig, axes = plt.subplots(2, 2, figsize=(14, 8), constrained_layout=True)\nfor ax, group in zip(axes.flat, meta['groups']):\n    values = np.asarray([row['samples'] for row in radar['rows'][group['rowStart']:group['rowEndExclusive']]])\n    ax.imshow(values, aspect='auto', cmap='gray', extent=(0, group['twoWayTimeEndNs'], group['traceCount'], 0))\n    ax.set_title(f'Config {group[\"configId\"]}: Δt={group[\"sampleTimeIncrementNs\"]} ns'); ax.set_xlabel('Two-way travel time (ns)'); ax.set_ylabel('Trace')\nfig.suptitle('RIMFAX Sol 10 calibrated radar traces — no depth conversion'); plt.show()\nprint('RIMFAX traces:', meta['traceCount'], 'groups:', len(meta['groups']), 'classification:', meta['classification'])\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "summary = json.loads((ROOT / 'scientific-summary-v2.json').read_text())\nprint(json.dumps(summary, indent=2))\nprint('MEDA Sol 119 raw files are unavailable; only the existing evidence summary is included.')\nprint('CRISM remains LOCATION_UNVERIFIED; THEMIS remains PLAYABLE_AREA_CANDIDATE; RAD remains NON_JEZERO_CONTEXT.')\n",
        ]},
    ]
    value = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python", "version": "3"}}, "nbformat": 4, "nbformat_minor": 5}
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if OUT.exists() or ZIP_OUT.exists():
        raise SystemExit("Refusing to overwrite an existing V2 export")
    v1_provenance = json.loads((V1 / "provenance.json").read_text(encoding="utf-8"))
    verify_checksums(V1, {entry["path"]: entry["sha256"] for entry in v1_provenance["sourceFiles"]})
    verify_sha256sums(QA / "SHA256SUMS", QA)
    copy_allowlist(V1, OUT, V1_EXPORT_FILES)
    qa_target = OUT / "qa_corrections"
    qa_files = (
        "README.md", "SHA256SUMS", "crism_checksum_validation.json", "crism_manifest_archive_relative.json",
        "meda_sol180_quality.json", "meda_themis_rad_validation.json", "rad_observations.json",
        "rimfax_calibrated_time_groups.png", "rimfax_visualization_metadata.json",
    )
    copy_allowlist(QA, qa_target, qa_files)
    (OUT / "data/nasa/crism/crism_manifest_archive_relative.json").write_text((QA / "crism_manifest_archive_relative.json").read_text(), encoding="utf-8")
    assert_no_private_names(OUT)

    dataset = load_jezero(OUT / "data/jezero", verify_hashes=True)
    mission = json.loads((OUT / "data/jezero/mission.json").read_text())
    terrain = quality_report(dataset)
    route = analyze_route(dataset, [(n["point"]["x"], n["point"]["y"]) for n in mission["presetNodes"]], route_label="Earthapps preset route")
    rough = local_relief(dataset.heights_m, radius_cells=1)
    crism_rows = list(csv.DictReader((OUT / "data/nasa/crism/derived/crism_jezero_spectrum.csv").open()))
    pixl_rows = list(csv.DictReader((OUT / "data/nasa/pixl/table_s3_oxides_bulksum.csv").open()))
    oxide = [k for k in pixl_rows[0] if k not in {"Regolith Component", "Total"} and not k.endswith("_err")]
    qa_meda = json.loads((QA / "meda_sol180_quality.json").read_text())
    qa_rad = json.loads((QA / "rad_observations.json").read_text())
    qa_rimfax = json.loads((QA / "rimfax_visualization_metadata.json").read_text())
    raw = np.fromfile(OUT / "data/nasa/themis/I98521009BTR.IMG", dtype=np.uint8)
    themis_image = raw[2240:].reshape(1808, 320)
    themis_valid = themis_image != 0
    themis_grid = np.where(themis_valid, themis_image * 0.051 + 205.272, np.nan)
    themis_temp = themis_grid[themis_valid]
    summary = {
        "packageId": "earthapps-unified-nasa-analysis-v2",
        "terrain": {"datasetId": terrain["datasetId"], "heightFinite": terrain["height"]["count"], "roughness8mMeanM": float(np.nanmean(rough)), "roughnessConvention": "3x3 local elevation range on 257x257 8m analysis grid"},
        "route": route["totals"],
        "crism": {"bands": len(crism_rows), "sourceMatches": json.loads((QA / "crism_checksum_validation.json").read_text())["allMatch"], "classification": "LOCATION_UNVERIFIED"},
        "pixl": {"rows": len(pixl_rows), "columns": len(pixl_rows[0]), "normalizedMeasurements": len(pixl_rows) * len(oxide), "classification": "JEZERO_REGIONAL"},
        "themis": {"headerBytesSkipped": 2240, "shape": [1808, 320], "validPixels": int(themis_valid.sum()), "nodataPixels": int((~themis_valid).sum()), "minK": float(themis_temp.min()), "maxK": float(themis_temp.max()), "classification": "PLAYABLE_AREA_CANDIDATE"},
        "medaSol180": {"pressureRows": qa_meda["pressureRows"], "pressureGaps": len(qa_meda["verifiedPressureGaps"]), "missingWindValues": qa_meda["windMissingPrimaryValues"], "interpolation": "not performed"},
        "rad": {"observations": qa_rad["observationCount"], "doseBValid": qa_rad["doseBValidCount"], "doseEValid": qa_rad["doseEValidCount"], "classification": qa_rad["classification"]},
        "rimfax": {"traces": qa_rimfax["traceCount"], "groups": qa_rimfax["groups"], "depthConversion": "not performed"},
        "limitations": ["MEDA Sol 119 raw products are unavailable.", "CRISM geographic registration is unverified.", "THEMIS pixel-level playable-area coverage is unverified.", "PIXL coordinates are unavailable.", "RAD is Gale Crater context only."],
    }
    (OUT / "scientific-summary-v2.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    # Versioned graphs; V1 graphs remain present in the copied package.
    fig, ax = plt.subplots(figsize=(9, 5)); image = ax.imshow(themis_grid, cmap="inferno"); fig.colorbar(image, ax=ax, label="Brightness temperature (K)"); ax.set_title("THEMIS calibrated-derived temperature (DN 0 masked)"); fig.tight_layout(); fig.savefig(OUT / "themis-brightness-temperature-v2.png", dpi=140); plt.close(fig)
    meda_specs = [("data/nasa/meda_sol180/WE__0180___________CAL_ATS_________________P02.CSV", "ATS_LOCAL_TEMP1", "MEDA Sol 180 air temperature", "K"), ("data/nasa/meda_sol180/WE__0180___________CAL_PS__________________P03.CSV", "BAROCAP1_PRESSURE", "MEDA Sol 180 pressure", "Pa"), ("data/nasa/meda_sol180/WE__0180___________CAL_WS__________________P03.CSV", "BOOM1_HORIZONTAL_WIND_SPEED", "MEDA Sol 180 wind", "m/s")]
    fig, axes = plt.subplots(3, 1, figsize=(12, 9));
    for ax, (rel, col, title, unit) in zip(axes, meda_specs):
        with (OUT / rel).open(newline="") as stream: rows = list(csv.DictReader(stream))
        y = np.array([float(row[col]) if row.get(col, "").strip() else np.nan for row in rows]); ax.plot(np.arange(len(y)), y, linewidth=.5); ax.set_title(title); ax.set_ylabel(unit)
    axes[-1].set_xlabel("Source row index; missing values and sampling gaps are not interpolated"); fig.tight_layout(); fig.savefig(OUT / "meda-sol180-environment-v2.png", dpi=140); plt.close(fig)
    obs = qa_rad["observations"]; fig, ax = plt.subplots(figsize=(11, 4)); x = [int(o["observationId"]) for o in obs]; ax.plot(x, [o["doseB"] for o in obs], label="Dose B"); ax.plot(x, [o["doseE"] for o in obs], label="Dose E"); ax.set(xlabel="Observation ID", ylabel="microGray / Hour", title="RAD Sol 420 dose context — Gale Crater"); ax.legend(); fig.tight_layout(); fig.savefig(OUT / "rad-sol420-dose-v2.png", dpi=140); plt.close(fig)
    radar = json.loads((OUT / "data/nasa/rimfax/radargram.json").read_text()); fig, axes = plt.subplots(2, 2, figsize=(14, 8), constrained_layout=True)
    for ax, group in zip(axes.flat, qa_rimfax["groups"]):
        values = np.asarray([row["samples"] for row in radar["rows"][group["rowStart"]:group["rowEndExclusive"]]]); ax.imshow(values, aspect="auto", cmap="gray", extent=(0, group["twoWayTimeEndNs"], group["traceCount"], 0)); ax.set_title(f"Config {group['configId']}: Δt={group['sampleTimeIncrementNs']} ns"); ax.set_xlabel("Two-way travel time (ns)"); ax.set_ylabel("Trace")
    fig.suptitle("RIMFAX Sol 10 calibrated traces — no depth conversion"); fig.savefig(OUT / "rimfax-calibrated-time-groups-v2.png", dpi=140); plt.close(fig)

    (OUT / "README-v2.md").write_text("""# Earthapps Unified NASA Analysis V2

Open `earthapps_unified_nasa_analysis_v2.ipynb` in Google Colab from the
extracted package root and run all cells. NumPy and Matplotlib are the only
runtime dependencies used by the notebook. No network access is required.

V2 includes the V1 package unchanged, the versioned QA correction reports, the
corrected CRISM archive-relative manifest, RAD Dose B/E and QC parsing, MEDA
Sol 180 quality/missing-value and 11-gap analysis, and RIMFAX group-aware
time-domain plots. The THEMIS cell skips the 2,240-byte PDS header, reshapes the
1,808 x 320 image, and masks DN 0 before applying the documented scale and
offset.

Classifications remain: HiRISE `VERIFIED_FOR_CURRENT_USE`, CRISM
`LOCATION_UNVERIFIED`, THEMIS `PLAYABLE_AREA_CANDIDATE`, RIMFAX
`JEZERO_REGIONAL`, PIXL `JEZERO_REGIONAL`, MEDA Sol 180 regional/location
unverified, and RAD `NON_JEZERO_CONTEXT`. MEDA Sol 119 raw files remain
unavailable and are not fabricated or downloaded.
""", encoding="utf-8")
    notebook(OUT / "earthapps_unified_nasa_analysis_v2.ipynb")

    provenance = {"packageId": "earthapps-unified-nasa-analysis-v2", "sourceFiles": []}
    for file in sorted(p for p in OUT.rglob("*") if p.is_file()):
        if file.name in {"provenance-v2.json", "SHA256SUMS-v2"}:
            continue
        provenance["sourceFiles"].append({"path": str(file.relative_to(OUT)), "bytes": file.stat().st_size, "sha256": sha256(file)})
    (OUT / "provenance-v2.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    checksums = [f"{sha256(file)}  {file.relative_to(OUT)}" for file in sorted(p for p in OUT.rglob("*") if p.is_file() and p.name != "SHA256SUMS-v2")]
    (OUT / "SHA256SUMS-v2").write_text("\n".join(checksums) + "\n", encoding="utf-8")
    deterministic_zip(OUT, ZIP_OUT)
    print(json.dumps({"directory": str(OUT), "zip": str(ZIP_OUT), "files": sum(1 for p in OUT.rglob('*') if p.is_file()), "zipBytes": ZIP_OUT.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
