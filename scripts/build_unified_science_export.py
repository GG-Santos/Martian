"""Build a self-contained, reproducible Colab export from staged science assets."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "earthapps staging" / "colab_unified_nasa_v1"
ZIP_OUT = ROOT / "earthapps staging" / "earthapps_unified_nasa_analysis_v1.zip"
sys.path.insert(0, str(ROOT))

from analysis.io import load_jezero
from analysis.route_terrain import analyze_route
from analysis.terrain_metrics import quality_report
from scripts.export_builder_utils import (
    assert_no_private_names,
    copy_allowlist,
    deterministic_zip,
    secure_extract_zip,
    sha256,
    verify_checksums,
    verify_sha256sums,
)

JEZERO_FILES = (
    "atlas/chemical.webp", "atlas/geophysical.webp", "atlas/radiation.webp", "atlas/spectral.webp",
    "detail-a.f32", "detail-b.f32", "detail-c.f32", "expedition-evidence.json", "heights.f32",
    "manifest.json", "mission.json", "optical.webp", "overview.webp", "regional-panorama.webp",
    "relief.f32", "scenario.json", "science-atlas.json", "slope.u8", "slope.webp", "thermal.u8", "thermal.webp",
)
CRISM_FILES = (
    "source/hrl000040ff_07_if183j_mtr3.xml", "source/hrl000040ff_07_if183j_mtr3.lbl", "source/hrl000040ff_07_if183j_mtr3.hdr",
    "source/hrl000040ff_07_wv183j_mtr3.tab", "source/hrl000040ff_07_wv183j_mtr3.xml", "source/hrl000040ff_07_de183l_mtr1.hdr",
    "source/hrl000040ff_07_de183l_mtr1.lbl", "source/hrl000040ff_07_de183l_mtr1.img", "derived/crism_jezero_spectrum.csv",
    "derived/crism_jezero_spectrum.png", "crism_manifest.json",
)
PIXL_FILES = ("table_s3_oxides_bulksum.csv", "table_s3_oxides_bulksum.xml", "readme.txt", "pixl_jezero_oxide_composition.png", "pixl_manifest.json")
MEDA_FILES = (
    "WE__0180___________CAL_ATS_________________P02.CSV", "WE__0180___________CAL_ATS_________________P02.xml",
    "WE__0180___________CAL_PS__________________P03.CSV", "WE__0180___________CAL_PS__________________P03.xml",
    "WE__0180___________CAL_WS__________________P03.CSV", "WE__0180___________CAL_WS__________________P03.xml",
)
THEMIS_FILES = ("I98521009BTR.IMG", "I98521009BTR.xml")
RAD_FILES = ("RAD_RDR_2013_284_02_54_0420_V00.LBL", "RAD_RDR_2013_284_02_54_0420_V00.TXT")
RIMFAX_FILES = ("radargram.json", "rimfax_calibrated_00010.csv", "rimfax_calibrated_00010.xml")
CRISM_VERIFICATION_FILES = ("checkpoint.json", "range-requests.tsv", "source-values.json", "source_pixel_values.csv", "source_pixel_values.f32", "verification-report.json")
ANALYSIS_FILES = ("__init__.py", "io.py", "registration.py", "route_terrain.py", "schema.py", "terrain_metrics.py")
SCRIPT_FILES = ("pds_quantitative_adapter.py", "pds_remaining_adapter.py", "verify_crism_source.py")


def copy_files(source: Path, target: Path, names: tuple[str, ...]) -> None:
    copy_allowlist(source, target, names)


def extract_verified(source: Path, target: Path, names: tuple[str, ...]) -> None:
    secure_extract_zip(source, target, names)
    manifest_name = "crism_manifest.json" if source.name.endswith("crism_verified.zip") else "pixl_manifest.json"
    manifest = json.loads((target / manifest_name).read_text(encoding="utf-8"))
    checksums = {}
    for key, value in manifest.get("checksums", {}).items():
        matches = list(target.rglob(Path(key).name))
        if len(matches) != 1:
            raise ValueError(f"Checksum path is ambiguous or missing: {key}")
        checksums[str(matches[0].relative_to(target))] = value
    verify_checksums(target, checksums)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def build_notebook(path: Path) -> None:
    cells = [
        {"cell_type": "markdown", "metadata": {}, "source": [
            "# Earthapps unified NASA scientific analysis V1 (historical)\n",
            "This notebook reproduces the supplied Earthapps terrain and staged NASA analyses. "
            "Observed, derived, contextual, and simulated values remain explicitly classified.\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "from pathlib import Path\n",
            "import csv, json, struct, hashlib, zipfile\n",
            "import numpy as np\n",
            "import matplotlib.pyplot as plt\n",
            "from analysis.io import load_jezero\n",
            "from analysis.terrain_metrics import quality_report\n",
            "from analysis.route_terrain import analyze_route\n",
            "ROOT = Path.cwd()\n",
            "jezero = load_jezero(ROOT / 'data' / 'jezero', verify_hashes=True)\n",
            "print(jezero.manifest['datasetId'], jezero.analysis_grid.__dict__)\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "terrain = quality_report(jezero)\n",
            "mission = json.loads((ROOT / 'data' / 'jezero' / 'mission.json').read_text())\n",
            "route = analyze_route(jezero, [(node['point']['x'], node['point']['y']) for node in mission['presetNodes']], route_label='Earthapps preset route')\n",
            "json.dumps({'terrain': terrain, 'route': route['totals']}, indent=2)\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "fig, axes = plt.subplots(1, 3, figsize=(15, 4))\n",
            "axes[0].imshow(jezero.heights_m, cmap='terrain'); axes[0].set_title('HiRISE elevation (m)')\n",
            "axes[1].imshow(jezero.slope_deg, cmap='magma'); axes[1].set_title('Derived slope (deg)')\n",
            "axes[2].imshow(jezero.relief_m, cmap='viridis'); axes[2].set_title('HiRISE relief (m)')\n",
            "plt.tight_layout(); plt.show()\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "crism = list(csv.DictReader((ROOT / 'data/nasa/crism/derived/crism_jezero_spectrum.csv').open()))\n",
            "wavelength = np.array([float(row['wavelength_nm']) for row in crism])\n",
            "if_value = np.array([float(row['if_value']) for row in crism])\n",
            "plt.figure(figsize=(10, 4)); plt.plot(wavelength, if_value); plt.xlabel('Wavelength (nm)'); plt.ylabel('I/F'); plt.title('CRISM verified 489-band spectrum'); plt.show()\n",
            "print('bands:', len(crism), 'classification: LOCATION_UNVERIFIED')\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "pixl = list(csv.DictReader((ROOT / 'data/nasa/pixl/table_s3_oxides_bulksum.csv').open()))\n",
            "oxide_fields = [name for name in pixl[0] if name not in {'Regolith Component', 'Total'} and not name.endswith('_err')]\n",
            "means = [np.mean([float(row[name]) for row in pixl]) for name in oxide_fields]\n",
            "plt.figure(figsize=(12, 4)); plt.bar(oxide_fields, means); plt.xticks(rotation=75, ha='right'); plt.ylabel('Mean wt%'); plt.title('PIXL normalized oxide table (11 components)'); plt.tight_layout(); plt.show()\n",
            "print('components:', len(pixl), 'normalized measurements:', len(pixl) * len(oxide_fields))\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "thermal_path = ROOT / 'data/nasa/themis/I98521009BTR.IMG'\n",
            "thermal_raw = np.fromfile(thermal_path, dtype=np.uint8)\n",
            "thermal_dn = thermal_raw[2240:].reshape(1808, 320)\n",
            "thermal = np.where(thermal_dn != 0, thermal_dn * 0.051 + 205.272, np.nan)\n",
            "plt.figure(figsize=(8, 5)); plt.imshow(thermal, cmap='inferno'); plt.colorbar(label='Brightness temperature (K)'); plt.title('THEMIS calibrated-derived brightness temperature; DN 0 masked'); plt.show()\n",
            "print('valid pixels:', int(np.isfinite(thermal).sum()), 'classification: PLAYABLE_AREA_CANDIDATE; pixel-level coverage unverified')\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "radar = json.loads((ROOT / 'data/nasa/rimfax/radargram.json').read_text())\n",
            "radar_values = np.array([row['samples'] for row in radar['rows']])\n",
            "plt.figure(figsize=(12, 4)); plt.imshow(radar_values, aspect='auto', cmap='gray'); plt.xlabel('Sample index'); plt.ylabel('Sounding'); plt.title('RIMFAX Sol 10 calibrated radar traces'); plt.show()\n",
            "print('traces:', radar_values.shape[0], 'classification:', radar['classification'], 'depth conversion:', radar['depthConversion'])\n",
        ]},
        {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [
            "provenance = json.loads((ROOT / 'provenance.json').read_text())\n",
            "print(json.dumps(provenance, indent=2))\n",
            "print('MEDA Sol 119 raw files are not present in the repository export; only the existing expedition-evidence summary is included.')\n",
            "print('RAD Sol 420 classification: NON_JEZERO_CONTEXT (Gale Crater / Curiosity).')\n",
        ]},
    ]
    notebook = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python", "version": "3"}}, "nbformat": 4, "nbformat_minor": 5}
    path.write_text(json.dumps(notebook, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if OUT.exists() or ZIP_OUT.exists():
        raise SystemExit("Refusing to overwrite an existing V1 export")
    verify_sha256sums(ROOT / "earthapps staging/nasa_phase_remaining_v1/SHA256SUMS", ROOT)
    verify_sha256sums(ROOT / "earthapps staging/nasa_final_verification_v1/SHA256SUMS", ROOT)
    OUT.mkdir(parents=True)
    data = OUT / "data"
    copy_files(ROOT / "public/data/jezero", data / "jezero", JEZERO_FILES)
    extract_verified(ROOT / "earthapps staging/earthapps_nasa_crism_verified.zip", data / "nasa/crism", CRISM_FILES)
    extract_verified(ROOT / "earthapps staging/earthapps_nasa_pixl_verified.zip", data / "nasa/pixl", PIXL_FILES)
    copy_files(ROOT / "earthapps staging/nasa_phase_remaining_v1/meda_sol180", data / "nasa/meda_sol180", MEDA_FILES)
    copy_files(ROOT / "earthapps staging/nasa_phase_remaining_v1/themis_i98521009btr", data / "nasa/themis", THEMIS_FILES)
    copy_files(ROOT / "earthapps staging/nasa_phase_remaining_v1/rad_sol420", data / "nasa/rad_sol420", RAD_FILES)
    copy_files(ROOT / "earthapps staging/nasa_final_verification_v1/rimfax_sol10", data / "nasa/rimfax", RIMFAX_FILES)
    copy_files(ROOT / "earthapps staging/nasa_final_verification_v1/crism_source_verification", data / "nasa/crism_source_verification", CRISM_VERIFICATION_FILES)
    copy_files(ROOT / "public/data/jezero", data / "nasa", ("expedition-evidence.json",))
    (data / "nasa/meda_sol119_reference.json").write_bytes((data / "nasa/expedition-evidence.json").read_bytes())
    (data / "nasa/expedition-evidence.json").unlink()

    analysis = OUT / "analysis"
    analysis.mkdir()
    (OUT / "scripts").mkdir()
    copy_files(ROOT / "analysis", analysis, ANALYSIS_FILES)
    copy_files(ROOT / "scripts", OUT / "scripts", SCRIPT_FILES)
    assert_no_private_names(OUT)

    dataset = load_jezero(data / "jezero", verify_hashes=True)
    mission = json.loads((data / "jezero/mission.json").read_text())
    terrain = quality_report(dataset)
    route = analyze_route(dataset, [(node["point"]["x"], node["point"]["y"]) for node in mission["presetNodes"]], route_label="Earthapps preset route")
    (OUT / "terrain-summary.json").write_text(json.dumps(terrain, indent=2) + "\n")
    (OUT / "route-analysis.json").write_text(json.dumps(route, indent=2) + "\n")
    (OUT / "scientific-results-summary.md").write_text(
        f"""# Scientific results summary

