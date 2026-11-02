"""Independent CPython storage and arithmetic vectors for the six teaching scenes.

Run with 64-bit CPython 3.12. The checked-in fixture was captured with 3.12.14.
This reads trusted dictionary objects created here; it is not an authoring dependency.
"""
import ctypes
import json
import math
import platform
import sys
from fractions import Fraction

if sys.implementation.name != 'cpython' or sys.version_info[:2] != (3, 12) or ctypes.sizeof(ctypes.c_void_p) != 8:
    raise SystemExit('This storage oracle requires 64-bit CPython 3.12')

class Dictionary(ctypes.Structure):
    _fields_ = [('refcount', ctypes.c_ssize_t), ('type', ctypes.c_void_p),
                ('used', ctypes.c_ssize_t), ('version', ctypes.c_uint64),
                ('keys', ctypes.c_void_p), ('values', ctypes.c_void_p)]

class Keys(ctypes.Structure):
    _fields_ = [('refcount', ctypes.c_ssize_t), ('log_size', ctypes.c_uint8),
                ('log_index_bytes', ctypes.c_uint8), ('kind', ctypes.c_uint8),
                ('version', ctypes.c_uint32), ('usable', ctypes.c_ssize_t), ('entries', ctypes.c_ssize_t)]

class Entry(ctypes.Structure):
    _fields_ = [('hash', ctypes.c_ssize_t), ('key', ctypes.c_void_p), ('value', ctypes.c_void_p)]

def inspect(d):
    obj = Dictionary.from_address(id(d))
    keys = Keys.from_address(obj.keys)
    assert keys.kind == 0 and not obj.values and (1 << keys.log_size) == 8
    assert (1 << keys.log_index_bytes) == 8
    indices = list((ctypes.c_int8 * 8).from_address(obj.keys + ctypes.sizeof(Keys)))
    entries = (Entry * keys.entries).from_address(obj.keys + ctypes.sizeof(Keys) + 8)
    values = [{'key': ctypes.cast(e.key, ctypes.py_object).value if e.key else None,
               'value': ctypes.cast(e.value, ctypes.py_object).value if e.value else None} for e in entries]
    return {'indices': indices, 'entries': values}

d = {0: 'apple', 8: 'pear', 16: 'plum'}
original = inspect(d)
del d[0]
deleted = inspect(d)

def fnv(text):
    result = 2166136261
    for byte in text.encode('utf8'):
        result = ((result ^ byte) * 16777619) & 0xffffffff
    return result

def chance(n, kind):
    if kind == 'one':
        return float(1 - Fraction(364, 365) ** (n - 1))
    return float(1 - Fraction(math.prod(range(365-n+1, 366)), 365 ** n))

def sample(n, kind):
    seed, value, matched, first = 137, 137, 0, []
    for trial in range(1000):
        room = []
        for _ in range(n):
            while True:
                value = value * 16807 % 2147483647
                u = value - 1
                if u < (2147483646 // 365) * 365:
                    room.append(u % 365 + 1)
                    break
        if trial == 0:
            first = room
        matched += len(set(room)) != n if kind == 'any' else room[0] in room[1:]
    return {'seed': seed, 'trials': 1000, 'matched': matched, 'first': first, 'observed': matched/1000}

result = {
    'python': platform.python_version(),
    'dict': {'original': original, 'deleted': deleted, 'lookups': {str(k): d.get(k) for k in [0,8,16,24]}},
    'fnv': {s: fnv(s) for s in ['', 'a', 'foobar', 'hello', 'cat', 'café', '猫']},
    'bloom': {str(size): {'locations': {word: [fnv(f'{seed}:{word}') % size for seed in range(3)] for word in ['cat','dog','owl','word32','word127','wolf']}} for size in [16,32]},
    'birthdays': {f'{n}:{q}': {'chance': chance(n,q), 'sample': sample(n,q)} for n in [10,23,50] for q in ['any','one']},
}
print(json.dumps(result, ensure_ascii=False, indent=2))
