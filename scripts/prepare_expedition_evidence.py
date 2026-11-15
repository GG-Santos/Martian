"""Package exact, quality-filtered MEDA samples and registered regional context."""
import csv
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

STAGE = Path('.data-staging/expedition')
OUT = Path('public/data/jezero')

def value(row, field):
    try:
        number = float(row[field])
        return number if math.isfinite(number) and -900 < number < 1e8 else None
    except (ValueError, KeyError, TypeError):
        return None

def seconds(row):
    clock = row['LMST'].split('M')[1]
    h, m, s = map(float, clock.split(':'))
    return h*3600 + m*60 + s

def select_weather_rows(ats, ps, ws):
    """One exact sample/channel within ten minutes of each three-hour bin.

    ATS/PS have no per-sample quality flags in these calibrated products.
    WS requires BOOM1_ALG_STATE_STABLE=1 and ROVER_STILL=1.
    Empty numeric cells remain missing. No averages or gap interpolation.
    """
    channels = [
        ('temperatureC', ats, 'ATS_LOCAL_TEMP1'),
        ('pressurePa', ps, 'BAROCAP1_PRESSURE'),
        ('windMps', [r for r in ws if r.get('BOOM1_ALG_STATE_STABLE') == '1'
                    and r.get('ROVER_STILL') == '1'], 'BOOM1_HORIZONTAL_WIND_SPEED')]
    rows = []
    for hour in range(0, 24, 3):
        item = {'hour': hour, 'times': {}}
        for key, samples, field in channels:
            valid = [r for r in samples if value(r, field) is not None
                     and abs(seconds(r)-hour*3600) <= 600]
            nearest = min(valid, key=lambda r: abs(seconds(r)-hour*3600), default=None)
            number = value(nearest, field) if nearest else None
            if number is not None and key == 'temperatureC':
                number = round(number-273.15, 2)
            item[key] = number
            item['times'][key] = nearest['LMST'] if nearest else None
        rows.append(item)
    return rows

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2), encoding='utf-8', newline='\n')

def package_weather():
    base = 'https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/sol_0090_0179/sol_0119/'
    products = []
    data = []
    ns = {'p': 'http://pds.nasa.gov/pds4/pds/v1'}
    for channel in ('ATS', 'PS', 'WS'):
        file = next(STAGE.glob('*CAL_'+channel+'_*.CSV'))
        label = file.with_suffix('.xml')
        root = ET.parse(label).getroot()
        with file.open(newline='') as stream:
            data.append(list(csv.DictReader(stream)))
        products.append({'channel': channel, 'productId': root.findtext('.//p:logical_identifier', namespaces=ns),
                         'file': file.name, 'url': base+file.name, 'label': base+label.name,
                         'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                         'sourceStart': root.findtext('.//p:start_date_time', namespaces=ns),
                         'sourceEnd': root.findtext('.//p:stop_date_time', namespaces=ns)})
    # The SIS excludes lower-level samples where the corresponding derived
    # magnitude is unavailable. Also exclude the archive's numeric fill sentinel.
    for index, channel, field in [(1, 'PS', 'PRESSURE'), (2, 'WS', 'HORIZONTAL_WIND_SPEED')]:
        file = next(STAGE.glob('*DER_'+channel+'_*.CSV'))
        with file.open(newline='') as stream:
            good = {float(r['SCLK']) for r in csv.DictReader(stream) if value(r, field) is not None}
        data[index] = [r for r in data[index] if float(r['SCLK']) in good]
        root = ET.parse(file.with_suffix('.xml')).getroot()
        derived_base = base.replace('data_calibrated_env', 'data_derived_env')
        products.append({'channel': 'Derived '+channel+' availability mask',
                         'productId': root.findtext('.//p:logical_identifier', namespaces=ns),
                         'file': file.name, 'url': derived_base+file.name,
                         'label': derived_base+file.with_suffix('.xml').name,
                         'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                         'sourceStart': root.findtext('.//p:start_date_time', namespaces=ns),
                         'sourceEnd': root.findtext('.//p:stop_date_time', namespaces=ns)})
    return {'sol': 119, 'location': 'Perseverance rover in Jezero crater. Regional observation; not measured at the hypothetical field stations.',
            'sourceTime': '2021-06-20 to 2021-06-21 UTC',
            'units': {'temperatureC': '°C', 'pressurePa': 'Pa', 'windMps': 'm/s'},
            'timeBasis': 'Local mean solar time (LMST) at the rover',
            'method': 'Exact nearest valid sample per channel within ±10 minutes of each 3-hour LMST bin. Channels may have different sample times. Gaps remain unavailable.',
            'quality': 'ATS_LOCAL_TEMP1 (K converted to °C), BAROCAP1_PRESSURE (Pa), BOOM1_HORIZONTAL_WIND_SPEED (m/s), wind only when control algorithm stable and rover still. Pressure/wind require a usable derived sample at the same SCLK, per SIS section 3.3.4. Empty cells and numeric fill sentinels excluded. Calibrated per-detector channels, not derived ambient estimates.',
            'products': products, 'rows': select_weather_rows(*data)}

