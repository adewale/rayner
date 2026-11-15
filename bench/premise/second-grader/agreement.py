"""Agreement between the first grader (bench/premise/*/claims.json) and the blind second grader
(bench/premise/second-grader/grades.json): raw agreement and Cohen's kappa, per claim item and
weighted by each item's count. Run: python3 bench/premise/second-grader/agreement.py"""
import collections, glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PREMISE = os.path.dirname(HERE)
CATS = ['right', 'wrong', 'unverifiable']


def kappa(pairs, weights):
    n = sum(weights)
    agree = sum(w for (a, b), w in zip(pairs, weights) if a == b) / n
    first, second = collections.Counter(), collections.Counter()
    for (a, b), w in zip(pairs, weights):
        first[a] += w
        second[b] += w
    chance = sum(first[c] * second[c] for c in CATS) / n / n
    return agree, (agree - chance) / (1 - chance)


second = json.load(open(os.path.join(HERE, 'grades.json')))
every, every_w = [], []
for path in sorted(glob.glob(os.path.join(PREMISE, '*', 'claims.json'))):
    claims = json.load(open(path))
    pairs = [(c['grade'], second[c['id']]['grade']) for c in claims['claims']]
    weights = [c.get('count', 1) for c in claims['claims']]
    (a, k), (aw, kw) = kappa(pairs, [1] * len(pairs)), kappa(pairs, weights)
    print(f"{claims['topic']}: {len(pairs)} items, agreement {a:.3f}, kappa {k:.2f}; by count {aw:.3f}, kappa {kw:.2f}")
    for c, (f, s) in zip(claims['claims'], pairs):
        if f != s:
            print(f"  {c['id']}: first {f}, second {s}")
    every += pairs
    every_w += weights
(a, k), (aw, kw) = kappa(every, [1] * len(every)), kappa(every, every_w)
print(f"all: {len(every)} items ({sum(every_w)} claims), agreement {a:.3f}, kappa {k:.2f}; by count {aw:.3f}, kappa {kw:.2f}")
