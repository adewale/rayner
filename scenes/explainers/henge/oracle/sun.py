"""The real Sun for the henge explainer's places. pip install skyfield==1.55 geographiclib==2.1, fetch JPL's
DE440s ephemeris, then run:

  curl -sSo /tmp/de440s.bsp https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp
  python3 scenes/explainers/henge/oracle/sun.py /tmp/de440s.bsp

which writes the explainer's fixtures/henge-sun.json. It imports nothing from Rayner.

- Places: two viewpoints and a far point down each street, OpenStreetMap nodes (fetched 2026-11-15 with
  the OSM API's map call). GeographicLib's WGS84 geodesic gives each street's bearing and length.
- The Sun: Skyfield observes the Sun from each place on the WGS84 ellipsoid through DE440s, as an
  apparent (aberration, light deflection, topocentric) position, with no atmospheric refraction.
  Skyfield's built-in timescale supplies UT1 and TT.
- Half Sun and full Sun: the evening moment the Sun's centre is 34 arcminutes below the flat horizon (half
  Sun: standard refraction lifts it onto the horizon), and the moment it is one semidiameter higher than that
  (full Sun: its lower edge on the horizon). The semidiameter is asin(696,000 km / distance). Each evening is
  searched by bisection from the place's mean solar noon to twelve hours later, for every day of 2026.
- Alignments: the evenings whose half (or full) Sun azimuth is nearest the street's bearing, one either side
  of each change of sign.
- The Hayden Planetarium's published 2026 Manhattanhenge minutes (half and full Sun, EDT), with the Sun's
  position at each: a cross-check of the dates, not a recording of AMNH's method, which it does not publish.
"""
import hashlib
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import geographiclib
import numpy as np
import skyfield
from geographiclib.geodesic import Geodesic
from skyfield.api import load, wgs84

HERE = Path(__file__).resolve().parent.parent
if str(skyfield.__version__) != '1.55':
    raise SystemExit('Requires skyfield 1.55')
if geographiclib.__version__ != '2.1':
    raise SystemExit('Requires geographiclib 2.1')
EPHEMERIS_SHA256 = 'c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2'
raw = Path(sys.argv[1]).read_bytes()
if hashlib.sha256(raw).hexdigest() != EPHEMERIS_SHA256:
    raise SystemExit('de440s.bsp does not match the recorded sha256')

PLACES = {
    'manhattan': dict(
        at=dict(node=6997311896, lat=40.749124, lon=-73.9705351, note='East 42nd Street under the Tudor City Place bridge (way 23048466)'),
        far=dict(node=42430673, lat=40.7608557, lon=-73.9983473, note='West 42nd Street at 11th Avenue')),
    'chicago': dict(
        at=dict(node=10838732050, lat=41.8844844, lon=-87.6243714, note='East Randolph Street at North Michigan Avenue'),
        far=dict(node=258955481, lat=41.8844139, lon=-87.6474389, note='West Randolph Street at North Halsted Street')),
}
for p in PLACES.values():
    line = Geodesic.WGS84.Inverse(p['at']['lat'], p['at']['lon'], p['far']['lat'], p['far']['lon'])
    p['bearing'] = round(line['azi1'] % 360, 4)
    p['metres'] = round(line['s12'], 1)

eph = load(sys.argv[1])
ts = load.timescale(builtin=True)
sun, earth = eph['sun'], eph['earth']
SUN_KM = 696000.0
REFRACTION = 34 / 60


def observe(p, t):
    alt, az, dist = (earth + wgs84.latlon(p['at']['lat'], p['at']['lon'])).at(t).observe(sun).apparent().altaz()
    return alt.degrees, az.degrees, dist.km


def utc(seconds):
    return ts.from_datetimes([datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=float(s)) for s in seconds])


def evenings(p, kind, days):
    """Each day's moment of half or full Sun, by bisection between mean solar noon and twelve hours later."""
    noon = np.array([(d - datetime(1970, 1, 1, tzinfo=timezone.utc)).total_seconds() + (12 - p['at']['lon'] / 15) * 3600 for d in days])
    lo, hi = noon.copy(), noon + 12 * 3600
    for _ in range(36):
        mid = (lo + hi) / 2
        alt, _, dist = observe(p, utc(mid))
        target = -REFRACTION + (np.degrees(np.arcsin(SUN_KM / dist)) if kind == 'full' else 0)
        above = alt > target
        lo, hi = np.where(above, mid, lo), np.where(above, hi, mid)
    t = (lo + hi) / 2
    alt, az, dist = observe(p, utc(t))
    return [dict(date=d.strftime('%Y-%m-%d'), utc=round(float(s), 1), azimuth=round(float(a), 4), altitude=round(float(h), 4))
            for d, s, a, h in zip(days, t, az, alt)]


def alignments(rows, bearing):
    off = [r['azimuth'] - bearing for r in rows]
    found = []
    for i in range(len(rows) - 1):
        if (off[i] > 0) != (off[i + 1] > 0):
            found.append(rows[i if abs(off[i]) < abs(off[i + 1]) else i + 1]['date'])
    return found


days = [datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=i) for i in range(365)]
out = {}
for name, p in PLACES.items():
    half, full = evenings(p, 'half', days), evenings(p, 'full', days)
    # Positions across the sky, day and night: one instant every ten days, the hour moving on by seven each time.
    instants = [datetime(2026, 1, 3, 5, 17, tzinfo=timezone.utc) + timedelta(days=10 * i, hours=7 * i) for i in range(37)]
    alt, az, dist = observe(p, ts.from_datetimes(instants))
    out[name] = dict(**p,
        instants=[dict(utc=round((t - datetime(1970, 1, 1, tzinfo=timezone.utc)).total_seconds()), azimuth=round(float(a), 5), altitude=round(float(h), 5), km=round(float(k)))
                  for t, a, h, k in zip(instants, az, alt, dist)],
        half=[[r['date'], r['utc'], r['azimuth']] for r in half],
        full=[[r['date'], r['utc'], r['azimuth']] for r in full],
        alignments=dict(half=alignments(half, p['bearing']), full=alignments(full, p['bearing'])))

# The Hayden Planetarium's 2026 minutes, Eastern Daylight Time (UTC-4), as NYC Tourism + Conventions publishes them.
AMNH = [('2026-05-28', '20:14', 'half'), ('2026-05-29', '20:13', 'full'), ('2026-07-11', '20:20', 'full'), ('2026-07-12', '20:21', 'half')]
amnh = []
for date, minute, kind in AMNH:
    t = datetime.fromisoformat(f'{date}T{minute}:00-04:00')
    alt, az, dist = observe(PLACES['manhattan'], ts.from_datetime(t))
    amnh.append(dict(date=date, edt=minute, kind=kind, utc=round(t.timestamp()), azimuth=round(float(az), 4), altitude=round(float(alt), 4)))

(HERE / 'fixtures/henge-sun.json').write_text(json.dumps(dict(
    source='Skyfield observing the Sun through JPL DE440s; GeographicLib geodesics between OpenStreetMap nodes',
    versions=dict(skyfield='1.55', geographiclib=geographiclib.__version__, numpy=np.__version__, ephemeris='de440s.bsp', ephemerisSha256=EPHEMERIS_SHA256),
    refraction=REFRACTION, sunKm=SUN_KM, places=out, amnh=amnh), separators=(',', ':')).replace('],[', '],\n[').replace('},{', '},\n{') + '\n')
