---
name: rayner-explainers
description: Author, check and publish Rayner explainers as reader-paced HTML embeds. Use for step-through diagrams, code-change explanations, protocol walkthroughs and program-driven animation.
---

# Rayner explainers

An explainer is one Rayner `Scene`. The CLI builds it into a step-through HTML page. It needs no server or MCP. Start with [Your first explainer](https://github.com/adewale/rayner/blob/main/docs/TUTORIAL.md) for a worked example: LRU versus MRU cache replacement, with its model tested against published examples. Read the [reference](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md) for the helper API and the checks, and [publishing](https://github.com/adewale/rayner/blob/main/docs/PUBLISHING.md) before you host a page.

## How to use this skill

This skill says what a finished explainer must achieve and how each part is checked. It does not tell you how to draw, lay out or word a step: use your own judgement, and copy techniques from [the examples](#start-from-an-example) when they help. Rayner's value is that it checks the result: values come from a model tested against its source, pictures are measured as painted, and the page is reviewed as served. When an instruction and a check disagree, the check wins; when you find yourself following a rule that no check or reader would miss, drop it.

## Script first

Write the script the explainer exists to show before you draw anything. Explainers grown from a model without one explain their own mechanics and never answer the reader's question.

- **Questions and answer.** Write the questions the reader brings, in their words, and answer them in a short piece of plain prose, answer first. For a concept, the first sentence says what it is and what sets it apart.
- **Check questions.** Write the questions a reader should be able to answer afterwards and that only this explainer answers: its own example's outcome, or a transfer to a new case. A reader who already knows the topic recites definitions anyway; a model reader answered every statecharts question from prior knowledge alone. On a topic that well known, only people new to it can tell you whether the explainer teaches.
- **Test it alone.** If a newcomer who reads only the script cannot answer the check questions, fix the script before drawing.

Keep the script beside the scene as `script.md` (`rayner init` starts one). Put its one-sentence answer in `meta.answer`, which `rayner check` requires step 1 or 2 to state, and the check questions with their answers in `meta.checks`, which the player asks after the last step. Do not also print the answers in the last step: the disclosures exist so the reader answers first. The script decides what the explainer says; the model and its tests decide whether it is true.

## What must be true

Each of these is a result, with the way it is checked. Use any technique that gets there.

| The explainer… | Checked by |
| --- | --- |
| Draws every value from a model, tested against the real source | A fidelity test per case and step ([Test the model](#test-the-model)) |
| States its answer by step 2 | `rayner check`, from `meta.answer` |
| Gives the reader something to do that the explanation then answers | Reading it as a reader; [Make the reader act](#make-the-reader-act) |
| Has pictures readable at 1280 px and on a phone, with nothing colliding, and a description in words for each | `rayner check` |
| Works as served: every step from a fresh link, every case, phone and desktop | `rayner review` |
| Says nothing a setting would make false, and claims no more than it tests | Reading every case against the model and its sources |
| Teaches better than the alternative: a still, a code diff, or a page written without Rayner | Asking honestly; [the benchmark](../../bench/explainers/README.md) for changes to Rayner itself |

Checks establish deterministic, readable pictures; they cannot establish that a caption is true or that a reader learns. Do not weaken a check, bless a corrupt snapshot or skip a case to get a pass; a checker defect needs a valid example it wrongly rejects and an invalid one it must still reject.

## Make the reader act

Readers learn from what they do, not from what they watch. In a blind comparison of three Rayner explainers with pages the same models wrote without Rayner, from one script, the reviewer preferred the plain page in all three pairs, twice over, mainly because those let the reader commit to predictions and drive a live machine ([the benchmark](../../bench/explainers/README.md)). Rayner cannot yet take the reader's input inside a step ([the live machine](https://github.com/adewale/rayner/issues/88) is proposed). Until it can, use what exists:

- **Ask, then answer.** A step asks a check question and the next step answers it. The rail hides a step's title until the reader reaches it, so "Answer: …" is safe on the answering step; keep the answer out of the asking step itself.
- **A case that changes the outcome.** A setting is the reader's own lever; give them one whose other option changes the conclusion.
- **The check questions at the end**, from `meta.checks`.

## Loop

Commands are `rayner <command>`, or `npm run rayner -- <command>` in a checkout; `rayner --help` prints the install lines for capture and PNG output.

1. `rayner init <directory>` writes the tutorial's explainer: `script.md`, `scene.ts`, the model `model.ts` and its test `model.test.ts`. Rewrite the script first. Keep one default-exported `Scene` subclass with static `meta` (id, title, sources, answer, checks, and `lang` if not English) and, if a second case teaches something, static `settings`.
2. `rayner preview scene.ts --watch` while you work; `see` and `describe` give any step as text and JSON when you need to read it without a browser.
3. `rayner check scene.ts` until it passes.
4. `rayner review scene.ts --out public/<id>.html` when the scene settles. It checks every case, reviews the served page at phone and desktop widths, and keeps that exact page with its receipt. Look at its screenshots.

The [engine map](https://github.com/adewale/rayner/blob/main/docs/ENGINE.md) lists what already exists (a camera that zooms without moving anything, code that morphs along its diff, morphs matched by text or shape, charts of the model's numbers, pictures rebuilt from `scene.state`), and [the reference](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#engine-features) names an explainer that uses each. Read it before building something by hand.

## Start from an example

Each explainer in [`scenes/explainers/`](https://github.com/adewale/rayner/blob/main/scenes/explainers) shows a technique. Copy the nearest one rather than starting blank; these are ways that worked, not rules:

| You are explaining | Start from | It shows |
| --- | --- | --- |
| Two algorithms or policies on the same input | `scenes/tutorial/lru-mru` (what `rayner init` writes) | One card with a column per policy, read from the model's trace; one case that favours each policy; captions tested against the model |
| A code change and what it does to a system | `mr-cache` | `TransformDiff` on the code, the same edit replayed on the diagram with `ops`, a setting for hit or miss |
| Authoring feature reference | `feature-tour` | Choose a feature case: the recipe step shows the author-written API, the result step runs it. See [scope and specialized APIs](../../docs/FEATURE-TOUR.md) |
| A protocol or request flow | `oauth-pkce` | A sequence diagram revealed message by message (`build: 'frame'`, `reveal`); a setting that adds the attacker's step |
| A data structure changing step by step | `ring-buffer` | No diagram: native shapes, `Succession`, a `view` of `scene.state` |
| A state machine | `state-machine` | A state diagram driven by the real reducer, code spans, `Restore` |
| Nested or parallel states | A Mermaid `stateDiagram-v2` with composites and regions ([recipe](../../docs/REFERENCE.md#state-machines-and-graphs)); `statecharts` when position carries meaning | `statecharts`: native boxes and arrows drawn from a model's states and transitions; a keyed `view` whose parts keep their identity as a grid becomes regions; a flat and a structured drawing side by side |
| A race or ordering bug | `latest-search` | A real controlled-promise run, `Axes` and a `view` of `scene.state`; guard and completion order change the displayed result |
| A rate or a model's numbers over time | `token-bucket`, `seasons` | `token-bucket`: `Axes`, `lineGraph`, `stateView`; `seasons`: `Axes.plot`; a setting that reruns the model |
| Identity, hashing or text that changes | `exgit` | `TransformMatchingText`, `TransformMatchingShapes`, `TransformFromCopy` |
| A real tool's behaviour, checked against it | `isdigit`, `gtfs`, `traffic-policy` | A model checked against the tool's own output, with a fidelity test |
| Records, schedules or shares | `gtfs` (ER, gantt), `pg-page` (pie), `cert-renewal` (timeline) | Diagram families beyond flowcharts |
| A subject in another language | `quotient-familial` | `meta.lang: 'fr'`; descriptions in French |
| A drawing made by hand, values said on it | `pen-and-pencil` | `s.draw` with a pen and pencil, `s.focus` on the camera, `s.carry`, `s.dimension` and `s.callout` instead of cards |
| A requested face in text and diagrams | `font-metrics` | EB Garamond, real cuts and `lettering: 'natural'` diagram measurements |
| Sound compared with a visible score | `melody-rhythm` | Optional `step.audio`, two piano rolls from the played notes, tempo and unchanged-timing controls; see [score audio](../../docs/REFERENCE.md#optional-score-audio) |
| Explicit panel placement and field order | `layout-direction` | RTL `start`/`end` placement, a card's LTR override and updates that keep their columns |

A state machine, statechart or graph is usually best as a Mermaid `stateDiagram-v2` or flowchart with `s.show`: layout and connector routing come with it, and composite states, regions, marks, walks and keyed morphs work on its parts. Draw by hand when position itself carries meaning the layout cannot keep.

## Test the model

The scene asks the model; it never states an answer it did not get from one. This is the check that matters most, and the one no other tool gives you. These steps apply when you write or change a model; a change to layout, captions or publishing needs none of them.

1. Put the model in its own module, with no drawing in it. In this repository, a model of an outside tool or format gets `scenes/explainers/lib/<id>.ts`; the small models behind `ring-buffer`, `state-machine`, `token-bucket` and `seasons` share `scenes/explainers/lib/models.ts`.
2. Check the model against its source: run the real program or library, or use its published test vectors, and pin the version you ran in the `meta.sources` links (`isdigit` links CPython at tag `v3.15.1`). If you cannot run the source, pin exactly what you relied on instead (the tagged source file, the RFC section or the published test vectors) and say in your report that you read it but did not run it. Never leave a placeholder where a pin belongs.
3. At each step, record what the picture shows on `this.state` (`isdigit` sets `this.state.outcome = run.outcome` from the model's run).
4. Add a test that runs every case and asserts each step's state equals the model. In this repository, a model of an outside tool gets `test/lib/fidelity/<id>.ts`, using `assertStepState(trace, step, { … })`, called from `test/explain-fidelity.test.ts`; a model in `lib/models.ts` is tested in `test/explain-models.test.ts`, and a picture built with `view` adds `assertViewFollowsState`. Make the test fail first: break the model and watch it go red.

## Engine constraints

These are how the engine works, not advice; breaking one breaks the build or the page.

- One scene, one clock: never call `Scene.play()` concurrently. Use `{ parallel: true }` or one `play`.
- No awaited animation inside `try`/`catch` or `.catch()` in `construct()`; handle model errors in plain code first.
- Finish every change before a step's last `play()` ends: the picture must not move during the caption hold.
- Walks use real links; a missing link is a bug in the diagram or the model, never a reason to draw a shortcut.
- Morphs with `ops` must reproduce the next diagram through Agentic Mermaid's mutation replay. Without `ops`, call it a visual transition.
- A setting may change diagrams, captions, numbers and which steps exist; keep the palette fixed. A scene may have at most 64 cases.
- Default lettering is embedded Inter and JetBrains Mono. Other scripts, replacement faces, real bold and italic, and maths need a `lettering` request in `static meta` and committed snapshots; unsupported or unrequested characters fail the build. See [Lettering on request](https://github.com/adewale/rayner/blob/main/docs/LETTERING.md) and REFERENCE, Maths.
- Arabic or Hebrew text sets its own reading direction; `stage` and card `direction` choose spatial order; set a diagram's flow in its Mermaid source.

## Reporting

Report the commands you ran, the artifact paths and what the checks found. Do not claim:

- that a local build was deployed, released or tried by an outside author;
- that a model is a complete implementation, or that a caption proves a security or scientific claim;
- support for styles, scripts or SVG features the collection does not test;
- that a passing build replaces a visual review, or that readers learned anything you did not observe.

The engine is a fork of Lantern by Ivar Vong (MIT). Keep the MIT and font notices, and do not imply endorsement by Lantern or Agentic Mermaid.

The reviewed page is ready to upload with its header recipe and optional loader; another build is unnecessary. Where helper intent does not name a caption's subject, add `scene.review.json`; see [reader review](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#reader-review). For judging a finished explainer, or choosing a gallery hero, use the [rubric](../../docs/EXPLAINER-RUBRIC.md).
