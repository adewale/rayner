# Machine, view and reader review

Reviewed PR 115 at `bad42099793aba0988fc98a6daaf3819f3bf4559` against the PR base `11b9ab5a61fbed0cb57006f583317b56eb02b5aa` and current main `2bab6486b8f33bf1238b3f239ee9ed7b357bc66b`. Three small scenes hit two distinct false passes and one false rejection. A separate run measures the cost of visiting incoming result presentations. The probes use constructed public author inputs. Their counts describe these fixtures.

## P1. Entering a mark below a shared wrapper hides it until the event ends

An ordinary group contains an opaque red field and a separate reference square, both keyed. The event inserts a blue mark between them in the target group and fades the mark in. The emitted 800 × 450 frames on both baselines show the intended fade. By frame 21 their centre is pure blue. On the PR head the centre stays pure red from frames 3 through 34 then jumps directly to blue at frame 35. This is a regression against both baselines. [Native samples](causal/replay.json) · [Fixture](causal/replay.mjs)

The ordering code converts each surviving keyed child to its direct ancestor under the root. Both surviving keys therefore resolve to the same wrapper. When the algorithm sees the second key it inserts the pending blue mark before that entire wrapper, behind the red field. The end-of-event picture adoption finally places the mark inside the wrapper. The existing wrapped-anchor test covers entrants outside the wrapper. [Root ancestor](../../explain/choreograph.ts#L108) · [Placement](../../explain/choreograph.ts#L132) · [Picture adoption](../../explain/machine.ts#L496) · [Current test](../../test/choreograph.test.ts#L189)

Place an entrant in its target parent at its target sibling position. For a surviving unkeyed wrapper, a matched keyed descendant identifies the actual parent. For a newly introduced subtree, admit the subtree with its clip and opacity intact. Retain explicit treatment of temporary travellers above resting layers. This gives the wrapped and unwrapped fixtures the same local ordering rule.

## P2. Endpoint validation loses an observable change in paint order

The same fixture returns two durable states, two observations, complete exploration, zero motion findings and zero problems, although the centre changes from pure red to pure blue during picture adoption. The endpoint checker sorts the SVG fragments before comparing them. An opaque foreground/background reversal preserves every fragment. This checker blind spot exists in both baselines and conceals the new ordering regression. [Exploration receipt](causal/replay.json) · [Fragment sort](../../tools/lib/explain-check.ts#L855) · [Endpoint comparison](../../tools/lib/explain-check.ts#L927)

Compare records in paint order. If the order or representation differs, compare the two composited frames on the same pixel grid. That allows harmless reorderings of disjoint marks and equivalent decompositions of glyphs, while detecting the visible handoff in this fixture. The more expensive comparison is needed only on a structural difference.

## P1. The travel checker can certify a parcel hidden on every movement frame

A vertical line with a 2.6-unit opaque stroke sits in a group at x = 8.7, just outside the right side of the stage. Its stroke extends over the stage. A red parcel passes beneath it at x = 7.7. The stage SVG paints 8,250 gray pixels and zero red pixels on all 24 movement frames. The causal check reports no findings. The clear control paints 400 red pixels at 24 positions. The checker's rendering of the covered example also paints 400 red pixels on every frame because it culled the foreground group. [Per-frame observations](causal/paint-and-cost.json) · [Executable probe](causal/paint-and-cost.mjs)

The inverse also reproduces. A parcel travelling vertically at the left stage edge contributes a strip of 20 red pixels at each of 24 distinct vertical positions. The checker's culled frame has zero red pixels throughout. It reports that the parcel failed to paint at two positions. Both cases are new relative to both baselines, which have no `MachineMotionCheck`. The proof uses native rasterization of the reader's uncropped SVG geometry at 800 × 450. The reader's DOM sink also requests records with culling disabled. [Checker record selection](../../tools/lib/explain-motion-rules.ts#L62) · [Cull thresholds](../../src/svg.ts#L107) · [DOM sink](../../src/svg.ts#L535)

Use the reader's paint records for the full frame and the knockout. If the native renderer requires pruning, conservatively bound painted ink including descendant strokes, joins and caps. A codec-specific two-pixel threshold cannot establish visibility. The cheaper two-position early exit remains valid once both samples use the same painting semantics. A declared context subject still uses isolated paint by design. Meaningful context that another object can cover needs a composited witness for that subject. [Documented contract](../../docs/MACHINES.md#L239)

## P1. Whole-picture fades draw both group contents at full strength

A public `view.sync({how:'fade'})` exchanges a group holding a red square on the left for a group holding a blue square on the right. On frame 3, just before the transition, only the red square paints. From the first transition frame to the midpoint and through the last sampled transition frame both centres are fully saturated red and blue. At the midpoint both should be white paper. The code sets opacity only on the two root groups, and the SVG renderer emits each drawable leaf with its own opacity. Text and grouped artwork have their ink in descendants. The test asserts the two root opacity values at halfway. [Native RGB](causal/replay.json) · [Opacity writes](../../explain/view.ts#L325) · [Leaf paint](../../src/svg.ts#L184) · [Test](../../test/view.test.ts#L628)

This behavior matches the old PR base. Current main has no typed `how:'fade'` option. The identical JavaScript call on main follows its ordinary keyed morph and produces a single moving square, purple at the midpoint. Merging the proposed change into current main would publish the broken whole-picture fade option again. The direct fix is to retain each rendered family member's initial opacity and multiply it by its half-fade envelope, as the existing fade animations already do. The native midpoint and quarter frames should be the assertions. A group-level multiplier would require an explicit renderer feature shared by every sink. [Advertised behavior](../../docs/VIEWS.md#L194) · [Existing fade](../../src/animation.ts#L773)

## P2. Checking results repeatedly evaluates every prefix of a history

With 256 reachable states and 255 accepted edges in a one-event chain, an explicitly offered reader machine triggers 163,200 result evaluations before playing any outgoing transition. A head control without a result makes 257 model calls. With a result, it makes 163,969. An equivalent implicitly live fixture runs unchanged against the three versions:

| Revision | Durable states | Result calls | Model calls |
| --- | ---: | ---: | ---: |
| PR base | 256 | 32,641 | 32,897 |
| Current main | 256 | 0 | 258 |
| PR head | 256 | 163,201 | 163,970 |

Current main has no transient result API. The implicit fixture includes one extra authored event during reconstruction of the reader stage. The explicit fixture isolates context enumeration and confirms the exact result counts of 2,480, 10,080, 40,640 and 163,200 for 32, 64, 128 and 256 states. The focused run selected zero outgoing animation events, retained every admitted durable state and did no native animation checking. These counts measure repeated callback work, not an end-to-end build-time forecast. [Three revisions](causal/compare-cost.json) · [Three-revision probe](causal/compare-cost.mjs) · [Size series](causal/paint-and-cost.json)

The checker reconstructs a presentation by replaying a full shortest path, repeats that walk for every source and admitted incoming edge, and deduplicates only after collecting the resulting contexts. A pure result is already determined by the last incoming edge's event, before and after. Compute the outgoing result once for that edge and combine it with the non-result presentation at the origin. Keep a parent pointer for diagnostic paths, separate historical and start seeds, and deduplicate each durable-state/presentation pair before scheduling its checks. The authored `mark → ship` regression still requires both incoming presentations. Recording durable states, distinct presentations and tested transitions separately would expose the work represented by one reported state. [Repeated replay](../../tools/lib/explain-check.ts#L710) · [Deduplication](../../tools/lib/explain-check.ts#L738)

## Reader reset and carry semantics

Keep historical resting input for an empty log. Clear the machine-owned transient response precisely when the first start-based event begins, including the first event in an existing session. Use this reader rule to seed the presentation exploration. Keep the distinction between `pass`, which may copy information, and `carry`, which releases the named source at departure and can hand the object to a destination. These semantics are observable, and narrative prerequisites beyond those two endpoints still need scene-specific declarations and independent paint checks. [Reader reset](../../explain/live.ts#L213) · [Carry](../../explain/drawing.ts#L706) · [Retained history fixture](../../test/machine-motion.test.ts#L250)

The constructive carry API can supply the source and destination identities it already knows to the checker. That removes duplicated endpoint strings for common exclusive transfers. Keep the separately authored `motion` rule for additional prerequisites and for deliberate mutations of the transition implementation, so removing production travel or an entire transition still leaves an independent failing assertion. A resting description alone cannot establish that the source went away, the traveller was visible, or the receiver appeared at the correct time.

The existing native controls for a visible source surviving its carry, distinct incoming results at the same durable state, and a kept reader session resetting its first event all passed in a focused rerun (3/3, zero skips). Production and repository test sources were untouched. The native regressions above do not establish how frequently those input combinations occur in the shipped catalog.
