# Periodic-table gallery entry

This lesson helps chemistry teachers explain to secondary-school students why atomic-number gaps vary within a periodic-table group. Readers choose sodium, chlorine, iron, copper or helium. An introduction compares electron counts; family and count views connect those counts to columns. Five optional steps show configurations, family members and the limits of the rule. The lesson opens the gallery.

## Model and source boundary

The model fills subshells in Madelung order (`n + l`, then `n`). It derives positions from that prediction and counts s, d and p electrons beyond the previous noble gas, excluding f. Before period 4, the p block needs a visible ten-column adjustment. Helium's count of 2 differs from its group of 18. This table uses Sc, Y, Lu and Lr in group 3; other layouts use La and Ac.

`test/fixtures/periodic-groups/nist-ground.json` records an ASD 5.12 query captured on 30 October 2026: elements 1–108, with 20 differences from the filling-rule prediction. Its rows do not distinguish measured configurations from computed ones. Beyond that fixture the scene uses a prediction. This coverage limit does not establish the limits of available scientific evidence.

An independent parser expanded every captured raw shorthand row, including nested `[Cd]` and `[Hg]` cores. The expansions, electron totals and subshell capacities matched the normalized fixture. This checks the captured data's consistency; a fresh NIST download was unavailable. No chemist has reviewed the lesson and no reader study has been conducted.

## What the scene checks

| Case | Pivotal comparison | Boundary |
| --- | --- | --- |
| Sodium | `11 - 10 = 1`, `[Ne] 3s¹`, count 1 and group 1 | Hydrogen shares the s¹ ending but is not an alkali metal. |
| Chlorine | `17 - 10 = 7`; aluminium's count 3/group 13 and chlorine's count 7/group 17 | Tennessine lies beyond the captured reference. |
| Iron | Ruthenium's d⁷ s¹ ending retains iron's count of 8 | “Iron group” can also name iron, cobalt and nickel across a row. |
| Copper | Predicted `4s² 3d⁹` and listed `3d¹⁰ 4s¹` both count 11 | “Coinage metal” is a looser name than group 11. |
| Helium | Count 2 suggests a position over Be; the table puts He over Ne in group 18 | Group placement uses the full shell, not this count alone. |

The `column` and `count` steps put their complete comparisons above a small unlabelled 118-cell table. The detailed table returns when later steps use it. Independent tests check 108 configurations, all 118 positions, 28 family members, 23 jumps, 16 count/group rows, three core equations, copper's two configurations, helium's placements and eight boundary outlines.

## Atlas inside the periodic-table picture

