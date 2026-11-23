# Refusals: seven causal repairs and authored prevention

Owned scope: `scenes/explainers/poppy-refusals/**`. No model, framework, frozen audit, or historical faulty replacement was changed. Existing footprint-aware routes are preserved. The changes add scene-owned contracts and independent native regression evidence.

## What changed

`scene.ts` declares that every ticket moves on its current named lane, with the lane stroke, sign, station and station name already present. Replacement keys also retain that context; new delegations and seals retain station context. The `for MCP` caption is required on a key journey only when it already belongs to the source state. Its initial introduction is not incorrectly treated as existing context.

The scene's fixed-row invariant expresses the author's chosen lane-layout policy: readable signs stay on their authored old or new rows while the layouts cross-fade. It leaves ticket movement unrestricted. This is an explicit editorial contract, not a generic judgment that layout movement is always wrong.

`scene.test.ts` now checks the native composited paint of the actual station ring separately from lane/station lettering, every authored ticket trajectory, delegation/seal trajectories, both replacement-key trajectories, and their genuine docking points. It counts fourteen actual request travellers across eight step/trouble combinations. Real ticket/key/delegation drawings are deliberately placed over actual victims, then restored as inverse controls; missing-road and sliding-sign poisons also reject. The baseline preserves all protected paint. The native helper retains fixed-size buffers and caches subject/traveller witnesses; no per-pixel object arrays or corpus-sized image histories are introduced. Tests reject measured ink loss immediately while retaining complete final witness assertions, so damaged variants stop rendering after their first proven loss.

## Per-case cause, contract, proof and boundary

| Historical entry | Cause chain and prevention | Independent proof | Limit |
| --- | --- | --- | --- |
| `refusals-ticket-over-station` | Seal-centred launch sends the whole ticket across the station ring. Preserve the lane launch; station ring has its own native protected-victim assertion. | Exact compound historical edit still rejects the unrelated answer overrun (3.450 versus 3.400 s). A separate legal-duration control changes only the request launch and loses 3,633 actual station-ring pixels at turned-back/frame 57. Actual-ticket-over-ring poison rejects; restored launch passes. | The compound edit's duration refusal is **not** credited as visible station prevention. |
| `refusals-ticket-over-lane-name` | Station-edge clearance omitted the lane sign. Keep the departure beyond the supported API/MCP sign footprints and ticket half-width. | Both supported signs and actual full-size ticket are witnessed. Historical launch edit loses 409 actual lettering pixels at turned-back/frame 44; actual-ticket-over-API poison fails; restored launch passes. | Contract covers the authored labels and token size; future wording/scale changes rerun this evidence. |
| `refusals-lanes-slide` | Reusing one key across two layouts turns a layout-height change into travel. Preserve separate identities and cross-fade. | Readable sign rows are observed as exactly 3, 3.92 and 2.85. An intermediate-row poison fails the scene invariant, restoration passes, and historical shared-key mutation fails it. | Frozen verdict remains editorial. Mechanical mutation alias rebase is required so missing renamed subjects cannot earn credit. |
| `refusals-lanes-gone-in-flight` | Treating supporting lanes as fresh results delays them until after the ticket. Relay first; require active lane line and sign during actual ticket movement. | Full story checks current lane presence throughout every visible ticket trip. Historical fresh-lane mutation fails `mcp-mcp: the request lost its road`; deliberate removal rejects and restoration passes. Authored motion requirements are evaluated during the actual move, including offstage portions, by the framework checker. | Presence is separate from full composited readability; native lettering clearance owns occlusion. |
| `refusals-delegation-over-station` | Lower entrance carries a filled certificate through the station name. Preserve upper entrance and genuine seal attachment. | Historical lower-route edit loses 440 agent-name pixels in the native comparison. Actual certificate-over-name poison rejects; upper route preserves the name. Both delegation and fresh seal finish at the seal, within float geometry tolerance. | Contact with the receiving seal is purposeful docking; no blanket station-overlap prohibition is added. |
| `refusals-mcp-key-over-label` | Inward descent crosses the actual MCP lane and station lettering. Preserve extent-based descent beyond the lane sign and then approach the hook. | Historical inward descent loses 200 MCP-lettering pixels. Actual-key-over-MCP poison rejects; repaired native route preserves API, MCP and station lettering and docks on its actual resting drawing. | Frozen historical target remains secondary-only: `for MCP` is introduced after the first flight, so absence during that flight is not credited as caption clearance. Its later actual paint is separately witnessed. |
| `refusals-key-over-lane-name` | Returning a full key on the named lane intersects API ink. Keep clearance based on the key's full width/height and actual sign extents. | Historical direct route loses 142 API pixels. Actual-key-over-API poison rejects. Repaired route preserves actual API and station lettering; final centre matches the actual resting key drawing. | Use the resting drawing's centre, not nominal hook coordinates: key geometry offsets that centre slightly. |

## Validation

- `node --expose-gc --test scenes/explainers/poppy-refusals/scene.test.ts scenes/explainers/poppy-refusals/model.test.ts`: **35 passed, 0 failed** (33 model tests and 2 native scene tests; final run 19.97 s). Log: `out/sol61/refusals-tests.log`.
- Scoped `rayner check`: **1 scenario, 9 steps, 51 reachable states, 33 model tests, 0 problems, 0 phone warnings**. Receipt: `out/sol61/refusals-check/report.json`.
- All seven exact historical edits were applied in isolated `/tmp` scene/picture copies, without changing repository production bytes. Native tests reject all seven. The additional station-launch-only control rejects on actual visual damage rather than duration. An earlier split-victim lane rerun terminated without an attributable assertion and is not credited; the final rerun rejects promptly on measured text loss. Logs: `out/sol61/refusals-*.log`; ledger: `out/sol61/refusals-poisons.json`.
- Global TypeScript, installed-package validation and whole-corpus measurement remain owned by root. No global test claim is made here.

## Corpus alias rebase sent to root

For the sliding-lane reconstruction only, additionally change its namespace lookup in the **mutation variant**:

```text
find:    const lane = laneOfWorld(after).mcpShown ? 'mcp-mcp' : 'api';
replace: const lane = laneOfWorld(after).mcpShown ? 'mcp' : 'api';
```

No existing `find` string changed because of production edits. Preserve all historical faulty replacements; this additional alias solely follows the historical shared lane namespace so an unknown-subject error cannot masquerade as an editorial motion detection.
