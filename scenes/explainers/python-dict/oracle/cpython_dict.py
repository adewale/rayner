"""CPython 3.12 dict storage for the python-dict explainer: the index and entries of
{0: 'apple', 8: 'pear', 16: 'plum'} read from memory before and after del d[0], and its lookups.

Split, unchanged, from the CPython script that served three explainers. Run with 64-bit
CPython 3.12 (the checked-in fixture was captured with 3.12.14); it prints fixtures/cpython-dict.json.
This reads trusted objects created here; it is not an authoring dependency.
"""
import ctypes
import json
import platform
import sys

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

result = {
    'python': platform.python_version(),
    'dict': {'original': original, 'deleted': deleted, 'lookups': {str(k): d.get(k) for k in [0,8,16,24]}},
}
print(json.dumps(result, ensure_ascii=False, indent=2))
