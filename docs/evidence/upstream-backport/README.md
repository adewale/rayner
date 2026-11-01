# Lantern backport and the tests that missed it

The baseline is Rayner `df49328556b15711a5518eaa1aa5ab02eb9e5e35` (PR #39). Lantern was reviewed through `d65fd1da5f11f8e902b43eaf2e1598decee9abcb`. [UPSTREAM.md](../../UPSTREAM.md#october-2026-backport) lists the adopted fixes and the features left upstream.

The misses came from missing input classes and incorrect expectations. Running the same properties more often would not have found them.

| Miss | Why the previous checks passed | Corrected owner |
| --- | --- | --- |
| Fresh Text started above the origin | The random-scene helper called `moveTo` before observing it. Relative metrics, seek and cache tests compared results with the same offset. The display-math test explicitly expected that offset. | `core.test.ts` checks the absolute advance-box and public anchor before placement; `lettering-math.test.ts` checks the same origin for display runs. |
| A child and its newly added parent both painted | Normal animation/replace flows did not exercise direct admission in both orders, repeated roots or batches. Deduplicated diagnostics cannot prove unique paint. | `core.test.ts` models add/front/back against a literal input tree and checks ordered rendered identities. Replacement rows check siblings, backlinks and an off-screen source parent. |
| Inherited/coercible font names passed runtime admission | Font generators only chose the two legal TypeScript enum values. | `fonts.test.ts` checks acceptance and rejection over JavaScript values, including prototype keys, boxed strings, symbols and hostile coercion. |
| SVG options and paint could produce invalid output | Serializer tests used default dimensions, valid colours and repeatability comparisons. They did not independently parse arbitrary XML data. | `svg-boundary.test.ts` uses an independent XML parser, XML 1.0 character rules, own-key controls and exact BigInt aspect-ratio arithmetic. Huge valid widths are inspected as headers, never rasterized. |
| Live DOM text/attributes could stay stale | Producer-shaped record sequences did not vary text while sharing the attributes object, or remove an own `__proto__` attribute. | `svg-browser.test.ts` checks native DOM text and attribute membership after every immutable record. |
| Imported labels and route ink escaped the gates | A property required two imported labels to pass even when overlapping. The production check exempted them. No gate checked a route against label ink. | `explain-tools.property.test.ts` applies one independent intersection law to native/imported/mixed pairs. `explain-layout.test.ts` and real `checkProject` fixtures cover crossings. |

The new route check considers glyph ink bounds, camera and descendant clips, curved paths, stroke width, draw order, and opaque plates. Attachments are allowed only at genuine route ends; a shared joint is not an attachment. Unknown or transparent paint cannot establish an opaque mask. Geometry cannot decide whether a caption tells a useful story, so the browser story checks from PR #39 remain necessary.

The served-collection review visits every settings case at both widths, but selects the gallery tile's step (or the first step), rather than every step. It checks caption equality, artwork presence, page overflow and runtime errors. It cannot establish that the objects named in a caption are visible or that readout wording belongs in a reader view. [PR #39's audit](https://github.com/adewale/rayner/blob/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence/reader-story/README.md) records the named-arrow phone assertions, readout wording/value checks and all-case card audit added at those boundaries. New caption claims need assertions naming the objects and viewport that carry them.

The gate exposed dashed guides through the Tromsø year-count labels and a translucent badge over the daylight curve. Stage callouts and dimensions now use paper plates; the January badge is opaque. The existing raster owner now samples these Seasons labels as well as the cache and Lantern labels. It still requires the orange trail to exist, so deleting the drawing cannot satisfy the test.

## Review and failing controls

The review used the [OpenClaw test-audit workflow](https://github.com/openclaw/openclaw/tree/main/.agents/skills/test-audit) and [Hegel testing/review](https://github.com/hegeldev/hegel-skill). Read-only lanes examined geometry/admission and SVG/DOM owners; a [separate reviewer](blind-review.md) derived contracts without reading the tests. Follow-up review rejected overly broad attachment and mask exemptions before acceptance. [Validation results](validation.md) separate completed local gates from platform limits.

New tests failed against the baseline: ten engine/font/SVG contracts, both production gate fixtures, the DOM record property, and the expanded Seasons raster check. The corrected display-math origin assertion also fails with only the old Text constructor restored.

Eleven isolated mutations then reintroduced individual defects: clipped plates, chord-only curves, omitted curved arrows, ignored stroke width, ignored glyph clips, internal-joint exemptions, transparent masks, CSS alpha aliases, off-screen replacement parents, stale DOM text and prototype-sensitive attribute removal. Each failed an assertion in its named keeper; production files were restored byte for byte. [Control results](controls.json) and [logs](logs/) retain the outcomes.

The new properties found two additional defects during implementation: upstream's repeated-root batch handling reordered `[parent, other, parent]`, and floating-point multiplication rounded the height incorrectly for valid width `2615960288601814`. The local admission rule preserves batch order, and SVG dimensions now use exact integer arithmetic.

Existing seek/cache equivalence, Manim vectors, snapshot fixtures, raster comparisons, browser layout/transport checks and installed-package smoke checks remain. Those protect different contracts. Pure geometry, parser and admission properties cover the new combinations cheaply; they do not replace browser or platform evidence.

## Visual evidence

The paired artifacts use the same inputs at the baseline above and the source revision recorded in [receipt.json](receipt.json). `render.ts` imports each checkout's production engine and builder; it does not redraw their output.

| Input | Before | After | Inspect |
| --- | --- | --- | --- |
| Fresh `Group(Rectangle, Text('Label'))`, no positioning helper | ![Text starts above the rectangle centre](text-origin-before.png) | ![Text advance box starts at the rectangle centre](text-origin-after.png) | The label's vertical position. Ink symmetry is not the contract. |
| Seasons, Tromsø, year, 1180 × 980 viewport | [Before](seasons-year-before.png) | [After](seasons-year-after.png) | Dashed guides stop behind “60 days” and “61 days at 0 h”. |
| Seasons, Tromsø, distance, same viewport | [Before](seasons-distance-before.png) | [After](seasons-distance-after.png) | The curve no longer shows through the “0.0 h” badge. |

Regenerate from a checkout with Node 24, dependencies, fonts and Chromium available:

```sh
node docs/evidence/upstream-backport/render.ts /path/to/baseline out/backport-before
node docs/evidence/upstream-backport/render.ts /path/to/source-revision out/backport-after
```

The images show one native font and two authored states. Independent origin, geometry and raster checks support those specific claims. They do not prove general typography, caption comprehension or Safari rendering. This environment runs Linux/Chromium; macOS/Safari execution and re-enabling GitHub Actions remain separate release work.
