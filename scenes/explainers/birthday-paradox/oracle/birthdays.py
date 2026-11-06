"""Exact birthday chances as fractions, and the seeded samples, for the birthday-paradox explainer.

Split, unchanged, from the CPython script that served three explainers. Run with 64-bit
CPython 3.12 (the checked-in fixture was captured with 3.12.14); it prints fixtures/birthdays.json.
This reads trusted objects created here; it is not an authoring dependency.
"""
import ctypes
import json
import math
import platform
import sys
from fractions import Fraction

if sys.implementation.name != 'cpython' or sys.version_info[:2] != (3, 12) or ctypes.sizeof(ctypes.c_void_p) != 8:
    raise SystemExit('This storage oracle requires 64-bit CPython 3.12')

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
    'birthdays': {f'{n}:{q}': {'chance': chance(n,q), 'sample': sample(n,q)} for n in [10,23,40,50] for q in ['any','one']},
}
print(json.dumps(result, ensure_ascii=False, indent=2))
