"""Expand the embedded WOFF2 subsets without changing their glyph order or timestamp."""
import base64
import io
import json
import sys
from fontTools.ttLib import TTFont

result = []
for encoded in json.load(sys.stdin):
    font = TTFont(io.BytesIO(base64.b64decode(encoded)), recalcTimestamp=False)
    font.flavor = None
    out = io.BytesIO()
    font.save(out, reorderTables=False)
    result.append(base64.b64encode(out.getvalue()).decode("ascii"))
json.dump(result, sys.stdout)
