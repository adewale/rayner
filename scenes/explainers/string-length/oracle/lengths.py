"""An independent oracle for the string-length explainer: CPython's own strings.

It reads a JSON list of texts on standard input, each given as its code points so that nothing is
lost on the way, and prints for each its length (len counts code points), its UTF-8 bytes
(str.encode) and each code point's general category (unicodedata.category). Any CPython 3 will do;
model.test.ts compares the model with these answers each time it runs.
"""
import json
import sys
import unicodedata

texts = [''.join(chr(cp) for cp in points) for points in json.load(sys.stdin)]
print(json.dumps({
    'python': '.'.join(map(str, sys.version_info[:3])),
    'unicode': unicodedata.unidata_version,
    'texts': [{'length': len(t), 'bytes': list(t.encode('utf-8')), 'categories': [unicodedata.category(c) for c in t]} for t in texts],
}))
