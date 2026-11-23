> Integration note: this report records the isolated investigation. Its three chapter files have now been integrated. Final Ring replay, both-scenario fidelity, typecheck and installed-package checks passed; see [validation](validation.json). The original experiment receipts below retain their original identities.

# Ring-buffer source handoff repair (isolated proposal)

Production sources and the active full59 fingerprint remain unchanged. The complete chapter is copied at `out/sol61-ring/ring-buffer`; its unchanged shared PBT helper is under `lib`. Only the isolated `scene.ts` differs. `ring-buffer.patch` shows the proposed production edit.

## Cause

The pop transition copied `ring:value:<head>` into a temporary proxy and moved that proxy to the returned-value tray for 0.6 seconds. It did not retire the stored value until a later 0.35-second clear beat. When a departure had sufficient projected displacement, two partly overlapping digits painted at once. The key suffix `ring:value:4` identifies storage slot 4, not necessarily the digit 4: the exact reported history carries digit 5.

The real reader log `push, push, push, push, pop, pop, push, pop, pop, pop`, from the implementation machine's start, reproduces the finding at +0.500 s in both scenarios. At +0.633 s a native 1280-pixel capture shows offset copies of 5. Removing the stationary source independently changes 246 pixels; removing the moving proxy changes 212 pixels. This is a real departure duplication, not two legitimate distinct values or a checker false positive.

## Proposed edit

Preserve `arrive` and `newTray` construction/play order. Construct the entering proxy before claiming its source (the choreography removes a claimed source from its lookup immediately), then retire the source with a zero-duration leave co-timed with proxy appearance. The identical proxy replaces the original at the same position and is the sole value that travels. Preserve the existing 0.6-second flight, subsequent 0.35-second slot-clear beat, and head/fields/rest sequence. The proxy is already an exact snapshot of the source, so no additional fade or travel duration is needed.

## Evidence

- The unchanged production chapter's saved catalog report has 85 duplicate findings. Full authored playback and all reachable reader events in **both scenarios** of the isolated repair return **zero findings**: `findings.json`.
- `ring-transfer-proof.ts` is a repository fidelity owner using private reader replay; it belongs under `tools/repo/` if retained. Chapter scene tests keep public APIs. The proof accepts a scene path and `--poison` for the unchanged original.
- Keeper and original poison each cover 14 independently named native phases across both scenarios. The original source is visibly present before departure. At +0.500 and +0.633 the moving proxy visibly contributes and the receipt contributes nothing. The keeper source contributes zero during those frames; the original source contributes 244/246 pixels. Arrival replaces the proxy with a receipt contributing 640 pixels. These checks prevent missing sources, invisible transit, or early receipts from satisfying the ownership assertion.
- Native samples of the head pointer base and slot paint are **exactly equal at all 14 matched phases**, as are final model states: `timing-parity.json`. The repair changes value ownership while retaining slot/pointer order.
- Keeper and poison native receipts and middle-frame PNGs: `keeper/` and `poison/`.
- Public isolated scene tests: 2 passed. Isolated model tests: 2 passed after copying their missing sibling `lib/pbt.ts` (the first combined run had a fixture import setup failure, not a behavioral failure).

No global typecheck or source/core edits were performed. Root will integrate after the current captures end, then rerun Ring and affected package/type checks. Frozen59 historical evidence and score are unchanged by this separate catalog repair.


## Persistent owned regression ready for integration

Copy exactly these three isolated files into the corresponding chapter paths:

- `ring-buffer/scene.ts`
- `ring-buffer/fidelity.ts`
- `ring-buffer/oracle/fidelity.ts` (new)

`ring-buffer-owned.patch` is the combined patch. The existing `assertStepState` comparison against `ringStory` remains intact. Fidelity now accepts typed `FidelityRun` and passes the actual `scenario.Scene` to its repository-only oracle. Neither public scene test imports the oracle, so installed-package tests stay portable.

The oracle owns all seven native phases for each actual scenario, normal duplicate diagnostics, final model equality, and preserved pointer/slot timing. It also constructs an isolated retained-source class through Node's TypeScript stripping: only the source-retirement action is replaced by an empty action. The same legal authored duration remains, and the original stored value survives through the move. The exact native ownership assertion must reject this control; the normal duplicate detector must also find it. There are no guard exemptions or test-only production exports. A direct call against the unchanged original production chapter also rejects at that ownership assertion in both scenarios.

Validation after packaging: all four public chapter tests pass in 3.103 seconds. Calling the extended fidelity helper directly for both collected scenarios passes keeper and poison checks in 6.952 seconds. `owned-validation.json` retains file identities and counts. The older standalone proof remains a diagnostic artifact; integration only needs the three chapter files above.
