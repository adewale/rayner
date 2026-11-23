# Causal framework investigation

## Root cause and repair

The historical context/order/source cases share one distinction: durable destination state does not establish what paints during an intervening action. Existing exact, view-scoped `motion` declarations correctly inspect the actual begun travel, including offstage movement, and separately witness composited travel displacement. The merge preserves that behavior alongside main's initialized scene inputs, observation identity, derived picture descriptions and explicit reader offers.

A further architectural gap appeared at that new API boundary: `result` deliberately leaves durable model identity unchanged. Model-only exploration therefore checked an event from the initial picture but skipped a different incoming presentation after a self-loop. A reachable `mark -> ship` reader history could lose its red prerequisite during shipment even though checking `ship` alone passed.

`exploreMachines` now enumerates distinct incoming result presentations for admitted model states, reconstructs their actual event paths from the start and the reachable reader origin, and checks outgoing transitions from each. Result is a pure function of event/before/after, so incoming accepted edges cover these contexts without an unbounded history walk. Durable state counts, observation identity and per-origin limits remain unchanged. Explicitly offered historical steps use their own resting presentation. Start-based logs clear a historical transient result exactly when the first event begins, including kept sessions.

## Independent evidence

The new result-history fixture runs the real reader log with native raster frames. Its red prerequisite has more than 100 red pixels after `mark`. During at least two middle-stage magenta parcel frames, the keeper retains that red ink and the deliberate broad-clear poison removes it. The repaired checker reports `after mark, ship: motion contract ... context must be present` with only one durable state.

A temporary `/tmp` copy of the checker with supplemental result-context enumeration disabled fails the named regression at its expected historical-path diagnosis assertion (1 test, 1 failure). Production files were never mutated for this control. The initial temporary invocation lacked package resolution; that setup failure was corrected before obtaining the assertion failure and is not credited as semantic evidence.

A separate kept-session regression starts from a historic `Marked` picture with an empty log, then sends its first event from the machine start. Every captured frame matches a freshly replayed log and reads `Ready`. Existing travel regression captures also retain exact seeked frame equality through repeated transfer events.

## Validation

`node --test test/machine.test.ts test/machine-motion.test.ts test/machine-transfer-paint.test.ts test/view.test.ts`: 68 passed, zero failures/skips after API fixture migration. A final focused rerun covers transient-result exploration and kept/fresh reset after replacing untyped property access with JSON snapshots. Root owns the global typecheck and full/corpus/package runs.

Files staged: `explain/internal.ts`, `explain/live.ts`, `explain/machine.ts`, `explain/view.ts`, `tools/lib/explain-check.ts`, `test/machine.test.ts`, `test/machine-motion.test.ts`, `test/machine-transfer-paint.test.ts`, `test/view.test.ts`.

## Limits

This is an independently demonstrated framework defect and repair, not a new historical case or a change to frozen 59-case evidence. Scene authors still identify narrative prerequisites and physical source exclusivity explicitly. Isolated subject presence is not composited legibility; the separate occlusion/native clearance owners retain that boundary. Result contexts respect the existing admitted durable-state budget, so incomplete model exploration remains sampled. Arbitrary undocumented transition dependence on external mutable variables is outside the pure model/result contract.
