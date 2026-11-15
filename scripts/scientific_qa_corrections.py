"""Pure helpers for versioned scientific QA corrections."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path
from typing import Any


def corrected_crism_manifest(manifest: dict[str, Any], archive_names: list[str]) -> dict[str, Any]:
    """Return a copy whose checksum keys are exact archive-relative paths."""

    result = json.loads(json.dumps(manifest))
    names_by_basename: dict[str, list[str]] = {}
    for name in archive_names:
        names_by_basename.setdefault(Path(name).name, []).append(name)
    corrected: dict[str, str] = {}
    for basename, digest in manifest.get("checksums", {}).items():
        candidates = names_by_basename.get(basename, [])
        if len(candidates) != 1:
            raise ValueError(f"Checksum path is not uniquely resolvable: {basename}")
        corrected[candidates[0]] = digest
    result["checksums"] = corrected
    result["checksumPathConvention"] = "archive-relative POSIX paths"
    return result


def validate_archive_checksums(archive_path: Path, manifest: dict[str, Any]) -> list[dict[str, Any]]:
    """Validate only exact archive-relative checksum paths; no basename fallback."""

    results = []
    with zipfile.ZipFile(archive_path) as archive:
        names = set(archive.namelist())
        for name, expected in manifest.get("checksums", {}).items():
            if name not in names:
                raise ValueError(f"Manifest checksum path is absent from archive: {name}")
            actual = hashlib.sha256(archive.read(name)).hexdigest()
            results.append({"path": name, "expected": expected, "actual": actual, "match": actual == expected})
    return results