The periodic-table picture uses [Atlas's design language](https://atlas-48p.pages.dev/about/design). Shared player and gallery chrome retain the design from `main`; the teaching/source navigation is described in the [reader audit](https://github.com/adewale/rayner/blob/11fde2bb570aff007b2a28b99fca66b69add4394/docs/evidence/pr69-adversarial-audit-2026-10-31.md).

- **Palette.** Paper `#f7f2e8`, black `#0f0f0f` and Grey Mid `#666` for secondary text. Block colours: s deep blue `#133e7c`, d warm red `#9e1c2c`, p mustard `#856912`, f black.
- **Cells.** Lit cells and the blocks step are solid block colour with paper lettering. Paper text on each reaches 4.67:1 (mustard) or better. Neon's core, in the count step's context table, stays a pale tint. Cells are square.
- **Numbers.** Atomic numbers, jumps, counts and the core equation use the monospace face. In the count rows each count takes its element's block colour. Family badges are block-coloured squares.
- **Outlines and badge.** Boundary outlines stay black: a warm red outline would vanish against the d block. The stage badge uses teal inside the picture. Shared player controls use the neutral light or dark theme by default.
- **Historical player tint.** The captures below predate [the neutral-player change](https://github.com/adewale/rayner/commit/fed1f3260237d0e76dfa61f21b2ba72f8ad66953). Their card carried a 10% tint from the scene's paper. Current pages use neutral chrome; authors may opt into contrast-checked paper and accent cues with `meta.player`.

| | Before | After |
| --- | --- | --- |
| Blocks step, 1280×800 | ![Pale tinted blocks with rounded cells in the main player](periodic-groups/atlas-blocks-before.png) | ![Solid deep blue, warm red, mustard and black blocks with square cells, same player](periodic-groups/atlas-blocks-after.png) |
| Chlorine count, 1280×800 | ![Count rows in one colour](periodic-groups/atlas-chlorine-count-before.png) | ![Counts in each element's block colour, groups in bold monospace](periodic-groups/atlas-chlorine-count-after.png) |
| Sodium opening, 390×844 | ![Sodium highlighted in pale blue](periodic-groups/atlas-phone-sodium-before.png) | ![Sodium as a solid deep blue cell; the player around it identical](periodic-groups/atlas-phone-sodium-after.png) |

These historical PR #60 captures compare the scene's palette in the same player from `main`. Their image files are pinned at [9c9e2a4](https://github.com/adewale/rayner/tree/9c9e2a4d33e2585524a9b17df9dc9e96cda5bfb8/docs/evidence/periodic-groups); the before palette comes from [bf24af0](https://github.com/adewale/rayner/commit/bf24af0444633b54f41249a6b06b12b07df87f62). They precede the shorter teaching path. Later opening captures and their pinned pre-neutral source fingerprints are recorded in the [reader audit](https://github.com/adewale/rayner/blob/11fde2bb570aff007b2a28b99fca66b69add4394/docs/evidence/pr69-adversarial-audit-2026-10-31.md).

An earlier version of this PR restyled the shared player in Atlas's design language and added an 880 px standalone reading floor to every player. Both were removed: the player is shared by every explainer, and Atlas belongs to this explainer's picture only. Two defects the audit found came from that player styling and left with it: uppercase CSS that turned authored `-m` switches into `-M`, and a selected case that forced colours erased.

The shared player sizes the stage using the window's height. Small context labels in the full-table source steps can fall below 12 CSS pixels on a short laptop; the old 880 px floor is not a current guarantee. `test/explain-periodic-reader.test.ts` checks the count comparison's actual label size at 1100, 1212 and 1280 px widths, each at 720 and 800 px heights. Final results belong to the revision named by the PR's validation record.

## Adversarial audit repairs

The follow-up audit found five defects. Two were in the Atlas player styling, removed as described above. The other three are fixed here: overlapping bounds let an unchanged reorder count as new artwork; removing a duplicate layer missed newly revealed paint; and later descriptions claimed pale core cells while all 118 cells were solid block colours.

The description regression checks all 35 periodic-table phases against independent expected cell fills, opacity, recorded state, text summary and HTML description. Earlier PR #60 deliberate-defect controls rejected the original wording, missing complete-block paint and missing valid core wording.

Review regressions compare native paint and use effective CSSOM poison controls for a newly revealed layer. The checker must reject an unchanged picture without a named subject and detect hidden paint that became visible after a duplicate was removed. These controls are separate from equivalent-redraw and disjoint-order acceptance tests.

Collection review combines built-in and companion claims. Claims and their loader enter its fingerprint, so edits, additions or removal invalidate older receipts. Every case and resting step remains subject to the browser review at both widths.

## Evidence and verification

The before/after captures above use the player on `main`. Older images in `periodic-groups/` (`phone-*`, `sodium-steps.png`, `countercases-count-step.png`) document earlier layouts in the player that preceded `main`'s redesign; `phone-*-before.png` come from [b944907](https://github.com/adewale/rayner/commit/b94490764f4c55768d92209650f3fc044dba3b09).

The PR records the commands and exact counts from the final verification run. Local Chromium checks do not establish physical iPhone behaviour, native Safari, speaker output or reader comprehension. Nothing here deploys the gallery. A future curated `site:export --only` selection must include the new `periodic-groups` entry.

This evidence note and the PR description were edited using [anti-slop-writing](https://github.com/adewale/anti-slop-writing): claims identify the mechanism and observed result, with source and browser limits stated beside them.
