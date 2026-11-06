"""Independent data for the great-circle explainer. pip install geographiclib==2.0, then run from the repo root:

  curl -sSo /tmp/ne_110m_land.geojson \
    https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_land.geojson
  python3 tools/oracle/great-circle.py /tmp/ne_110m_land.geojson

It writes two files and imports nothing from Rayner:
- test/fixtures/great-circle-geodesic.json: GeographicLib's geodesic solver (Karney 2013) on the WGS84
  ellipsoid and on a sphere of radius 6371 km, for both routes: distance, initial azimuth, and the
  highest latitude reached, found by sampling the solved geodesic.
- scenes/explainers/great-circle/land.ts: Natural Earth 1:110m land polygons (public domain), outer
  rings as [lon, lat] rounded to 0.01 degrees, a few named by a city they contain.
"""
import hashlib
import json
import sys
from pathlib import Path

import geographiclib
from geographiclib.geodesic import Geodesic

if geographiclib.__version__ != '2.0':
    raise SystemExit('Requires geographiclib 2.0')
SOURCE_SHA256 = '9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9'
RADIUS_KM = 6371.0
AIRPORTS = {
    'LHR': (51.4700, -0.4543), 'LAX': (33.9416, -118.4085),
    'MAD': (40.4983, -3.5676), 'JFK': (40.6413, -73.7781),
}
ROUTES = [('LHR', 'LAX'), ('MAD', 'JFK')]


def solve(geod, a, b):
    (lat1, lon1), (lat2, lon2) = AIRPORTS[a], AIRPORTS[b]
    line = geod.InverseLine(lat1, lon1, lat2, lon2)
    top = max((line.Position(line.s13 * i / 20000) for i in range(20001)), key=lambda p: p['lat2'])
    return dict(km=line.s13 / 1000, azimuth=line.azi1 % 360, top=dict(lat=top['lat2'], lon=top['lon2']))


sphere = Geodesic(RADIUS_KM * 1000, 0)
rows = [dict(route=f'{a}-{b}', wgs84=solve(Geodesic.WGS84, a, b), sphere=solve(sphere, a, b)) for a, b in ROUTES]
Path('test/fixtures/great-circle-geodesic.json').write_text(json.dumps(dict(
    source='GeographicLib geodesic solver (Karney 2013)', version=geographiclib.__version__,
    radiusKm=RADIUS_KM, airports=AIRPORTS, rows=rows), indent=2) + '\n')

raw = Path(sys.argv[1]).read_bytes()
if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
    raise SystemExit('Not Natural Earth v5.1.2 ne_110m_land.geojson')
rings = []
for feature in json.loads(raw)['features']:
    geometry = feature['geometry']
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    for polygon in polygons:
        ring = [[round(lon, 2), round(lat, 2)] for lon, lat in polygon[0]]
        deduped = [p for i, p in enumerate(ring) if i == 0 or p != ring[i - 1]]
        if deduped[0] == deduped[-1]:
            deduped.pop()
        rings.append(deduped)


def inside(lon, lat, ring):
    hit = False
    for i in range(len(ring)):
        (x1, y1), (x2, y2) = ring[i], ring[(i + 1) % len(ring)]
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


# Named by a place each contains, so tests can ask for a landmass rather than an index.
PLACES = {'Greenland': (-45.0, 72.0), 'North America': (-87.6, 41.9), 'Great Britain': (-1.5, 52.5),
          'Ireland': (-8.0, 53.3), 'Afro-Eurasia': (-3.7, 40.4)}
names = {}
for name, (lon, lat) in PLACES.items():
    hits = [i for i, ring in enumerate(rings) if inside(lon, lat, ring)]
    if len(hits) != 1:
        raise SystemExit(f'{name}: {len(hits)} polygons')
    names[name] = hits[0]
body = ',\n'.join('  ' + json.dumps(ring, separators=(',', ':')) for ring in rings)
Path('scenes/explainers/great-circle/land.ts').write_text(
    '// Natural Earth 1:110m land (v5.1.2, public domain): each polygon\'s outer ring as [longitude, latitude]\n'
    '// in degrees, rounded to 0.01. Written by tools/oracle/great-circle.py from\n'
    '// https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_land.geojson\n'
    f'// (sha256 {SOURCE_SHA256}); do not edit by hand.\n\n'
    'export const LAND: readonly (readonly (readonly [number, number])[])[] = [\n' + body + ',\n];\n\n'
    '/** Polygons named by a place each contains: an index into LAND. */\n'
    f'export const LANDMASS = {json.dumps(names)} as const;\n')
