# Regression repairs and independent follow-up, 22 November 2026

The source repairs below are integrated. Their focused native, model, reader and inverse controls pass. A new complete repository run, catalog run and 59-case measurement are being retained separately under `out/regression-fix`; their results must be reported from completed receipts, not inferred from these focused checks. The earlier failed catalog run remains a failure.

## Repairs

| Problem | Cause and repair | Evidence and review |
|---|---|---|
| SignIn approval jumped at target adoption | The empty-key guide changed from a background layer to foreground when the card disappeared. Keep it below both card and physical ring in every layout (`5bff60e0`, strengthened keeper `5e66dc98`). | Endpoint: 43 changed pixels before, zero after. [Independent reader check](independent-sign-in/findings.md): 47 accepted events, 12 approvals, 876 approval frames at widths 390/800; four inverse controls. [Native keeper](keeper-strengthened.log). |
| Conversations Direct opening lost its AI participant until target adoption | New seats entered among inconsistent retained paint anchors. Construct seats/tables behind participant marks in both layouts (`0f7622c9`). | [Committed native comparison](../conversations-endpoint-2026-11-22/README.md): 456 missing participant pixels before, zero endpoint difference after; eight real reader opening/closing routes. |
| Whole-word replacements dissolved into separated dots | Key matching distinguished word identity, but unmatched glyphs still shrank independently. Explicit whole-word replacement now fades endpoint ink without deformation and shares a fade lag slot (`a224f69b`). | [Native before/after](whole-word/before-after.png); [old-engine rejection](whole-word/whole-word-prepatch-control.log). Runtime tests cover keyed labels, unmatched keyed containers, unkeyed words, lag and nonmonotonic seeking. The chapter keeper checks both authored owner/close transitions. |
| Poppy could not start its promised whole-protocol exercise | Final-rest discovery/cart flags made those events unreachable. Explicit `liveStart: 'start'` starts reader histories before discovery while retaining the authored final picture on opening/Reset (`f9069d2c`). | [Actual Chromium histories and inverse](poppy-reader/README.md), both approval settings, reload/Reset, all nine events. Full chapter check: 50 states and 250 transitions per setting. |
| Sessions never demonstrated its header-time rejection | The model supported the late copy but neither story nor eight-button interface reached it. Add a separate late-copy detail in both policies, retaining delegation-expiry teaching and all eight controls (`0299a5fe`). | [Independent editorial finding](editorial/report.md); [new native pictures/receipt](sessions-detail/receipt.json). Positive controls require signing/arrival times and the `iat` tear; whole-time and single-digit removals reject in both policies. |
| Required motion context could pass while completely hidden | Presence rasterized the subject alone. Required `present` now measures its actual composited native RGBA contribution, on the correct camera grid, retaining glyph ownership and complete foreground paint (`78c267a0`). | [Independent review](context/context-review.md), [68 focused checks and inverse](context/validation.md), 600 seeded native crop/full comparisons. Draft glyph and letterbox counterexamples were found and repaired before integration. |
| Conversations captions exceeded the existing word budget | The full chapter check exposed 94/81-word captions after endpoint checking passed. Preserve cursor/poll/hold/stream, retry identity, author marks, close priority and reader-root guidance in 79/62 words (`0f7622c9`). | Full chapter check passes: one scenario, eight steps, 134 states, zero reported problems/phone warnings. Combined endpoint/model/scene tests and typecheck also pass. |
| Prospective assessment could relabel unrelated input as the frozen review | The adapter inferred target confirmation from case IDs/coarse verdicts. Require explicit reviewer-produced version bindings tied to exact review/source/run bytes and a measurement provenance receipt (`80c57a1c`). | [Independent adversarial review](prospective-v2-independent-review.md): nine real-file binding checks and 96 synthetic predicate groups. The original wrong-source/different-clause counterexample now rejects. |

Physical `absent` still means retiring the source, so hiding an unwanted copy behind a plate does not satisfy absence. Required `present` proves some real paint contribution; it does not establish complete glyph readability or explanatory causality. The context repair adds native work: the small paired ABBA benchmark records CPU increases of about 18% for Poppy and 12% for Conversations, with 358 MiB peak RSS. [Exact inputs and receipts](context/benchmark-paired.json) are retained; these measurements are not a general performance guarantee.

The Poppy repair and Chromium keeper share an author; they are ownership evidence, not independent review of that author's code. The exercise gap was independently identified by the editorial reviewer. The archived SignIn review describes a missing-guide/count keeper gap that the later `5e66dc98` strengthening closes; it is not an outstanding final-source gap.

