"""Shared safety and reproducibility helpers for scientific export builders."""

from __future__ import annotations

import hashlib
import os
import stat
import zipfile
from pathlib import Path, PurePosixPath
from typing import Iterable, Mapping

MAX_ARCHIVE_MEMBERS = 64
MAX_ARCHIVE_BYTES = 100 * 1024 * 1024


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_allowlist(source: Path, target: Path, relative_files: Iterable[str]) -> None:
    """Copy exactly the approved relative files and reject missing/extra paths."""
    names = tuple(relative_files)
    if len(set(names)) != len(names):
        raise ValueError("Duplicate file in approved export manifest")
    source = source.resolve()
    for name in names:
        relative = PurePosixPath(name)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"Unsafe approved path: {name}")
        source_path = source.joinpath(*relative.parts)
        if not source_path.is_file() or source_path.is_symlink():
            raise FileNotFoundError(f"Required approved input is missing: {source_path}")
        destination = target.joinpath(*relative.parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source_path.read_bytes())


def secure_extract_zip(
    source: Path,
    target: Path,
    expected_files: Iterable[str],
    *,
    max_members: int = MAX_ARCHIVE_MEMBERS,
    max_bytes: int = MAX_ARCHIVE_BYTES,
) -> None:
    """Extract a fixed, bounded archive without permitting ZIP path escapes."""
    expected = set(expected_files)
    target = target.resolve()
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        members = archive.infolist()
        if len(members) > max_members:
            raise ValueError("Archive contains too many members")
        seen: set[str] = set()
        total = 0
        for member in members:
            raw_name = member.filename.replace("\\", "/")
            relative = PurePosixPath(raw_name)
            if not raw_name or "\x00" in raw_name or relative.is_absolute() or ".." in relative.parts:
                raise ValueError(f"Unsafe ZIP member path: {member.filename!r}")
            normalized = relative.as_posix().rstrip("/")
            if not normalized or normalized in seen:
                raise ValueError(f"Duplicate or conflicting ZIP member: {member.filename!r}")
            seen.add(normalized)
            mode = (member.external_attr >> 16) & 0o170000
            if mode and mode != stat.S_IFREG and mode != stat.S_IFDIR:
                raise ValueError(f"ZIP member is not a regular file or directory: {member.filename!r}")
            if member.is_dir():
                continue
            total += member.file_size
            if total > max_bytes:
                raise ValueError("Archive exceeds the uncompressed size limit")
            destination = (target / Path(*relative.parts)).resolve()
            try:
                destination.relative_to(target)
            except ValueError as error:
                raise ValueError(f"ZIP member escapes extraction directory: {member.filename!r}") from error
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as input_stream, destination.open("wb") as output_stream:
                while chunk := input_stream.read(1024 * 1024):
                    output_stream.write(chunk)
    files = {path.relative_to(target).as_posix() for path in target.rglob("*") if path.is_file()}
    if files != expected:
        raise ValueError(f"Archive contents differ from the approved manifest: {sorted(files ^ expected)}")


def verify_checksums(root: Path, checksums: Mapping[str, str]) -> None:
    """Verify manifest hashes using exact archive-relative paths."""
    for relative, expected in checksums.items():
        path = root.joinpath(*PurePosixPath(relative).parts)
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"Checksum validation failed for {relative}")


def verify_sha256sums(manifest: Path, root: Path) -> None:
    """Verify a conventional sha256sum file without trusting paths outside root."""
    checksums: dict[str, str] = {}
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        digest, name = line.split(None, 1)
        relative = Path(name.strip().lstrip("*"))
        path = relative if relative.is_absolute() else root / relative
        path = path.resolve()
        try:
            path.relative_to(root.resolve())
        except ValueError as error:
            raise ValueError(f"Checksum manifest path escapes its root: {name}") from error
        checksums[str(path.relative_to(root.resolve()))] = digest
    verify_checksums(root.resolve(), checksums)


def deterministic_zip(source_dir: Path, destination: Path) -> None:
    """Write a stable ZIP with normalized timestamps, permissions, and ordering."""
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(p for p in source_dir.rglob("*") if p.is_file()):
            relative = path.relative_to(source_dir).as_posix()
            info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())


def assert_no_private_names(root: Path) -> None:
    blocked = {".env", ".env.local", ".aws", ".ssh", "credentials"}
    for path in root.rglob("*"):
        if path.name in blocked or path.suffix in {".pem", ".key"}:
            raise ValueError(f"Refusing to export private file: {path}")
