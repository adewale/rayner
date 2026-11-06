"""An independent FNV-1a for the bloom-filter explainer: hashes of seven strings, and each name's three
positions at 16 and 32 bits.

Split, unchanged, from the CPython script that served three explainers. Run with 64-bit
CPython 3.12 (the checked-in fixture was captured with 3.12.14); it prints fixtures/fnv.json.
This reads trusted objects created here; it is not an authoring dependency.
"""
import ctypes
import json
import platform
import sys

if sys.implementation.name != 'cpython' or sys.version_info[:2] != (3, 12) or ctypes.sizeof(ctypes.c_void_p) != 8:
    raise SystemExit('This storage oracle requires 64-bit CPython 3.12')

def fnv(text):
    result = 2166136261
    for byte in text.encode('utf8'):
        result = ((result ^ byte) * 16777619) & 0xffffffff
    return result

result = {
    'python': platform.python_version(),
    'fnv': {s: fnv(s) for s in ['', 'a', 'foobar', 'hello', 'cat', 'café', '猫']},
    'bloom': {str(size): {'locations': {word: [fnv(f'{seed}:{word}') % size for seed in range(3)] for word in ['cat','dog','owl','word32','word127','wolf']}} for size in [16,32]},
}
print(json.dumps(result, ensure_ascii=False, indent=2))
