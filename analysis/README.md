# Earthapps Colab research workflow

This directory contains CPU-compatible, reproducible analysis tools for the bundled Jezero dataset. It does not change the Next.js application or production assets.

## Colab setup

The workflow is designed for a private repository without exposing GitHub credentials.

1. In Colab, use the file upload control or mount Google Drive containing a local Earthapps checkout.
2. Do not paste a GitHub personal access token into the notebook.
3. Set `REPO_ROOT` to the uploaded or Drive-mounted checkout, for example:

```python
from pathlib import Path
REPO_ROOT = Path('/content/Earthapps')
DATA_ROOT = REPO_ROOT / 'public' / 'data' / 'jezero'
OUTPUT_ROOT = REPO_ROOT / 'analysis' / 'outputs'
```

4. Install only the analysis dependencies in a Colab cell when approved:

```python
%pip install -r /content/Earthapps/analysis/requirements-colab.txt
```

The notebook never downloads scientific data. It reads the existing manifest, binaries, and provenance files from the checkout.

## Outputs

Generated files belong under `analysis/outputs/` only:

- `quality-report.json`
- `slope-comparison.json`
- `hazard-comparison.json`
- `route-cost-comparison.json`
- `provenance.json`
- PNG maps and plots

These are research artifacts and are not consumed by the application unless separately approved.

## Experiments

The notebook runs dataset integrity, baseline slope reproduction, Horn slope sensitivity, four- versus eight-neighbor hazards, route-cost sensitivity, cross-layer registration checks, and runtime/memory observations. Each result records assumptions and limitations. No accuracy or confidence score is invented without independent validation data.

## Local tests

Tests use synthetic grids and do not require the Mars assets. They should be run only after approval:

```powershell
python -m unittest discover -s analysis/tests -p "test_*.py" -v
```
