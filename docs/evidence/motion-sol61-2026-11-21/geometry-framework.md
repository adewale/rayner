# Geometry and identity investigation

Owned scope: `src/animation.ts`, `src/keyed-motion.ts`, `src/mobject.ts`, matching/keyed-motion/native-occlusion tests, and the drawing/layer test merge conflicts. Read `test/AGENTS.md`, the frozen 59-row causal matrix (Markdown and JSON), and the existing repair README. Historical evidence and corpus behaviors were not edited.

## Findings and changes

1. **Continuous occlusion was attributed to the first mask for the entire interval.** A word can remain hidden as several independently named covers take turns. Resetting detection at a mask switch would miss a long obscuration made of individually short covers. `src/keyed-motion.ts` now retains the continuous victim interval and records each contributing representative mask's contiguous sampled interval in the diagnostic. Single-mask wording stays unchanged. The glyph count is the minimum across the run, matching the claim that at least that many glyphs were covered throughout.
2. **Travel coverage treated clipped-away path area as painted area.** Its polygon-area calculation bypassed effective camera/ancestor/own clips, even though the sampler retained them. It also inferred opacity from combined stroke/fill alpha. The calculation now intersects each mask's effective clip and requires its actual fill alpha. An opaque stroke cannot establish an opaque interior.
3. **Duplicate-word suppression had the inverse error.** A paper between travelling and fixed text could suppress a real duplicate using uncut anchor-polygon area and combined stroke alpha. It now requires actual fill opacity and the existing conservative cubic-edge/winding/clip proof. Clipped-away paper, transparent interiors and same-winding evenodd holes cannot erase a visible duplicate.

The existing matching implementation already retains logical keyed ownership of omitted containers and intersects their real clips on admitted children. Native matching regressions passed without further changes to `src/animation.ts` or `src/mobject.ts`. No public keys, inspection reparenting, universal overlap bans or pace thresholds were added.

Merge resolutions: `test/drawing.test.ts` preserves `carry` and main's `described`/`drawContext`; `test/layers.test.ts` lists the actual `Machine.reachable` callers (film and live review), while the merged checker uses `explore`.

## Independent verification

All native controls use Resvg rasterized SVG, independently counting visible glyph-color pixels. The three added tests cover 18 scene configurations:

- Nine mask-alternation cases: positive continuous obscuration, clear gaps, and clipped second mask, each at 15/30/60 fps. Six successive masks each last under the detection threshold; the continuous positive still reports once with six measured attributions. Positive and clear intervals assert zero and over 100 red glyph pixels respectively. The 30 fps positive is rebuilt frame by frame with `renderFrame`; SVG and complete findings agree with playback.
- Five travel-fill cases: opaque positive, own clip, ancestor clip, transparent fill opacity and transparent hex fill. Every case traverses the word; native center-crossing observations establish actual disappearance or preserved red ink. Only opaque fill reports coverage.
- Four duplicate cases: opaque paper inverse, clipped paper, transparent interior with opaque stroke, and an evenodd hole. Red fixed glyphs remain visible; separate green travelling glyphs prove that the offending second copy really paints. Only genuinely opaque paper suppresses the duplicate.

Actual command (outside restricted sandbox, with real Node assertions):

`node --test test/motion-occlusion-adversarial.test.ts test/matching-ownership.test.ts test/matching.test.ts test/keyed-motion.test.ts test/layers.test.ts test/drawing.test.ts`

Result: **77 tests passed, zero failed/skipped**. This includes existing native matching-ownership/clipping positives, inverse controls, independent seeks and all three new tests.

Three deliberate detector defects were introduced independently and restored in `finally` blocks. Each focused test exited 1 for its intended assertion:

- First-mask-only attribution: expected six attributed spans, observed zero; falsely blamed first cover for 0.33 s.
- Ignore mask clip during travel: own-clipped carrier falsely reported 100% coverage for 0.567 s while native glyph ink remained visible.
- Old chord-area/combined-alpha duplicate suppression: clipped paper hid the duplicate finding although native green travelling ink remained visible.

Logs: `/tmp/geometry-first-mask-attribution.log`, `/tmp/geometry-uncut-travel-fill.log`, `/tmp/geometry-chord-only-duplicate-paper.log`. Production bytes were restored after every poison. The three new native tests were rerun after restoration: **3 passed, zero failed/skipped**. Scoped `git diff --check` is clean.

## Limits and implications for all 59 cases

