import csv
import tempfile
import unittest
from pathlib import Path

from scripts.pds_remaining_adapter import (
    ScientificValidationError,
    validate_meda,
    validate_rad,
    validate_themis,
)


MEDA_LABEL = """<Product_Observational><logical_identifier>urn:nasa:pds:mars2020_meda:test</logical_identifier><version_id>1.0</version_id><processing_level>Calibrated</processing_level><unit>kelvin</unit></Product_Observational>"""
THEMIS_LABEL = """<Product_Observational><logical_identifier>urn:nasa:pds:ody.themis.sdp:data_irbtr:i98521009btr</logical_identifier><version_id>1.0</version_id><unit>Kelvin</unit><data_type>UnsignedByte</data_type></Product_Observational>"""
RAD_LABEL = '''DATA_SET_ID = "MSL-M-RAD-3-RDR-V1.0"\nPRODUCT_ID = "RAD_RDR_2013_284_02_54_0420_V00"\nUNIT = "microGray / Hour"\n'''
RAD_DATA = '''[OBSERVATION: 00]\nQC=00000000\n\n[DOSIMETRY_TOTAL_DOSE_B: 00]\n\n9.47510\n\n[DOSIMETRY_TOTAL_DOSE_E: 00]\n\n8.74758\n'''


class RemainingPdsAdapterTests(unittest.TestCase):
    def test_meda_validates_expected_fields_and_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "ats.csv"
            label = root / "ats.xml"
            label.write_text(MEDA_LABEL)
            with data.open("w", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=["SCLK", "LMST", "ATS_LOCAL_TEMP1"])
                writer.writeheader()
                writer.writerow({"SCLK": "1", "LMST": "00001M00:00:00", "ATS_LOCAL_TEMP1": "210.2"})
            result = validate_meda(data, label, "ATS")
            self.assertEqual(result["rows"], 1)
            self.assertEqual(result["numeric"]["ATS_LOCAL_TEMP1"]["finite"], 1)
            self.assertEqual(result["missingValues"]["ATS_LOCAL_TEMP1"], 0)
            self.assertEqual(result["sclkGaps"], [])

    def test_meda_rejects_missing_channel_field(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "ats.csv"
            label = root / "ats.xml"
            label.write_text(MEDA_LABEL)
            data.write_text("SCLK,LMST\n1,00001M00:00:00\n")
            with self.assertRaises(ScientificValidationError):
                validate_meda(data, label, "ATS")

    def test_themis_checks_identifier_type_and_unit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "I98521009BTR.IMG"
            label = root / "I98521009BTR.xml"
            data.write_bytes(b"image")
            label.write_text(THEMIS_LABEL)
            result = validate_themis(data, label)
            self.assertEqual(result["missingConstant"], 0)
            self.assertEqual(result["scalingFactor"], 0.051)

    def test_rad_preserves_context_and_product_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "rad.txt"
            label = root / "rad.lbl"
            data.write_text(RAD_DATA)
            label.write_text(RAD_LABEL)
            result = validate_rad(data, label)
            self.assertIn("Gale Crater", result["context"])
            self.assertEqual(result["startSol"], "0420")
            self.assertEqual(result["classification"], "NON_JEZERO_CONTEXT")
            self.assertEqual(result["observationCount"], 1)
            self.assertEqual(result["doseBValidCount"], 1)
            self.assertEqual(result["doseEValidCount"], 1)
            self.assertEqual(result["observations"][0]["qc"], "00000000")

    def test_rad_rejects_malformed_dose_record(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "rad.txt"
            label = root / "rad.lbl"
            data.write_text(RAD_DATA.replace("9.47510", "not-a-number"))
            label.write_text(RAD_LABEL)
            with self.assertRaisesRegex(ScientificValidationError, "Malformed RAD Dose B"):
                validate_rad(data, label)

    def test_meda_preserves_missing_wind_and_quality_flags(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "ws.csv"
            label = root / "ws.xml"
            label.write_text(MEDA_LABEL)
            data.write_text(
                "SCLK,LMST,BOOM1_HORIZONTAL_WIND_SPEED,BOOM1_ALG_STATE_STABLE,BOOM2_ALG_STATE_STABLE,ROVER_STILL\n"
                "1,00001M00:00:00,1.2,1,1,1\n"
                "4,00001M00:00:03,,0,1,0\n"
            )
            result = validate_meda(data, label, "WS")
            self.assertEqual(result["missingValues"]["BOOM1_HORIZONTAL_WIND_SPEED"], 1)
            self.assertEqual(result["sclkGaps"][0]["missingOneHzSamples"], 2)
            self.assertEqual(result["qualityFlags"]["ROVER_STILL"]["zeros"], 1)


if __name__ == "__main__":
    unittest.main()
