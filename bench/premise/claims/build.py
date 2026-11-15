"""Writes bench/premise/<topic>/claims.json and claims-blind.json from the claim lists here, and prints the totals.

python3 bench/premise/claims/build.py

claims.json carries each claim with its evidence and this checker's grade; claims-blind.json carries the same
claims and evidence with no grade and no note, for a second grader. See bench/premise/README.md, "Claims for a
second grader".
"""
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cert_renewal  # noqa: E402
import ext4_space  # noqa: E402
import isdigit  # noqa: E402
import poppy_browser  # noqa: E402

TOPICS = {'ext4-space': ext4_space, 'isdigit': isdigit, 'cert-renewal': cert_renewal, 'poppy-browser': poppy_browser}
GRADES = {'right', 'wrong', 'unverifiable'}
RULES = (
    'Grade each claim against the evidence only. right: agrees with a recorded value, with the tested model on an input of the same shape as a recorded one, '
    'with a source file the model pins, or is plain arithmetic. wrong: contradicted by a recorded value or a pinned source. unverifiable: nothing in the evidence '
    'decides it; do not guess, even where the claim is well known. A claim with count n stands for n claims of the same kind graded together.'
)


def main() -> None:
    for topic, mod in TOPICS.items():
        claims = []
        per_page = Counter()
        for i, (page, count, grade, claim, evidence, note) in enumerate(mod.CLAIMS, 1):
            assert grade in GRADES, (topic, claim)
            assert page in mod.PAGES, (topic, page)
            cid = f'{topic}-{page}-{sum(1 for c in claims if c["page"] == page) + 1:02d}'
            claims.append({'id': cid, 'page': page, 'count': count, 'claim': claim, 'evidence': evidence, 'grade': grade, 'note': note})
            per_page[(page, grade)] += count
            per_page[(page, 'claims')] += count
        head = {'topic': topic, 'oracle': mod.ORACLE, 'pages': mod.PAGES, 'rules': RULES}
        out = HERE.parent / topic
        (out / 'claims.json').write_text(json.dumps({**head, 'claims': claims}, ensure_ascii=False, indent=1) + '\n')
        blind = [{k: c[k] for k in ('id', 'page', 'count', 'claim', 'evidence')} for c in claims]
        (out / 'claims-blind.json').write_text(json.dumps({**head, 'claims': blind}, ensure_ascii=False, indent=1) + '\n')
        for page in mod.PAGES:
            print(f'{topic:13} {page:7} claims {per_page[(page, "claims")]:3}  right {per_page[(page, "right")]:3}  wrong {per_page[(page, "wrong")]:2}  unverifiable {per_page[(page, "unverifiable")]:2}  items {sum(1 for c in claims if c["page"] == page)}')


if __name__ == '__main__':
    main()
