"""The coastlines henge's globe draws: Natural Earth 1:110m land (v5.1.2, public domain), the polygons that face
either globe view. Fetch the source and run:

  curl -sSo /tmp/ne_110m_land.geojson \
    https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_land.geojson
  python3 scenes/explainers/henge/oracle/land.py /tmp/ne_110m_land.geojson

which writes the explainer's land.ts and imports nothing from Rayner. Each polygon's outer ring is kept as
[longitude, latitude] rounded to 0.01 degrees, as great-circle's land.ts keeps it, when any of its points lies
within 95 degrees of a globe view's centre: the point halfway along each street's arc from the viewpoint to the
ring a quarter-turn and 34' away (the places and bearings of fixtures/henge-sun.json).
"""
import hashlib
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SOURCE_SHA256 = '9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9'
raw = Path(sys.argv[1]).read_bytes()
if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
    raise SystemExit('Not Natural Earth v5.1.2 ne_110m_land.geojson')

places = json.loads((HERE / 'fixtures/henge-sun.json').read_text())['places']


def along(lat, lon, bearing, distance):
    p, b, d = map(math.radians, (lat, bearing, distance))
    q = math.asin(math.sin(p) * math.cos(d) + math.cos(p) * math.sin(d) * math.cos(b))
    l = math.radians(lon) + math.atan2(math.sin(b) * math.sin(d) * math.cos(p), math.cos(d) - math.sin(p) * math.sin(q))
    return math.degrees(q), math.degrees(l)


def unit(lat, lon):
    p, l = math.radians(lat), math.radians(lon)
    return (math.cos(p) * math.cos(l), math.cos(p) * math.sin(l), math.sin(p))


centres = [unit(*along(p['at']['lat'], p['at']['lon'], p['bearing'], (90 + 34 / 60) / 2)) for p in places.values()]
near = math.cos(math.radians(95))
rings = []
for feature in json.loads(raw)['features']:
    geometry = feature['geometry']
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    for polygon in polygons:
        ring = [[round(lon, 2), round(lat, 2)] for lon, lat in polygon[0]]
        deduped = [p for i, p in enumerate(ring) if i == 0 or p != ring[i - 1]]
        if deduped[0] == deduped[-1]:
            deduped.pop()
        if any(sum(a * b for a, b in zip(unit(lat, lon), c)) > near for lon, lat in deduped for c in centres):
            rings.append(deduped)
body = ',\n'.join('  ' + json.dumps(ring, separators=(',', ':')) for ring in rings)
(HERE / 'land.ts').write_text(
    '// Natural Earth 1:110m land (v5.1.2, public domain): the polygons facing the globe step\'s views, each outer ring\n'
    '// as [longitude, latitude] in degrees, rounded to 0.01. Written by oracle/land.py from\n'
    '// https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_land.geojson\n'
    f'// (sha256 {SOURCE_SHA256}); do not edit by hand.\n\n'
    'export const LAND: readonly (readonly (readonly [number, number])[])[] = [\n' + body + ',\n];\n')
print(len(rings), 'rings')
