# The motion defect corpus

`rayner check` follows every keyed part through every transition ([Keyed motion](REFERENCE.md#keyed-motion)). Its rules were first tuned on the catalog and proven on three synthetic defects and three real ones it found. This page measures its recall on real defects: the motion defects that filming the eight Poppy chapters found after `rayner check` and `rayner review` had passed them ([issue #101](https://github.com/adewale/rayner/issues/101), item 14, and the glyph dissolve of item 12), and three more that filming poppy-conversations found later.

## What the corpus is

Issue #101 counts 63 filmed defects and names their kinds, but lists none of them one by one, and the branch that fixed them (`claude/focused-newton-s7zxou`, pull request #102) records the fixes only as hunks in work-in-progress commits. So the corpus is built from the fixes, not from a list: every scene and picture hunk of the motion audit commits (d4392856 to 9e7d166a, with 0a887ad4, on that branch) was read with the comment it added, and each fix of a motion defect became one entry. Each entry undoes its fix on the current Poppy scenes, as a few text edits (`test/fixtures/motion-corpus/corpus.ts`): `reverted` when the fix's hunk reverses onto the scene as it stands, `adapted` when later commits moved the lines and the pre-fix code was rewritten onto them. Its `kind` is #101's, read from the fix's own comment; two kinds the fixes show and item 14 does not name are kept apart (`squeezed`, from item 12, and `flicker`). Two entries come from origin/claude/film-fixes (46cdb7e6), which filming poppy-conversations found after the audit; its third finding, an engine bug, is measured by hand below.

There are 59 entries. Fixes left out are listed, with the reason, in `NOT_IN_CORPUS` in the same file: one is a transition rewritten whole, with no single defect to tell; one is a new step with no before-state; one is an engine bug (below); the rest are re-timings, comments, and the layout, wording and schema changes that shared the audit commits. The 59 are therefore not a subset of #101's 63 that can be matched one to one: they are every motion fix the history shows, which is the nearest recoverable record of them.

The corpus is kept as edits, not as copies of the scenes. `tools/repo/motion-corpus.ts` copies the Poppy folders to `out/motion-corpus-<id>/` (three levels below the root, so the scenes' relative imports resolve), makes the entry's edits and runs the keyed motion check on the copy, in a process of its own, four at a time. The repository carries about 50 KB of edits and their descriptions rather than a copy of eight explainers per defect, needs no git history (the Poppy branch is not an ancestor of main), and a change to a Poppy scene that moves an entry's text fails a fast test naming the entry rather than silently measuring nothing.

## How it is measured

Each entry is caught when the check makes a finding in its variant that the scene as it is does not have. The scenes as they are have none (the catalog's gate), and the runner runs each chapter's baseline first, with every event: a finding a baseline has is not counted for an entry. For the figures below every baseline was clean. An entry names the machine events whose transitions its edits change; the runner plays those events' transitions from every reachable state, with every play of every scenario's run. That is a subset of what `rayner check` plays, so what it catches the check catches. `--full` plays every event, as the check does; run that way, no entry missed below is caught.

```sh
node tools/repo/motion-corpus.ts                # every entry, focused; out/motion-corpus.json has each entry's findings
node tools/repo/motion-corpus.ts --full         # every event's transitions, as rayner check plays them
node tools/repo/motion-corpus.ts --only <id>,…  # some entries
```

`test/motion-corpus.test.ts` checks that every entry's edits still apply, runs five sample entries by default (covers, small words, flicker and both attributed occlusion gains), and with `FULL=1` (`npm run test:full`, CI's `check` job) runs every entry and requires each of the 32 retained rejection IDs individually. A separate FULL-only native pixel proof establishes the credited poll's visible defect independently of the detector. "Before" is the check as it was at 3e71fe38 (jump, flicker, early words); "after" is the check with the two rules added here (covers, small words) and flicker's same place widened from 0.08 to 0.2 units.

## Latest measurement: 20 November 2026

The complete focused run rejects **32 of 59** reconstructed mutations, up from
30. All thirty previous rejection IDs remain caught. All eight full-event Poppy
baselines are clean, no mutation errored, and the other 44 catalog chapters are
also clean on the final detector and choreography.

| Mutation kind | Cases | November 19 | November 20 |
| --- | ---: | ---: | ---: |
| passes over | 28 | 19 | 20 |
| result before cause | 5 | 0 | 0 |
| layout motion | 8 | 0 | 1 |
| two copies | 4 | 2 | 2 |
| squeezed | 3 | 3 | 3 |
| too long | 3 | 0 | 0 |
| small label in flight | 3 | 3 | 3 |
| glyph dissolve | 1 | 0 | 0 |
| flicker | 4 | 3 | 3 |
| **all** | **59** | **30** | **32** |

The two gains have independently rendered, attributed evidence:

- **`sign-in-poll-over-card`: intended occlusion.** The poll masks letters in
  `Example Company`. Judging individual glyph boxes catches this partial name
  even though the whole line's box did not meet the former coverage threshold.
  Three frames on both routes, glyph-removal controls and named-poll removal
  establish the actual lost ink. Pinned Chromium independently confirms the
  middle frame's sixty SVG controls. A FULL-only regression reruns the native
  pixel proof without using the detector's geometry.
- **`sign-in-ask-people-slide`: secondary occlusion.** In the reconstructed
  reflow, the moving tag hides seven letters of `Exchange items`; removing that
  tag restores their ink. Its rejection explains the table's one layout-motion
  hit. It detects a geometric consequence of this mutation, and does not judge
  whether a smooth, unobscured movement helps the explanation.

Both new entries require fresh findings on the observed scenario, transition,
part, words and foreground shape. An unrelated warning or duration guard cannot
substitute. Historical entries retain the earlier rejection metric: seven are
guard-only refusals, including four classified as passes over
(`refusals-ticket-over-station`, `browser-message-across-stage`,
`conversations-turn-over-seat-name`, `discovery-arm-over-register`). Those four
reject before painting their intended crossing. The 32/59 result is consequently
a comparable mutation-rejection score, not 32 direct diagnoses of the historical
defect kinds or a general detection accuracy estimate.

The new foreground rule certifies coverage of glyph boxes by an opaque fill,
including non-travelling shapes, with camera/descendant clips, conservative stroke
bounds, SVG fill rules and cubic control-point hulls. It preserves transparent
paint, holes, cutouts, co-located text handoffs and terminal wipes. It does not
combine smaller masks or establish complete composited visibility. A separate
outside-corpus poison still misses text temporarily lacking a keyed ancestor.
The glyph-dissolve reconstruction remains uncredited: its 1,564 affected frames
matched baseline after later changes stopped pairing those ledger keys.

The baseline work repaired shared target-part entrance layering and actual
sign-in, statechart, browser-record and coverage-request occlusions. The rule was
not weakened to waive those scenes. Failed baseline replays now make the score
unavailable; saved observations remain diagnostic evidence.

[Evidence, native images, controls and reproduction commands](https://github.com/adewale/rayner/blob/1522b5040e599edcf9f373ff7e3e3fad9e730bfd/docs/evidence/motion-occlusion-2026-11-20/README.md)
and the retained `corpus.json` give the case inventory, baseline counts and new
observations. The measurement uses the same 59 entry IDs and focused event
selection, with every baseline's events. Subsequent public-API test ports and
attribution metadata leave the measured runtime and normalized mutation edits
unchanged. Causality, unnecessary movement and pacing still need authored meaning
and visual review.

## Previous measurement: 19 November 2026

A fresh focused run on the follow-up implementation caught **30 of 59** mutations;
all eight baselines were clean and no entry errored. The score by kind is 19/28
passes over, 0/5 result before cause, 0/8 layout motion, 2/4 two copies, 3/3
squeezed, 0/3 too long, 3/3 small label in flight, 0/1 glyph dissolve and 3/4
flicker. This remains a measure of reconstructed mutations, not general detection
accuracy or proof of narrative correctness.

The strict event-duration check now catches all three squeezed mutations. The
normal scenes declare enough time for their actual choreography. A five-second
motion ceiling and a duplicate-word rule also have independent poison controls;
the three historical “too long” examples remain below that ceiling. The glyph
mutation explicitly requests glyph matching now that whole-word matching is the
default; removing an option alone would no longer recreate the old behaviour.

The earlier `poppy-last-object-lingers` hit was an incidental **size jump**, not a
semantic stale-result finding. Current transition defaults remove that jump, so
the unchanged-result mutation is correctly reported as missed. Its former
mechanical assertion has a keeper in `test/motion-corpus.test.ts`, replaying actual
frame measurements in `historical-exhibit-jump.json`, captured from the earlier
implementation at commit `0b1fe3e`. The fixture records provenance, not a current
source hash to refresh. The test still rejects the recorded 53% size jump and
accepts invisible geometry. The full current-corpus gate preserves the other 25
previous hits and five new hits individually. The archived jump is **not** added
to the current 30/59 score.

`rayner film` and review's native mid-play frames provide visual evidence for the
remaining semantic and pacing cases. They do not turn those misses into passes.

## Historical recall: 15 November 2026

Measured on 2026-11-15, focused runs, the catalog as of this page. Before: 3 of 59 (5%). After: 26 of 59 (44%). The "which rule" column names the rules whose findings were the entry's own (not in its chapter's baseline).

| Entry | Chapter | Kind (#101) | Fix commit | Method | Before | After | Why missed, or which rule |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `poppy-ticket-over-lane-names` | poppy | passes over | 0a887ad4 | adapted | missed | caught | covers |
| `poppy-key-over-station-name` | poppy | passes over | 0a887ad4 | reverted | missed | missed | no readable label under the token's ink (none above 5% of a label's box in any frame): what it passes over is a drawing (a station, a card, a stop, the register) or, in the current layout, nothing; covers judges words only |
| `poppy-last-object-lingers` | poppy | result before cause | 0a887ad4 | reverted | caught (jump) | caught | jump |
| `refusals-ticket-over-station` | poppy-refusals | passes over | d4392856 | adapted | missed | caught | covers |
| `refusals-ticket-over-lane-name` | poppy-refusals | passes over | 0a887ad4 | reverted | missed | caught | covers |
| `refusals-lanes-slide` | poppy-refusals | layout motion | 0a887ad4 | adapted | missed | missed | no rule: a part sliding smoothly to a new place for the composition has no mechanical tell; the same slide carries meaning elsewhere |
| `refusals-lanes-gone-in-flight` | poppy-refusals | layout motion | 82eb9c03 | adapted | missed | missed | no rule: the lanes are fresh, hidden while the ticket travels and back after it lands, which flicker excuses as the event's result |
| `refusals-delegation-over-station` | poppy-refusals | passes over | 0a887ad4 | reverted | missed | caught | covers |
| `refusals-mcp-key-over-label` | poppy-refusals | passes over | 0a887ad4 | reverted | missed | missed | no readable label under the token's ink (none above 5% of a label's box in any frame): what it passes over is a drawing (a station, a card, a stop, the register) or, in the current layout, nothing; covers judges words only |
| `refusals-key-over-lane-name` | poppy-refusals | passes over | d99c9195 | reverted | missed | missed | no readable label under the token's ink (none above 5% of a label's box in any frame): what it passes over is a drawing (a station, a card, a stop, the register) or, in the current layout, nothing; covers judges words only |
| `sessions-ticket-from-under-stamp` | poppy-sessions | passes over | d99c9195 | reverted | missed | caught | covers |
| `sessions-key-to-wax-after-check` | poppy-sessions | result before cause | d99c9195 | adapted | missed | missed | no rule: a cause shown after its result (the key reaches the wax as the picture settles); early words judges results shown before a token lands, not causes shown late |
| `sessions-key-in-two-places` | poppy-sessions | two copies | cb20195a | adapted | missed | missed | no rule: the two copies are a ring with no words, apart, not one over the other |
| `sessions-squeezed` | poppy-sessions | squeezed | 2d181ce5 | adapted | missed | missed | no rule: the squeeze is mild (1.1 to 1.2 times) and snaps no move; a squeeze check failed shipped transitions squeezed more (below) |
| `sessions-too-long` | poppy-sessions | too long | 9e7d166a | reverted | missed | missed | no rule: no ceiling separates these from transitions the audit kept (poppy-coverage's hostile sort runs 4.9 s) |
| `sign-in-ask-people-slide` | poppy-sign-in | layout motion | 3038108f | adapted | missed | missed | no rule: a part sliding smoothly to a new place for the composition has no mechanical tell; the same slide carries meaning elsewhere |
| `sign-in-collect-people-slide` | poppy-sign-in | layout motion | 3038108f | adapted | missed | missed | no rule: a part sliding smoothly to a new place for the composition has no mechanical tell; the same slide carries meaning elsewhere |
| `sign-in-collect-too-long` | poppy-sign-in | too long | 3038108f | adapted | missed | missed | no rule: no ceiling separates these from transitions the audit kept (poppy-coverage's hostile sort runs 4.9 s) |
| `sign-in-tokens-over-labels` | poppy-sign-in | passes over | bf773626 | adapted | missed | caught | covers |
| `sign-in-password-before-card` | poppy-sign-in | result before cause | bf773626 | adapted | missed | missed | no rule: the password left in the field is unchanged words, which early words does not judge (only words new or changed in the transition) |
| `sign-in-ask-squeezed` | poppy-sign-in | squeezed | 58b06e8e | adapted | missed | missed | no rule: the squeeze is mild (1.1 to 1.2 times) and snaps no move; a squeeze check failed shipped transitions squeezed more (below) |
| `sign-in-pages-overlap` | poppy-sign-in | passes over | d99c9195 | adapted | missed | missed | no readable label under the token's ink (none above 5% of a label's box in any frame): what it passes over is a drawing (a station, a card, a stop, the register) or, in the current layout, nothing; covers judges words only |
| `sign-in-card-from-desk` | poppy-sign-in | layout motion | d99c9195 | adapted | missed | missed | no rule: a part sliding smoothly to a new place for the composition has no mechanical tell; the same slide carries meaning elsewhere |
| `sign-in-poll-over-card` | poppy-sign-in | passes over | d99c9195 | reverted | missed | missed | no readable label under the token's ink (none above 5% of a label's box in any frame): what it passes over is a drawing (a station, a card, a stop, the register) or, in the current layout, nothing; covers judges words only |
| `sign-in-password-hand-and-flight` | poppy-sign-in | two copies | d99c9195 | adapted | missed | missed | no rule: the card in your hand and the card in flight are apart, not one over the other; whether a copy should have left is meaning, not geometry |
| `sign-in-code-tiny-words` | poppy-sign-in | small label in flight | cb20195a | adapted | missed | caught | small words |
| `sign-in-password-route` | poppy-sign-in | passes over | cb20195a | reverted | missed | missed | no readable label under the token's ink (none above 5% of a label's box in any frame): what it passes over is a drawing (a station, a card, a stop, the register) or, in the current layout, nothing; covers judges words only |
| `sign-in-tag-over-scopes` | poppy-sign-in | passes over | cb20195a | adapted | missed | caught | covers |
| `browser-ticket-over-road-name` | poppy-browser | passes over | 0a887ad4 | adapted | missed | caught | covers |
| `browser-halves-together` | poppy-browser | passes over | 0a887ad4 | adapted | missed | caught | covers |
| `browser-read-across-page` | poppy-browser | passes over | 0a887ad4 | adapted | missed | missed | no readable label under the token's ink (none above 5% of a label's box in any frame): what it passes over is a drawing (a station, a card, a stop, the register) or, in the current layout, nothing; covers judges words only |
| `browser-forge-across-stage` | poppy-browser | passes over | 0a887ad4 | adapted | missed | caught | covers |
| `browser-message-across-stage` | poppy-browser | passes over | 0a887ad4 | reverted | missed | caught | covers |
| `browser-message-lingers` | poppy-browser | result before cause | 0a887ad4 | reverted | missed | missed | no rule: the declined message stays, unchanged, through the next flight; early words judges only new or changed words |
| `browser-submit-meet-on-top` | poppy-browser | passes over | 58b06e8e | reverted | missed | caught | covers |
| `browser-forge-ends-on-stop` | poppy-browser | passes over | 58b06e8e | reverted | missed | missed | no readable label under the token's ink (none above 5% of a label's box in any frame): what it passes over is a drawing (a station, a card, a stop, the register) or, in the current layout, nothing; covers judges words only |
| `browser-record-after-halves` | poppy-browser | result before cause | d99c9195 | reverted | missed | missed | no rule: the record is shown after what follows from it; nothing is readable early |
| `browser-read-over-its-copy` | poppy-browser | two copies | d99c9195 | adapted | missed | caught | covers |
| `browser-legend-moves` | poppy-browser | layout motion | d99c9195 | reverted | missed | missed | no rule: a part sliding smoothly to a new place for the composition has no mechanical tell; the same slide carries meaning elsewhere |
| `browser-attacker-over-shelf` | poppy-browser | passes over | ffc39ca0 | reverted | missed | caught | covers |
| `browser-read-tiny-words` | poppy-browser | small label in flight | cb20195a | adapted | missed | caught | small words |
| `browser-forge-tiny-words` | poppy-browser | small label in flight | cb20195a | adapted | missed | caught | small words |
| `conversations-layout-slides` | poppy-conversations | layout motion | f3a705cf | adapted | missed | missed | no rule: a part sliding smoothly to a new place for the composition has no mechanical tell; the same slide carries meaning elsewhere |
| `conversations-turn-over-seat-name` | poppy-conversations | passes over | 0a887ad4 | adapted | missed | caught | covers |
| `conversations-words-dissolve` | poppy-conversations | glyph dissolve | 0a887ad4 | reverted | missed | missed | no rule: the morph keeps each word's alpha and box while its glyph outlines blend, which the sampler (boxes, alpha, words) does not see |
| `conversations-person-over-ledger` | poppy-conversations | passes over | 0a887ad4 | reverted | missed | missed | threshold: the person's mark covers 40% of “role” for two frames in a row (0.07 s), under covers' 0.1 s |
| `conversations-table-block-blinks` | poppy-conversations | flicker | 46cdb7e6 | reverted | missed | missed | excused: the block is fresh, hidden while the turn travels and back after it lands; narrowing the excuse failed the kit's answer pattern (below) |
| `conversations-block-crossfades` | poppy-conversations | flicker | 46cdb7e6 | reverted | missed | caught | flicker |
| `coverage-strips-cross` | poppy-coverage | passes over | f3a705cf | adapted | missed | caught | covers |
| `coverage-report-too-long` | poppy-coverage | too long | f3a705cf | adapted | missed | missed | no rule: no ceiling separates these from transitions the audit kept (poppy-coverage's hostile sort runs 4.9 s) |
| `coverage-skill-card-twice` | poppy-coverage | two copies | 0a887ad4 | adapted | missed | caught | covers |
| `coverage-reach-over-strips` | poppy-coverage | passes over | bf773626 | adapted | missed | caught | covers |
| `coverage-desk-blinks` | poppy-coverage | flicker | d99c9195 | reverted | caught (flicker) | caught | flicker |
| `coverage-user-line-blinks` | poppy-coverage | flicker | d99c9195 | reverted | caught (flicker) | caught | flicker |
| `coverage-list-over-labels` | poppy-coverage | passes over | d99c9195 | adapted | missed | caught | covers |
| `discovery-arm-over-register` | poppy-discovery | passes over | 3038108f | adapted | missed | missed | no readable label under the token's ink (none above 5% of a label's box in any frame): what it passes over is a drawing (a station, a card, a stop, the register) or, in the current layout, nothing; covers judges words only |
| `discovery-sheet-over-shop` | poppy-discovery | passes over | 0a887ad4 | adapted | missed | missed | no readable label under the token's ink (none above 5% of a label's box in any frame): what it passes over is a drawing (a station, a card, a stop, the register) or, in the current layout, nothing; covers judges words only |
| `discovery-fetch-squeezed` | poppy-discovery | squeezed | bf773626 | adapted | missed | missed | no rule: the squeeze is mild (1.1 to 1.2 times) and snaps no move; a squeeze check failed shipped transitions squeezed more (below) |
| `discovery-path-slides` | poppy-discovery | layout motion | d99c9195 | reverted | missed | missed | no rule: a part sliding smoothly to a new place for the composition has no mechanical tell; the same slide carries meaning elsewhere |

