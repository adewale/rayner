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
| `animation.ts`: `GrowFromEdge`, `PulseAlongPath`, `SetState`, `Follow` | [Reusable choreography](CHOREOGRAPHY.md) | How do I grow a bar/task, send a transient token, sequence model snapshots with views, or drive several drawings from one sampled number? |
| `animation.ts`: `TransformMatching`, `TransformMatchingShapes`, `TransformMatchingText`, `matchByKey` (`shapeKey()` in `vmobject.ts`) | [MATCHING.md](MATCHING.md) | How do I morph by what the parts are instead of where they sit in the family, and keep a keyed cell or node as one component? |
| `animation.ts`: `Circumscribe`; `shapes.ts`: `SurroundingRectangle`, `Underline`, `Cross`, `Brace`, `BraceLabel` | [EMPHASIS.md](EMPHASIS.md) | How do I point at part of the picture so the step's resting picture still shows it? |
| `frame.ts` (`scene.frame`); `svg.ts`: `cull` | [CAMERA.md](CAMERA.md) | How do I zoom and pan without moving anything I drew? |
| `graphing.ts`: `NumberLine`, `Axes` | [GRAPHING.md](GRAPHING.md) | How do I chart the program's own numbers? |
| `view.ts`: `view`, `stateView`, `viewMismatch`; `panels.ts`: `StateReadout` | [VIEWS.md](VIEWS.md) | How do I make a picture a function of `scene.state`, and check it at every step? |
| `text.ts`: `Code` spans and token colours; `svg.ts`: run merging; `tools/tokens.ts` | [CODE.md](CODE.md) | How do I address, colour and box part of a line of code, and what does colour cost? |
| `diff.ts`, `animation.ts`: `TransformDiff`; `scene.ts`: `record()` | [MATCHING.md, "Diff-driven"](MATCHING.md#diff-driven) and [the reference, "Scene"](REFERENCE.md#scene) | How does a code morph follow the diff, and how does the trace prove it did? |
| `svg.ts`, `ascii.ts`, `trace.ts`, `timeline.ts` | [Scene outputs](SCENE-OUTPUTS.md) | How do I get frames, text, elements, step indexes and traces without a JSON scene document? |
| `session.ts`: `Session`, `sessionsOf`; `SetState` with a model step | [Sessions](SESSIONS.md) | How do I drive a scene's model with events, replay them as one play, and have every reachable state checked? |
| `scene.ts`: `addInvariant`; `verify.ts`: `InvariantSink` | [Extension recipes, "Claim something on every frame"](EXTENDING.md#claim-something-on-every-frame) | How do I say what must stay true while things move, and have every frame checked? |
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
diagram snapshots are captured at build time. [Sampled parameters](PARAMETERS.md)
records what a directly sampled alternative to updaters would and would not buy.

## What belongs in Rayner

Sort a feature request with one question: does it check, ground or publish the result, or does it do work a capable author would do anyway?

- **Belongs:** work an author, human or model, cannot easily do or verify by eye, and that should be identical on every page. Testing a model against its source, measuring what is painted, reviewing the served page, deterministic frames, portable and accessible pages, a description and transcript for every picture, and making the reader's own actions checkable ([the live machine](https://github.com/adewale/rayner/issues/88)). These get more valuable as authoring models get better, because there is more output to check.
- **Does not belong:** work that needs judgement and improves with the author's skill. Wording, pacing, narration, layout choices and how to teach. Rayner should give the author what that work needs (`describe`, `see`, the resting-picture descriptions, step timing) and leave the work to the author. A feature here would cap good authors at the feature's level and be outgrown by better models. The same goes for guidance: the [authoring skill](../skills/rayner-explainers/SKILL.md) says what must be true and how it is checked, not how to draw.

When a request is the second kind, the answer is usually to expose the data the author needs, not to build the behaviour.

**Design records.** A design document ends with what was tried and not kept, and why, as Lantern's performance notes did: [sampled parameters](PARAMETERS.md), [sessions](SESSIONS.md) and the primitives below do. A proposal that cannot name its rejected alternatives, or the existing explainers it changes, is not ready. A claim of success names the check that proves it and the deliberate defect that check was shown to reject.

## Next primitives

Reconsidered on 2026-11-03 against the collection as it draws today: 34 of the
40 explainers clear the stage and redraw each step, 7 morph a `View`, and the
duplication the collection actually carries is layout arithmetic, not identity.
That rules out most of what was proposed and leaves two things, each in its own
layer.

- **Keyed components, in the engine (done).** `matchByKey()` pairs the parts
  under containers with the same `mobject.key`, so a keyed cell or node is kept
  as one component wherever it moves ([matching](MATCHING.md#keyed-components)),
  and `View.sync({ match: 'keys' })` uses it. `periodic-groups` keys its element
  cells and symbols this way. The [live machine](https://github.com/adewale/rayner/issues/88)
  is the next consumer: a reader-driven redraw whose parts keep their identity.
- **A table that places its measured columns, in the explainer library (done).**
  `table()` in `scenes/explainers/lib/lesson-drawing.ts` already measured every
  column; it now takes `{ left, right }` or `{ left, gap }` and places them, and
  its box is the measured extent. That removed the private width calculations
  in `python-dict` and `bloom-filter`. Nothing in `src/` is involved: a table is
  a drawing an author composes, not an engine object.

Not built, and why:

- **Keyed collections with separate slots.** Which entity an item is, which slot
  it occupies and where it is shown are model facts, and every scene's model
  already holds them (`ring-buffer` keys values `slot:${i}`). Once keyed
  components match, a collection is a key-naming convention, and moving entity
  identity into the drawing layer would take it away from the oracle-tested model.
- **Persistent attachments.** In a redraw scene every label is recomputed anyway;
  in a morphing scene the `View` rebuild repositions arrows, and `Labeled` and
  the diagram `note()` cover static anchors. The contracts an attachment system
  needs (a geometry plan, cycle rejection, missing-target policy) are a reactive
  constraint graph, which "points are the truth" deliberately excludes.
- **The live machine, authoring half (done).** [Sessions](SESSIONS.md) replay events
  through a scene's model as one play and `rayner check` explores every reachable state;
  `statecharts` reaches its transfer answer this way. The player's buttons remain.
- **A parameter rig.** [Sampled parameters](PARAMETERS.md) records the survey:
  one explainer, the token bucket, needed several drawings to follow one number.
  The exported shape is one small animation, [`Follow`](CHOREOGRAPHY.md#follow),
  which names the mobjects it writes; the token bucket's refill is its proof.

Keep `presentFrame`'s clear/draw transition the default: an author opts into
entity continuity when successive pictures really show the same entities.

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
