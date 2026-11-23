# Browser: 14-case causal repair report

Ownership: `scenes/explainers/poppy-browser/**`. Merge resolved by retaining main's `DrawContext` API and HEAD's `carry` repair. Frozen audit and evidence files were not edited.

## Changes and new evidence

The scene now declares that the actual read trip retains the page code, submission's physical stub is absent during its carry, and the attacker's cookie remains while its request copies it. The previous declined message must clear for forge, fetch and browse; the empty-rack notice must clear during the initial request as well as both issuance trips. Each actual issuing trip still requires its particular stub and ring.

A new baseline defect was measured at forged-stub landing: the old centre x=1.35 gave the complete slip box x=0.398000..2.302000 over the stop box x=1.929999..2.269999. The final port now uses the actual stop's left edge minus half the actual token width and a 0.12 gap. Native proof constrains only the final stationary dwell, accepting the earlier road crossing. Both a centred-on-stop poison and the prior x=1.35 port must obscure actual stop ink and reject.

`scene.test.ts` adds all-three-setting authored issuance ordering, code-specific record prerequisites, old empty-state removal, copied-read source retention, consumed submitted stub, a positive simultaneous submission, reserved ticket corridor, readable travel literal size, actual multi-position witnesses, and an explicit legend-visible multirow stationary fixture. The fixture does not alter the story or pretend the frozen legend mutation reproduced a defect.

`fidelity.ts` adds native Resvg four-paint knockout checks, at 800px and the scene's 30fps, of the entire visible authored read, forgery, message, attacker-cookie, submission-half and issuance-cookie trajectories against their named host/code glyphs. Every route requires the protected lettering to contribute actual painted pixels, and actual moving-traveller paint at two distinct screen positions. Each has an independent poison that moves the actual visible traveller onto those glyphs, requires native rejection, and restores the traveller before playback continues. The submission and read copy controls remain valid. Reader paths separately check second-load authorization and phish-before-forge, including the no-scope retry branch.

Exact native inventory: 18 authored route checks, 3 authored landing checks, 6 reader route checks; 18 independent route-overlap rejections and 6 independent landing rejections (centred stop plus old grazing port). Frame totals are not retained, so this report makes no exact frame-count claim. These are scene/native assertions, not new historical corpus scores. Native route/landing controls observe paint; lifetime declarations observe isolated subject presence and do not independently establish composited readability.

## All 14 historical cases

| ID | Cause, retained fix or added prevention | Proof owner and disposition |
| --- | --- | --- |
| browser-ticket-over-road-name | A reading label shared the full ticket corridor. Retain the authored unnamed road. | Public scene test witnesses moving tickets and absence of the road-name label; historical attributed covers remains the native historical evidence. Confirmed, retained repair. |
| browser-halves-together | Independently meaningful halves shared issuance time/space. Retain sequential issue; parallel submission remains valid on separate approaches. | Scene test requires nonoverlapping issuance intervals and page-first ordering. Native issuance-cookie versus the printed page code plus overlap poison; native submission-half versus carried literal plus overlap poison. Confirmed, retained repair. |
| browser-read-across-page | Direct read route crossed the actual browser host. Retain window-edge itinerary and literal copy. | Native full authored/read-on-second-load host clearance and actual-host overlap poison, all settings. Confirmed, new scene-owned prevention despite archived no-finding. |
| browser-forge-across-stage | Direct attacker shortcut crossed account/session readout. Retain lower approach. | Native full forge route against browser/attacker hosts and account/session glyphs; reader reversed attacks; independent visible actual-traveller poison. Confirmed, retained repair. |
| browser-message-across-stage | Historic reconstruction also overruns its event budget. Retain bottom route and strict duration guard. | Legal-duration baseline message native route and independent glyph-overlap poison. Historical reconstruction remains guard-only; no historical painted geometric reproduction is claimed. |
| browser-message-lingers | Obsolete declined message and empty-state notice inherited scene lifetime. Expand named absence rules to all relevant next trips. | Motion contracts now cover forge/fetch/browse after phish and the initial load request; public issuance absence assertion. Confirmed; framework/root owns complete reachable contract checking. |
| browser-submit-meet-on-top | Shared landing centre masked the code under its half. Retain adjacent ports and unique physical stub carry. | Native entire paired submission route, actual code-glyph overlap poison; public positive parallel submission/source retirement. Confirmed, retained repair. |
| browser-forge-ends-on-stop | Centre-only endpoint accounting hid part of the named painted stop even in the baseline. Derive final port from complete token and stop extents. | Native final-dwell-only clearance plus centred-stop and exact old-port poisons; earlier crossing accepted. Confirmed landing clause only; no claim that spatially separate rack barrier fell on the token. |
| browser-record-after-halves | Generic settle deferred a prerequisite record until after issuance. Retain early stub/ring entrance and mandatory actual-trip contracts. | Every authored issuing sample requires the specific row's stub/ring; mandatory flight contracts still cover reachable loads. Confirmed, retained repair. |
| browser-read-over-its-copy | Legitimate data copy peeled apart over its source. Retain separate departure port and original code. | Native entire read route protects original code ink plus host; overlap poison and public source-retention positive. Confirmed; unique-object carry deliberately does not replace this read. |
| browser-legend-moves | Historic legend position depended on rack count, but the audited routes do not show a changed visible legend. Retain fixed position. | Independent explicit legend-visible fixture checks all four legend positions across zero/one/two own records. Frozen entry stays unreproduced and gains no historical score. |
| browser-attacker-over-shelf | Exit side crossed attacker host/shelf region. Retain external left port. | Native whole forgery against evil.example; phish cookie against evil.example and cookies; all-three-setting actual-object overlap controls. Confirmed host clause only; do not claim historical cookies-caption loss. |
| browser-read-tiny-words | Miniaturized resting stub was used for a required literal. Retain purpose-sized code slip. | Public all-setting full-trip literal size check; frozen native phone comparison and existing small-words detector remain historical/readability owners. Confirmed. |
| browser-forge-tiny-words | Same resting-design miniaturization affected forgery literal. Retain purpose-sized code slip. | Public all-setting full-trip literal size check; frozen native phone comparison and existing small-words detector remain historical/readability owners. Confirmed. |