Root subsequently found that the Poppy reader-origin keeper imported private reader APIs from a portable scene test. It is now owned by `test/poppy-reader-origin.test.ts`, using the internal barrels. All assertions remain; no public API was added. The moved keeper and package/scene-import boundaries [pass together](package-owner-followup.log). The earlier full integration invocation executed the same keeper in its former location; this follow-up covers the relocation.

The later [integration review](integration-review/final-integration-review.md) independently exercised six whole-word variants, 222 frames and 432 native word checks, including rotation, placement/font-size changes and nonuniform glyph opacity. The script and compact receipt are retained beside that report. Its Poppy section is explicitly an ownership review; its earlier no-blocker statement predates the test-ownership correction above.

## Fresh 59-case evidence

The [new native capture](../motion-current-audit-2026-11-22/README.md) freezes production at `5bff60e0aa5660c2b944fb59fbfe0b59e703db93`, after the SignIn repair and before the subsequent chapter/matcher/checker repairs. Its 59-case inventory contains 55 completed routes and four typed refusals, with no capture errors. Six separately labeled supplements preserve rejected histories rather than inventing replacements.

Two independent reviewers saved their visual judgments before inspecting detector conclusions. Their [first 30](../motion-current-audit-2026-11-22/reviews/review-first.md) and [last 29](../motion-current-audit-2026-11-22/reviews/review-second.md) account for every ID:

| Disposition | Cases |
|---|---:|
| At least one intended clause visibly confirmed | 39 |
| Pacing/editorial judgment | 7 |
| Secondary effect, original named clause unconfirmed | 5 |
| Original mutation not visually reproduced | 4 |
| Typed refusal before the damaged animation | 4 |

These are sampled native visual reviews with complete frame ledgers available, not a claim that a human inspected every frame. Compound claims are scoped to the clauses actually observed. The 39 confirmed clauses are deliberately injected defects, not 39 current baseline bugs. The reviewers found the current baseline word-shrink symptom even though that reconstruction had no mutation differential; the later whole-word repair addresses it. Complete readable witnesses are archived alongside the reviews.

The frozen generic measurement independently repeats **39 historical credits / 40 raw rejections of 59**, including ten original exact target matches. This numerical 39 is a different quantity from 39 visually confirmed clauses. Native capture refusals concern selected routes; generic worker refusals can occur elsewhere in the explored graph. Neither is a filmed visual diagnosis.

The separate [prospective assessment](../motion-current-audit-2026-11-22/prospective-v2/report.md) retains all original targets. It registers 25 observations, including six independently grounded additions: 20 finding observations have explicit independent confirmation, 16 match the detector and four are strict misses. Two relevant typed preventions are reported separately. Thirty-nine cases have no declared finding target; no chapter-prevention receipt was supplied to this assessment. The missed observations are the inbound key/Sign-in crossing, refreshed key/API crossing, current domain/poll crossing, and forged slip/Session crossing. No predicate was broadened to another convenient warning.

Run the frozen assessment from the preserved, hash-bound original bytes:

```sh
bash tools/repo/reproduce-motion-current-assessment.sh
```

The helper extracts the exact hash-bound reviews, ratifications, provenance and full measurement from `assessment-inputs.tar.gz` into a fresh temporary directory. Large duplicate inputs are compressed; the JSON and Markdown assessment reports remain browsable. The measurement provenance is an honest controlled-run completion attestation with a pinned-tree comparison; it is not an evaluator-generated proof of past filesystem contents. Later renderer, chapter and checker changes require separate measurements and must not be relabeled as this frozen run.

## Remaining limits

Pacing and unnecessary movement still require an authored editorial policy; geometry cannot decide whether a trip teaches the protocol. The SignIn composition alternative in [the editorial review](editorial/report.md) remains a preference, not an established regression. Broad historical claims without an independently named victim/event remain unassessed. Native contribution, model correctness, actual reader reachability and source provenance are separate obligations.

The [root-cause addendum](../motion-current-audit-2026-11-22/reviews/review-first-root-causes.md) groups the first 30 into routes, phase ownership, layout, timing, origins, representation and issuance. Its confirmed required-context loophole is repaired above. Smaller suggested device-card-origin and stronger wordless-transit witnesses remain prevention opportunities, not observed production defects.

The editorial archive retains all saved native pictures and sparse histories in `editorial/native-witnesses.tar.gz`; selected images and JSON inventories remain directly accessible. Its visual scope was 33 inspected PNGs plus one contact sheet, seven sparse reader histories, and a complete semantic enumeration of 17 offered roots across 14 scenarios. It did not certify every intermediate frame or a served browser flow. The later Poppy browser keeper supplies the named served interaction evidence.
