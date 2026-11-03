# Engine docs: a map

The engine is `src/` (zero dependencies, exported through `src/index.ts`). Each guide below
answers one question about it. The explainer layer built on top is documented in
[the reference](REFERENCE.md), which also [names the explainers](REFERENCE.md#engine-features)
that use each feature. Start with [engine fundamentals](ENGINE-FUNDAMENTALS.md),
then run the [extension recipes](EXTENDING.md). [Scene outputs](SCENE-OUTPUTS.md)
covers the use case previously served by Lantern's JSON documents. Attribution and
historical differences belong in [Upstream](UPSTREAM.md), not in the prerequisite
reading for this API.

| Module | Doc | The question it answers |
| --- | --- | --- |
| `mobject.ts`, `vmobject.ts`, `shapes.ts`, `scene.ts` | [Fundamentals](ENGINE-FUNDAMENTALS.md) and [extension recipes](EXTENDING.md) | What is a scene made of, how does ownership work, and how do I extend it? |
| `animation.ts`: `Restore`, `TransformFromCopy`, `Succession` (`saveState` in `mobject.ts`) | [ANIMATIONS.md](ANIMATIONS.md) | How do I come back to a saved look, derive one thing from another, or run animations one after another in one play? |
| `animation.ts`: `GrowFromEdge`, `PulseAlongPath`, `SetState` | [Reusable choreography](CHOREOGRAPHY.md) | How do I grow a bar/task, send a transient token, or sequence model snapshots with views? |
| `animation.ts`: `TransformMatching`, `TransformMatchingShapes`, `TransformMatchingText` (`shapeKey()` in `vmobject.ts`) | [MATCHING.md](MATCHING.md) | How do I morph by what the parts are instead of where they sit in the family? |
| `animation.ts`: `Circumscribe`; `shapes.ts`: `SurroundingRectangle`, `Underline`, `Cross`, `Brace`, `BraceLabel` | [EMPHASIS.md](EMPHASIS.md) | How do I point at part of the picture so the step's resting picture still shows it? |
| `frame.ts` (`scene.frame`); `svg.ts`: `cull` | [CAMERA.md](CAMERA.md) | How do I zoom and pan without moving anything I drew? |
| `graphing.ts`: `NumberLine`, `Axes` | [GRAPHING.md](GRAPHING.md) | How do I chart the program's own numbers? |
| `view.ts`: `view`, `stateView`, `viewMismatch`; `panels.ts`: `StateReadout` | [VIEWS.md](VIEWS.md) | How do I make a picture a function of `scene.state`, and check it at every step? |
| `text.ts`: `Code` spans and token colours; `svg.ts`: run merging; `tools/tokens.ts` | [CODE.md](CODE.md) | How do I address, colour and box part of a line of code, and what does colour cost? |
| `diff.ts`, `animation.ts`: `TransformDiff`; `scene.ts`: `record()` | [MATCHING.md, "Diff-driven"](MATCHING.md#diff-driven) and [the reference, "Scene"](REFERENCE.md#scene) | How does a code morph follow the diff, and how does the trace prove it did? |
| `svg.ts`, `ascii.ts`, `trace.ts`, `timeline.ts` | [Scene outputs](SCENE-OUTPUTS.md) | How do I get frames, text, elements, step indexes and traces without a JSON scene document? |
| `verify.ts`, `trace.ts`, `timeline.ts` | [Testing](TESTING.md), [fundamentals](ENGINE-FUNDAMENTALS.md#outputs-checks-and-performance) and [the reference, "Checks"](REFERENCE.md#checks) | Is the animation true, correct and smooth, and what does each check establish? |
| `perf.ts`, `svg.ts` | [Profiling](ENGINE-FUNDAMENTALS.md#outputs-checks-and-performance); run merging in [CODE.md](CODE.md#cost-elements-per-line) | Where does a frame's time go, and how should I measure it? |
| `fonts.ts`, `font-data.ts` | [The reference, "Scene"](REFERENCE.md#scene) (the fallback chain) and [upstream](UPSTREAM.md#engine-changes) | Which face draws a character, and what fails? |
| `lettering.ts` | [The reference, "Lettering on request"](REFERENCE.md#lettering-on-request) | How does an explainer draw Greek or Cyrillic, and what does that cost the explainers that do not? |
| `lettering-outlines.ts`, `italic.ts`, `math.ts` | [LETTERING.md](LETTERING.md) | How does an explainer draw another face, real bold and italic, Arabic, Devanagari, Hebrew or maths from runs shaped at build time, and why does no other page carry that code? |

Lantern's Mermaid flowchart layout and its JSON document format were deleted in this fork
([upstream](UPSTREAM.md) lists what went); diagrams come from Agentic Mermaid capture instead.

Endpoint-based animations capture starts when their play begins and support skipped
interpolations; active updaters conservatively retain frame-by-frame replay. Seeking
must render the byte-identical frame a full run renders. Nothing in `src/` imports
a dependency or shells out. External inputs such as token colours, Git hunks and
diagram snapshots are captured at build time. [Continuous parameters](PARAMETERS.md)
designs a shared, directly sampled alternative; its proposed API is not yet exported.

## What belongs in Rayner

Sort a feature request with one question: does it check, ground or publish the result, or does it do work a capable author would do anyway?

- **Belongs:** work an author, human or model, cannot easily do or verify by eye, and that should be identical on every page. Testing a model against its source, measuring what is painted, reviewing the served page, deterministic frames, portable and accessible pages, a description and transcript for every picture, and making the reader's own actions checkable ([the live machine](https://github.com/adewale/rayner/issues/88)). These get more valuable as authoring models get better, because there is more output to check.
- **Does not belong:** work that needs judgement and improves with the author's skill. Wording, pacing, narration, layout choices and how to teach. Rayner should give the author what that work needs (`describe`, `see`, the resting-picture descriptions, step timing) and leave the work to the author. A feature here would cap good authors at the feature's level and be outgrown by better models. The same goes for guidance: the [authoring skill](../skills/rayner-explainers/SKILL.md) says what must be true and how it is checked, not how to draw.

When a request is the second kind, the answer is usually to expose the data the author needs, not to build the behaviour.

## Proposed composition primitives after PR #89

Reconsidered against [PR #89](https://github.com/adewale/rayner/pull/89) at
`50bc696cabcc370bb4349126cacb1e4387dc19f8` on 2026-11-03. These are design
directions, not five new exported APIs. The current supported extension points and
animations remain in [the recipes](EXTENDING.md) and [choreography](CHOREOGRAPHY.md).

| Primitive | Evidence in the current examples | Required contract |
| --- | --- | --- |
| Keyed component updates | Periodic groups' `samePlace` matches element cells and symbol glyphs across the filling-run/table transition. `View.sync()` retains its outer View but swaps its child; matching currently addresses drawable paths. | An author supplies semantic keys within an owner. Retain compatible keyed component roots, including their addressability; explicitly insert/remove/replace others. Reject duplicate keys. Glyphs may change beneath a retained Text. Do not infer entity identity from equal words or coordinates. |
| Measured, addressable table | Python dict repeats table width calculations to align its lookup panel; GTFS computes cell, column and row positions locally. | Expose measured column widths, row heights, cell bounds and anchors keyed by row/column identity. Cell contents remain ordinary mobjects. Rows and columns can be selected without giving a cell two parents. Gaps, alignment, fixed widths and overflow policy belong to the author. |
| Keyed collections with separate slots | Dict entries occupy slots; ring-buffer values wrap around storage; GTFS has service/date cells; iCalendar shows a moved meeting in its original recurrence slot. | Separate item identity, slot/address and display order. Moving an item must not rename it; clearing a slot must not delete the slot. iCalendar's identity includes the series and original recurrence id, not its displayed start. An array strip and a date grid are compositions over this capability. |
| Persistent attachments | Git pointers, dict routes and labels in the calendar/timeline drawings manually recompute positions and endpoints. | Address an owner plus a named anchor, with an explicit offset and missing-target policy. Retain the attached label/connector. Resolve anchors after the sample's geometry is known, before paint; arbitrary repeated calls to `nextTo()` are not the contract. Graph route planning remains a separate responsibility. |
| Sampled continuous parameters | Seasons can derive several drawings from one day; token-bucket refill can advance between request events. | Keep the [four parameter contracts](PARAMETERS.md#the-four-contracts): validated inputs, one shared sample, stable identity/one writer, reproducible evaluation and inspection. Event acceptance, deletion and calendar membership remain discrete. |

Start with semantic identity: the periodic-table transition already demonstrates
the need, and tables, collection references and attachments all depend on it.
Table and collection layouts should share measurement and addressing mechanisms,
while retaining distinct row/column and item/slot semantics. Attachments and
parameter bindings should share deterministic sampling and ownership rules,
rather than install competing updater systems. A rig binding and an attachment
cannot both claim the same label or connector.

An attachment that follows animated geometry needs that sample's planned bounds
or endpoints. Resolve these from an immutable geometry plan before applying the
patches; do not read a previous frame's boxes or depend on mutation order. This
extends the parameter design's calculation phase, not its permission for bindings
to read another binding's newly mutated target. Reject dependency cycles and
missing anchors before applying changes. Static attachments can use captured
bounds without introducing a general reactive graph.

The new expiry-aligned certificate bars, tax rulers and request lifetime tracks
also suggest useful recipes: scales, interval marks, ticks and labels composed
from `NumberLine`, `Axes` and ordinary shapes. They do not yet justify another
timeline engine. Preserve the quantity's meaning: the certificate bars measure
hours; the search tracks show event order and explicitly disclaim measured time.

**Composition** is an author assembling a particular drawing. **Modularity** is
keeping its model, drawing and checks independently usable. **Compositionality**
is stronger: independently useful parts preserve their contracts when combined.
A table cell that becomes a connector target and then follows a sampled parameter
must keep its identity, report the current anchor, obey one-writer scheduling and
remain seekable. Five isolated widgets would not establish that property.

Prove the shared mechanisms by refactoring the periodic keyed transition and the
dict's measured table/lookup alignment first, preserving their model checks and
resting pictures. Then exercise an attached label through a sampled interval,
including seek/full-render equality, removal and conflicting writers. Keep
`presentFrame`'s clear/draw transition available: an author must opt into entity
continuity when successive pictures actually represent the same entities.

## Out of scope

Each for a reason:

- **3D.** The model is 2D point buffers drawn as SVG paths; depth sorting and a 3D camera would be a second engine.
- **Boolean path operations** (union, intersection, difference). Robust curve clipping is a geometry library in itself; an approximate one would break exact points, and a dependency would break zero runtime dependencies.
- **Runtime LaTeX.** A TeX engine and its fonts are a large runtime dependency, so neither a page nor a build runs one. Maths is typeset once, when its snapshot is captured, by `glyph`'s TeX subset on Latin Modern Math, and stored as outlines in `scene.lettering.json`, checked in like the diagram snapshots. `MathTex` draws those outlines ([Maths](REFERENCE.md#maths)).
- **`transform` matrices on the model.** Every move rewrites points, because points are the truth that traces, the verifiers and matching transforms read. The string serializer already writes shape-relative path data plus a `translate`, so a pure move keeps its `d` without a matrix in the model.
- **Raster images.** A bitmap has no points to morph, would be fetched or embedded as bytes, and would make frames depend on a decoder; everything on stage is paths and glyph outlines.

Lantern listed matching morphs as out of scope at the fork base; [MATCHING.md](MATCHING.md) adds them.
Which of these changes are offered to the original project: [upstream](UPSTREAM.md#offered-upstream-draft-pr-description).

## Embedded browser fonts

Ordinary portable pages use SFNT copies of the embedded Inter, JetBrains Mono and Noto subsets. They retain the same glyphs and metrics while omitting the WOFF2 Brotli decoder. Authoring and pages that request additional lettering keep the full loader. `test/browser-fonts.test.ts` compares both loaders over fixed fallback examples and generated strings.

`npm run fonts` regenerates both representations. To rebuild only the browser copies from the committed subsets, run `node tools/fonts-sfnt.ts` with fonttools and brotli installed in Python; `RAYNER_LETTERING_PYTHON` selects a Python interpreter. The tool checks the original shaper pin before deriving its SFNT-only variant. No Python process runs when an author builds a normal page.
