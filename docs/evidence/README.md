# Evidence

Current development screenshots and validation receipts belong under `out/` and in CI artifacts. Commit a small example when it helps review a visible change, and remove it once the change has landed: the commit that introduced it keeps it.

This directory keeps only what is still current:

- [`release-0.1/`](release-0.1/validation.md): the record of a published release.
- [`authoring-layout/`](authoring-layout/README.md): independent font measurements a fidelity test compares against.
- [`statecharts/`](statecharts/README.md): the decisions behind the statecharts explainer.

Dated audits, before-and-after captures and reviews of finished work are in Git history: the test audit, the reader benchmark reviews, the upstream backport findings and the lettering output at [d3db60d](https://github.com/adewale/rayner/tree/d3db60dc14124472903c0366ef64a819d57f2fe7/docs/evidence), and earlier player designs and assessments at [ce11e0a](https://github.com/adewale/rayner/tree/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence). They describe those revisions, not the current code. Explainer scores in them (out of 24, and later 28) use the editorial rubric's retired 0–4 scale; the current [Judging an explainer](../EXPLAINER-RUBRIC.md) gives no scores to compare them with.

Diagram and lettering snapshots beside the scenes are build inputs, not evidence.
