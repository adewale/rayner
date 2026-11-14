"""An independent oracle for the galton-board explainer, from Python's standard library alone.

math.comb gives the number of routes to each bin, fractions.Fraction the chance of a bin at a bent
peg, and statistics.NormalDist the normal curve's density and areas. Run with any CPython 3.8 or
later; it prints JSON, which model.test.ts compares with the model's own counting each time it runs.
"""
import json
import sys
from fractions import Fraction
from math import comb, sqrt
from statistics import NormalDist

rows_list = list(range(0, 13))


def curve(rows):
    return NormalDist(rows / 2, sqrt(rows) / 2)


def area(rows, a, b):
    d = curve(rows)
    return d.cdf(b) - d.cdf(a)


def bent(rows, k, num, den):
    p = Fraction(num, den)
    return comb(rows, k) * p ** k * (1 - p) ** (rows - k)


result = {
    'python': '.'.join(map(str, sys.version_info[:3])),
    'pile': {str(n): [comb(n, k) for k in range(n + 1)] for n in rows_list},
    'density': {str(n): [curve(n).pdf(x / 4) for x in range(-4, 4 * n + 5)] for n in rows_list if n},
    'area': {
        str(n): {
            'middle': area(n, n / 2 - 1.5, n / 2 + 1.5),
            'edge': area(n, -0.5, 0.5),
            'beyond': 1 - curve(n).cdf(n + 0.5),
        }
        for n in rows_list
        if n
    },
    # Each peg sends the ball right three times in four: every bin's chance, as an exact fraction.
    'bent': {str(n): [[f.numerator, f.denominator] for f in (bent(n, k, 3, 4) for k in range(n + 1))] for n in (4, 6, 8)},
}
print(json.dumps(result))
