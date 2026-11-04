# Changelog

## Unreleased

- Build Henge from the approved script: fixed-axis globes, projected daily sky paths, an annual bearing sweep, a due-west alternative and street-level half/full disc geometry. Check the coordinate model against independently captured ERFA vectors. Update the other published explanations to follow their revised causal scripts and regenerate the complete website collection.
- Rewrite the explainer scripts and the starter as reader-facing causal explanations. Keep construction choices and model scope in optional notes, ending quizzes in scene metadata, and verification in tests. Update the tutorial and editorial guidance to use the same division.
- Shorten the main periodic-table story to runs, stacking, names and helium; keep filling-order machinery and configuration exceptions as optional reference. Give dictionary deletion and search-race readers unseen transfer exercises, distinguish all three ordinary Git merge outcomes, and promote the three engineering lessons after reviewing their scripts and source checks.
- Rebuild explainer scripts around concrete problems, consequential cases and tested models. Add statecharts with an independent XState comparison, plus external model checks against Git, rustc and Go’s rate limiter.
- Add `meta.answer` and disclosed transfer questions (`meta.checks`). The answer gate checks that the declared phrase appears; editorial review and newcomer evaluation determine whether the explanation teaches.
- Add optional `meta.claims` evidence-link lint. Paths resolve in the author’s working directory; static node:test declarations are checked. Multiple claim phrases in one sentence are retained. This does not run tests or verify prose truth.
- Curate subject exemplars from catalog tiers, with Bloom filter as the entry. Keep authoring lessons in their own collection and periodic groups/birthday paradox as secondary examples. `--only showcase` derives build/export selection from the catalog. No benchmark result establishes that the final rebuilt pages outperform plain pages.
- Ask birthday readers to reason about merged rooms and a smaller calendar rather than recall seeded cards. Share seasons’ calendar calculation with its model and keep model invariants in tests instead of scene construction.
- Improve phone stage height, remove duplicated headings from close-ups, enable arrow keys from load and conceal future step titles. Phone preflight uses the minimum stage geometry; browser review measures the actual served page.
- File Agentic Mermaid state-edit reports [#596](https://github.com/adewale/agentic-mermaid/issues/596) and [#597](https://github.com/adewale/agentic-mermaid/issues/597), and remove temporary drafts.
- Extract `GrowFromEdge`, `PulseAlongPath` and `SetState` as composable engine animations. Use them for captured bars/tasks/messages and the ring-buffer/periodic-table schedules; document their contracts and ship a runnable choreography recipe.

- Add `matchByKey({ fallback, text })` and `View.sync({ match: 'keys' })`: parts under containers with the same `key` pair by place, so a keyed cell or node is kept as one component wherever it moves and its own parts morph inside it; `text: 'whole'` pairs a keyed word only with the same words. Match keys now receive the picture they belong to. Periodic groups and statecharts use it instead of their own key functions.
- Add `Mobject.become(other)`: take another mobject's data in place, keeping identity, children and key; a different shape replaces the children, refused when any carries a key. Ring-buffer pointers now move with `Follow`, replacing two path functions.
- Make the new abstractions correct by construction. `Follow` takes `draw` (the picture at a value) instead of `apply` and writes its targets itself with `become`, so it cannot write undeclared mobjects or carry over a previous frame. A `Session` refuses views that are not `view(scene, render)`. An invariant returns `true` when it held, and `rayner check` fails one that never held (a misspelt key finds nothing).
- `matchByKey` takes `unkeyed: 'by-place'`; monty-hall uses it instead of its own copy of the key function, and both monty-hall and statecharts use the kit's `keyed`. Token-bucket's private `SyncToCall` is now a `SetState` followed by the readout's sync. All three render byte-identically.
- Statecharts' picture is a function of the scene's state (its phase included), and the coffee machine is a second session: the parent step replays POWER_ON, START and GROUND. Ring-buffer and state-machine stay hand-animated; SESSIONS.md says why.
- Publish the drawing kit as `rayner/drawing`: `keyed`, `label`, `tile`, `segment`, `dot`, `table`, `stat`, `flow` and `bars`, moved from the collection's scene library, which re-exports them.
- `rayner describe` lists each case's invariants and sessions and each step's replayed events; `rayner see` prints them.
- `rayner check` runs its checks as sinks fed by one fan-out sink (caption holds, seek frames, resting pictures, legibility, motion, invariants); its reports are byte-identical. Explored session states are also checked for label size.
- The player keeps the tallest heading's and title's height, Next's width and, on phones, the close-up tour row's and next close-up's places, and its step bar takes the room left beside a longer Next, so stepping no longer moves the heading, the stepper row or the tour row. The caption keeps the tallest caption's height, so nothing after it moves either; the way back from the details reads Back and shrinks to its icon when the row is tight, so the stepper row never wraps.
- The bench leaves out shifts that begin after the reader opens a disclosure on the way to the last step and before the jump's own click.
- Add a generated-sequence comparison of the statecharts model with XState's explored graph.
- Add `Session`: a scene's model driven by events, replayed as one `Succession` of model steps and keyed view syncs; `SetState` takes a function of the current state and an `event` to record. `rayner check` explores every state a session reaches and fails one that collides, is undescribed, does not show its state, or is described like another, naming its shortest events. Statecharts reaches the frother answer by replaying XState's events. The player's event buttons are not built yet.
- Add `Scene.addInvariant(name, check)` and `InvariantSink`: a claim about the picture checked on every frame of a full run; `rayner check` fails a case at the first frame a claim breaks and reports the frames each held on. The token bucket claims its gauge stands where the balance line ends; the ring buffer that its pointers stay on their circle, now that their arrows turn about the ring's centre. A fifth recipe shows a claim and its counterexample.
- Add `Mobject.find(key)`, `findAll(key or test)`, `Scene.find` and `Scene.findAll`: the one way to address a part by key.
- Every animation reports `evidence()`, recorded as it begins, including a View's sync (its morph's counts and the View's key) and `Follow` (its interval and targets). The matcher's `scene` field is gone.
- Let the explainer library's `table()` place its measured columns between two edges or a fixed gap apart; Python dict and the Bloom filter drop their private column-width calculations.
- Add `Follow`: several drawings written from one number sampled between two ends, with the mobjects it writes named for `play()`'s one-writer check; every animation now reports its `targets()`. The token bucket's gauge and chart climb from the same elapsed time during refill, corner at the cap included. Ring-buffer pointers move round the ring instead of across it, through `Transform`'s `pathFunc`.
- Document native frame/text/trace output as the replacement for Lantern document authoring. Add local engine fundamentals, runnable public-API extension recipes and installed-package coverage. Record the sampled-parameter survey: the recipe stays the supported path, one explainer would change, and the rig API is not built.

- Capture numbered contact-sheet titles in explicit lettering mode. Preserve copied panels’ reader emphasis and repeated state-readout labels. Export `jsonObject` for portable authoring helpers, and reject array subclasses and inherited array entries.
- Give composite objects a shared copy/restore contract so copied cards and code blocks update their own children, readouts and highlights.
- Separate animation schedules from drawable targets and packed lettering references from expanded glyph paths. Type known step metadata and scene state; reject lossy JSON state and evidence with a field path.
- Add retained text-shaping services and explicit scene authoring. Keep existing ambient constructors behind a compatibility adapter; remove font-table replacement, prototype patches and the dummy installation scene. Pass the service through diagram measurement and SVG lowering.
- Share narrative-frame presentation and generated catalog, evidence and scene-input contracts. Validate serialized artifacts before consumers use them.

- Lead the gallery with selected subject lessons while keeping the full subject and authoring collection available. Add cited lessons on Python dictionary deletion, Bloom filters, Git merges, Monty Hall, birthdays, music and periodic-table groups.
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