## Scoped validation

- `node --test scenes/explainers/poppy-browser/scene.test.ts scenes/explainers/poppy-browser/model.test.ts`: 24 passed, 0 failed, 0 skipped (final run after scene repair).
- `node --test --test-name-pattern='^poppy-browser:' test/explain-fidelity.test.ts`: one Browser fidelity test, all three settings and their authored/reader/poison inventories. Initial full-route version passed in 32.6s; landing version passed in 39.5s. Final version including the exact old-port poison passed in 37.6s (1 passed, 0 failed, 0 skipped).
- All Node test runs used `require_escalated`, as requested. Global TypeScript, installed-package smoke, full suite and complete 59-case corpus remain root-owned.

## Exact corpus context rebases needed

Do not change historical faulty replacements or frozen evidence.

1. `browser-forge-across-stage`: its full route `find` changes from `[EVIL_OUT, [EVIL_SIDE_X, 0.95], [WIN_RIGHT - 0.6, 0.95], ROAD_B_FROM, [COUNTER_X - 0.75, ROAD_B]]` to `[EVIL_OUT, [EVIL_SIDE_X, 0.95], [WIN_RIGHT - 0.6, 0.95], ROAD_B_FROM, forgedStop]`. Preserve its old diagonal `replace` exactly.
2. `browser-forge-ends-on-stop`: its suffix `find` changes from `ROAD_B_FROM, [COUNTER_X - 0.75, ROAD_B]], { appear: 0.25, move: 1.3, leave: 0.2 }` to `ROAD_B_FROM, forgedStop], { appear: 0.25, move: 1.3, leave: 0.2 }`. Preserve `ROAD_B_FROM, COUNTER_B], { appear: 0.25, move: 1.3, leave: 0.2 }` as its faulty replacement.

## Every-event follow-up: empty rules and fetch context lifetime

The fresh every-event measurement exposed an invalid `request` rule on reader reload: with an already populated rack, no `rack:none` subject exists, so the rule accidentally had no subjects. The scene now emits that request-only absence rule only when the empty-rack subject exists. Both issuance record/ring rules remain unconditional. An attached `MachineMotionCheck` regression plays `load, submit, load` at the reachable reader step in all three settings.

After that runtime correction, the complete every-event baseline exposed 12 truthful absence findings on `phish → fetch` (message and note, first/second-load paths, three settings). Fetch alone had omitted the existing `FRESH` retirement set. Fetch now uses that set, preserving the truthful message-absence rule. An attached `MachineMotionCheck` regression plays this sequence in all three settings; a separate focused run also checked the second-load version: all six reader histories had zero findings.

Only `scene.ts` and `fidelity.ts` changed in this follow-up. The final targeted Browser fidelity/native run passed 1 test, 0 failed, 0 skipped in 38.8s, including the new attached regressions and all existing native positive/poison controls. Final complete every-event baseline: **zero findings, no errors**, completed in 125.6s; receipt: `out/sol61/browser-baseline-final.json`. No corpus anchors or frozen audit/evidence changed.
