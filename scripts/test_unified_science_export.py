from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.export_builder_utils import deterministic_zip, secure_extract_zip


class ExportBuilderSafetyTests(unittest.TestCase):
    def test_rejects_zip_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive_path = root / "unsafe.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("../outside.txt", "blocked")
            with self.assertRaises(ValueError):
                secure_extract_zip(archive_path, root / "out", ("outside.txt",))

    def test_rejects_symlink_member(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive_path = root / "unsafe.zip"
            info = zipfile.ZipInfo("link")
            info.external_attr = 0o120777 << 16
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr(info, "/etc/passwd")
            with self.assertRaises(ValueError):
                secure_extract_zip(archive_path, root / "out", ("link",))

    def test_deterministic_zip_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = root / "first"
            second = root / "second"
            first.mkdir()
            second.mkdir()
            (first / "b.txt").write_text("B")
            (first / "a.txt").write_text("A")
            (second / "a.txt").write_text("A")
            (second / "b.txt").write_text("B")
            deterministic_zip(first, root / "first.zip")
            deterministic_zip(second, root / "second.zip")
            self.assertEqual((root / "first.zip").read_bytes(), (root / "second.zip").read_bytes())


if __name__ == "__main__":
    unittest.main()
