import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.pds_quantitative_adapter import (
    PdsQuantitativeValidationError,
    stage_crism,
    stage_pixl,
)


CRISM_LABEL = """<Product_Observational>
  <Identification_Area>
    <logical_identifier>urn:nasa:pds:mro_crism_mrdr:synthetic_jezero</logical_identifier>
    <version_id>1.0</version_id>
  </Identification_Area>
  <Observation_Area>
    <instrument>CRISM</instrument><unit>I/F</unit><missing_constant>-9999</missing_constant>
    <coordinate_system>mars-equirectangular-local</coordinate_system>
    <processing_level>MRDR map-projected</processing_level>
    <west_bound>77.4</west_bound><east_bound>77.6</east_bound>
    <south_bound>18.3</south_bound><north_bound>18.6</north_bound>
  </Observation_Area>
</Product_Observational>"""

PIXL_LABEL = CRISM_LABEL.replace(
    "urn:nasa:pds:mro_crism_mrdr:synthetic_jezero", "urn:nasa:pds:mars2020_pixl:synthetic_dourbes"
).replace("CRISM", "PIXL").replace("I/F", "wt%").replace("MRDR map-projected", "calibrated elemental abundance")

AUTHENTIC_CRISM_LABEL = """<Product_Observational xmlns:cart="urn:nasa:pds:cart">
  <Identification_Area><logical_identifier>urn:nasa:pds:mro_crism_mtrdr:data_mtrdr:hrl000040ff_07_if183j_mtr3</logical_identifier><version_id>1.0</version_id></Identification_Area>
  <Observation_Area><Time_Coordinates><start_date_time>2007-01-29T10:48:10Z</start_date_time><stop_date_time>2007-01-29T10:50:17Z</stop_date_time></Time_Coordinates>
    <Investigation_Area><Internal_Reference><lid_reference>urn:nasa:pds:context:instrument:crism.mro</lid_reference></Internal_Reference></Investigation_Area>
    <cart:Bounding_Coordinates><cart:west_bounding_coordinate>77.2</cart:west_bounding_coordinate><cart:east_bounding_coordinate>77.6</cart:east_bounding_coordinate><cart:south_bounding_coordinate>18.2</cart:south_bounding_coordinate><cart:north_bounding_coordinate>18.8</cart:north_bounding_coordinate></cart:Bounding_Coordinates>
  </Observation_Area><File_Area_Observational><Special_Constants><missing_constant>65535</missing_constant></Special_Constants></File_Area_Observational>
</Product_Observational>"""

AUTHENTIC_PIXL_LABEL = """<Product_Observational>
  <Identification_Area><logical_identifier>urn:nasa:pds:shumway_m2020_pixl_regolith:data:table_s3_oxides_bulksum</logical_identifier><version_id>1.0</version_id></Identification_Area>
  <Observation_Area><Time_Coordinates><start_date_time>2022-10-04T17:23:41Z</start_date_time><stop_date_time>2022-10-29T00:00:00Z</stop_date_time></Time_Coordinates>
    <Observing_System><Observing_System_Component><name>Planetary Instrument for X-ray Lithochemistry (PIXL)</name><Internal_Reference><lid_reference>urn:nasa:pds:context:instrument:mars2020.pixl</lid_reference></Internal_Reference></Observing_System_Component></Observing_System>
  </Observation_Area><File_Area_Observational><Table_Character><records>11</records><fields>52</fields></Table_Character></File_Area_Observational>
</Product_Observational>"""


def write_fixture(root: Path, label: str, data: str, name: str = "measurements.csv") -> tuple[Path, Path]:
    label_path = root / "product.xml"
    data_path = root / name
    label_path.write_text(label, encoding="utf-8")
    data_path.write_text(data, encoding="utf-8")
    return label_path, data_path


