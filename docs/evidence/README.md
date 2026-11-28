# Evidence

Current development screenshots and validation receipts belong under `out/` and in CI artifacts. Commit a small example when it helps review a visible change, and remove it once the change has landed: the commit that introduced it keeps it.

This directory keeps only what is still current:

- [`release-0.1/`](release-0.1/validation.md): the record of a published release.
- [`authoring-layout/`](authoring-layout/README.md): independent font measurements a fidelity test compares against.
- [`statecharts/`](statecharts/README.md): the decisions behind the statecharts explainer.

Dated audits, before-and-after captures and reviews of finished work are in Git history: the test audit, the reader benchmark reviews, the upstream backport findings and the lettering output at [d3db60d](https://github.com/adewale/rayner/tree/d3db60dc14124472903c0366ef64a819d57f2fe7/docs/evidence), and earlier player designs and assessments at [ce11e0a](https://github.com/adewale/rayner/tree/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence). They describe those revisions, not the current code. Explainer scores in them (out of 24, and later 28) use the editorial rubric's retired 0–4 scale; the current [Judging an explainer](../EXPLAINER-RUBRIC.md) gives no scores to compare them with.

## Archived motion audits

The dated motion audits behind [the motion corpus](../MOTION-CORPUS.md), 13 bundles and 132 MB, are no longer in the source tree; they stay in its history at [`6bc9bfc8`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence), the last commit of [#115](https://github.com/adewale/rayner/pull/115) that carried them, which `main` reaches through that pull request's merge commit. [`archive.json`](archive.json) records each bundle's Git object hash there, and `test/evidence-archive.test.ts` checks every bundle against it, so the archive cannot change unnoticed and needs no branch of its own. Read one with `git show 6bc9bfc8:docs/evidence/<bundle>/README.md` in a full clone.

| Bundle | What it records |
| --- | --- |
| [`conversations-endpoint-2026-11-22`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/conversations-endpoint-2026-11-22) | Direct Conversation endpoint paint |
| [`motion-all59-2026-11-21`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-all59-2026-11-21) | Visual audit of the 59 motion reconstructions |
| [`motion-construction-2026-11-21`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-construction-2026-11-21) | Principled construction repairs for Rayner |
| [`motion-consumer-binding-2026-11-23`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-consumer-binding-2026-11-23) | Native evidence binding and source-39 results |
| [`motion-current-audit-2026-11-22`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-current-audit-2026-11-22) | Fresh native capture, 22 November 2026 |
| [`motion-occlusion-2026-11-20`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-occlusion-2026-11-20) | Foreground glyph occlusion: 20 November 2026 |
| [`motion-raster-resource-2026-11-21`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-raster-resource-2026-11-21) | Native raster resource investigation |
| [`motion-regressions-2026-11-22`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-regressions-2026-11-22) | Regression repairs and independent follow-up, 22 November 2026 |
| [`motion-root-causes-2026-11-21`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-root-causes-2026-11-21) | Motion repairs from the 59-case causal review |
| [`motion-root-causes-2026-11-22`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-root-causes-2026-11-22) | Authored motion contracts and stable SignIn grants |
| [`motion-root-causes-2026-11-23`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-root-causes-2026-11-23) | Prospective exact domain clearance |
| [`motion-sol61-2026-11-21`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-sol61-2026-11-21) | Ten-agent investigation of the 59 historical motion cases |
| [`motion-visual-guide-2026-11-23`](https://github.com/adewale/rayner/tree/6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef/docs/evidence/motion-visual-guide-2026-11-23) | Motion repairs: visual review guide |

The archive is not edited. What it gets wrong is noted here and in `archive.json` instead:

- `motion-regressions-2026-11-22/prospective-v2-independent-review.md` cites `31c89b16`, a worktree commit that was never pushed; the bundle README attributes the prospective adapter fix to 80c57a1c.
- `motion-regressions-2026-11-22/context/validation.md` cites `39f3fb63`, a worktree commit on base 5e66dc98 that was never pushed; the bundle README attributes the context-contribution change to 78c267a0, whose parent is 0f7622c9.
- `motion-regressions-2026-11-22/signin-keepers/validation.md` cites `e693f762`, a worktree commit on base d41c54ea that was never pushed; in the repository, dd9d5dc2 is the commit on that base and changes only poppy-sign-in/scene.test.ts.

Diagram and lettering snapshots beside the scenes are build inputs, not evidence.
