import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.scientific_qa_corrections import corrected_crism_manifest, validate_archive_checksums


class ScientificQACorrectionTests(unittest.TestCase):
    def test_crism_checksum_paths_are_archive_relative_and_strictly_validated(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payload = b"crism metadata"
            archive = root / "crism.zip"
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr("source/product.lbl", payload)
            manifest = {"checksums": {"product.lbl": hashlib.sha256(payload).hexdigest()}}
            corrected = corrected_crism_manifest(manifest, ["source/product.lbl"])
            self.assertEqual(corrected["checksums"], {"source/product.lbl": manifest["checksums"]["product.lbl"]})
            result = validate_archive_checksums(archive, corrected)
            self.assertTrue(result[0]["match"])

    def test_checksum_correction_rejects_ambiguous_basename(self):
        manifest = {"checksums": {"product.lbl": "0" * 64}}
        with self.assertRaisesRegex(ValueError, "not uniquely resolvable"):
            corrected_crism_manifest(manifest, ["source/product.lbl", "derived/product.lbl"])


if __name__ == "__main__":
    unittest.main()
