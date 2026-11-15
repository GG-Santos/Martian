"""Prepare a bounded, attributed Mars package. Original downloads stay untracked."""
import argparse
import hashlib
import json
import requests
from pathlib import Path
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject, transform
from rasterio.windows import from_bounds as window_from_bounds
from PIL import Image


def write_json(path, value):
    """Use stable UTF-8/LF bytes before hashing, regardless of host platform."""
    Path(path).write_text(json.dumps(value, indent=2), encoding='utf-8', newline='\n')


def verify(root):
    root = Path(root)
    m = json.loads((root / 'manifest.json').read_text())
    g = m['grid']
    raw = (root / 'heights.f32').read_bytes()
    if len(raw) != g['width'] * g['height'] * 4:
        raise ValueError('height byte length does not match grid')
    if not (g['width'] > 1 and g['height'] > 1 and np.isfinite(g['cellSizeM']) and g['cellSizeM'] > 0):
        raise ValueError('invalid grid dimensions or cell size')
    if not np.isfinite(np.frombuffer(raw, dtype='<f4')).any():
        raise ValueError('no valid elevation coverage')
    if len(m['layers']) != 3 or len(set(a['mission'] for a in m['layers'])) < 2:
        raise ValueError('three data categories and two missions required')
    for name, digest in m['assets'].items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
            raise ValueError('asset hash mismatch: ' + name)
    if 'reliefGrid' in m:
        relief = m['reliefGrid']
        samples = np.fromfile(root/'relief.f32', dtype='<f4')
        if (samples.size != relief['width'] * relief['height'] or not np.isfinite(samples).all()
                or relief['westM'] != g['westM'] or relief['northM'] != g['northM']
                or any((relief[axis]-1)*relief['cellSizeM'] != (g[axis]-1)*g['cellSizeM']
                       for axis in ('width', 'height'))):
            raise ValueError('display relief does not match analysis coverage')
        for name in ('thermal.u8', 'slope.u8'):
            if (root/name).stat().st_size != g['width'] * g['height']:
                raise ValueError('invalid scalar dimensions: ' + name)
    print(f"Verified {len(m['assets'])} assets; {g['width']}x{g['height']} grid; three categories, two missions")


def sample_relief(dtm, west, north, size, count):
    spacing = size / (count - 1)
    half = spacing / 2
    transform = from_bounds(west-half, north-size-half, west+size+half, north+half, count, count)
    samples = np.full((count, count), np.nan, dtype='float32')
    reproject(rasterio.band(dtm, 1), samples, src_crs=dtm.crs, dst_crs=dtm.crs,
              dst_transform=transform, dst_nodata=np.nan, resampling=Resampling.bilinear)
    if not np.isfinite(samples).all():
        raise ValueError('display relief contains missing coverage')
    return samples


def package_detail_tiles(dtm, out, west, north):
    tiles = []
    for stop, x, y in [('A', 376, 968), ('B', 896, 1608), ('C', 1328, 1160)]:
        try:
            samples = sample_relief(dtm, west+x, north-2048+y, 512, 513)
        except ValueError:
            if stop == 'A':
                raise
            print('Optional detail tile omitted for missing coverage: ' + stop)
            continue
        asset = 'detail-' + stop.lower() + '.f32'
        samples.astype('<f4').tofile(out/asset)
        tiles.append({'stopId': stop, 'asset': asset, 'grid': {
            'width': 513, 'height': 513, 'cellSizeM': 1, 'westM': x, 'northM': y}})
    return tiles


