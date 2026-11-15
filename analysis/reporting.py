"""Colab-friendly report serialization and plotting helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np


def json_safe(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        return None
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    return value


def write_report(path: str | Path, report: dict[str, Any]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(json_safe(report), indent=2, allow_nan=False) + "\n", encoding="utf-8")


def save_map(path: str | Path, values: np.ndarray, title: str, cmap: str = "viridis", extent: tuple[float, float, float, float] | None = None) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(8, 6), constrained_layout=True)
    image = ax.imshow(values, origin="upper", cmap=cmap, extent=extent)
    ax.set(title=title, xlabel="Local east (m)", ylabel="Local north (m)")
    fig.colorbar(image, ax=ax)
    fig.savefig(path, dpi=150)
    plt.close(fig)