These fixes improve the shared geometric measurement and diagnostic attribution; they do not turn editorial or stale historical cases into defects or claim a revised corpus score. Root owns global type checks, full suite, corpus and package validation.

Occlusion still selects one strongest qualifying representative mask per victim per sampled frame and retains one longest qualifying continuous obscuration per victim/text identity. It does not compute the union of several masks that each hide fewer than the required glyph count, nor prove unique causal responsibility among overlapping equally strong masks. Anonymous masks use draw-order position internally for seek-stable span attribution and retain the anonymous diagnostic name. Multiple leaves sharing one logical keyed mask address remain one named owner. Attributions are bounded by sample times, not inferred subframe crossings.

Travel coverage still uses its pre-existing anchor-polygon area approximation, including its existing limitations for curved edges and complex fill-rule overlap; only duplicate suppression and glyph occlusion use the conservative fill proof. Native clearance assertions remain necessary for protected non-text ink, narrow contacts and intentional docks. Scene declarations still determine causal prerequisites, unique-object handoffs and pacing intent; this investigation does not infer them from movement.

## Follow-up: periodic-groups catalog regression

The fresh merged catalog reported 40 findings: the same eight occluded symbols in five scenarios. Native investigation confirms a real chapter defect. In the sodium stack transition, tinting Hf's actual glyphs shows four consecutive 30 fps frames with zero visible green pixels; removing only Ta's cell restores 85–108 glyph pixels. Earlier partially obscured frames also lose ink. The detector did not invent the overlap.

Cause: main introduced an unlabelled stack schematic (`schematic` in `picture.ts`) with changed cell heights/y positions and removed symbol matching. Historical `1522b504` matched every cell and symbol; main matches only the 118 cells and fades old symbols away. Those retiring symbols shrink in place while later neighbouring cell papers cross them. The existing alternating cell/symbol paint order lets an opaque later cell erase a still-visible earlier symbol. This is an upstream chapter/choreography interaction, not a new renderer or geometry-rule defect.

The chapter-only repair places all cell lettering in a separate unkeyed group drawn after every cell paper. Symbols remain above crossing papers through their own authored retirement. Cell geometry, routes, timing, state, keys and detector/core bytes are unchanged. Files: `scenes/explainers/periodic-groups/picture.ts` and its own `scene.test.ts`.

The new native test runs the real authored sodium scene twice: repaired order, then a local test poison restoring alternating cell/paper order without touching any geometry, alpha or detector. Each pass independently tints Hf, measures actual native glyph ink, removes only Ta's paper, restores styles, and feeds the unmodified detector. The positive retains substantial ink throughout at least eight observed crossing frames. The poison loses Hf completely for at least four frames and reproduces exactly the eight victims: Hf, Ta, W, Re, Os, Ir, At and Rf. Repaired order produces no occlusion findings.

Actual verification: `node --test scenes/explainers/periodic-groups/scene.test.ts scenes/explainers/periodic-groups/model.test.ts` passed **15/15**, zero skips/failures, including the native positive/poison owner, all-scenario state fidelity and independent expected table facts. Separately, full authored traversals of **all five** scenarios (`na`, `cl`, `fe`, `cu`, `he`) with the locked `KeyedMotionSink` each returned an empty complete finding array. Scoped `git diff --check` is clean. These chapter sources are frozen for root's catalog remeasurement; the 59-case scene/core fingerprints are unaffected.

Portability correction: the public chapter test no longer imports the private detector. Its eight victim assertions now measure native glyph ink directly, with a separate named-paper knockout for each of Hf/Ta/W/Re/Os/Ir/At/Rf. Both repaired and deliberately restored paint orders are checked. Hf's consecutive-frame proof remains. The focused native test passes after this change. The exact generic detector-finding assertions are retained at their existing repository owners: root's all-five-scenario full catalog measurement (`out/sol61/catalog/periodic-groups.json`) owns this chapter's detector receipt; `test/motion-occlusion-adversarial.test.ts` and `test/matching-ownership.test.ts` retain the shared detector's native positive/inverse, logical ownership and paint-order controls. No frozen picture/core bytes changed for portability.

The repaired test and its five transitive chapter/shared-source dependencies were copied with public engine imports rewritten to package entry points and type-checked against `dist`'s public declarations (`node node_modules/typescript/bin/tsc -p out/sol61/periodic-public/tsconfig.json`): passed. `node --test test/scene-imports.test.ts`: **4/4 passed**, including the complete collection import-boundary gate. The focused eight-victim native test: **1/1 passed**, zero skips/failures.