class QuantitativeAdapterTests(unittest.TestCase):
    def test_authentic_crism_schema_is_normalized(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            label, data = write_fixture(root, AUTHENTIC_CRISM_LABEL, "band,wavelength_nm,if_value,preliminary_valid\n1,436.13,0.1,True\n2,442.63,65535,False\n")
            result = stage_crism(label_path=label, data_path=data, output=root / "crism", source_url="https://pds.example/crism")
            measurements = json.loads((root / "crism" / "measurements.json").read_text())
            self.assertEqual(result["measurements"]["count"], 2)
            self.assertEqual(measurements[0]["sourceFields"], {"wavelength": "wavelength_nm", "value": "if_value"})
            self.assertFalse(measurements[1]["valid"])
            self.assertEqual(result["product"]["bounds"]["west"], 77.2)
            self.assertFalse(result["quality"]["coordinatesValidated"])
            self.assertFalse(result["quality"]["coordinatesAvailable"])

    def test_authentic_pixl_wide_schema_normalizes_values_and_missing_uncertainty(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            label, data = write_fixture(root, AUTHENTIC_PIXL_LABEL, "Regolith Component,Total,SiO2,SiO2_err\nOlivine,103.5,37.52,1.88\n")
            result = stage_pixl(label_path=label, data_path=data, output=root / "pixl", source_url="https://pds.example/pixl")
            measurements = json.loads((root / "pixl" / "measurements.json").read_text())
            self.assertEqual(result["measurements"]["count"], 1)
            self.assertEqual(measurements[0]["component"], "Olivine")
            self.assertEqual(measurements[0]["element"], "SiO2")
            self.assertEqual(measurements[0]["uncertainty"], 1.88)
            self.assertIsNone(result["product"]["bounds"])
            self.assertFalse(result["quality"]["coordinatesValidated"])
            self.assertFalse(result["quality"]["coordinatesAvailable"])

    def test_crism_staging_is_deterministic_and_preserves_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            label, data = write_fixture(root, CRISM_LABEL, "wavelength,value,longitude,latitude\n1.0,0.12,77.5,18.4\n2.0,-9999,77.5,18.4\n")
            output_a = root / "a"
            output_b = root / "b"
            kwargs = dict(label_path=label, data_path=data, source_url="https://pds.example/crism", expected_data_sha256=hashlib.sha256(data.read_bytes()).hexdigest(), expected_label_sha256=hashlib.sha256(label.read_bytes()).hexdigest())
            first = stage_crism(output=output_a, **kwargs)
            second = stage_crism(output=output_b, **kwargs)
            self.assertEqual(first, second)
            self.assertEqual(json.loads((output_a / "measurements.json").read_text())[1]["valid"], False)
            self.assertTrue(first["quality"]["checksumVerified"])
            self.assertTrue(first["quality"]["coordinatesAvailable"])
            self.assertTrue(first["quality"]["coordinatesValidated"])

    def test_rejects_product_identifier_mismatch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            label, data = write_fixture(root, CRISM_LABEL.replace("mro_crism_mrdr", "not_crism"), "wavelength,value\n1,0.1\n")
            with self.assertRaisesRegex(PdsQuantitativeValidationError, "identifier"):
                stage_crism(label_path=label, data_path=data, output=root / "out", source_url="https://pds.example/crism")

    def test_rejects_invalid_units_and_missing_nodata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bad_units = CRISM_LABEL.replace("<unit>I/F</unit>", "<unit>degrees Celsius</unit>")
            label, data = write_fixture(root, bad_units, "wavelength,value\n1,0.1\n")
            with self.assertRaisesRegex(PdsQuantitativeValidationError, "units"):
                stage_crism(label_path=label, data_path=data, output=root / "units", source_url="https://pds.example/crism")
            no_nodata = CRISM_LABEL.replace("<missing_constant>-9999</missing_constant>", "")
            label.write_text(no_nodata, encoding="utf-8")
            with self.assertRaisesRegex(PdsQuantitativeValidationError, "nodata"):
                stage_crism(label_path=label, data_path=data, output=root / "nodata", source_url="https://pds.example/crism")

    def test_rejects_checksum_and_coordinate_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            label, data = write_fixture(root, CRISM_LABEL, "wavelength,value,longitude,latitude\n1,0.1,78,18.4\n")
            with self.assertRaisesRegex(PdsQuantitativeValidationError, "checksum"):
                stage_crism(label_path=label, data_path=data, output=root / "checksum", source_url="https://pds.example/crism", expected_data_sha256="0" * 64)
            with self.assertRaisesRegex(PdsQuantitativeValidationError, "outside"):
                stage_crism(label_path=label, data_path=data, output=root / "bounds", source_url="https://pds.example/crism")

    def test_pixl_requires_uncertainty_and_preserves_target_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            label, data = write_fixture(root, PIXL_LABEL, "element,value,uncertainty,longitude,latitude,sol,observationTime\nMg,12.4,0.8,77.5,18.4,400,2022-03-01T00:00:00Z\n")
            result = stage_pixl(label_path=label, data_path=data, output=root / "pixl", source_url="https://pds.example/pixl")
            measurement = json.loads((root / "pixl" / "measurements.json").read_text())[0]
            self.assertEqual(result["product"]["instrument"], "PIXL")
            self.assertEqual(measurement["uncertainty"], 0.8)
            self.assertEqual(measurement["sol"], 400)
            data.write_text("element,value,uncertainty\nMg,12.4,\n", encoding="utf-8")
            with self.assertRaisesRegex(PdsQuantitativeValidationError, "uncertainty"):
                stage_pixl(label_path=label, data_path=data, output=root / "missing-uncertainty", source_url="https://pds.example/pixl")

    def test_rejects_unknown_binary_measurement_layout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            label, data = write_fixture(root, CRISM_LABEL, "\x00\x01", name="product.img")
            with self.assertRaisesRegex(PdsQuantitativeValidationError, "binary layout"):
                stage_crism(label_path=label, data_path=data, output=root / "binary", source_url="https://pds.example/crism")


if __name__ == "__main__":
    unittest.main()
