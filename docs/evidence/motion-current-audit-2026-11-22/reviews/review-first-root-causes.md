# Current root causes and remaining actions: first 30

This addendum was written after the independent dispositions in [review-first.json](review-first.json) were saved. Original historical hunks and the archived detector attribution fields were then read. No archived visual verdict was imported into these observations.

No current baseline pixel defect found in this reviewer’s sampled targeted witnesses. Deliberately reconstructed variants are fault injections and must not be fixed in production. Existing chapter controls already prevent most diagnosed families.

## First action: required context can be fully hidden

The concrete remaining checker bug is in [paintsOnStage](/workspace/rayner-audit/tools/lib/explain-motion-rules.ts:17), called for required context at [line221](/workspace/rayner-audit/tools/lib/explain-motion-rules.ts:221). It rasterizes the subject by itself. The actual travel proof uses composited pixels, but context presence discards foreground paint.

The bounded [probe](review-first-witnesses/context-occlusion-probe.ts) supplies a real accepted moving parcel and a red context rectangle wholly hidden by an opaque black sibling. The [native receipt](review-first-witnesses/context-occlusion-probe.json) records zero checker findings, zero context contribution pixels, and 2160 pixels exposed by removing the cover. The [actual image](review-first-witnesses/context-occlusion-probe.png) was inspected. This proves a checker blind spot; it is not evidence of a defective current Poppy baseline.

Fix only required `present` by checking exact-subject contribution to the actual composited scene during the declared move. Reuse immutable SVG snapshots and bounded async native rasterization; cache must account for the composited frame. Preserve physical `absent` semantics: a source hidden behind a plate has not been retired. Controls should cover opaque sibling, cover removal, equal-color overpaint and clips, plus an unchanged hidden-source rejection. No new duration, distance or overlap threshold is needed.

## Family assessment

### routes

Cases: `poppy-ticket-over-lane-names`, `poppy-key-over-station-name`, `refusals-ticket-over-station`, `refusals-ticket-over-lane-name`, `refusals-delegation-over-station`, `refusals-mcp-key-over-label`, `refusals-key-over-lane-name`, `sessions-ticket-from-under-stamp`, `sign-in-tokens-over-labels`, `sign-in-poll-over-card`, `sign-in-password-route`, `browser-ticket-over-road-name`.

A resting object or handwritten centreline is reused as travel geometry without reserving its complete footprint and named reading surfaces. Reconstructed old coordinates can now touch a different victim, or no victim, after later layout changes.

Construction: Keep the current scene-owned ports, purpose-sized token and footprint clearance. Select protected subjects from the authored explanation, then derive offsets from their actual geometry. Use existing clearRoute only where a genuine corridor is needed; do not route every drawing globally.

Keeper: Poppy fidelity.ts journeys; Refusals scene.test.ts native routeInkCheck; SignIn scene.test.ts password/poll checks; Sessions oracle/fidelity.ts protected stamp body.

Remaining action: Retain exact subject identities in v2 and keep secondary clock/domain/object contact separate. No baseline route defect was observed in this review. The MCP old victim is absent from the valid first-refresh flight; its held-key refresh attempt is refused. Do not alter production to recreate that obsolete history.

### phase-ownership

Cases: `poppy-last-object-lingers`, `refusals-lanes-gone-in-flight`, `sessions-key-to-wax-after-check`, `sessions-key-in-two-places`, `sign-in-password-before-card`, `sign-in-pages-overlap`, `sign-in-password-hand-and-flight`, `sign-in-tag-over-scopes`.

An omitted fresh/leave/lead beat is repaired only at c.rest(), so final pictures are correct while old context persists, a prerequisite arrives late, or a source copy remains during travel. Prefix lists also confuse transient results with persistent context.

Construction: Use carry for physical transfers, pass for intentional copies, and explicit before-flight clearing for old pages/results. Keep contextual lanes out of fresh. Preserve event-specific motion present/absent rules independently of choreography.

Keeper: MachineMotionCheck plus native Sessions handoff/source-bezel controls and explicit Poppy/Refusals/SignIn motion declarations.

Remaining action: Fix the demonstrated present-context compositing gap below. Preserve isolated physical-source absence, so hiding a duplicate behind a plate cannot satisfy retirement. Keep same-sign password reapproval classified as unreachable for the requested accepted log; do not weaken the model to film it.

### layout

Cases: `refusals-lanes-slide`, `sign-in-ask-people-slide`, `sign-in-collect-people-slide`.

Same-key parts that merely change composition are left to c.rest() or lead morphs, which interpolates them into an invented journey.

Construction: Keep the existing scene-local relaid endpoint crossfade and separately keyed MCP layouts. Movement purpose remains authored policy; a generic checker cannot infer protocol meaning.

Keeper: SignIn scene.test.ts endpoint-only layout assertion; Refusals scene.test.ts lane-row endpoint checks.

Remaining action: Keep these as editorial constraints with positive travel controls. Do not lower generic jump thresholds to call a smooth layout slide a jump. An Exchange items/tag obstruction is a separately confirmed concrete finding.

### timing

Cases: `sessions-squeezed`, `sessions-too-long`, `sign-in-collect-too-long`, `sign-in-ask-squeezed`.

Declared event duration and authored beat sum are independent clocks; broad five-second limits cannot express a chapter-specific teaching budget. Later repairs changed the baseline duration, so old numerical comparisons can be stale.

Construction: Keep Machine WhenItsTurnComes refusal when beats exceed event time. Measure approved chapter budgets on the actual reader clock, separating caption holds and frame bookkeeping.

Keeper: explain/machine.ts duration guard; Sessions oracle/fidelity.ts pacing and durations.

