# Coverage investigation and prevention

Owned paths: `scenes/explainers/poppy-coverage/**`. Resolved and staged `scene.ts`; staged the strengthened `motion.test.ts`. Preserved the newer main API (`Scene` state binding, typed `settingsOf`, detached `s.drawing`, `sendSequence`) and the previous request replacement and full-footprint list route repairs. The merged `picture.ts` changes are main's API migration, not a new layout edit by this investigator. Frozen audit evidence was not changed.

## Seven retained cases

| Historical case | Cause and production decision | Independent prevention and deliberately faulty control |
| --- | --- | --- |
| `coverage-strips-cross` | Different strip groups used a shared corridor concurrently. Keep the existing ordered followed/reaching/set-aside groups; retain the independent ticket/set-aside parallelism. | New native knockout checks protect `applyGiftCard` and `checkout page` while the actual set-aside strip moves. Parallel-group poison fails because it hides 1,040 painted `checkout page` pixels. |
| `coverage-report-too-long` | Three journeys illustrated an approved two-journey explanation. Preserve sending the sealed report and receiving its answer, including existing explicit timings; no universal time cap added. | Existing occurrence-sensitive two-leg assertion now also requires each leg to paint at two distinct screen positions. Extra desk-to-station journey fails with `report:extra, report:sent, report:reply`; a second independently executed control reusing `report:sent` also fails with `report:sent, report:sent, report:reply`. This is an authored editorial contract, not a new universal diagnosis of duration. |
| `coverage-skill-card-twice` | A borrowed physical object was treated as a passing information copy while its source remained on the hook. Preserve its explicit source departure and restoration with the later ticket landing. | Add a machine motion rule requiring `skill:card` absent during actual `skill:read` movement. Native test separately witnesses the initially painted source, displaced painted carrier, absent source during movement, and painted restored source with the landing ticket in both companies. Source-survival poison fails on 2,995 actually painted source pixels. Legal restoration passes. |
| `coverage-reach-over-strips` | Secret-reaching paper crossed already settled followed strips; both route and scheduling mattered. Preserve the corridor detour and existing ordering. | New native knockout checks protect `GET the order` and `POST the exchange` throughout the hostile skill route. Historical direct-reach/order poison fails because it hides 889 painted `GET the order` pixels. It reaches this assertion rather than a runtime ceiling. |
| `coverage-desk-blinks` | Stable desk context was included in event-scoped `FRESH`. Keep desk context outside global fresh output; sort may deliberately replace it. | Add persistent `desk:head` during list movement. Native test finds the actual `the shop sees` text independently and requires its final composited ink whenever the list paints. Desk-in-fresh poison fails on disappeared desk ink. |
| `coverage-user-line-blinks` | Stable user speech inherited the tray paper's lifetime. Preserve separate `user:` keys, and preserve deliberate request replacement before a new probe. | Require `user:close` during list movement only when the same close request exists before and after the event. Native test locates `Close my account` by text, independent of key, and its historic tray-key poison fails because actual speech ink disappears. See the mechanical context alias rebase below. |
| `coverage-list-over-labels` | A direct route crossed feedback/shop labels; a later centerline detour still grazed a heading with the sheet's full footprint. Preserve the repaired route computed from both headings and the entire travelling sheet's width/height. | Existing scene-owned native route test covers feedback, both desk/tray headings and the user's complete command, with actual painted displacement required. Direct board-to-tray poison fails because it hides 654 painted pixels of `feedback / the shop sees`. Both company baselines pass. |

## Corpus context alias rebase

All existing seven-case source find strings remain valid. The new persistent speech declaration introduces a key reference that the historical user-line namespace edit must mechanically follow, so it tests the intended disappearance instead of an unrelated unknown-subject guard:

```text
file: poppy-coverage/scene.ts
find:    ...(closeStays ? ['user:close'] : [])
replace: ...(closeStays ? ['tray:user:close'] : [])
```

Keep the historical picture and probe-lookup replacements unchanged. The independent native user-line control already locates its victim by actual text and proves the original disappearance without relying on the declaration or this alias.

## Executed checks

Final command:

```sh
node --test scenes/explainers/poppy-coverage/scene.test.ts scenes/explainers/poppy-coverage/motion.test.ts scenes/explainers/poppy-coverage/model.test.ts
```

Result: **35 passed, 0 failed, 0 skipped**, about 24 seconds. Scoped staged whitespace check also passes. The preceding motion-only final run passes 4/4. An initial broad run rasterized every final resting skill frame and lost its motion worker; limiting the witness to the journey through its first verified restoration removed that unnecessary work, and the final combined run above passes.

All seven independent controls were finally rerun against the final production/test bytes with `python3 /tmp/coverage-controls.py`. Each test process exits 1 on its intended assertion, and the runner completes normally. Production was never mutated: controls use isolated source copies with absolute shared-runtime imports under `/tmp/coverage-controls/<case>/`, and each directory retains its source, test and `test.log`. Names: `strips-cross`, `report-extra-leg`, `skill-card-twice`, `reach-over-strips`, `desk-blinks`, `user-line-blinks`, `list-over-labels`. The separate repeated-key control is `/tmp/coverage-controls/report-repeated-key/test.log` (runner `/tmp/coverage-repeat-control.py`). Initial missing-package setup failures were fixed before these credited runs; they are not credited as detection.

## Limits

The new native assertions observe the complete sampled authored journeys at 800-pixel width, camera/clips/paint order included. They are scene-specific prevention, not a universal continuous-time clearance theorem. Presence assertions prove painted context survives; the separate native route checks protect full lettering from travelling obstructions. The hostile corridor tests target the actual adversarial strips; the report, context, borrowed-source and list baseline tests cover both honest and hostile companies. Deliberate information copying from the board, endpoint docking and later borrowed-source restoration remain legal. No global displacement/time ban was introduced. Generic every-event checks, corpus remeasurement, package smoke and full repository checks remain with root; this scoped work makes no claim that those were run here.
