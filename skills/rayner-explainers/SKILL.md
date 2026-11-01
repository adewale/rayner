---
name: rayner-explainers
description: Author, check and publish Rayner explainers as reader-paced HTML embeds. Use for step-through diagrams, code-change explanations, protocol walkthroughs and program-driven animation.
---

# Rayner explainers

An explainer is one Rayner `Scene`. The CLI builds it into a step-through HTML page. It needs no server or MCP. Start with [Your first explainer](https://github.com/adewale/rayner/blob/main/docs/TUTORIAL.md) for a worked example: LRU versus MRU cache replacement, with its model tested against published examples. Read the [reference](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md) for the helper API and the checks, and [publishing](https://github.com/adewale/rayner/blob/main/docs/PUBLISHING.md) before you host a page.

## Script first

Before planning steps or drawing anything, write the script the explainer exists to show. Pictures that grow from a model without a script tend to explain their own mechanics and never answer the reader's question.

1. **Questions.** Write the two or three questions the reader brings, in their words: "What is a statechart? How is it different from a state machine? Why would I use one?"
2. **Script.** Answer them in 150 to 250 words of plain prose, answer first. For a concept, the first sentence is a definition: what kind of thing it is and what sets it apart. Give each reason one concrete example, say early why the reader should care, and end on the limit. A few seconds of concrete hook may come before the definition; the definition is still stated outright, never left to be inferred.
3. **Sentence to remember.** One sentence the reader should still have in a month.
4. **Check questions.** Two or three questions a reader should be able to answer afterwards. They become prediction prompts: a step's line or caption asks, and the next step answers. Ask what only this explainer teaches, such as its own example's outcome or a transfer to a new case, not a definition a reader who knows the topic recites anyway: a model reader answered all three statecharts questions from prior knowledge alone. On a topic that well known, a model reader cannot tell you whether the explainer teaches; ask people who are new to it.
5. **Test the script alone.** A newcomer who reads only the script can answer the check questions. If not, rewrite the script; do not start drawing.
6. **Storyboard from the script.** Each step shows one or two of its sentences, and its caption is essentially those sentences, adapted to the picture. Cut anything on screen that serves no sentence. The model and its tests ground what the script claims; they do not choose what the explainer says.

Keep the script beside the scene as `script.md` (`rayner init` starts one), so reviewers can check the explainer against it. Put two parts of it in the scene's `static meta`: `answer`, the script's one-sentence answer, which `rayner check` requires step 1 or 2 to state; and `checks`, the questions with their answers, which the player asks after the last step. Gallery explainers that explain an observed result (a bug, a measurement, a surprising output) need the same script: its questions are the reader's questions about that result.

## Editorial gate

With the script written, state **who** needs to explain **what** to **whom**, the reader's specific question, the answer the model can support, and the conditions under which it holds. Ask whether a still or short code diff already explains it: do not add cases or motion just to demonstrate Rayner. A source link is not a licence to claim more than the scene tests. For example, a ruler across “Ink on paper” measures that phrase's advance; without a trailing space, it does not locate the next word.

Sketch the question, the answer and a case that could challenge it before drawing. Keep the object or value recognisable when its representation changes. State the assumptions that bound the result. A separate planning table or audit report is optional.

- Open with a concrete puzzle or observable result, then name the code, standard or tool that resolves it. Put the consequence before an extended taxonomy; do not impose a fixed step or seconds-to-payoff limit. If the tool itself is the subject, show an actual output and what produced it before listing its parts. A box named “trace” or “verified” is not a trace or test result.
- For each step, write what changes, which prior question it answers, and why the next step follows. Leave its evidence visible while the reader reads. A caption should connect a pictured mark or number to an inference, not narrate controls or repeat the heading.
- Use an alternate case when it changes the conclusion or exposes a boundary; write conditional captions for its actual outcome. End at the specific result and its limit, not at a claim that the subject is important.

Read the first step, a countercase and the ending as a newcomer would. Can the reader reconstruct the cause without watching the animation? Does every claimed value, path or comparison appear in the resting picture or an identified source? Would any sentence become false when a setting changes? For a consequential claim, test its pictured result against an independent source; a played-versus-seeked match checks reproducibility, not domain truth. `check` and `review` catch missing or unreadable ink; they cannot answer these questions. Use [anti-slop-writing](https://github.com/adewale/anti-slop-writing) to replace generic importance, decorative contrast and repeated headings with a mechanism or a cut. Keep earned detail, including a caveat when it bounds a claim. For comparative assessment, use the [explainer editorial rubric](../../docs/EXPLAINER-RUBRIC.md); its scores do not replace source review.

## Loop

Commands are `rayner <command>`, or `npm run rayner -- <command>` in a checkout; `rayner --help` prints the install lines for capture and PNG output.

1. `rayner init <directory>` writes the tutorial's LRU/MRU explainer: its `script.md`, `scene.ts`, its model `model.ts` and the model's test `model.test.ts`. Rewrite the script for your topic first. Keep one default-exported `Scene` subclass with static `meta` (id, title, sources, `answer`, `checks`, and `lang` if not English) and, if a second case teaches something, static `settings`.
2. Derive every value on screen from a small model of the system, kept apart from the drawing code, and test it; the checks cannot tell whether a caption is true. See [Test the model](#test-the-model).
3. Give each idea a step with a stable name, a title the picture can prove, a short `line` telling the reader what to notice (not repeating the title), and a caption connecting the visible evidence to its consequence. The page shows all three; the line is drawn on the picture under the title.
4. Before you hand-roll motion, read the [engine map](https://github.com/adewale/rayner/blob/main/docs/ENGINE.md): it already has a camera that zooms without moving a point, code that morphs along its own diff (`TransformDiff`), morphs matched by text or shape, emphasis that stays, charts of the model's numbers (`Axes`), pictures rebuilt from `scene.state` (`view`), addressable code spans, and `Restore`, `TransformFromCopy` and `Succession`. [The reference](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#engine-features) names an explainer that uses each.
5. Call `stage(this, { style })` once. Put diagrams (`s.show`), cards (`s.card`) and code (`s.code`) in named regions (`main`, `side`, `top`, `bottom`) so nothing overlaps. For explicit spatial direction, set `direction: 'rtl'` on the stage and use logical `start`/`end` regions; cards inherit RTL columns unless they override `direction`. Physical regions keep their coordinates, and Mermaid flow still follows its source. Native Rayner objects mix freely; bring several in together with `s.enter(...)`, and pass `{ describe: '…' }` to `s.enter` or `s.keep` so readers who cannot see the drawing get it in words.
6. Design each step's resting picture, what the step leaves on screen, because the reader looks at it while reading the caption. Leave the idea there with `walk(..., { trail: true })`, `mark`, `dim`, `note`, `card.set`, `card.mark` and `code.focus`; give marks an `as` word ("rejected") when they mean something. A token that walks and vanishes leaves nothing. Say a value where it is, with `s.dimension`, `s.pin` or `s.callout`, rather than in a card beside it; keep cards for a few values that belong together (`check` reports `cardsAtRest`).
7. Make the drawing do explanatory work, not just move. `s.draw(m, { tool: 'pen' })` draws a mobject stroke by stroke with the tool on its tip; `s.focus(target)` moves the camera close while the heading stays put; `s.carry(m, region)` preserves a subject the next step builds on, instead of clearing and redrawing it. If the end picture already tells the whole truth, show it immediately; motion earns its place by revealing order, identity or cause.
8. Iterate with `rayner preview scene.ts --watch`; use `shots`, `see` or `describe` when you need a picture or state diagnostic. Check the opening, a countercase and the ending against the model and sources. A passing build cannot establish that a caption is true.
9. Test whether it teaches: `rayner quiz scene.ts` writes `packet.md` (the explainer as text, with `meta.checks` and no answers), `control.md` (the questions alone) and `key.json`. Give the packet to one fresh reader and the control to another (new agent sessions that have not seen the scene, or people). Grade both against the key. A question counts only when the packet's reader is right and the control's reader is not; when both are right, replace the question; when the packet's reader is wrong, fix the step that should have taught it.
10. When the scene settles, run `rayner review scene.ts --out public/<id>.html`. It runs the checks and served-reader review, then retains that exact page. Inspect the generated screenshots. Fix failures at their cause; do not lower the label-size floor or hide labels to pass it. A checker defect needs both a valid example it wrongly rejects and an invalid example it must still reject. The reports under `out/review/<id>/` and `out/checks/` supply the record; no separate audit document is required.

## Make the reader act

Readers learn from what they do, not from what they watch. In a blind comparison of three Rayner explainers with pages the same models wrote without Rayner, from one script, the reviewer preferred the plain page in all three pairs, mainly because those asked the reader to commit to predictions and drive the machine ([the benchmark](../../bench/explainers/README.md)). The player now does part of this for you; the rest is the scene's.

- **Ask, then answer.** A step's line or caption asks a check question ("Predict: how many POWER_OFF arrows?") and the next step answers it. Keep the answer out of the asking step's words and picture. The rail does not show a step's title until the reader reaches it, so a title such as "Answer: one arrow on the box" is safe on the answering step.
- **Let a case change the outcome.** A setting is the reader's own lever: give them one whose other option changes the conclusion, and say in the caption what to compare.
- **End on the check questions.** `meta.checks` puts them after the last step, each answer behind a disclosure. Two or three that only this explainer answers beat a summary.
- **Lead each caption with its point.** At 1280 × 800 the reader sees the picture, the step heading and the caption's first two lines without scrolling. Put the inference there; detail can follow.

## Lessons from the player

The player was redesigned in two passes in October 2026: a [step bar](../../specs/player-redesign.md), then [one tile](../../specs/player-tile.md), and then taught to [guide the reader](../../specs/player-guidance.md). Four lessons from that work apply to every scene.

- **Each resting picture passes the crop test.** Opened from a direct link with the caption hidden, the picture still says which step it is, what it is about and which values matter. The tile passes the same test as a whole, and the catalog tests enforce it there.
- **Keep the three roles apart, and a case's steps even.** The title is what the picture proves. The line is a short "notice this", shorter than the caption and never a second one. The caption connects the evidence to its consequence. The player gives every step the room its case's longest title, line and caption need, so one long caption leaves every other step with empty space under its words. `check` reports this as `words` in `report.json`: `caption.outliers` names the steps that set the room, and `caption.slackLines` is the empty lines they leave a median step. Shorten an outlier, or split it into two steps.
- **Name what a reader should track with `meta.watch`, and keep it to a few keys.** Map each `this.state` key a caption talks about to the label the caption uses (`watch: { tokens: 'Tokens left' }`); each step then says what it changed of them under its caption, in the transcript and in `describe`. Leave walk records, hashes and counters out: raw state is developer data. Prefer numbers, short strings and short lists, which read briefly; `check` reports a watched key it cannot format as `watch[].unformatted`.
- **Lay out the picture by contrast, repetition, alignment and proximity.** Make the one thing a step changed the strongest mark on screen. Give a mark the same meaning in every step. Align regions and panels to shared edges. Put each label next to what it names. The tile's own chrome was tidied by these rules; the before and after table is in [the evidence](https://github.com/adewale/rayner/blob/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence/player-tile/README.md).

## Start from an example

Each explainer in [`scenes/explainers/`](https://github.com/adewale/rayner/blob/main/scenes/explainers) shows a technique. Copy the nearest one rather than starting blank:

| You are explaining | Start from | It shows |
| --- | --- | --- |
| Two algorithms or policies on the same input | `scenes/tutorial/lru-mru` (what `rayner init` writes) | One card with a column per policy, read from the model's trace; one case that favours each policy; captions tested against the model |
| A code change and what it does to a system | `mr-cache` | `TransformDiff` on the code, the same edit replayed on the diagram with `ops`, a setting for hit or miss |
| Authoring feature reference | `feature-tour` | Choose a feature case: the recipe step shows the author-written API, the result step runs it. See [scope and specialized APIs](../../docs/FEATURE-TOUR.md) |
| A protocol or request flow | `oauth-pkce` | A sequence diagram revealed message by message (`build: 'frame'`, `reveal`); a setting that adds the attacker's step |
| A data structure changing step by step | `ring-buffer` | No diagram: native shapes, `Succession`, a `view` of `scene.state` |
| A state machine | `state-machine` | A state diagram driven by the real reducer, code spans, `Restore` |
| Nested or parallel states | `statecharts` | Native boxes and arrows drawn from a model's states and transitions; a keyed `view` whose parts keep their identity as a grid becomes regions; a flat and a structured drawing side by side |
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

## Test the model

The scene asks the model; it never states an answer it did not get from one. These steps apply when you write or change an explainer's model; a change to layout, captions or publishing needs none of them.

1. Put the model in its own module, with no drawing in it. In this repository, a model of an outside tool or format gets `scenes/explainers/lib/<id>.ts`; the small models behind `ring-buffer`, `state-machine`, `token-bucket` and `seasons` share `scenes/explainers/lib/models.ts`.
2. Check the model against its source: run the real program or library, or use its published test vectors, and pin the version you ran in the `meta.sources` links (`isdigit` links CPython at tag `v3.15.1`). If you cannot run the source, pin exactly what you relied on instead (the tagged source file, the RFC section or the published test vectors) and say in your report that you read it but did not run it. Never leave a placeholder where a pin belongs.
3. At each step, record what the picture shows on `this.state` (`isdigit` sets `this.state.outcome = run.outcome` from the model's run).
4. Add a test that runs every case and asserts each step's state equals the model. In this repository, a model of an outside tool gets `test/lib/fidelity/<id>.ts`, using `assertStepState(trace, step, { … })`, called from `test/explain-fidelity.test.ts`; a model in `lib/models.ts` is tested in `test/explain-models.test.ts`, and a picture built with `view` adds `assertViewFollowsState`. Make the test fail first: break the model and watch it go red.

## Rules

- Walks use real links; a missing link is a bug in the diagram or the model, never a reason to draw a shortcut.
- Morphs with `ops` must reproduce the next diagram through Agentic Mermaid's mutation replay. Without `ops`, call it a visual transition.
- One scene, one clock: never call `Scene.play()` concurrently. Use `{ parallel: true }` or one `play`.
- No awaited animation inside `try`/`catch` or `.catch()` in `construct()`; handle model errors in plain code first.
- Finish every change before a step's last `play()` ends: the picture must not move during the caption hold.
- A setting may change diagrams, captions, numbers and which steps exist; keep the palette fixed. Keep cases few; the limit is 64.
- Do not weaken a check, bless a corrupt snapshot or skip a case to get a pass. Add a regression test that fails before the fix.
- Default lettering uses embedded Inter and JetBrains Mono, plus Arabic-Indic, Devanagari and Chinese numerals, with faux bold and no italic. Request additional scripts with `lettering: { scripts: ['Grek'] }` in `static meta`. Plain `Latn`, `Grek` and `Cyrl` requests use font subsets; requests for `Arab`, `Deva`, `Hebr`, `Hani`, replacement `faces` (such as `eb-garamond` for pen-and-ink), `styles: ['bold', 'italic']` (real cuts; `ItalicText` needs `'italic'`) or `math: true` use outline snapshots. Follow [Lettering on request](https://github.com/adewale/rayner/blob/main/docs/LETTERING.md) for supported faces and capture dependencies. Commit `scene.lettering.json`; refresh outline snapshots with `rayner snapshots scene.ts` after changing source or captions. Unsupported or unrequested characters fail the build. Picture descriptions are generated in English or French.
- For a diagram that should use the requested face's natural proportions, pass `lettering: 'natural'` in its `s.show` spec. Capture measures the active sans/mono faces and requested cuts before layout; a style alone does not request a face. Refresh and commit the diagram and lettering snapshots together after changing fonts or measurements. Existing specs keep fitting labels to captured widths.
- Keep paragraph shaping separate from panel placement. Arabic or Hebrew text determines its own reading direction; `stage` and card `direction` choose spatial order. Values and code retain their source order. Set a diagram's flow explicitly in Mermaid, such as `graph RL`.
- For formulas, set `lettering: { math: true }` and draw `new MathTex('\\frac{a}{b}', { display: true })`. `snapshots` typesets each one once (it needs `RAYNER_MATH_FONT`); commit `scene.lettering.json`. TeX outside `glyph`'s subset (`\color`, `align`, `\substack` …) fails capture. Give each kept formula a `describe` in words, and morph a formula that gains or loses terms with `TransformMatchingText`. See REFERENCE, Maths.
- Leave out panel titles and asides that repeat the heading, caption or values. Apply [anti-slop-writing](https://github.com/adewale/anti-slop-writing) to every title, line and caption: name the pictured mechanism and its consequence, connect contrasts with their cause, and cut significance claims the evidence does not earn.

## Reporting

Report the commands you ran, the artifact paths and what the checks found. Do not claim:

- that a local build was deployed, released or tried by an outside author;
- that a model is a complete implementation, or that a caption proves a security or scientific claim;
- support for styles, scripts or SVG features the collection does not test;
- that a passing build replaces a visual review.

The engine is a fork of Lantern by Ivar Vong (MIT). Keep the MIT and font notices, and do not imply endorsement by Lantern or Agentic Mermaid.

The reviewed page is ready to upload with its header recipe and optional loader; another build is unnecessary. Add `scene.review.json` with independent caption subjects where helper intent does not name the story; see [reader review](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#reader-review). Open a pivotal step link fresh, refresh it, switch the case and return. Check that caption, values and paths agree with forward navigation, and that the phone tour and text alternative explain the inference. Use the generated receipt for case, step and viewport details. If a newcomer tries a countercase prediction, record their actual answer instead of claiming measured comprehension.

For an explainer proposed as a **hero**, use the rubric's separate [J/R/C brief](../../docs/EXPLAINER-RUBRIC.md#choose-a-hero-separately). Show the author job, an actual model input/output, the consequential other case, and a short path from source and test to the reviewed reader. Put engine inventories in supporting documentation, not in the lesson's payoff. A high /24 lesson score alone is not a hero recommendation; neither the rubric nor a passing build establishes reader demand.
