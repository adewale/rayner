"""Independent horizon-coordinate vectors. pip install pyerfa==2.0.1.5, then run from repo root.
ERFA hd2ae is the SOFA-derived hour-angle/declination to azimuth/elevation conversion.
This does not import or reproduce Rayner's coordinate implementation.
"""
import json
import math
from pathlib import Path
import erfa

if erfa.__version__ != '2.0.1.5':
    raise SystemExit('Requires pyerfa 2.0.1.5')
rows = []
for latitude in [-65, 0, 40.75, 65]:
    for declination in [-23.44, 0, 23.44]:
        for hour in [0, 45, 90, 120]:
            az, alt = erfa.hd2ae(*[math.radians(x) for x in [hour, declination, latitude]])
            rows.append(dict(latitude=latitude, declination=declination, hourAngle=hour,
                             azimuth=math.degrees(float(az)), altitude=math.degrees(float(alt))))
Path('test/fixtures/henge-erfa.json').write_text(json.dumps(dict(
    source='ERFA hd2ae via pyerfa', version=erfa.__version__, rows=rows), indent=2) + '\n')
