"""Bundle source-backed science figures with reproducible provenance and checksums."""
import hashlib
import json
from pathlib import Path
import requests
from PIL import Image

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2), encoding='utf-8', newline='\n')

def prepare():
    source_file = Path('data/jezero/science-atlas-sources.json')
    sources = json.loads(source_file.read_text(encoding='utf-8'))
    stage = Path('.data-staging/science-atlas')
    out = Path('public/data/jezero')
    (out/'atlas').mkdir(exist_ok=True)
    stage.mkdir(parents=True, exist_ok=True)
    records = []
    manifest = json.loads((out/'manifest.json').read_text())
    for source in sources:
        original = stage/(source['record']['category']+'.source')
        if not original.exists():
            response = requests.get(source['imageUrl'], timeout=60)
            response.raise_for_status()
            original.write_bytes(response.content)
        digest = hashlib.sha256(original.read_bytes()).hexdigest()
        if source.get('sourceSha256') and digest != source['sourceSha256']:
            raise ValueError('Upstream evidence image changed: '+str(original))
        source['sourceSha256'] = digest
        image = Image.open(original).convert('RGB')
        image.thumbnail((1600,1600), Image.Resampling.LANCZOS)
        asset = source['record']['asset']
        image.save(out/asset, quality=92, method=6)
        source['processing'] = {'resizeMaxPixels':1600,'format':'WebP','quality':92,'crop':'none','outputDimensions':list(image.size)}
        manifest['assets'][asset] = hashlib.sha256((out/asset).read_bytes()).hexdigest()
        records.append(source['record'])
    write_json(source_file, sources)
    write_json(out/'science-atlas.json', records)
    manifest['assets']['science-atlas.json'] = hashlib.sha256((out/'science-atlas.json').read_bytes()).hexdigest()
    write_json(out/'manifest.json', manifest)
    print('Packaged four credited evidence figures:', sum((out/r['asset']).stat().st_size for r in records), 'bytes')

if __name__ == '__main__':
    prepare()
