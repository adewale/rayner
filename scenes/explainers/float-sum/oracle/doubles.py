"""An independent oracle for the float-sum explainer: CPython's own float, with exact arithmetic
from the standard library.

It reads one JSON object on standard input:
  {"doubles": [repr, ...], "pairs": [[repr, repr], ...], "literals": [decimal string, ...]}
and prints, for each double, its exact decimal digits (decimal.Decimal), its exact fraction
(float.as_integer_ratio), what Python prints for it (repr) and its two neighbours
(math.nextafter); for each pair, what float addition gives and the exact sum of the two stored
values (fractions.Fraction), as a fraction and digit by digit; and for each literal, the float Python reads it as and on which side of
the typed value that float lies. Any CPython from 3.9 (math.nextafter) will do; model.test.ts
compares the model with these answers each time it runs.
"""
import json
import math
import sys
from decimal import Decimal, getcontext
from fractions import Fraction

request = json.load(sys.stdin)
# A sum of two doubles ends within 1,100 decimal places; with this precision every digit of it is exact.
getcontext().prec = 2400


def number(text):
    x = float(text)
    num, den = x.as_integer_ratio()
    return {
        'digits': format(Decimal(x), 'f'),
        'ratio': [str(num), str(den)],
        'repr': repr(x),
        'below': repr(math.nextafter(x, 0.0)),
        'above': repr(math.nextafter(x, math.inf)),
    }


def pair(a, b):
    x, y = float(a), float(b)
    total = Fraction(x) + Fraction(y)
    return {'sum': repr(x + y), 'exact': [str(total.numerator), str(total.denominator)], 'digits': format(Decimal(total.numerator) / Decimal(total.denominator), 'f')}


def literal(text):
    x = float(text)
    typed = Fraction(text)
    stored = Fraction(x)
    return {'float': repr(x), 'side': 'exact' if stored == typed else 'high' if stored > typed else 'low'}


print(json.dumps({
    'python': '.'.join(map(str, sys.version_info[:3])),
    'doubles': [number(t) for t in request['doubles']],
    'pairs': [pair(a, b) for a, b in request['pairs']],
    'literals': [literal(t) for t in request['literals']],
}))