| Kind | Entries | Caught before | Caught after |
| --- | --- | --- | --- |
| passes over | 28 | 0 | 17 |
| result before cause | 5 | 1 | 1 |
| layout motion | 8 | 0 | 0 |
| two copies | 4 | 0 | 2 |
| squeezed | 3 | 0 | 0 |
| too long | 3 | 0 | 0 |
| small label in flight | 3 | 0 | 3 |
| glyph dissolve | 1 | 0 | 0 |
| flicker | 4 | 2 | 3 |
| **all** | **59** | **3** | **26** |

## What this score establishes

The change from 3/59 to 26/59 is coverage of these reconstructed historical mutations. It is not a measured 44% detection rate for arbitrary animation defects, and the 33 misses are not 33 known defects still present in the current catalog. The examples share one eight-chapter subject and drawing kit, were selected from defects older checks missed, and were used to tune the new rules. There is no independent held-out sample here.

Of the 59 entries, 24 directly reverse a fix and 35 adapt an old defect to later source. The edit-applicability test proves the mutation still changes code, not that it still reproduces the intended visible defect; some misses now cross nothing in the current layout. The score also counts any finding absent from the baseline as a hit, even if it names a different problem from the historical one. At that measurement the full regression test preserved the 26 named hits; the latest section accounts for each assertion after the transition changes, so a new hit cannot silently compensate for losing an old one; its fast sample covers three detector kinds. Those tests omit baseline runs on the assumption that the separate catalog gate is clean. The reporting command runs baselines and subtracts their findings.

