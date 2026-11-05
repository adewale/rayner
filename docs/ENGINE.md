# Engine docs: a map

The engine is `src/`, exported through `src/index.ts`. It has no runtime dependencies and never shells out: token colours, Git hunks, diagram snapshots and requested lettering are captured at build time and checked in. Start with [engine fundamentals](ENGINE-FUNDAMENTALS.md), then run the [extension recipes](EXTENDING.md). The explainer layer on top (stage, diagrams, checks, page) is in [the reference](REFERENCE.md), which also [names the explainers](REFERENCE.md#engine-features) that use each feature. [Upstream](UPSTREAM.md) records what changed from Lantern.

## Correctness by construction

Five invariants hold the engine together. The API enforces each one where it can, and a check covers it where it cannot.

1. **A frame is a pure function of time.** The clock is the frame count. An animation fixes its endpoints when it begins and computes each frame from alpha alone, so a seek can skip interpolations and must render the byte-identical frame a full run renders. An active updater may depend on earlier frames, so a play with one replays frame by frame ([fundamentals](ENGINE-FUNDAMENTALS.md#updaters-derived-pictures-and-seeking)). `rayner check` fails a step whose direct link draws differently from playing to it.
2. **Each mobject has one writer.** Every animation reports the mobjects it writes (`targets()`), and `play()` rejects two animations that drive the same mobject, or an ancestor and its descendant, at once. [`Follow`](CHOREOGRAPHY.md#follow) writes only the targets it names.
3. **Identity is a key.** A part is addressed by its `key` (`find`, `findAll`) and kept across morphs by it ([`matchByKey`](MATCHING.md#keyed-components)); `become` refuses to drop a keyed child. `Mobject.id` is the renderer's number and is not part of the published types.
4. **Anything a reader can reach is a view of state.** A [`view(scene, draw)`](VIEWS.md) keeps its `draw`, `stage.steps` records each step's, and a [`Machine`](MACHINES.md) is made of views. So `rayner check` redraws every staged step and every reachable machine state from the state alone and compares, and a fidelity test can compare any view with the traced state at every step.
5. **Every claim can fail.** An [invariant](EXTENDING.md#hold-an-invariant-on-every-frame) that never holds in a run fails, and `test/explain-gates.test.ts` gives each check one seeded defect it must reject. A claim of success names the check that proves it and the deliberate defect that check was shown to reject.

Three records say what happened, each answering a different question. The **trace** (`traceScene`) is what each step showed: its timing, the model before and after, what was shown (`shown`) and the step's evidence. **Evidence** is what an animation decided, recorded as it began ([fundamentals](ENGINE-FUNDAMENTALS.md#steps-state-and-evidence)). The **receipt** is what a build produced: source, engine and snapshot hashes, the page's `artifactHash` and each scenario's steps ([reference](REFERENCE.md#headers)).

## Which guide answers which question

| Module | Doc | The question it answers |
| --- | --- | --- |
| `mobject.ts`, `vmobject.ts`, `shapes.ts`, `scene.ts` | [Fundamentals](ENGINE-FUNDAMENTALS.md) and [extension recipes](EXTENDING.md) | What is a scene made of, how does ownership work, and how do I extend it? |
| `animation.ts`: `Restore`, `TransformFromCopy`, `Succession` (`saveState` in `mobject.ts`) | [ANIMATIONS.md](ANIMATIONS.md) | How do I come back to a saved look, derive one thing from another, or run animations one after another in one play? |
| `animation.ts`: `GrowFromEdge`, `PulseAlongPath`, `SetState`, `Follow`; `mobject.ts`: `become` | [Reusable choreography](CHOREOGRAPHY.md) | How do I grow a bar or task, send a transient token, sequence model snapshots with views, or drive several drawings from one sampled number? |
| `animation.ts`: `TransformMatching`, `TransformMatchingShapes`, `TransformMatchingText`, `matchByKey` (`shapeKey()` in `vmobject.ts`) | [MATCHING.md](MATCHING.md) | How do I morph by what the parts are instead of where they sit in the family, and keep a keyed cell or node as one component? |
| `animation.ts`: `Circumscribe`; `shapes.ts`: `SurroundingRectangle`, `Underline`, `Cross`, `Brace`, `BraceLabel` | [EMPHASIS.md](EMPHASIS.md) | How do I point at part of the picture so the step's resting picture still shows it? |
| `frame.ts` (`scene.frame`); `svg.ts`: `cull` | [CAMERA.md](CAMERA.md) | How do I zoom and pan without moving anything I drew? |
| `graphing.ts`: `NumberLine`, `Axes` | [GRAPHING.md](GRAPHING.md) | How do I chart the program's own numbers? |
| `view.ts`: `view`, `viewMismatch`; `panels.ts`: `StateReadout` | [VIEWS.md](VIEWS.md) | How do I make a picture a function of `scene.state`, and check it at every step? |
| `text.ts`: `Code` spans and token colours; `svg.ts`: run merging; `tools/tokens.ts` | [CODE.md](CODE.md) | How do I address, colour and box part of a line of code, and what does colour cost? |
| `diff.ts`, `animation.ts`: `TransformDiff`; `scene.ts`: `record()` | [MATCHING.md, "Diff-driven"](MATCHING.md#diff-driven) | How does a code morph follow the diff, and how does the trace prove it did? |
| `svg.ts`, `ascii.ts`, `trace.ts`, `timeline.ts` | [Scene outputs](SCENE-OUTPUTS.md) | How do I get frames, text, elements, step indexes and traces from a scene? |
| `machine.ts`: `Machine`, `machinesOf`; `choreograph.ts`: `choreograph` | [Machines](MACHINES.md) | How do I drive a scene's model with events, author each event's motion part by part, and have every reachable state and transition checked? |
| `scene.ts`: `addInvariant`; `verify.ts`: `InvariantSink` | [Extension recipes, "Hold an invariant on every frame"](EXTENDING.md#hold-an-invariant-on-every-frame) | How do I say what must stay true while things move, and have every frame checked? |
| `verify.ts`, `trace.ts`, `timeline.ts` | [Testing](TESTING.md) and [the reference, "Checks"](REFERENCE.md#checks) | Is the animation true, correct and smooth, and what does each check establish? |
| `perf.ts`, `svg.ts` | [Profiling](ENGINE-FUNDAMENTALS.md#outputs-checks-and-performance); run merging in [CODE.md](CODE.md#cost-elements-per-line) | Where does a frame's time go, and how should I measure it? |
| `fonts.ts`, `font-data.ts` | [The reference, "Scene"](REFERENCE.md#scene) (the fallback chain) | Which face draws a character, and what fails? |
| `lettering.ts` | [The reference, "Lettering on request"](REFERENCE.md#lettering-on-request) | How does an explainer draw Greek or Cyrillic, and what does that cost the explainers that do not? |
| `lettering-outlines.ts`, `italic.ts`, `math.ts` | [LETTERING.md](LETTERING.md) | How does an explainer draw another face, real bold and italic, Arabic, Devanagari, Hebrew or maths from runs shaped at build time, and why does no other page carry that code? |

## What belongs in Rayner

Sort a feature request with one question: does it check, ground or publish the result, or does it do work a capable author would do anyway?

- **Belongs:** work an author, human or model, cannot easily do or verify by eye, and that should be the same on every page: testing a model against its source, measuring what is painted, reviewing the served page, deterministic frames, portable and accessible pages, a description and transcript for every picture, and making the reader's own actions checkable ([the live machine](https://github.com/adewale/rayner/issues/88)). This work gets more valuable as authoring models improve, because there is more output to check.
- **Does not belong:** work that needs judgement and improves with the author's skill: wording, pacing, narration, layout and how to teach. Rayner gives the author what that work needs (`describe`, `see`, the resting-picture descriptions, step timing) and leaves the work to the author, because a feature here would cap good authors at the feature's level. The same goes for guidance: the [authoring skill](../skills/rayner-explainers/SKILL.md) says what must be true and how it is checked, not how to draw.

When a request is the second kind, the answer is usually to expose the data the author needs rather than build the behaviour.

**Design records.** A design document ends with what was tried and not kept, and why, as Lantern's performance notes did and as [sampled parameters](PARAMETERS.md), [machines](MACHINES.md) and the [vocabulary](VOCABULARY.md) do. A proposal that cannot name its rejected alternatives, or the existing explainers it changes, is not ready.

## Primitives considered and not built

A review on 2026-11-03 found that 34 of the 40 explainers cleared the stage and redrew each step, and that the duplication the collection carried was layout arithmetic, not identity. It added keyed components (`matchByKey`, [matching](MATCHING.md#keyed-components)) and a `table()` in the drawing kit that places its measured columns and keys its header, rows and cells (`key:row:column`; a duplicated row key is refused), which python-dict's machines morph by. It turned these down:

- **Keyed collections with separate slots.** Which entity an item is, which slot it occupies and where it is shown are model facts, and every scene's model already holds them (`ring-buffer` keys values `slot:${i}`). Once keyed components match, a collection is a key-naming convention, and moving entity identity into the drawing layer would take it away from the oracle-tested model.
- **Persistent attachments.** In a redraw scene every label is recomputed anyway; in a morphing scene the `View` rebuild repositions arrows, and `Labeled` and the diagram `note()` cover static anchors. An attachment system needs a geometry plan, cycle rejection and a missing-target policy, which add up to a reactive constraint graph; "points are the truth" excludes one.
- **A parameter rig.** One explainer, the token bucket, needed several drawings to follow one number, so the exported shape is one small animation, [`Follow`](CHOREOGRAPHY.md#follow). [Sampled parameters](PARAMETERS.md) records the survey.

`stage.steps` keeps clear-and-redraw as its default transition: an author opts into entity continuity, with a view or a machine, when successive pictures show the same entities.

## Public names

A review on 2026-11-05 found that 90 of the 165 names the three entry points export as values had no explainer using them, and looked each one up in the library, the tools, the tests, the recipes and the docs. A name stays public for one of three reasons:

- **Author tooling.** Sinks, traces, `renderAt`, `describeExplainer`, the settings functions, fonts and the diagnostics serve an author's tests and scripts rather than scenes; [the reference lists them](REFERENCE.md#testing-and-tooling-api).
- **A Manim name that means what Manim means, with a test that says so.** `linear`, `smooth`, `rushInto`, `rushFrom` and `thereAndBack` are compared with Manim's own functions (`test/manim.test.ts`); the nine direction vectors and fourteen colours are ManimGL's values, checked against its `default_config.yml` (ManimCE differs only on `YELLOW`, `#F7D96F` there; `test/core.test.ts`). They are fixed values for porting Manim scenes: no explainer uses them, because an explainer colours from `s.palette`, so that a palette chosen for the stage recolours every part and keeps its contrast; `Brace`, `NumberLine`, `DecimalNumber`, `Indicate`, `Flash` and `ArcBetweenPoints` have tests and guides.
- **A Rayner name a guide or recipe teaches and a test covers**, such as `Labeled`, `bars`, `between`, `greatArc` and `MathTex`'s alias `Math`.

A name only the library uses becomes internal, and a name nothing uses is cut. In 0.2.0 that made internal the vector helpers `add`, `sub`, `mul`, `dot`, `norm`, `normalize`, `lerp`, `rotate` and `angleOf` (one-line arithmetic, and `dot` collided with the drawing kit's `dot`); `tokenize`, `diffTokens` and `hunkHeader`, which `TransformDiff` uses inside (`diffLines` and `parseUnifiedDiff` stay, as sources of hunks); `findingsOf` and `edgePartOf`, whose public routes are `d.findings()` and `d.link()`; and `stagedStepsOf`, which `rayner check` reads. `ViewSync` is now a type only, since `view.sync()` makes one. `easeInQuad`, `easeOutQuad` and `easeOutBack` were cut, being neither Manim's names nor used, and so was `wiggle`, which swings twice as often as Manim's. `test/api.test.ts`, `test/drawing.test.ts` and `test/explain-helpers.test.ts` pin the result.

## Out of scope

- **3D in the engine.** The model is 2D point buffers drawn as SVG paths; a z-buffer, lighting and a 3D camera would be a second engine. A 3D picture is a drawing instead: [`seenFrom(model, viewpoint)`](REFERENCE.md#3d-seenfrommodel-viewpoint) in the drawing kit turns a model and a viewpoint (plain state, turned by a `Follow`) into ordinary keyed 2D pieces in an explicit depth order, which `depthOrder` checks.
- **Boolean path operations** (union, intersection, difference). Robust curve clipping is a geometry library in itself; an approximate one would break exact points, and a dependency would break zero runtime dependencies.
- **Runtime LaTeX.** A TeX engine and its fonts are a large dependency, so neither a page nor a build runs one. Maths is typeset once, when its snapshot is captured, by `glyph`'s TeX subset on Latin Modern Math, and stored as outlines in `scene.lettering.json`. `MathTex` draws those outlines ([Maths](REFERENCE.md#maths)).
- **`transform` matrices on the model.** Every move rewrites points, because points are what traces, the verifiers and matching transforms read. The SVG serializer already writes shape-relative path data plus a `translate`, so a pure move keeps its `d` without a matrix in the model.
- **Raster images.** A bitmap has no points to morph, would be embedded as bytes, and would make frames depend on a decoder; everything on stage is paths and glyph outlines.

The fork deleted Lantern's Mermaid flowchart layout and its JSON document format. Diagrams come from Agentic Mermaid capture, and [scene outputs](SCENE-OUTPUTS.md) gives the outputs the JSON documents produced, from native scenes.

## Embedded browser fonts

Ordinary pages use SFNT copies of the embedded Inter, JetBrains Mono and Noto subsets: the same glyphs and metrics, without the WOFF2 Brotli decoder. Authoring, and pages that request lettering, keep the full loader. `test/browser-fonts.test.ts` compares both loaders over fixed fallback examples and generated strings.

`npm run fonts` regenerates both. To rebuild only the browser copies from the committed subsets, run `node tools/fonts-sfnt.ts` with fonttools and brotli installed in Python (`RAYNER_LETTERING_PYTHON` selects the interpreter); the tool checks the original shaper pin first. No Python runs when an author builds a page.
