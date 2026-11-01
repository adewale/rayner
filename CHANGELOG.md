# Changelog

## Unreleased

- Rewrite the authoring skill around what an explainer must achieve and how each part is checked, and drop technique rules no check or reader would miss. Replace the rubric's scored dimensions with a judgement: would a newcomer learn the answer, and is it better than the alternative? The README now says what Rayner checks and where it stands against hand-made pages.
- Arrow keys step through a standalone page as soon as it loads, before the reader clicks anything. Frames still take keys only once focused.
- Reserve the caption's first two lines in the stage's height cap, so at 1280 × 800 and 1366 × 768 a reader sees the picture and the start of its explanation without scrolling.
- Name a teaching step in the steps rail and step bar only once the reader reaches it; until then the rail shows its number. A later title such as "Answer: …" no longer gives away an earlier prediction. `meta.player.outline` shows every title from the start.
- Add `meta.answer` and `meta.checks`. `check` fails a declared answer that the first two teaching steps do not state; the player asks the check questions after the last step with answers behind disclosures; the transcript and `describeExplainer` include both.
- `rayner init` writes `script.md` first, and the tutorial explains how the script reaches the scene.
- Measure the stage heading on the phone only in the close-ups that show it. Close-ups keep below it, and the player gives the step's number, title and line as page text, so a drawing fitted to the stage no longer fails `labelsUnder12PxAt390` for labels larger than the heading's line. The statecharts explainer drops its hand-tuned scale caps.
- Describe Mermaid state diagrams' `[*]` dots by the state and region they belong to ("start of on, region 2") instead of failing them as wordless parts, count composite states and not the dots, and let `dim` on a composite keep what is drawn inside it. The reference has a recipe for state machines and graphs drawn with Mermaid, and the authoring skill prefers it to hand-placed boxes.
- Add a statecharts explainer, written from a short script that answers what a statechart is and why to use one: a coffee machine's four POWER_OFF arrows become one on a parent state, and a player's playback and volume become regions that rule out the impossible boolean combination. Its model is checked against XState 5.33.3.
- Write the script first: the authoring skill now asks for the reader's questions, a 150 to 250 word answer-first script, a sentence to remember and check questions before planning steps, and the rubric fails an explainer whose transcript does not state its answer by step 2.
- Lead the gallery with six showcase lessons while retaining the complete coverage catalog. Subset exports can choose their own introductory lesson.
- Explain the search ticket check, PKCE verifier hash comparison and Rust wrapper requirements on the main reading paths. Compare both search guards and both shell values without redundant selectors.
- Put secondary phone controls after the explanation and let headings and captions use their natural height.
- Use equivalent SFNT copies of default fonts in portable pages to omit the Brotli decoder; requested lettering keeps its existing loader.
- Render public step cards only for exported lessons and test one package archive across the compatibility matrix.
- Save reviewed HTML directly in the README publishing path and archive repeated design captures through Git history.

- Include visible stroke width and newly focused context in phone tours, keeping unrelated labels out of the reading-scale decision. Preserve backing-stroke rasterization when checking letter visibility in WebKit, while rejecting covered glyphs.

- Retain the exact reviewed HTML with `rayner review --out page.html`, including its header recipe and loader.
- Reuse catalog visits for shared player checks and keep minimum-Node browser coverage focused on compatibility. Reviewer-only edits invalidate review receipts without rebuilding unchanged source pages.
- Replace overlapping PR audit logs with current testing guidance and four representative screenshots.

- Keep authored comparison labels readable when they are unchanged, dimmed, rotated or compressed, and frame headings completely or leave them outside a close-up. Use one affine font metric for native and imported lettering; imported metrics survive copying, morphs and matching without changing layout bounds.
- Treat backing strokes beneath filled letters as halos in the glyph mask, while retaining outline-only and covered-letter checks. Enlarge source-diagram views whose labels fell below the existing 14px floor.
- Check independently claimed teaching openings at 320 pixels, including visible paint, and reject incomplete review receipts. Covers cannot hide required words; unsupported masks, paint servers, CSS path replacements and rounded clips fail review.
- Let Next view advance from a whole-frame authored opening into its detail tour instead of repeatedly resetting to the opening.
- Expire story-review receipts when player CSS, runtime helpers or build inputs change. Check retained detail tours against independently named facts and make the token-cap, proxy and seasonal labels reachable at readable size.
- Explain GNOME study outcomes with semantic labels and keep the traffic-share caption within its pictured evidence. Invalid step links return to the explanation's first step.
- Require visible paint changes for reordered or repeated drawing layers, including artwork revealed by removing a cover. Match periodic-table descriptions to the block fills actually shown.
- Give the catalog’s longer lessons a short main reading path with complete phone comparisons. Retain implementation walkthroughs under Details and sources, with direct links and full verification.
- Let authors name a comparison with `s.reading(before, after)`. Keep its subjects together when they fit at a readable scale, while retaining close-ups for smaller details.
- Add prediction steps to the dictionary, Bloom-filter, Git, Monty Hall and music lessons. Draw birthday comparisons and occupied dates, and show how a wrong font measurement changes placement.
- Rewrite main captions around causes and case results. Align comparison tables and bars, strengthen question headings, pair token-bucket requests with their responses, and keep font measurements beside their labels.

