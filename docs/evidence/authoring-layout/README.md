# Font measurement vectors

Independent measurements of EB Garamond advances, taken by HarfBuzz over the original font bytes before subsetting (`test/lettering/oracle.py`), with each font file's SHA-256. The `font-metrics` fidelity test in `test/explain-fidelity.test.ts` compares the scene's natural-lettering widths with these numbers rather than with Rayner's own text measurement.

- `font-vectors.json`: the advances of "Ink" and "Paper" in the regular cut.
- `font-metrics-source-vectors.json`: one phrase's advance in each requested cut.

The before-and-after screenshots and audit that introduced natural lettering are in [Git history](https://github.com/adewale/rayner/tree/d3db60dc14124472903c0366ef64a819d57f2fe7/docs/evidence/authoring-layout).