def package_regional():
    from rasterio.warp import transform
    manifest = json.loads((OUT/'manifest.json').read_text())
    file = STAGE/'M20_traverse.json'
    features = json.loads(file.read_text())['features']
    lines = []
    for feature in features:
        sol = int(feature['properties']['sol'])
        if sol > 690:
            continue
        coords = feature['geometry']['coordinates']
        xs, ys = transform('+proj=longlat +R=3394839.8133163 +no_defs', manifest['sourceCrs'],
                           [p[0] for p in coords], [p[1] for p in coords])
        origin = manifest['localTransform']
        line = []
        for x, y in zip(xs, ys):
            point = [round(x-origin['eastingOriginM'], 2), round(y-origin['northingOriginM'], 2)]
            if not line or math.dist(point, line[-1]) >= 10:
                line.append(point)
        end = [round(xs[-1]-origin['eastingOriginM'], 2), round(ys[-1]-origin['northingOriginM'], 2)]
        if line[-1] != end:
            line.append(end)
        lines.append({'sol': sol, 'points': line})
    return {'title': 'Jezero regional traverse', 'dateRange': 'Archived traverse, sols 14–'+str(lines[-1]['sol'])+' (2021–2023)',
            'credit': 'NASA/JPL-Caltech · M20 MMGIS traverse',
            'source': 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json',
            'sourceSha256': hashlib.sha256(file.read_bytes()).hexdigest(),
            'registration': 'Source Mars planetocentric east longitude/latitude transformed into the playable patch PDS equirectangular frame. Simplified to 10 m spacing, original leg endpoints retained.',
            'frame': 'Local east/north meters in the same CRS and origin as the playable terrain',
            'patch': [[0,0],[2048,0],[2048,2048],[0,2048]], 'traverse': lines,
            'threeForks': {'title': 'Three Forks sample depot', 'date': 'Completed January 28, 2023 · sol 690',
                          'url': 'https://science.nasa.gov/resource/perseverances-three-forks-sample-depot-map/'}}


if __name__ == '__main__':
    weather = package_weather()
    regional = package_regional()
    evidence = {'weather': weather, 'regional': regional}
    write_json(OUT/'expedition-evidence.json', evidence)
    write_json(Path('data/jezero/expedition-sources.json'), {'weather': {k:v for k,v in weather.items() if k!='rows'}, 'regional': {k:v for k,v in regional.items() if k!='traverse'}})
    manifest = json.loads((OUT/'manifest.json').read_text())
    manifest['assets']['expedition-evidence.json'] = hashlib.sha256((OUT/'expedition-evidence.json').read_bytes()).hexdigest()
    write_json(OUT/'manifest.json', manifest)
    print(json.dumps(weather['rows'][0]))
