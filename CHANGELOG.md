# Changelog

## Unreleased

- Hold sweeping sentences to tests, after the statechart skill's rule that every rule a reader accepts is checked. `meta.claims` pairs a phrase with the test that holds it (or marks it `shown` when it speaks only of its own picture); `check` fails a claim no step states or whose test is missing, and reports each sentence with "every", "never", "only" and the like that nothing backs, and each code name that reaches the reader's words with the step that first uses it. The authoring skill adds simplifying without hiding an outcome, saying what the model leaves out, and doubting the model before the source; the rubric's grounding criterion asks for them.
- Make 13 explainers the website's exemplars and the showcase tier: monty-hall, statecharts, bloom-filter, periodic-groups, agentic-mermaid, seasons, melody-rhythm, lantern, pen-and-pencil, fork, birthday-paradox, isdigit and feature-tour. Each was rebuilt against the rubric's remaining findings, its prose edited with the anti-slop-writing skill by an editor who did not write it, and its check questions replaced with ones only the explainer answers. birthday-paradox and feature-tour were rebuilt from the coverage tier; the other explainers graded Good before (python-dict, git-branches, send-sync, pg-page, trust-proxy) move to the gallery tier.
- Give each explainer a tier from its rubric verdict. `showcase` (graded Good: python-dict, git-branches, monty-hall, send-sync, pg-page, isdigit and trust-proxy) leads the gallery; `gallery` sits behind "More"; `coverage` (feature-tour, layout-direction, mr-cache, state-machine, gnome-files, wcag-map, birthday-paradox and just-bash) keeps its page and tests but gets no card and no `llms.txt` line.
- Rebuild 31 explainers by the new rubric: each opens on a concrete problem the reader predicts, gives its answer as the payoff within the first few steps, names things after the reader has seen why, and tells one story instead of two opening summary steps and a walkthrough that starts over. Each has a `script.md`, `meta.answer` and `meta.checks`. Steps that were hidden as details are on the main path.
- Fix untrue claims the grading found: periodic-groups called iron's 4s² 3d⁶ and 3d⁶ 4s² different and titled its step after copper, and its answer now excepts helium; exgit hashed one content in its opening and another later; cert-renewal said a run replaced a certificate that the rate limit refused; ical-recurrence described an exception that had been deleted; fork counted diagram families and checks from an older release; statecharts' boolean step manufactured its impossible state from a redundant pair of flags; ext4-space's answer held only from 1 GiB; lantern undercounted `rayner check`'s checks and its ruler contradicted its caption; glyph called a squeeze a stretch; pen-and-pencil placed Hershey at the wrong laboratory; seasons stated geometric day lengths as almanac ones; ring-buffer said every engine copies on `shift`; ical-recurrence did not say which reading of Bob's copy it follows.
- New grounding: token-bucket against `golang.org/x/time/rate`, send-sync's opening program compiled by rustc, git-branches' lost commit against real Git, and statecharts' regions checked in every configuration XState reaches.
- Draw a narrow stage without the stage's heading: the player already sets the step's number, title and line as page text under the stepper row, and the stage's copy read at 5.8 to 8 px. `check` no longer measures the heading on the phone and lists the labels it finds under 12 px (`smallLabelsAt390`) with their step; oauth-pkce and mr-cache, which failed only on the heading, now report none.
- A morph whose `ops` do not reproduce the next diagram now says why: the facts that differ, `remove_state` for a state left behind, or the first line where only the order differs.
- Give phones a taller stage. A stage under 600 px wide grows from 16:9 towards 4:5 where the screen has room, so each close-up shows the picture's full height below the heading and most steps need fewer views; on a 390 × 844 phone the statecharts explainer's stage goes from 358 × 201 to 358 × 385 px and most of its steps from four or five views to two or three. The margin around the picture is the case's paper, and `check` measures the phone at this shape.
- `check` fails a declared answer only when no step states it, and reports where it first appears; whether that is early enough is a reader's judgement. It no longer reports `words` or `cardsAtRest`, estimates of good writing and layout rather than measures of them. The tutorial's principles say which ones Rayner checks; the benchmark's briefs no longer prescribe how to teach; [What belongs in Rayner](docs/ENGINE.md#what-belongs-in-rayner) sorts feature requests.
- Rewrite the authoring skill around what an explainer must achieve and how each part is checked, and drop technique rules no check or reader would miss. Replace the rubric's scored dimensions with a judgement: would a newcomer learn the answer, and is it better than the alternative? The README now says what Rayner checks and where it stands against hand-made pages.
- Arrow keys step through a standalone page as soon as it loads, before the reader clicks anything. Frames still take keys only once focused.
- Reserve the caption's first two lines in the stage's height cap, so at 1280 × 800 and 1366 × 768 a reader sees the picture and the start of its explanation without scrolling.
- Name a teaching step in the steps rail and step bar only once the reader reaches it; until then the rail shows its number. A later title such as "Answer: …" no longer gives away an earlier prediction. `meta.player.outline` shows every title from the start.
- Add `meta.answer` and `meta.checks`. `check` fails a declared answer that no teaching step states, and reports where it first appears; the player asks the check questions after the last step with answers behind disclosures; the transcript and `describeExplainer` include both.
- `rayner init` writes `script.md` first, and the tutorial explains how the script reaches the scene.
- Measure the stage heading on the phone only in the close-ups that show it. Close-ups keep below it, and the player gives the step's number, title and line as page text, so a drawing fitted to the stage no longer fails `labelsUnder12PxAt390` for labels larger than the heading's line. The statecharts explainer drops its hand-tuned scale caps.
- Describe Mermaid state diagrams' `[*]` dots by the state and region they belong to ("start of on, region 2") instead of failing them as wordless parts, count composite states and not the dots, and let `dim` on a composite keep what is drawn inside it. The reference has a recipe for state machines and graphs drawn with Mermaid, and the authoring skill prefers it to hand-placed boxes.
- Add a statecharts explainer, written from a short script that answers what a statechart is and why to use one: a coffee machine's four POWER_OFF arrows become one on a parent state, and a player's playback and volume become regions that rule out the impossible boolean combination. Its model is checked against XState 5.33.3.
- Write the script first: the authoring skill now asks for the reader's questions, a 150 to 250 word answer-first script, a sentence to remember and check questions before planning steps, and the rubric fails an explainer whose transcript does not state its answer before it elaborates.
- Capture numbered contact-sheet titles in explicit lettering mode. Preserve copied panels’ reader emphasis and repeated state-readout labels. Export `jsonObject` for portable authoring helpers, and reject array subclasses and inherited array entries.
- Give composite objects a shared copy/restore contract so copied cards and code blocks update their own children, readouts and highlights.
- Separate animation schedules from drawable targets and packed lettering references from expanded glyph paths. Type known step metadata and scene state; reject lossy JSON state and evidence with a field path.
- Add retained text-shaping services and explicit scene authoring. Keep existing ambient constructors behind a compatibility adapter; remove font-table replacement, prototype patches and the dummy installation scene. Pass the service through diagram measurement and SVG lowering.
- Share narrative-frame presentation and generated catalog, evidence and scene-input contracts. Validate serialized artifacts before consumers use them.

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
