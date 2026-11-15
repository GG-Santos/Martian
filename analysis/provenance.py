"""Reproducibility metadata for analysis reports."""

from __future__ import annotations

import platform
import sys
from datetime import datetime, timezone
from typing import Any

import numpy as np


def environment() -> dict[str, Any]:
    return {
        "timestampUtc": datetime.now(timezone.utc).isoformat(),
        "python": sys.version,
        "platform": platform.platform(),
        "numpy": np.__version__,
    }


def report_metadata(dataset: Any) -> dict[str, Any]:
    return {
        "environment": environment(),
        "datasetId": dataset.manifest["datasetId"],
        "sourceCrs": dataset.manifest.get("sourceCrs"),
        "verticalDatum": dataset.manifest.get("verticalDatum"),
        "assetHashes": dataset.manifest.get("assets", {}),
        "processing": dataset.manifest.get("processing"),
    }
