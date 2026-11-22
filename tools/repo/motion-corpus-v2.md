# Prospective motion assessment v2

The Nov 22 current-audit adapter explicitly assesses frozen renderer/scenes revision `5bff60e0aa5660c2b944fb59fbfe0b59e703db93`. Subsequent matcher, word, chapter-context or timing policy changes require fresh measurements and captures. Frozen results must not be labeled final-head results. The generic evaluator records the input source revision/policy or explicitly marks them unspecified.

This is a separate assessment of specific observable diagnoses. It does not amend `CORPUS`, its twelve original targets, the frozen visual audit, or historical 39 credited / 40 raw rejections out of 59. Rejection is not detection accuracy.

`test/fixtures/motion-corpus/prospective-v2.ts` declares the actor, subject, events and phase of all 59 historical fix claims. Its initial registry has 19 versioned observations: twelve original targets, three exact printed-code/small-word targets read from mutation source, three typed event-budget prevention targets read from the historical squeezed mutations, and one current-domain poll target backed by the independent native pixel proof. The domain observation has a new version and names the old company-name observation it replaces; matching it cannot increase historical credit.

`prospective-v2-visual.ts` adds six narrow observations after independent blind review and before opening detector receipts: cart ticket/API, inbound key/Sign-in, expire ticket/API, delegation/your agent, refreshed key/API and the current forged code slip/Session. It preserves the initial nineteen declarations. Partial clauses and unconfirmed historical shape/origin claims are explicit. The active registry therefore contains twenty-five observations, with initial declarations and visual additions reported separately.

The source declarations were written before inspecting this audit's detector receipts. A historical description such as “crosses the stage” does not identify a victim. Such entries have no diagnostic binding and remain unassessed. Independent visual evidence can support a new versioned observation; it cannot justify choosing whichever unrelated warning happened to fire. Broadening an existing target after seeing results requires a new observation/version and a stated independent basis.

`tools/repo/motion-corpus-v2.ts` consumes structured worker observations. It does not contain a renderer or a timing detector. It reuses worker schema validation, baseline subtraction and the old rejection comparison. V2 finding matching requires scenario, transition, kind, actor/path, all named subjects and any required victim/masks/presence relation. V2 typed prevention requires the error kind/type, declared reason and event where declared. Printed diagnostic prose alone cannot satisfy v2.

A matching finding is reported as `findingMatch` before review. It earns `target-matched-diagnosis` only when a separately supplied independent visual review explicitly confirms that versioned observation. A broad case-level visual confirmation cannot silently confirm a substituted victim. A reviewer may explicitly confirm a concrete secondary obstruction in an otherwise editorial or secondary-only case; those diagnosed observations are reported separately while the case retains its independent classification. Editorial, secondary-only, not visually reproduced, blocked, inconclusive and unreviewed observations stay separate. No target means unassessed; no review means unassessed. An early refusal may establish relevant typed prevention while leaving later visual replay blocked. It never earns visual diagnosis.

The report exposes registered observations, registered finding targets, independent confirmations, assessed targets, target matches, misses, prevention and unassessed observations separately. It does not present a single success percentage. The historical 59-case raw/credited comparison is a separate section. Missing/duplicate/unknown worker or baseline rows reject evaluation. Malformed or failed workers and failed/incomplete baselines cannot earn diagnosis or a complete current historical comparison. Caller-provided `caught` and `fresh` are not trusted as proof.

Independent chapter prevention is accepted only through an explicit receipt naming a registered keeper's positive and inverse/challenge controls, both passing, with evidence references and the same capture run. A source path or a quiet detector does not supply a receipt. The report is an evidence assessor, not an executor or cryptographic authenticator of external receipts: the producer must actually run those controls and retain the cited artifacts. The held-token inverse is a historical enlargement challenge expected to remain clear because of the repaired dock; it is distinct from a defect expected to reject.

## Input and command

Create a JSON input with `run`, `results`, `baselines` and optional `reviews`/`chapterReceipts`. Results and baselines use existing `EntryResult` JSON. The run must contain exactly the 59 current corpus workers and all eight full-event chapter baselines. Every review names `id`, `run`, `reviewer`, `verdict`, `evidence`, `note` and `confirmedTargets` (version IDs). Every chapter receipt names `id`, `owner`, `run`, `evidence`, `fixed: {name, passed}` and `inverse: {name, passed}`; registered names are exported as `CHAPTER_KEEPERS`.

```sh
node tools/repo/motion-corpus-v2.ts --input out/v2-input.json --out out/prospective-v2
node --test test/motion-corpus-v2.test.ts test/motion-corpus-report.test.ts
node tools/repo/motion-corpus-v2-current.ts # completed Nov 22 capture/reviews
```

The current-audit adapter requires `measurement/corpus.exit` equal to zero before opening detector output. Its explicit confirmed-target mapping comes from the independent reviewers; it cannot select a target from a warning. Optional `--keepers` accepts actual retained chapter-control receipts.

The generic command writes JSON with complete per-observation predicates/evidence and a concise Markdown case table. A report without visual reviews is useful for inventory and raw target matches, but cannot claim a target-matched diagnosis.

## Verification

Fourteen focused tests check preservation of the original twelve targets, exact named-word targets, wrong actor/victim/event/reason/type/scenario, textual lookalikes, no-target and no-review behavior, failed/malformed workers, missing/duplicate inventory, baseline subtraction, versioned victim changes, chapter-control receipts and all visual uncertainty classes. Removing the path equality predicate deliberately makes the wrong-actor test fail; restoring it returns all fourteen tests to passing. This poison only changes the new evaluator temporarily, not renderer or scene code.
