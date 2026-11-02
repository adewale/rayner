# Test ownership

Put Chromium reader and transport tests in `test/browser/`; `test:embeds` discovers that directory. The standard suite includes both root and browser tests so pure assertions in mixed files still run. Font-capture and native Safari/WebKit tests retain their explicit environment owners. Do not add another browser filename list.

Use `lib/pbt.ts` for seeded fast-check runs. Keep the input domain as wide as the documented contract; bound expensive materialization rather than silently dropping input classes. A cheaper oracle must still check values, exact endpoints and ordering. Keep independent source vectors, Manim fixtures, raster comparisons, real browser transport/layout checks and package smoke tests at their existing boundaries.

When consolidating tests, name the keeper and move each assertion before removing its former owner. Prove repaired assertions reject a deliberate defect, restore production bytes, and record the result. Test names must describe the assertions actually made. Count expected outputs before using `every`, and distinguish a documented refusal from an unrelated exception.

Use controlled external clocks for timing bookkeeping. Browser latency and paint need real browser evidence. Do not add production exports or reset hooks just for tests.

`lettering.test.ts` checks catalog lettering declarations without rebuilding pages. `tools/explain-demos.ts` owns actual lettering/receipt assertions during the canonical catalog build. `tools/lib/explain-reader-shell.ts` checks player chrome and exact teaching-step segments during each catalog story case; `browser/explain-embed.test.ts` retains English/French standalone, iframe and loader crop checks on shared-shell fixtures. Do not pin whole generated artifacts by hash: such a pin fails on every intended change, says nothing about what changed, and can only be refreshed. Prefer an assertion that names the property and fails for a reason. Capture actual outline fixtures with the real pipeline; do not repair their metadata by hand to hide stale inputs. Optional browser/font/video tests must report skips explicitly.

Record benchmark or oracle speed comparisons with identical inputs, seeds and environment. Keep elapsed-time claims separate from semantic proof. The audit and retained boundaries are documented in `../docs/TESTING.md`.

Observe constructor invariants before calling positioning helpers: `moveTo()` can erase a wrong initial origin. Exercise direct public admission methods with parent/child orders, repeated roots and same-call batches; check rendered identity frequencies and order before deduplicating diagnostics.

Generate rejection inputs at JavaScript boundaries as well as valid TypeScript values: inherited names, boxed strings, coercion objects, malformed options and illegal serialized characters. A shared serializer on both sides of a cache/seek comparison is not an independent language or value oracle.

Imported labels have the same visible collision contract as native labels. Source provenance is not an exemption. Route checks must account for glyph ink, stroke width, camera and descendant clips, actual paint order and genuine endpoint attachments. Do not excuse a crossing using a plate clipped away from it, or a global overlap opt-out.

A live DOM record test must vary text independently of shared immutable attribute objects, and check own attribute removal. Keep this browser boundary separate from SVG/XML parser proof. Larger run counts cannot discover operation classes or contracts absent from the generator.

Collection browser review must visit every resting step in every settings case at both widths, opening each width fresh and observing the matching step-ready event. Count the expected step/width rows. Bind independently named caption subjects to actual DOM paint; missing, hidden or partly missing labels must reject. Arrow claims must require painted route strokes, so a label alone cannot satisfy them. An unchanged picture with a new caption needs an explicit subject. Opening claims must hold in the opening; tour coverage must use each stop's visible ink, not its viewport alone. Retain wording/value assertions for reader readouts and the existing transport, motion, raster and interaction owners.

Prove browser poison controls start from visible ink and actually apply under the page's CSP. Use individual CSSOM properties where inline style attributes are blocked. Test effective paint and clips, including CSS overrides of declared clips and a subject hidden only at its reachable tour stop. Expected context clipping comes from the authored frame, never the damaged browser state. Pure rectangle-union PBT owns holes and adjacent views; it does not replace native SVG geometry or served-reader checks.

Parallel story receipts must cover the independent built case/step inventory exactly once, with matching catalog and reviewer hashes. A missing, duplicate, stale or failed part must fail the required final check. Keep pure generated-inventory properties separate from actual rendered-subject checks; neither replaces the other. Reserved diagram frame paper cannot become narrative evidence.

Declared caption subjects and fresh helper intent take priority over incidental context rebuilt during an edit. Use changed artwork as fallback when neither supplies a subject. A helper-highlighted route may enter its authored viewport, but it must contribute visible ink even when another subject is visible. Keep highlighted labels and explicit whole-arrow claims complete; protect both acceptance of intended clipping and rejection of missing evidence.