The authoritative Earthapps Jezero grid is {dataset.analysis_grid.width} x {dataset.analysis_grid.height} at {dataset.analysis_grid.cell_size_m:g} m spacing. The loaded terrain has {terrain['height']['count']} finite elevation cells and {terrain['coverage']['thermalMissingFraction']:.3f} thermal missing fraction under the existing DN contract.

The preset route measures {route['totals']['routeLengthM']:.3f} m total length, {route['totals']['ascentM']:.3f} m ascent, and {route['totals']['descentM']:.3f} m descent. The supplied terrain analysis reports no slope-threshold exposure for this route at the default threshold.

The CRISM source verification contains 489/489 exact value matches from bounded byte-range requests, but geographic registration remains `LOCATION_UNVERIFIED`. PIXL contains 11 archived components and 275 normalized oxide measurements with uncertainties. RIMFAX contains 40 calibrated active soundings and remains `JEZERO_REGIONAL`; travel time is not converted to depth. THEMIS is calibrated-derived brightness temperature and remains `PLAYABLE_AREA_CANDIDATE`. MEDA Sol 180 is preserved without invented coordinates; Sol 119 raw files are unavailable and only the existing evidence summary is included. RAD Sol 420 is `NON_JEZERO_CONTEXT` from Gale Crater.
""",
        encoding="utf-8",
    )

    crism = list(csv.DictReader((data / "nasa/crism/derived/crism_jezero_spectrum.csv").open()))
    wavelengths = np.array([float(row["wavelength_nm"]) for row in crism])
    values = np.array([float(row["if_value"]) for row in crism])
    pixl = list(csv.DictReader((data / "nasa/pixl/table_s3_oxides_bulksum.csv").open()))
    oxide_fields = [name for name in pixl[0] if name not in {"Regolith Component", "Total"} and not name.endswith("_err")]
    fig, axes = plt.subplots(2, 3, figsize=(16, 9))
    axes[0, 0].imshow(dataset.heights_m, cmap="terrain"); axes[0, 0].set_title("HiRISE elevation (m)")
    axes[0, 1].imshow(dataset.slope_deg, cmap="magma"); axes[0, 1].set_title("Derived slope (deg)")
    axes[0, 2].imshow(dataset.relief_m, cmap="viridis"); axes[0, 2].set_title("HiRISE relief (m)")
    axes[1, 0].plot(wavelengths, values); axes[1, 0].set_title("CRISM I/F, 489 bands"); axes[1, 0].set_xlabel("nm")
    axes[1, 1].bar(oxide_fields, [np.mean([float(row[name]) for row in pixl]) for name in oxide_fields]); axes[1, 1].set_title("PIXL mean oxide wt%"); axes[1, 1].tick_params(axis="x", rotation=75, labelsize=7)
    thermal_raw = np.fromfile(data / "nasa/themis/I98521009BTR.IMG", dtype=np.uint8)
    thermal_dn = thermal_raw[2240:].reshape(1808, 320)
    thermal = np.where(thermal_dn != 0, thermal_dn * 0.051 + 205.272, np.nan)
    axes[1, 2].imshow(thermal, cmap="inferno"); axes[1, 2].set_title("THEMIS brightness temperature (K)")
    fig.tight_layout(); fig.savefig(OUT / "scientific-overview.png", dpi=140); plt.close(fig)

    radar = json.loads((data / "nasa/rimfax/radargram.json").read_text())
    radar_values = np.array([row["samples"] for row in radar["rows"]])
    fig, ax = plt.subplots(figsize=(12, 5)); ax.imshow(radar_values, aspect="auto", cmap="gray"); ax.set_title("RIMFAX Sol 10 calibrated radar traces"); ax.set_xlabel("Sample index"); ax.set_ylabel("Sounding"); fig.tight_layout(); fig.savefig(OUT / "rimfax-radargram.png", dpi=140); plt.close(fig)
    fig, ax = plt.subplots(figsize=(10, 4)); ax.plot(wavelengths, values); ax.set(xlabel="Wavelength (nm)", ylabel="I/F", title="CRISM verified single-pixel spectrum"); fig.tight_layout(); fig.savefig(OUT / "crism-spectrum.png", dpi=140); plt.close(fig)

    provenance = {
        "packageId": "earthapps-colab-unified-nasa-v1",
        "status": "reproducible-staged-export",
        "classifications": {"crism": "LOCATION_UNVERIFIED", "rimfax": "JEZERO_REGIONAL", "rad": "NON_JEZERO_CONTEXT", "pixl": "JEZERO_REGIONAL", "medaSol119": "JEZERO_REGIONAL", "medaSol180": "LOCATION_UNVERIFIED", "themis": "PLAYABLE_AREA_CANDIDATE", "hirise": "PLAYABLE_AREA_VERIFIED"},
        "limitations": ["MEDA Sol 119 raw observation files are not available in the repository; the existing evidence summary is preserved.", "CRISM source values are verified but independent geographic pixel registration remains unverified.", "THEMIS pixel-level intersection is not independently verified in this package.", "PIXL coordinates are unavailable and are not assigned to hypothetical mission stops.", "RAD Sol 420 is Gale Crater context only.", "RIMFAX travel time is preserved; no depth conversion is applied.", "Terrain and route calculations use the existing simulated/derived Earthapps grid contract."],
        "sourceFiles": [],
    }
    for file in sorted(p for p in OUT.rglob("*") if p.is_file()):
        provenance["sourceFiles"].append({"path": str(file.relative_to(OUT)), "bytes": file.stat().st_size, "sha256": sha256(file)})
    (OUT / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    (OUT / "README.md").write_text("""# Earthapps unified NASA scientific analysis export\n\nVersion: `earthapps-colab-unified-nasa-v1`\n\nThis package is a reproducible, offline Google Colab reference export assembled from existing Earthapps assets and staged NASA products. It does not download data or activate scanner data.\n\n## Run\n\nOpen `earthapps_unified_nasa_analysis.ipynb` in Google Colab and run all cells from the package root. Colab provides NumPy and Matplotlib. The notebook validates the authoritative Jezero manifest checksums, recomputes terrain and route summaries, and plots the staged CRISM, PIXL, THEMIS, and RIMFAX values.\n\n## Geographic/scientific classifications\n\n- HiRISE terrain: `PLAYABLE_AREA_VERIFIED` under the existing Earthapps grid contract.\n- THEMIS: `PLAYABLE_AREA_CANDIDATE`; calibrated-derived brightness temperature is preserved, but pixel-level intersection is not independently verified here.\n- MEDA Sol 119: `JEZERO_REGIONAL` summary only; raw files are unavailable in this repository export.\n- MEDA Sol 180: `LOCATION_UNVERIFIED`; rover-relative observations are preserved without invented coordinates.\n- CRISM: `LOCATION_UNVERIFIED`; all 489 source values were independently reproduced by bounded HTTP range requests, but source-cube geographic registration remains unverified.\n- PIXL: Jezero regional archived observations; coordinates are unavailable and no hypothetical mission-stop assignment is made.\n- RIMFAX: `JEZERO_REGIONAL`; calibrated traces are preserved and travel time is not converted to depth.\n- RAD Sol 420: `NON_JEZERO_CONTEXT`; Curiosity/Gale Crater only.\n\nAll product identifiers, URLs, labels, checksums, validation reports, and limitations are retained in the included manifests and `provenance.json`.\n""", encoding="utf-8")
    build_notebook(OUT / "earthapps_unified_nasa_analysis.ipynb")
    provenance["sourceFiles"] = [
        {"path": str(file.relative_to(OUT)), "bytes": file.stat().st_size, "sha256": sha256(file)}
        for file in sorted(p for p in OUT.rglob("*") if p.is_file() and p.name != "provenance.json")
    ]
    (OUT / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")

    deterministic_zip(OUT, ZIP_OUT)
    print(json.dumps({"directory": str(OUT), "zip": str(ZIP_OUT), "zipBytes": ZIP_OUT.stat().st_size, "files": sum(1 for p in OUT.rglob('*') if p.is_file())}, indent=2))


if __name__ == "__main__":
    main()
