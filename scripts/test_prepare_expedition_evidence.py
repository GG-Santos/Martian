import importlib.util
from pathlib import Path
import unittest

class EvidenceTests(unittest.TestCase):
    def test_quality_gaps_and_units(self):
        spec = importlib.util.spec_from_file_location('evidence', Path(__file__).with_name('prepare_expedition_evidence.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        ats = [{'LMST': '00119M12:00:00.000', 'ATS_LOCAL_TEMP1': '273.15'}]
        ps = [{'LMST': '00119M12:00:01.000', 'BAROCAP1_PRESSURE': '750'}]
        ws = [{'LMST': '00119M12:00:02.000', 'BOOM1_HORIZONTAL_WIND_SPEED': '0', 'BOOM1_ALG_STATE_STABLE': '1', 'ROVER_STILL': '1'},
              {'LMST': '00119M15:00:02.000', 'BOOM1_HORIZONTAL_WIND_SPEED': '9', 'BOOM1_ALG_STATE_STABLE': '0', 'ROVER_STILL': '1'}]
        rows = m.select_weather_rows(ats, ps, ws)
        noon = next(r for r in rows if r['hour'] == 12)
        self.assertEqual(noon['temperatureC'], 0)
        self.assertEqual(noon['pressurePa'], 750)
        self.assertEqual(noon['windMps'], 0)
        self.assertEqual(noon['times']['windMps'], '00119M12:00:02.000')
        self.assertIsNone(next(r for r in rows if r['hour'] == 15)['windMps'])
        self.assertIsNone(rows[0]['temperatureC'])
        self.assertIsNone(m.value({'speed': '999999999'}, 'speed'))
        self.assertEqual(m.value({'speed': '0'}, 'speed'), 0)

if __name__ == '__main__':
    unittest.main()