- Open the gallery with a periodic-table explainer: follow sodium, chlorine, iron, copper or helium from atomic number to group, with configurations checked against NIST's tabulated ground states for elements 1–108. The table uses Atlas’s block colours.
- Add explanations of Python dictionary deletion markers, insert-only Bloom filters, Git merges, Monty Hall host rules, the birthday paradox, and melody with rhythm. Each uses a separately tested model and compares an expected result with a case that challenges it.
- Shrink the phone view row to its one line of controls: the sentence on how Next view differs from Next moves to the footer's hint, on steps with more than one view. Install outline lettering when the build tools load, before any scene runs, so every run is leased and concurrent collection never shapes text with another scene's outlines.
- Guide the reader through the player. A scene may name the state readers follow in `meta.watch`; each step then shows what it changed of it under the caption, in the transcript, in `describeExplainer` (`watched`) and in the `check` report (`watch`), and collection refuses an unknown key. At rest on the last step Next becomes Start again, and a scene with settings offers its first setting's next case. Keyed controls name their key in their tooltip and `aria-keyshortcuts`, and the footer carries one quiet hint on how to move. Framed pages post `rayner:step` to the host and accept `rayner:goto` from it under the resize message's rules; the loader dispatches `rayner:step` on the iframe, calls `onStep` and returns `goTo` on its dispose function.

- Report each case's words in `check`: estimated phone lines for every title, line and caption, and the outlier steps whose length leaves the others empty space. Add the crop test, the three word roles and layout by contrast, repetition, alignment and proximity to the authoring skill and the editorial rubric.
- Tidy the tile by contrast, repetition, alignment and proximity. Every row of the card shares one inset, with Previous and the last tool pulled onto it; the case legend, step kicker, rail heading and view count share one label style; controls share one inner radius; the step's title and line stay together, set apart from the caption, with the line a size smaller; and the zoom tools are grouped apart from Copy link and Enlarge.
- Make the explainer one tile. The title and case picker are the card's header; the steps rail is a pane of the same tile on wide pages and a closed row in the card on narrow ones; the transcript is a closed row in the card; and a footer carries the Rayner mark and, in any frame, "Open the explainer". The loader no longer adds a link of its own. In a frame the page draws only the tile, on the host's background, and the loader passes the host page's colour scheme as `?theme=`. The tile's chrome takes a 10% tint from the case's paper, checked for contrast against every palette. `demos:build` records each page's framed height at 390, 640 and 900 px as `<id>/embed.json`, and `site:export --origin` writes an oEmbed response and discovery link per explainer.
- Put the player in one card: the picture, one stepper row and the step's words. The row keeps Previous and Next at its start, adds a step bar with one segment per step that fills as the current step plays, and sets the view tools apart behind a rule. The card fits the window's height, so Next is on screen when the page opens. Every width shows "Step 3 of 4" with the step's title and line. The steps list is a rail beside the card on wide pages and a closed disclosure under it on narrow ones. Replay, Stop and the duplicate Next are gone (Previous then Next plays a step again), and Fit stage is named Whole picture.
- Add optional, user-triggered score audio with Play A/B, Pulse, Stop and a synchronized piano-roll playhead. Notes are synthesized locally; ordinary pages omit the audio module.
- Add opt-in natural-width diagram lettering. Capture measures the requested font before layout, so labels retain their proportions; existing diagrams keep their fitted widths.
- Upgrade build-time Agentic Mermaid to 0.5.1 for its supported font-measurement hook and recapture the catalog with that renderer.
- Add explicit LTR/RTL card fields and logical `start`/`end` stage regions. Text shaping, code, numbers and authored Mermaid flow keep their own order.
- Demonstrate measured EB Garamond diagram labels and panel direction in the public gallery. Document the separate controls for text, panels and graph flow.
- Add `columns` to cards: values side by side under headings, with rows that span them, so one card can compare two cases and a phone close-up shows the comparison whole.
- `rayner init` writes the tutorial's LRU/MRU explainer, its model and the model's test, in place of the cache starter. The starter draws no diagram, so it checks and builds without a browser.
- Rewrite the tutorial around eight principles for planning, writing and checking an explainer, shared with the authoring skill and the editorial rubric. It builds an LRU versus MRU explainer whose model is tested against Wikipedia's worked examples; the finished scene is in `scenes/tutorial/lru-mru/`.
- Verify a deployed collection against the reviewed export, including file hashes, reader response headers and loader caching. Refuse ambiguous release records before archiving an existing npm version.

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