def prepare(source_path, out):
    source = json.loads(Path(source_path).read_text())
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    stage = Path(source['staging'])
    c = source['crop']; size = c['sizeM']; n = c['gridSize']; step = size / (n - 1)
    west, north = c['centerEasting'] - size / 2, c['centerNorthing'] + size / 2
    # Destination pixel centers correspond exactly to analysis-grid nodes.
    tx = from_bounds(west-step/2, north-size-step/2, west+size+step/2, north+step/2, n, n)
    with rasterio.open(stage / 'dtm.img') as dtm:
        crs = dtm.crs
        relief_count = c['renderGridSize']
        relief = sample_relief(dtm, west, north, size, relief_count)
        detail_tiles = package_detail_tiles(dtm, out, west, north)
        heights = np.full((n, n), np.nan, dtype='float32')
        reproject(rasterio.band(dtm, 1), heights, src_transform=dtm.transform, src_crs=crs,
                  dst_transform=tx, dst_crs=crs, dst_nodata=np.nan, resampling=Resampling.bilinear)
        # Both authoritative PDS labels declare identical offsets/CRS. JP2 embedded
        # GeoTIFF keys misexpress latitude-of-origin; use the matching PDS transform.
        image_bounds = (west, north-size, west+size, north)
        texture_tx = from_bounds(*image_bounds, 2048, 2048)
        optical = np.zeros((2048, 2048), dtype='uint8')
        with rasterio.open(stage / 'optical.jp2') as img:
            window = window_from_bounds(west-4,north-size-4,west+size+4,north+4,dtm.transform).round_offsets().round_lengths()
            reproject(img.read(1,window=window), optical, src_transform=dtm.window_transform(window), src_crs=crs,
                      dst_transform=texture_tx, dst_crs=crs, src_nodata=0, dst_nodata=0,
                      resampling=Resampling.bilinear)
        # Retain original source labels to make the CRS ruling inspectable.
        Path('data/jezero/dtm-label.txt').write_text('\n'.join(line.rstrip() for line in (stage/'dtm.img').read_bytes()[:27820].decode('ascii').strip().splitlines())+'\n')
        Path('data/jezero/optical-label.txt').write_text((stage/'optical.lbl').read_text())
        coords = [(west+200,north-200), (west+size-200,north-200), (west+size/2,north-size+200)]
        lon,lat = transform(crs, crs.geodetic_crs, [p[0] for p in coords], [p[1] for p in coords])
        center_lon,center_lat = transform(crs,crs.geodetic_crs,[c['centerEasting']],[c['centerNorthing']])
        control=[]
        for p,lo,la in zip(coords,lon,lat):
            row,col=dtm.index(*p);e,nn=dtm.xy(row,col)
            control.append({'sourcePixel':[col,row],'localMeters':[p[0]-west,p[1]-(north-size)],'longitude':lo,'latitude':la,'centerResidualM':float(np.hypot(e-p[0],nn-p[1]))})
        crs_wkt=crs.to_wkt()
    thermal = np.zeros((n,n),dtype='uint8')
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif'):
        with rasterio.open(source['sources'][2]['url']) as src:
            reproject(rasterio.band(src,1),thermal,src_crs=src.crs,src_transform=src.transform,
                      dst_crs=crs,dst_transform=tx,src_nodata=0,dst_nodata=0,resampling=Resampling.nearest)
    if not np.isfinite(heights).all() or not (optical>0).all() or not (thermal>0).all():
        raise ValueError('selected patch contains missing coverage; choose a complete overlap')
    heights.astype('<f4').tofile(out/'heights.f32')
    relief.astype('<f4').tofile(out/'relief.f32')
    thermal.tofile(out/'thermal.u8')
    Image.fromarray(optical).save(out/'optical.webp',quality=90)
    # False color only conveys brightness; no invented Kelvin scale.
    t=np.clip((thermal.astype(float)-thermal.min())/max(1,float(np.ptp(thermal))),0,1)
    rgb=np.stack([65+180*t,70+70*(1-t),135-90*t],axis=-1).astype('uint8')
    Image.fromarray(rgb).save(out/'thermal.webp',lossless=True)
    gy,gx=np.gradient(heights,step);slope=np.degrees(np.arctan(np.hypot(gx,gy)))
    np.minimum(np.rint(slope * 4), 254).astype('uint8').tofile(out/'slope.u8')
    rgba=np.zeros((n,n,4),dtype='uint8');rgba[:,:,:3]=[246,174,67];rgba[:,:,3]=np.clip(slope/30*210,0,210).astype('uint8')
    Image.fromarray(rgba).save(out/'slope.webp',lossless=True)
    Image.fromarray(optical).resize((1024,1024)).save(out/'overview.webp',quality=86)
    layers=[]
    for i,s in enumerate(source['sources']):
        layer=dict(s);layer['id']=['optical','slope','thermal'][i]
        layer['status']='derived' if i==1 else 'observed'
        layer['outputResolutionM']=step if i else 1
        layers.append(layer)
    manifest={'datasetId':source['datasetId'],'grid':{'width':n,'height':n,'cellSizeM':step,'westM':0,'northM':size},
        'reliefGrid':{'width':relief_count,'height':relief_count,'cellSizeM':size/(relief_count-1),'westM':0,'northM':size},
        'scalarGrid':{'width':n,'height':n},
        'detailTiles': detail_tiles,
        'bounds':{'westM':0,'eastM':size,'southM':0,'northM':size},'sourceCrs':crs_wkt,
        'localTransform':{'eastingOriginM':west,'northingOriginM':north-size},
        'center':{'longitude':center_lon[0],'latitude':center_lat[0]},'verticalDatum':'Mars 2000 equipotential surface',
        'noData':'NaN float32','textureConvention':'outer texture edges coincide with grid sample bounds; top row north',
        'layers':layers,'controlPoints':control,'elevationRangeM':[float(heights.min()),float(heights.max())],
        'slopeRangeDeg':[float(slope.min()),float(slope.max())],
        'thermalDnRange':[int(thermal.min()),int(thermal.max())],
        'processing':'PDS-authoritative HiRISE registration; bilinear height/optical resampling; nearest-neighbor THEMIS; no vertical exaggeration',
        'assets':{}}
    question_ref='https://science.nasa.gov/resource/detailed-panorama-of-mars-jezero-crater-delta/'
    stops=[{'id':'A','title':'Surface contact','point':{'x':630,'y':710},'question':'Does the surface texture change across this contact?',
        'context':'Compare grain size, angularity, and texture on either side. This is a proposed observation, not a confirmed mapped geologic boundary.'},
        {'id':'B','title':'Relief transect','point':{'x':1150,'y':1350},'question':'How does local relief relate to the material exposed?',
        'context':'Record an outcrop sketch and compare visible texture with the elevation profile. Orbital slope does not resolve individual boulders.'},
        {'id':'C','title':'Thermal context','point':{'x':1580,'y':900},'question':'Can field observations explain the regional IR-brightness pattern?',
        'context':'Compare loose and coherent surface materials. The coarse daytime mosaic alone cannot establish composition, temperature, or thermal inertia.'}]
    context=source['contextImage']
    if not (out/'regional-panorama.webp').exists():
        from io import BytesIO
        response=requests.get(context['url'],timeout=60);response.raise_for_status()
        Image.open(BytesIO(response.content)).save(out/'regional-panorama.webp',quality=88)
    for s in stops:s.update({'references':[question_ref,source['sources'][0]['reference']],'imageContext':'regional','image':'regional-panorama.webp','imageCredit':context['credit']})
    start={'x':420,'y':420}
    nodes=[{'id':'habitat-start','kind':'start','point':start}]+[{'id':'stop-'+s['id'],'kind':'stop','stopId':s['id'],'point':s['point']} for s in stops]+[{'id':'habitat-end','kind':'end','point':start}]
    mission={'datasetId':source['datasetId'],'title':'Jezero field excursion','stops':stops,'presetNodes':nodes,
        'brief':'Compare surface textures and relief within an archival HiRISE patch of Jezero. Every field station and the habitat are hypothetical.',
        'regionalContext':'Jezero contains an ancient delta investigated by Perseverance. These demonstration stops are not claimed to be rover-visited sites or delta outcrops.'}
    write_json(out/'mission.json', mission)
    for f in out.rglob('*'):
        if f.is_file() and f.name!='manifest.json':
            manifest['assets'][f.relative_to(out).as_posix()]=hashlib.sha256(f.read_bytes()).hexdigest()
    write_json(out/'manifest.json', manifest)
    verify(out)
    print(json.dumps({'center':manifest['center'],'elevation':manifest['elevationRangeM'],'slope':manifest['slopeRangeDeg'],'thermal':manifest['thermalDnRange'],'bytes':sum(f.stat().st_size for f in out.rglob('*') if f.is_file())}))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--manifest',default='data/jezero/source-manifest.json');p.add_argument('--out',default='public/data/jezero');p.add_argument('--verify-only',action='store_true');a=p.parse_args()
    verify(a.out) if a.verify_only else prepare(a.manifest,a.out)
