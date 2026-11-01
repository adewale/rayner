---
name: rayner-explainers
description: Author, check and publish Rayner explainers as reader-paced HTML embeds. Use for step-through diagrams, code-change explanations, protocol walkthroughs and program-driven animation.
---

# Rayner explainers

An explainer is one Rayner `Scene`. The CLI builds it into a step-through HTML page. It needs no server or MCP. Start with [Your first explainer](https://github.com/adewale/rayner/blob/main/docs/TUTORIAL.md) for a worked example: LRU versus MRU cache replacement, with its model tested against published examples. Read the [reference](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md) for the helper API and the checks, and [publishing](https://github.com/adewale/rayner/blob/main/docs/PUBLISHING.md) before you host a page.

## Editorial gate

Before writing the scene, state **who** needs to explain **which observed result** to **whom**, the reader's specific question, the answer the model can support, and the conditions under which it holds. Ask whether a still or short code diff already explains it: do not add cases or motion just to demonstrate Rayner. A source link is not a licence to claim more than the scene tests. For example, a ruler across “Ink on paper” measures that phrase's advance; without a trailing space, it does not locate the next word.

Plan the steps in words before drawing them. For the pivotal inference, write one compact row: `question | before | model operation | after | same entity or invariant | resting witness | source/assumption`. Keep the object, route, value or reference state recognisable when the representation changes; a morph is not proof of identity.

For a countercase, record `baseline input | changed input | fixed assumptions | predicted outcome | pictured comparison | conditional caption` *before* drawing. Choose a case that could refute the tempting shortcut, not one that only changes colour or decoration. One-case scenes can instead use an internal comparison. Then:

- Open with a concrete puzzle or observable result, then name the code, standard or tool that resolves it. Put the consequence before an extended taxonomy; do not impose a fixed step or seconds-to-payoff limit. If the tool itself is the subject, show an actual output and what produced it before listing its parts. A box named “trace” or “verified” is not a trace or test result.
- For each step, write what changes, which prior question it answers, and why the next step follows. Leave its evidence visible while the reader reads. A caption should connect a pictured mark or number to an inference, not narrate controls or repeat the heading.
- Use an alternate case when it changes the conclusion or exposes a boundary; write conditional captions for its actual outcome. End at the specific result and its limit, not at a claim that the subject is important.

Read the first step, a countercase and the ending as a newcomer would. Can the reader reconstruct the cause without watching the animation? Does every claimed value, path or comparison appear in the resting picture or an identified source? Would any sentence become false when a setting changes? For a consequential claim, record its case, step, pictured mark, source and independent expected result; a played-versus-seeked match checks reproducibility, not domain truth. `check` and `review` catch missing or unreadable ink; they cannot answer these questions. Use [anti-slop-writing](https://github.com/adewale/anti-slop-writing) to replace generic importance, decorative contrast and repeated headings with a mechanism or a cut. Keep earned detail, including a caveat when it bounds a claim. For comparative assessment, use the [explainer editorial rubric](../../docs/EXPLAINER-RUBRIC.md); its scores do not replace source review.

## Loop

Commands are `rayner <command>`, or `npm run rayner -- <command>` in a checkout; `rayner --help` prints the install lines for capture and PNG output.

1. `rayner init <directory>` writes the tutorial's LRU/MRU explainer: `scene.ts`, its model `model.ts` and the model's test `model.test.ts`. Keep one default-exported `Scene` subclass with static `meta` (id, title, sources, and `lang` if not English) and, if a second case teaches something, static `settings`.
2. Derive every value on screen from a small model of the system, kept apart from the drawing code, and test it; the checks cannot tell whether a caption is true. See [Test the model](#test-the-model).
3. Give each idea a step with a stable name, a title the picture can prove, a short `line` telling the reader what to notice (not repeating the title), and a caption connecting the visible evidence to its consequence. The page shows all three; the line is drawn on the picture under the title.
4. Before you hand-roll motion, read the [engine map](https://github.com/adewale/rayner/blob/main/docs/ENGINE.md): it already has a camera that zooms without moving a point, code that morphs along its own diff (`TransformDiff`), morphs matched by text or shape, emphasis that stays, charts of the model's numbers (`Axes`), pictures rebuilt from `scene.state` (`view`), addressable code spans, and `Restore`, `TransformFromCopy` and `Succession`. [The reference](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#engine-features) names an explainer that uses each.
5. Call `stage(this, { style })` once. Put diagrams (`s.show`), cards (`s.card`) and code (`s.code`) in named regions (`main`, `side`, `top`, `bottom`) so nothing overlaps. For explicit spatial direction, set `direction: 'rtl'` on the stage and use logical `start`/`end` regions; cards inherit RTL columns unless they override `direction`. Physical regions keep their coordinates, and Mermaid flow still follows its source. Native Rayner objects mix freely; bring several in together with `s.enter(...)`, and pass `{ describe: '…' }` to `s.enter` or `s.keep` so readers who cannot see the drawing get it in words.
6. Design each step's resting picture, what the step leaves on screen, because the reader looks at it while reading the caption. Leave the idea there with `walk(..., { trail: true })`, `mark`, `dim`, `note`, `card.set`, `card.mark` and `code.focus`; give marks an `as` word ("rejected") when they mean something. A token that walks and vanishes leaves nothing. Say a value where it is, with `s.dimension`, `s.pin` or `s.callout`, rather than in a card beside it; keep cards for a few values that belong together (`check` reports `cardsAtRest`).
7. Make the drawing do explanatory work, not just move. `s.draw(m, { tool: 'pen' })` draws a mobject stroke by stroke with the tool on its tip; `s.focus(target)` moves the camera close while the heading stays put; `s.carry(m, region)` preserves a subject the next step builds on, instead of clearing and redrawing it. If the end picture already tells the whole truth, show it immediately; motion earns its place by revealing order, identity or cause.
8. `rayner preview scene.ts --watch` and `rayner shots scene.ts --case id=value`: look at every step of every case. A passing build is not a visual review.
9. `rayner check scene.ts`. Fix failures at their cause; `out/checks/<id>/report.json` draws each resting picture roughly in text. Its `legibility.labelsUnder12PxAt390` counts labels a phone reader sees under 12 px in the step's close-up; get it to 0 in every case (a heading at `stage(this, { headingSize: 0.54 })` reads at 12 px). Making text larger so it reads at 12 px fixes the problem; changing the check, its threshold, or hiding labels so they are not counted is weakening it. Its `words.caption.outliers` names captions much longer than the case's others (see [Lessons from the player](#lessons-from-the-player)).
10. `rayner describe scene.ts --out out/<id>.json` and read each step of each case: does the caption claim only what that step's `changed` and `picture` show? Does the first step deliver on the gallery title, and does the last earn its conclusion in alternate cases? Rewrite a caption that names a value, mark or path the step does not show, or change the step so it shows it. `rayner see scene.ts <step> --case id=value` prints one step.
11. `rayner build scene.ts --out public/<id>.html`.

## Lessons from the player

The player was redesigned in two passes in October 2026: a [step bar](../../specs/player-redesign.md), then [one tile](../../specs/player-tile.md), and then taught to [guide the reader](../../specs/player-guidance.md). Four lessons from that work apply to every scene.

- **Each resting picture passes the crop test.** Opened from a direct link with the caption hidden, the picture still says which step it is, what it is about and which values matter. The tile passes the same test as a whole, and the catalog tests enforce it there.
- **Keep the three roles apart, and a case's steps even.** The title is what the picture proves. The line is a short "notice this", shorter than the caption and never a second one. The caption connects the evidence to its consequence. The player gives every step the room its case's longest title, line and caption need, so one long caption leaves every other step with empty space under its words. `check` reports this as `words` in `report.json`: `caption.outliers` names the steps that set the room, and `caption.slackLines` is the empty lines they leave a median step. Shorten an outlier, or split it into two steps.
- **Name what a reader should track with `meta.watch`, and keep it to a few keys.** Map each `this.state` key a caption talks about to the label the caption uses (`watch: { tokens: 'Tokens left' }`); each step then says what it changed of them under its caption, in the transcript and in `describe`. Leave walk records, hashes and counters out: raw state is developer data. Prefer numbers, short strings and short lists, which read briefly; `check` reports a watched key it cannot format as `watch[].unformatted`.
- **Lay out the picture by contrast, repetition, alignment and proximity.** Make the one thing a step changed the strongest mark on screen. Give a mark the same meaning in every step. Align regions and panels to shared edges. Put each label next to what it names. The tile's own chrome was tidied by these rules; the before and after table is in [the evidence](../../docs/evidence/player-tile/README.md).

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

Before publishing, run `rayner review scene.ts` (or `npm run rayner -- review scene.ts` in a checkout). It runs the checks and opens every case and step at phone and desktop widths, saving screenshots and a receipt. Add `scene.review.json` with independent caption subjects where helper intent does not name the story; see [reader review](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#reader-review). `build` writes artifacts without repeating these checks. Then open a pivotal step link in a fresh browser, refresh it, switch the case and return; check that the visible caption, numbers, paths and selected setting agree with forward navigation. Inspect the complete phone close-up tour, reduced-motion result and text alternative for the *inference*, not just a font-size threshold. Record URL, case, step, viewport, screenshot state and any gap. An informal newcomer check can ask for a countercase prediction, but record what they said instead of claiming measured comprehension.

For an explainer proposed as a **hero**, use the rubric's separate [J/R/C brief](../../docs/EXPLAINER-RUBRIC.md#choose-a-hero-separately). Show the author job, an actual model input/output, the consequential other case, and a short path from source and test to the reviewed reader. Put engine inventories in supporting documentation, not in the lesson's payoff. A high /24 lesson score alone is not a hero recommendation; neither the rubric nor a passing build establishes reader demand.
