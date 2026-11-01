> Current 0.1 release proof is in [release validation](../release-0.1/validation.md). Video-specific contracts in this historical audit now live in draft PR #36 for 0.3.

> Subsequent integration with the newer release, player and packed lettering changes is recorded in [latest-main validation](latest-main/validation.md). The inventories and counts below describe the original audit.

# Rayner test audit, October 2026

This audit covers the 68 original TypeScript test files: 679 declarations, 17,188 test lines and 1,520 support lines at main `a4a80d03963a86d804e2b3465ee8a7e9eb68ba6d`. The lettering lane also reviewed its 14 Python oracle cases. Parameterized rows and runtime subtests make runner totals different from declaration counts.

The final integrated inventory has **713 declarations and 18,094 test lines**; support is 1,561 lines after main added browser evidence helpers. The audit adds value and lifecycle checks while consolidating repeated work.

The process followed [OpenClaw test-audit](https://github.com/openclaw/openclaw/tree/main/.agents/skills/test-audit) and [Hegel testing/review](https://github.com/hegeldev/hegel-skill). Each lane read every declaration, its producers and callers, then recorded retain/fix/consolidate/delete decisions before editing. A separate reviewer derived [properties from implementations and contracts without seeing tests](blind-properties.md). Cross-lane reviewers checked preservation. Deliberate mutations checked that repaired assertions could actually reject defects. Hegel’s review method is applied through the existing fast-check tests.

## Results

Five production defects have independent pre-fix failures, kept separately from test cleanup:

| Defect | Regression and fix |
| --- | --- |
| A returning View sync changed the scale basis of a retained picture, shrinking the next rebuild | `test/view.test.ts`; restore retained size/scale metadata when the target is discarded |
| Fractional and extra-slash proxy prefixes could pass through numeric coercion | `test/explain-trust-proxy.test.ts`; validate the entire prefix before membership arithmetic |
| A failed/stopped frame sink left a performance span open | `test/perf.test.ts`; close the span in finally while preserving rejection identity |
| Thin positive emphasis overlaps were discarded, and thin rectangles could be treated as lines | `test/embed-closeup.property.test.ts`; distinguish strictly positive spans from exactly zero-width lines |
| Cached glyph cluster equal to source code-point count was accepted | `test/lettering-integration-audit.test.ts`; reject the one-past-end index, even with a fresh checksum |

The initial `/0` hypothesis was rejected after checking pinned proxy-addr 2.0.8, which deliberately rejects prefix zero. The model keeps that behavior; the fix rejects malformed prefixes.

Changes strengthen reader projection, reset, resize, callback and glide cancellation checks; exact emitted model values; independent network/crypto/queue oracles; caption/Card acceptance and refusal; share diagnostics; source-preserving morphs; and cached lettering/runtime lifecycle checks. Finite WCAG domains are enumerated rather than repeatedly sampled. Tests with sound existing proof remain unchanged.

`test/lettering.test.ts` now owns all 26 catalog page contracts in one build per page: HTML, actual byte count, header recipe, receipt excluding engineHash, and full receipt including it. Values from the deleted duplicate file were copied before consolidation and independently checked. A later, separate pin commit records the intentional engine, proxy-model and obsolete reader-helper changes. The actual catalog builds also refreshed the proxy and PKCE diagram manifests’ source hashes after their source changes; diagram keys and files stayed unchanged. Actual outline recapture changed only builder/payload hashes in four fixtures; glyphs, metrics, faces, source hashes and shaping output stayed identical. See [capture provenance](lettering-capture-provenance.json).

The obsolete CSS zoom painter/default and unused production inverse were removed after caller/export inspection. The real reader always supplies ReaderView.paint. Browser readback now lives in tests; independent screen projection checks the producer. Upstream fixtures, Manim/raster comparisons, heap/cache proofs, real browser integration and package checks remain at their original boundaries.

## Concurrent main integration

While final checks were running, main advanced to `fad29b00a0c1984984ab4e0f4bbe363199520371` with PR #30’s close-up emphasis. The branch merges that change. Six new tests were audited, the authoring metadata changes were reviewed, and the new ordering property received an independent interval oracle. Its explicit thin-overlap case failed before the fifth fix. All 26 new-main pinned fields and full receipts were migrated exactly before a separate intentional refresh for the combined tree. Pre-integration green results are not claimed as final integrated proof.

## Preservation and negative controls

Read the `preservation-*.md` reviews and the six `*-mutations.md` files. There are 24 deliberate assertion-killed controls: six engine core, seven reader, five authoring, three models, two lettering and one emphasis. Production bytes were restored after every control. The five original production failures supply additional regression evidence. The 24 deliberate controls were run before integrating main; their hashes describe that saved source, not the later emphasis additions.

Two mutations initially survived: a missing reader callback and source-tab corruption. The first exposed a vacuous observation loop; it now counts paint and callback applications independently. The second exposed insufficient tab generation; explicit tab lines expand the domain. Both controls then failed correctly. Mutation shrinking also exposed an ambiguous degenerate-cubic oracle; complete ordered partition matching replaced greedy endpoint matching without excluding degenerate inputs or widening tolerance.

Preservation review caught three Card generator losses: narrow accepted widths, undefined width and named placement. These branches are restored. Guaranteed-positive helpers lift genuinely insufficient explicit layouts and document their EPS margin; unrestricted acceptance/refusal tests retain the boundary domain. A browser wait initially listened on window for a nonbubbling document event; it now requires a fresh matching step and aria-current before measuring after RAF. Audit editing errors are recorded in lane actions rather than called product defects.

## Cost evidence

Three alternating-order old/new cubic comparisons used the same production bytes, seed and 200 generated cases. Median process wall time was 3,612.5ms versus 364.2ms, about 9.9× faster. Within-test medians were 3,233ms versus 43.8ms. The new independent Bernstein geometry oracle also checks two constant degenerate tapes. These are focused one-host measurements; they do not establish whole-suite speedup.

Direct source-line projection removed 400 redundant CodeBlock constructions in a small morph-oracle experiment (103.1ms versus 0.066ms for projection alone). The real morph, independent LCS and identity checks remain. The default frozen-page path goes from 29 builds across duplicate owners to 26; FULL goes from 52 to 26, with all original fields retained. Optional lettering checks no longer repeat that catalog build loop.

[PR #11 review](https://github.com/adewale/rayner/blob/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence/pr-11-test-review.md) separates cheap generated arithmetic/decision checks from actual browser performance measurements. Its isolated prototype executed 2,000 green cases in roughly 26ms of check time and reproduced finite-median overflow, invalid-data fail-green and a separately labelled terminal-wait measurement gap. Browser latency remains a real-browser responsibility.

## Evidence map and limits

- [Baseline](baseline.md), [original inventory](inventory.json), [final inventory](final-inventory.json) and [exclusive lane map](lanes.json).
- The supplemental [main-update ledger](main-update-reader.md) accounts for six declarations merged concurrently from PR #30; [final preservation review](main-update-final-review.md) checks the combined keepers and exact intersection fix.
- Six `*-ledger.md` files record original decisions and six `*-plan.md` files record discovery plans. They are historical inputs, not claims that every suggested enhancement was implemented.
- Lane actions, mutation evidence and independent preservation reviews record the final disposition. Raw process logs referenced under /tmp or out are session diagnostics; decisive pre-fix failures and structured mutation results are retained here.
- Validation results are in [validation.md](validation.md).

Remaining opportunities include topology-light diagram test materialization, wider PostgreSQL/Rust scale probes, repeated hidden/visible resize traces and further source-language payloads. Existing coverage remains; no measured production defect is being deferred under those labels. Optional video checks are outside the normal run. Actions enablement remains repository issue #9, so local evidence must be read separately from CI status.

An accounting check verifies every original declaration location appears in its owner's ledger and every original test file belongs to exactly one lane; see [accounting.json](accounting.json). Original test files were retained. Removed declarations have keepers or an obsolete internal product surface identified in their lane records. The audit adds 28 declarations; concurrent main added six more.
