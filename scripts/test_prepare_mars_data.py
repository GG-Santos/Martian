import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np


def load_preparer():
    spec = importlib.util.spec_from_file_location('prepare', Path(__file__).with_name('prepare_mars_data.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PackageVerificationTests(unittest.TestCase):
    def test_meter_tiles_share_registered_sample_coordinates(self):
        from rasterio.io import MemoryFile
        from rasterio.transform import from_origin
        module = load_preparer()
        with tempfile.TemporaryDirectory() as temp, MemoryFile() as memory:
            with memory.open(driver='GTiff', width=2052, height=2052, count=1,
                             dtype='float32', crs='EPSG:32631',
                             transform=from_origin(-2.5, 2050.5, 1, 1)) as dataset:
                x = np.arange(2052, dtype='float32') - 2
                dataset.write(np.tile(x, (2052, 1)), 1)
                tiles = module.package_detail_tiles(dataset, Path(temp), 0, 2048)
                for tile in tiles:
                    g = tile['grid']
                    fine = np.fromfile(Path(temp)/tile['asset'], dtype='<f4').reshape(513,513)
                    overview = module.sample_relief(dataset, g['westM'], g['northM'], 512, 129)
                    self.assertTrue(np.isfinite(fine).all())
                    np.testing.assert_allclose(fine[::4,::4], overview, atol=1e-4)
                    self.assertAlmostEqual(float(fine[256,256]), g['westM']+256, places=3)

    def test_detail_and_analysis_share_crop_centers(self):
        from rasterio.io import MemoryFile
        from rasterio.transform import from_origin

        module = load_preparer()
        with MemoryFile() as memory:
            with memory.open(driver='GTiff', width=260, height=260, count=1,
                             dtype='float32', crs='EPSG:32631',
                             transform=from_origin(-16, 2064, 8, 8)) as dataset:
                ramp = np.arange(-12, 2068, 8, dtype='float32')
                dataset.write(np.tile(ramp, (260, 1)), 1)
                detail = module.sample_relief(dataset, 0, 2048, 2048, 513)
                analysis = module.sample_relief(dataset, 0, 2048, 2048, 257)
        self.assertEqual(detail.shape, (513, 513))
        np.testing.assert_allclose(detail[[0, -1]][:, [0, -1]], [[0, 2048], [0, 2048]])
        np.testing.assert_allclose(detail[::2, ::2], analysis)

    def test_json_assets_have_platform_independent_utf8_lf_bytes(self):
        module = load_preparer()
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'mission.json'
            module.write_json(path, {'title': 'Jezero', 'stops': []})
            self.assertEqual(path.read_bytes(), b'{\n  "title": "Jezero",\n  "stops": []\n}')

    def test_rejects_corrupted_height_bytes(self):
        # Removing the byte-length/hash guard must break this test.
        module = load_preparer()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'heights.f32').write_bytes(b'broken')
            (root / 'manifest.json').write_text(json.dumps({'grid': {'width': 2, 'height': 2, 'cellSizeM': 10}, 'assets': {}, 'layers': []}))
            with self.assertRaisesRegex(ValueError, 'height byte'):
                module.verify(root)


if __name__ == '__main__':
    unittest.main()