The 23 additional hits are 19 **covers**, 3 **small words**, and 1 **flicker**; the earlier 3 were 1 **jump** and 2 **flicker**. There are no early-words hits in this corpus. The result-before-cause entry counted as caught is detected as a jump. The mechanical work left includes glyph dissolution, occlusion by drawings rather than readable labels, and engine paint-order defects outside this scene-mutation corpus. Timing and narrative causality need authored meaning or editorial review; shortening every long transition would not establish either.

For future measurements, retain affected-frame evidence showing each mutation still depicts its intended defect, associate acceptable rule/transition/part findings with it, and report baseline-subtracted results. Add independently discovered cases prospectively. Keep semantic and pacing review alongside these mechanical checks. [The follow-up review](https://github.com/adewale/rayner/blob/main/docs/evidence/review-2026-11-17.md) separates those recommendations from changes already verified.

## Why the historical misses were missed

This section describes the November 15 run; the latest measurements above supersede it.

The 33 misses fall into five groups (the table gives each entry's):

- **Over a drawing, not words, or not a token (10).** Covers judges a travelling token over a label's words. In these variants no readable label lies under a token's ink (none above 5% of a label's box in any frame): a key passes over a station, a poll over the device card's paper; or what moves is not a token (the register's arm is drawn out, a page fades in over another). Judging any part under a token would fail every flight along the line it travels, so the rule stays with words.
- **Under a threshold (1).** conversations-person-over-ledger covers 40% of “role” for two frames in a row (0.07 s); covers needs 0.1 s.
- **Layout motion (8).** A smooth slide to a new composition has no mechanical tell: the same slide carries meaning elsewhere (the travellers in poppy-conversations' reflow). One of the eight (`refusals-lanes-gone-in-flight`) hides the lanes as `fresh` across the ticket's flight, which flicker excuses.
- **No rule for the kind (13).** Too long (3) and squeezed (3): see below. Glyph dissolve (1): a morph keeps each word's alpha and box while its outlines blend, which the sampler (boxes, alpha, words) does not see. A cause shown after its result (2) and unchanged stale words left through a flight (2): early words judges only words new or changed in the transition, readable before a token lands. Two copies apart (2): a card in your hand and in flight, a ring in the chain and on its way; whether a copy should have left is meaning, not geometry.
- **Excused (1).** conversations-table-block-blinks: the block is `fresh`, hidden while the turn travels and back after it lands. Narrowing the excuse failed the kit's answer pattern (below).

Run with `--full`, every event's transitions as `rayner check` plays them, every one of these is still missed.

## Rules tried and not kept

- **A whole block hidden for part of it.** The flicker rule excuses a part hidden while a token travels that comes back once it lands (the kit's `fresh`), which let poppy-conversations' "On the table" heading and labels blink for a second at every message. Narrowing the excuse to blocks of which only some parts change (keys sharing their first segment) made 1,065 findings in seven Poppy chapters: the kit's own answer, whose code and phrase go out with it and come back beside a new meaning, as `beats`' default `fresh: ['answer:', …]` intends. The excuse stays, and the entry is missed.
- **Squeezed transitions.** A transition whose beats outlast its event's `runTime` is played faster to fit. A check that failed any squeeze failed shipped Poppy transitions that filming passed (poppy-browser's `load` plays 4.15 s of beats in 2.6 s, poppy-conversations' `joins` 2.0 s in 1.4 s), while the three squeezes the audit fixed were milder (1.1 to 1.2 times). The ratio does not tell a defect, so the check was removed.
- **Too long.** Filming called 4 to 5 s too long, but poppy-coverage's hostile "use skill" sort, which the audit kept, runs 4.9 s. No ceiling separates them.

## Found in the catalog, and fixed

With the two rules, the catalog's first run found these, in five Poppy chapters, monty-hall and the writing guide's example; each was a real defect of the kind filming fixed elsewhere, and each scene was fixed, not the rule loosened:

- poppy-coverage: probes, the ticket and the report rode the lanes over the lane names; the names now stand above their lanes (`nameAt: 'above'`, lanes moved 0.3 down) and the tokens ride under them at a smaller scale. The note's strips and the skill card settled over the shop's desk and the User's words, which stayed until the end; in a sort those now go first.
- poppy-refusals: a fresh poppy.json crossed the API lane's name; it now passes under the name, as a key does.
- poppy-sign-in: a swapped code flew up over the agent's tag; it now comes up beside the counter. At sign-out with Device Sign-In's card at the desk, the tag returned onto the card; it now stops under it.
- poppy-conversations: the agent's answer to the Company's invitation came down over the invitation's words, which went only at the end; the envelope now goes first.
- poppy-browser: a new code flew into the page over the last form's "error page"; the error page now goes first.
- monty-hall: switching lifted a filled copy of your door's box over the doors' words; the comment said "outline", and now it is one.
- scenes/tutorial/sort-as-text, the writing guide's example (docs/WRITING.md quotes its scene): a number's sorted box flew diagonally over its neighbours' numbers; it now flies along the gap between the rows and down into its place.
- test/fixtures/motion: the fixture's ticket set off over the client's name; it now sets off under the client.

Before the rule measured ink rather than boxes, it also flagged monty-hall's ring and a speech bubble whose tail crosses a label; measuring a filled shape's outline, clipped to the label's box, removed those.

## The engine defect, measured by hand

Filming poppy-conversations' owner step found its place card drawn over its own words from 0.5 s until they popped in at the end: the matching transform (then `TransformMatching`) added new parts in the wrong drawing order (fixed in `src/animation.ts`, 46cdb7e6). No scene edit brings it back, so it is not an entry. With that fix undone in `src/animation.ts`, the check (after) on poppy-conversations makes no finding: the card is not travelling, and its words are drawn under it rather than faded out, so neither covers nor flicker applies. A part hidden under another during a morph is not judged.
