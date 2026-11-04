---
name: rayner-explainers
description: Author, check and publish Rayner explainers as reader-paced HTML embeds. Use for step-through diagrams, code-change explanations, protocol walkthroughs and program-driven animation.
---

# Rayner explainers

An explainer is one Rayner `Scene`. The CLI builds it into a step-through HTML page. It needs no server or MCP. Start with [Your first explainer](https://github.com/adewale/rayner/blob/main/docs/TUTORIAL.md) for a worked example: LRU versus MRU cache replacement, with its model tested against published examples. Read the [reference](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md) for the helper API and the checks, and [publishing](https://github.com/adewale/rayner/blob/main/docs/PUBLISHING.md) before you host a page.

## How to use this skill

This skill says what a finished explainer must achieve and how each part is checked. It does not tell you how to draw, lay out or word a step: use your own judgement, and copy techniques from [the examples](#start-from-an-example) when they help. Rayner's value is that it checks the result: values come from a model tested against its source, pictures are measured as painted, and the page is reviewed as served. When an instruction and a check disagree, the check wins; when you find yourself following a rule that no check or reader would miss, drop it.

## Script first

Write the script the explainer exists to show before you draw anything: the story a reader follows, in plain prose. Explainers grown from a model without one explain their own mechanics and never answer the reader's question. Explainers that open on a definition answer it in a way the reader cannot yet use.

The communities that make the best explainers have converged on what makes one work. 3Blue1Brown's Summer of Math Exposition judged thousands of entries on four criteria ([rules](https://some.3b1b.co/rules)), and Grant Sanderson's advice to entrants adds the craft behind them ([announcement](https://rosetta.to/u/3blue1brown/make-math-videos-summer-of-math-exposition-announcement), [SoME4 prizes](https://3blue1brown.substack.com/p/some4-prizes)). Write the script against them:

- **Motivation.** Early on, the reader should see why the topic matters and want to know the answer: a problem they feel, a result that surprises them, a cost they would pay without it.
- **Concrete before abstract.** Start from a specific case and let the general idea emerge from it. Do not open on the definition and then fill it in with examples; that builds "from the top floor down".
- **Names are earned.** Give a thing its name once the reader has seen why it is needed, and show why it is defined the way it is.
- **The reader discovers it.** Set up each step so the reader can nearly see the next idea before it is shown: pose the problem, let its pain show, then reveal the move that removes it. "It's easiest to remember a piece of math if you feel like you invented it yourself."
- **A story, not a list.** The steps are a problem being solved, each one following from the last, not facts in a sensible order.
- **One deliberate aha.** Decide which moment should stick months later, usually a shift in perspective, and build up to it. Motion earns its place there, by showing that two pictures are the same thing.
- **Clarity.** Explain every term when it arrives, keep the goal visible, and care for someone new to the topic.
- **Novelty.** The idea need not be new, but the presentation should feel fresh: a better example, an angle the usual explanations miss.
- **One genre.** Decide whether you are an expert showing the way, a fellow learner discovering it, or a worked example, and keep to it.

The answer still comes early, as the payoff of the first concrete problem, within the first few steps: the reader should know what the explainer is about before the details, and recognise the definition when it arrives rather than be handed it cold.

- **Check questions.** Ask the reader to explain the mechanism or transfer it to an unseen condition. Avoid definitions alone and recall of seeded dates or labels. An expert may answer without the lesson; that does not invalidate the exercise. Evidence of learning needs newcomers, their prior knowledge, and their reasoning before and after reading.
- **Test it alone.** Read the script back as a newcomer would: does each step make the next one feel inevitable, and could they answer the check questions?

Keep the script beside the scene as `script.md` (`rayner init` starts one). It is the explanation addressed to the reader: read its paragraphs consecutively, without implementation notes, to judge whether the reasoning holds. Questions to the reader belong in that prose; directions such as "ask the reader" and "draw a chart" do not. There is no word quota or required outline.

Put the one-sentence answer in `meta.answer`, which `rayner check` requires some step to state, and the ending questions and their disclosed answers in `meta.checks`. Keep that question set in the scene rather than copying it into the script. An optional `notes.md` holds non-obvious construction decisions, source interpretation and model limits a future author needs. Do not create empty notes or copy test assertions, a step inventory or revision history into them. The scene supplies the steps, tests supply verification and Git supplies history. Keep any limitation necessary to interpret the conclusion in the reader-facing prose too. See the rubric's [working documents](../../docs/EXPLAINER-RUBRIC.md#working-documents).

Before drawing, check the causal links: what observation needs explaining, what rule makes the result follow, and what changed condition would alter it? Explain a prerequisite or name it as an input. A chart built from a rule does not derive that rule; a trusted calculation does not explain its mechanism. Use a second viewpoint when the current one cannot show the relationship the prose asks the reader to infer. The script decides what the explainer says; the model and its tests decide whether it is true.

## What must be true

Each of these is a result, with the way it is checked. Use any technique that gets there.

| The explainer… | Checked by |
| --- | --- |
| Draws every value from a model, tested against the real source | A fidelity test per scenario and step ([Test the model](#test-the-model)) |
| Motivates the question early, starts from a concrete case, earns each name and builds to one aha | Reading it against [Script first](#script-first) and the [rubric](../../docs/EXPLAINER-RUBRIC.md) |
| Names its answer within the first few steps, as the payoff of a concrete problem | `rayner check` fails if no step states `meta.answer` and reports where it first appears; reading it decides whether it is early and earned |
| Gives the reader something to do that the explanation then answers | Reading it as a reader; [Make the reader act](#make-the-reader-act) |
| Has pictures readable at 1280 px and on a phone, with nothing colliding, and a description in words for each | `rayner check` for desktop and conservative phone estimates; `rayner review` for actual served geometry |
| Works as served: every step from a fresh link, every scenario, phone and desktop | `rayner review` |
| Says nothing a setting would make false, and claims no more than it tests | Reading every scenario against the model and its sources; `rayner check` lists each sentence with "every", "never" or "only" that no declared claim backs ([Claims, words and limits](#claims-words-and-limits)) |
| Uses the reader's words, introducing any code name where it first appears | `rayner check` lists each code name in the steps' words with the step that first uses it |
| Teaches better than the alternative: a still, a code diff, or a page written without Rayner | Asking honestly; [the benchmark](../../bench/explainers/README.md) for changes to Rayner itself |

Checks establish deterministic, readable pictures; they cannot establish that a caption is true or that a reader learns. Do not weaken a check, bless a corrupt snapshot or skip a case to get a pass; a checker defect needs a valid example it wrongly rejects and an invalid one it must still reject.

## Make the reader act

Readers learn from what they do, not from what they watch. In a blind comparison of three Rayner explainers with pages the same models wrote without Rayner, from one script, the reviewer preferred the plain page in all three pairs, twice over, mainly because those let the reader commit to predictions and drive a live machine ([the benchmark](../../bench/explainers/README.md)). Rayner cannot yet take the reader's input inside a step ([the live machine](https://github.com/adewale/rayner/issues/88) is proposed). Until it can, use what exists:

- **Ask, then answer.** A step asks a check question and the next step answers it. The rail hides a step's title until the reader reaches it, so "Answer: …" is safe on the answering step; keep the answer out of the asking step itself.
- **A scenario that changes the outcome.** A setting is the reader's own lever; give them one whose other option changes the conclusion.
- **The check questions at the end**, from `meta.checks`.

## Loop

Commands are `rayner <command>`, or `npm run rayner -- <command>` in a checkout; `rayner --help` prints the install lines for capture and PNG output.

1. `rayner init <directory>` writes the tutorial's explainer: `script.md`, `scene.ts`, the model `model.ts` and its test `model.test.ts`. Rewrite the script first. Keep one default-exported `Scene` subclass with static `meta` (id, title, sources, answer, checks, and `lang` if not English) and, if a second scenario teaches something, static `settings`.
2. `rayner preview scene.ts --watch` while you work; `see` and `describe` give any step as text and JSON when you need to read it without a browser.
3. `rayner check scene.ts` until it passes.
4. `rayner review scene.ts --out public/<id>.html` when the scene settles. It checks every scenario, reviews the served page at phone and desktop widths, and keeps that exact page with its receipt. Look at its screenshots.

The [engine map](https://github.com/adewale/rayner/blob/main/docs/ENGINE.md) lists what already exists (a camera that zooms without moving anything, code that morphs along its diff, morphs matched by text or shape, charts of the model's numbers, pictures rebuilt from `scene.state`), and [the reference](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#engine-features) names an explainer that uses each. Read it before building something by hand.

## Start from an example

Each explainer in [`scenes/explainers/`](https://github.com/adewale/rayner/blob/main/scenes/explainers) shows a technique. Copy the nearest one rather than starting blank; these are ways that worked, not rules:

| You are explaining | Start from | It shows |
| --- | --- | --- |
| Two algorithms or policies on the same input | `scenes/tutorial/lru-mru` (what `rayner init` writes) | One card with a column per policy, read from the model's trace; one scenario that favours each policy; captions tested against the model |
| A code change and what it does to a system | `mr-cache` | `TransformDiff` on the code, the same edit replayed on the diagram with `ops`, a setting for hit or miss |
| Authoring feature reference | `feature-tour` | Choose a feature scenario: the recipe step shows the author-written API, the result step runs it. See [scope and specialized APIs](../../docs/FEATURE-TOUR.md) |
| A protocol or request flow | `oauth-pkce` | A sequence diagram revealed message by message (`build: 'frame'`, `reveal`); a setting that adds the attacker's step |
| A data structure changing step by step | `ring-buffer` | No diagram: native shapes, `Succession`, a `view` of `scene.state` |
| A state machine | `state-machine` | A state diagram driven by the real reducer, code spans, `Restore` |
| A model the reader could drive with events | `statecharts` (the frother) | A `Machine` over the model's step; `rayner check` draws every reachable state |
| Nested or parallel states | A Mermaid `stateDiagram-v2` with composites and regions ([recipe](../../docs/REFERENCE.md#state-machines-and-graphs)); `statecharts` when position carries meaning | `statecharts`: native boxes and arrows drawn from a model's states and transitions; a keyed `view` whose parts keep their identity as a grid becomes regions; a flat and a structured drawing side by side |
| A race or ordering bug | `latest-search` | A real controlled-promise run that opens on the unguarded race (the page ends on the older query) before naming the ticket that fixes it; guard and completion order change the displayed result |
| A rate or a model's numbers over time | `token-bucket`, `seasons` | `token-bucket`: `Axes`, `lineGraph`, `Follow` for the gauge and the line from one elapsed time; `seasons`: `Axes.plot`; a setting that reruns the model |
| Identity, hashing or text that changes | `exgit` | `TransformMatchingText`, `TransformMatchingShapes`, `TransformFromCopy` |
| Keyed cells or nodes rearranged between pictures of the same state | `periodic-groups` | `view(...).sync({ match: 'key' })`; `matchByKey({ fallback })` for unkeyed parts that should stay put, `{ text: 'whole' }` when a relabelled part is a new thing (`statecharts`); `find(key)` to address a part |
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
4. Add a test that runs every scenario and asserts each step's state equals the model. In this repository, a model of an outside tool gets `test/lib/fidelity/<id>.ts`, using `assertStepState(trace, step, { … })`, called from `test/explain-fidelity.test.ts`; a model in `lib/models.ts` is tested in `test/explain-models.test.ts`, and a picture built with `view` adds `assertViewFollowsState`. Make the test fail first: break the model and watch it go red.

## Claims, words and limits

These follow the statechart skill that checks a TLA+ model and draws it for the person deciding whether its behaviour is right: every rule the reader accepts is checked, the chart speaks the reader's words, simplifying never hides an outcome, and the hand-off says what the model leaves out.

- **A sweeping sentence is a rule; check it or narrow it.** A sentence with "every", "never", "only", "always" or "whenever" claims more than the scenarios on screen. Back it with `meta.claims: [{ says, test }]`: `says` is a phrase of the sentence and `test` names the test that holds it, as `"test/<file>.test.ts: <part of its name>"`. Write the test if there is none, and make it fail first. When the sentence speaks only of what its own step draws ("every round in the strip"), mark it `{ says, shown: true }` instead. Otherwise narrow the sentence until it says only what the explainer shows. Never weaken a test to make a claim hold. `rayner check` lints declared phrases and evidence references, and lists unlinked scope sentences. Test paths are relative to the directory where you invoke the command; static `node:test` names are checked, but tests are not run and their assertions are not verified. Read the referenced test and run it yourself. The scan covers step prose, not stage labels or check answers.
- **Speak the reader's words.** A title, line or caption names what the reader sees, not the code behind it. A code name (`int()`, `skipUntil`, `A->C#0`) belongs only where the reader needs it, introduced where it first appears. `rayner check` lists each one with the step that first uses it.
- **Simplify without hiding an outcome.** When a picture or a story is too busy, coarsen labels first, then leave out steps, but keep every scenario a setting offers reachable, never merge two scenarios that end differently, and never show part of a comparison. Record a consequential omission in `notes.md`; state it in the script too when the reader needs it to interpret the result.
- **Say what the model leaves out.** Keep material model assumptions and unshown scenarios in `notes.md`, and keep every caption inside those limits. End the reader's explanation with its practical boundary, rather than an inventory of implementation omissions: the token-bucket page's "accepted at every rate" held at the three rates it offered and failed at one it never built (`fork`).
- **Doubt the model before the source.** Replay a claim against the real thing where you can, one step at a time. When they disagree, the model is wrong until shown otherwise. A claim that rests on the explainer's own model and nothing outside it (a hand model, a perception claim) says so in its sentence.

## Engine constraints

These are how the engine works, not advice; breaking one breaks the build or the page.

- One scene, one clock: never call `Scene.play()` concurrently. Use `{ parallel: true }` or one `play`.
- No awaited animation inside `try`/`catch` or `.catch()` in `construct()`; handle model errors in plain code first.
- Finish every change before a step's last `play()` ends: the picture must not move during the caption hold.
- Walks use real links; a missing link is a bug in the diagram or the model, never a reason to draw a shortcut.
- Morphs with `ops` must reproduce the next diagram through Agentic Mermaid's mutation replay. Without `ops`, call it a visual transition.
- A setting may change diagrams, captions, numbers and which steps exist; keep the palette fixed. A scene may have at most 64 scenarios.
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
