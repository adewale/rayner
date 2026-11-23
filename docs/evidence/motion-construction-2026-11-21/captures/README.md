# Execution receipts and reproduction

The two requested agents used **gpt-6-astra / max**. Their independent design matrices cover runtime, models, drawing, text, replay, readers, accessibility, evidence, CLI, packaging, release and editorial boundaries: [runtime](runtime.md), [workflow](workflow.md). Their implementation and adversarial receipts are preserved here; [chapter follow-up](chapter-adversarial.md) independently checks the integrated routes and actual published reader roots.

These are execution records, not expected snapshots keyed to implementation hashes. Reports identify intermediate failures and final replacements. Logs ending `before`, `initial`, or a reported failed checkpoint must not be relabeled as final passes. Final repository validation is in the parent report and `validation.json`.

Scripts retain their original repository-root execution layout. To reproduce a probe, copy its files back to `out/principled-construction/` before running it; the relative imports deliberately use the repository source and installed dependencies. For example:

```sh
mkdir -p out/principled-construction
cp -R docs/evidence/motion-construction-2026-11-21/captures/. out/principled-construction/
node out/principled-construction/fixed-reader-actions.mjs
node out/principled-construction/fixed-final-route-adversarial.mjs
node out/principled-construction/fixed-final-chapter-native.mjs
node out/principled-construction/measure.mjs
```

The last command replays all 59 variants and eight baselines with two workers; it uses content fingerprints only to admit completed receipts for the same measured inputs. A fresh directory forces a new run. Native probes need the repository's pinned fonts. Chromium probes use `PLAYWRIGHT_BROWSERS_PATH` where required by the environment.

The original six-review evidence is preserved as `../prior-review-evidence.tar.gz`; extract it with `tar -xzf … -C out` to restore `out/adversarial-astra`. The runtime-before comparison additionally requires an isolated checkout of `bad42099793aba0988fc98a6daaf3819f3bf4559`; it never overwrites the repaired source.

The transport-only amendment retained 52 complete Unicode-clean receipts and reran the failed worker. The later interface-only amendment redirects an import through the existing internal barrel and proves all three imported function objects are identical. Both are explicit provenance amendments, not altered targets or normalized findings. The original generic capture and its source manifest remain unchanged.

`before-comparison-keepers/` preserves the exact two keeper inputs from the isolated reviewed-source comparison. Copy them to their original `test/` and `scenes/explainers/lib/` locations in that isolated checkout, then apply the documented incremental-API exclusion. This reproduces the14-group comparison independently of later valid-control additions and the repository await-keeper move.
