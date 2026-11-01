# Changelog

## Unreleased

- Lead the gallery with six showcase lessons while keeping the full subject and authoring collection available. Add cited lessons on Python dictionary deletion, Bloom filters, Git merges, Monty Hall, birthdays, music and periodic-table groups.
- Add prediction steps and causal comparisons. Put search tickets, PKCE verifier hashes and Rust wrapper requirements on the main paths; retain technical walkthroughs under Details and sources. Remove selectors when a lesson already compares both outcomes.
- Keep phone captions near their pictures, with secondary tools after the explanation. Headings and captions use natural heights, and single-view steps expose no tour controls. Preserve view scale and pan when a tour resizes.
- Use explicit case, playback and gesture scopes so interrupted work cannot change a later case. Preserve keyboard, history, embedding and loading behavior.
- Keep the reader in one neutral tile, with a teaching-step bar, transcript, named state changes and host step/goto messages. Authors can opt into checked palette cues, square corners and wider pictures.
- Add optional offline score audio with Play A/B, Pulse, Stop and a synchronized playhead. Pages without audio omit its code.
- Use equivalent SFNT default fonts in ordinary pages to omit the Brotli decoder. Requested lettering keeps its existing loader. Support natural-width diagram lettering, LTR/RTL card fields and logical panel regions with Agentic Mermaid 0.5.1.
- Start new authors with the diagram-free LRU/MRU lesson, its cited model and tests. Expand the tutorial, feature recipes and engine guides.
- Retain exact reviewed HTML with `rayner review --out page.html`, including headers, receipt and loader. Keep independent caption claims beside scenes so public and catalog review use the same expectations.
- Check actual painted subjects, readable labels, route strokes, clipping and authored comparison openings. Cover unsupported paint, reordered layers and retained detail tours with independent defect controls.
- Render teaching-step cards during export, choose each export's entry and produce matching catalog, descriptions, embedding metadata and deployment hashes. Test the same package archive on Linux and both Mac architectures, including native Safari and WebKit.
- Build and validate selected lessons without requiring the rest of the catalog. Partition story review by scene, run shared publication checks once, and snapshot shared build inputs per operation. Use focused prose checks and reuse recent successful validation for identical merged trees; releases always run fresh validation.
- Remove obsolete reserved-space estimates and historical design/run transcripts. Keep current authoring guidance, durable source oracles and release provenance.

## 0.1.1 (2026-10-29)

- Put step captions next to their pictures. Hide Next view and its instructions when a step has only one view.
- Refresh phone tour controls after a viewport resize while preserving the reader’s current zoom and step.
- Keep the cache hit/miss result and the token-bucket rate comparison together at phone widths, with readable labels and model-derived outcomes.
- Compress embedded diagram snapshots losslessly, enforce raw/gzip page budgets and record startup under 4× CPU slowdown.
- Add a public EB Garamond example with real bold and italic, captured from the requested source fonts.
- Add WebKit served-paint review and native macOS Safari reader checks. Keep installed-package checks on both Mac architectures while concentrating pure property tests in the full and minimum-Node lanes.
- Preserve tested release archives and manifests on GitHub Releases. Refuse an existing npm version or an undated changelog entry, and verify the registry’s integrity before exposing a release.
- Pin GitHub Actions and the existing vendored glyph bundle. Correct the 0.1.0 release status without changing its tag or published archive.

## 0.1.0 (2026-10-29)

First release of the `rayner` package, a fork of Ivar Vong's Lantern.

- Author technical explainers as TypeScript scenes with reader settings, named steps and captions.
- Build portable HTML pages with transcripts, picture descriptions, linkable steps, embedding support and response-header recipes. The browser runtime has no dependencies.
- Capture Agentic Mermaid diagrams at build time and animate their parts by id. Check every declared case, including imported-label collisions and visible route crossings, before publishing.
- Use native shapes, camera movement, charts, code diffs and matching transforms alongside diagrams. Text starts centred on its advance box; scene admission avoids duplicate subtree painting.
- Request additional scripts, replacement faces, real bold and italic, and typeset maths through committed lettering snapshots. See [supported requests](docs/LETTERING.md).
- Review every catalog step at phone and desktop widths, including actual painted subjects and close-up tours. The WCAG Focus Visible step opens on the criterion its caption explains.
- Use the `rayner` CLI to initialise, preview, capture, check, build and inspect scenes. PNG contact sheets are included.
- Run `rayner review` on an outside author's scene, with optional independent caption claims. Watched previews recapture requested lettering after edits.
- Export a generated catalog and deployment manifest with complete build inputs; stage and validate the collection before replacing its files and response-header rules.

- Compare reader timings with `npm run bench`: interleaved BASE/HEAD browser runs, retained traces and explicit inconclusive results for small samples. See the [measurement limits](docs/REFERENCE.md#reader-timing-measurements).

Requires Node 24 or later. Authoring targets Ubuntu and macOS; Windows is not yet supported. Diagram capture needs Chromium. Additional lettering capture needs Python and the documented source fonts; committed snapshots replay without them.

The [tutorial](docs/TUTORIAL.md) covers the first scene. [Publishing](docs/PUBLISHING.md) covers hosting and embedding. [Upstream](docs/UPSTREAM.md) records engine fixes and attribution.