Remaining action: Root is already repairing Sessions timing ownership. Keep squeezed prevention distinct from filmed defect diagnosis. SignIn 4.8 versus current 4.45 s and Sessions 4.35 versus 3.9 s remain explicit pacing policy, not a reason to lower the global five-second detector limit. The current SignIn 2.2 s ask is accepted, so do not claim a present overrun from its old name.

### origin

Cases: `sign-in-card-from-desk`.

A card is animated from a convenient desk coordinate rather than its explanatory source; generic geometry sees a legal journey and has no source semantics.

Construction: Keep current agent presentation port above its actual key slot. Bind a named source/destination to this authored card transfer; use a scene-local assertion rather than infer origins from all drawings.

Keeper: Current SignIn ask construction (present port).

Remaining action: If an origin keeper is needed, add one local positive/inverse test: the first complete device card contributes native ink above the agent and a desk-start substitute fails the same source-phase assertion. This is a prevention gap; current baseline origin is correct.

### representation

Cases: `sign-in-code-tiny-words`.

Scaling a detailed resting code slip preserves literal text at a size appropriate only to a wordless transit token.

Construction: Keep the existing wordless codeToken rather than shrinking text or expanding a global legibility exception.

Keeper: SignIn scene.test.ts wordless code transit assertion.

Remaining action: Strengthen only its witness: require actual composited moving code paint, not just opacity/points and two frame callbacks. Add a fully covered/offstage code challenge; the current test helper painted() can count a hidden object. Do not change the baseline token, which is already correct.

### issuance

Cases: `browser-halves-together`.

Two independent products are issued concurrently from one shared port, causing their actual code/cookie ink to coincide.

Construction: Keep current separate meaningful departure ports and sequential issuance. Parallel submission remains valid and must not be prohibited.

Keeper: Browser scene.test.ts issuance ordering and motion declaration; current load sequence.

Remaining action: Keep one native overlap challenge on load, separate from valid paired submit. Avoid a generic ban on simultaneous travellers or overlapping boxes.

## Existing owners to keep

- [beats / flight / carry](/workspace/rayner-audit/explain/drawing.ts:624) already distinguish fresh state, target flight and consumed source. [c.rest()](/workspace/rayner-audit/explain/choreograph.ts:218) guarantees the target endpoint but does not prove a meaningful intermediate sequence.
- [Poppy journeys](/workspace/rayner-audit/scenes/explainers/poppy/fidelity.ts:25) checks actual route ink and the historical full-key enlargement; its published-origin bookkeeping is being repaired by another owner.
- [Refusals routes](/workspace/rayner-audit/scenes/explainers/poppy-refusals/scene.test.ts:18) and [ticket/delegation contexts](/workspace/rayner-audit/scenes/explainers/poppy-refusals/scene.test.ts:64) cover the current API/MCP/station subjects.
- [Sessions native phase oracle](/workspace/rayner-audit/scenes/explainers/poppy-sessions/oracle/fidelity.ts:79) protects the physical source bezel, key-before-validation and stamp-body aperture. [Pacing](/workspace/rayner-audit/scenes/explainers/poppy-sessions/oracle/fidelity.ts:227) owns the actual clock; [handoff poisons](/workspace/rayner-audit/scenes/explainers/poppy-sessions/oracle/fidelity.ts:259) own the deliberate duplicate and late-key reversals.
- [SignIn route guards](/workspace/rayner-audit/scenes/explainers/poppy-sign-in/scene.test.ts:11), [wordless transit](/workspace/rayner-audit/scenes/explainers/poppy-sign-in/scene.test.ts:52), [layout endpoints](/workspace/rayner-audit/scenes/explainers/poppy-sign-in/scene.test.ts:74), and [motion declarations](/workspace/rayner-audit/scenes/explainers/poppy-sign-in/scene.ts:235) already encode the intended local behavior.
- [Browser issuance](/workspace/rayner-audit/scenes/explainers/poppy-browser/scene.test.ts:41) separates sequential issuance from intentional paired submission; [load construction](/workspace/rayner-audit/scenes/explainers/poppy-browser/scene.ts:144) already uses the correct sequence.

## Historical attribution and current evidence

The archived detector missed the full key/Sign-in collision, retained exhibit, missing lane, late wax key, duplicate key, page context and password duplication. Current native witnesses confirm those named clauses; current authored keepers and motion declarations address most of them. Conversely, archived raw rejections for station launch, stamp entry and squeezed timing cannot establish that the damaged transition painted: this audit keeps route status and exact native victims separate. All archived per-case raw flags/counts are preserved in the JSON addendum for provenance, not recomputed as a score.

The device-poll historical diagnostic named Example Company; fresh pixels show example.com instead. A new domain target may diagnose that secondary effect, but must not increase old exact-target credit. The MCP label and same-sign password histories remain unfilmed because their requested reader transitions are refused. Generic detectors should not be broadened to manufacture those old claims.

The Sessions higher ticket poison has a wider all-story native keeper than my sampled send witnesses. My blind report leaves exact stamp-body contact unconfirmed for that sampled route; it does not contradict the keeper by claiming all frames or all later tickets were clear.

## Narrow priorities

1. Close required-present compositing loophole using bounded same-frame snapshots and native knockout; add one covered-context adversarial test. (generic checker correctness; no baseline scene change)
2. Complete root-owned Poppy published-origin and Sessions actual-clock keeper repairs; retain exact acceptedLog/refusal receipts. (keeper validity; avoid duplicate implementation)
3. Add local device-card source-phase positive/inverse keeper and strengthen wordless-code visible-travel witness only if time permits. (small chapter prevention gaps)
4. Keep current versioned diagnostic registry and report exact observed clauses, secondary victims, blocked and inadmissible histories separately. (assessment integrity)

No production file, corpus entry, score or old evidence was changed for this assessment.
