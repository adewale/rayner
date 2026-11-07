---
name: rayner-explainers
description: Author, check and publish Rayner explainers as reader-paced HTML embeds. Use for step-through diagrams, code-change explanations, protocol walkthroughs and program-driven animation.
---

# Rayner explainers

An explainer is one Rayner `Scene`. The CLI builds it into a step-through HTML page. It needs no server or MCP. Start with [Your first explainer](https://github.com/adewale/rayner/blob/main/docs/TUTORIAL.md) for a worked example: LRU versus MRU cache replacement, with its model tested against published examples. Read the [reference](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md) for the helper API and the checks, and [publishing](https://github.com/adewale/rayner/blob/main/docs/PUBLISHING.md) before you host a page.

## How to use this skill

This skill says what a finished explainer must achieve and how each part is checked. It does not tell you how to draw, lay out or word a step: use your own judgement, and copy techniques from [the examples](#start-from-an-example) when they help. Rayner's value is that it checks the result: values come from a model tested against its source, pictures are measured as painted, and the page is reviewed as served. When an instruction and a check disagree, the check wins; when you find yourself following a rule that no check or reader would miss, drop it.

## Script first

An explainer is three files, each with one job:

- **`script.md`: the intent, for the author.** What the explainer must achieve: the reader's question, who the reader is, the answer, the condition whose change the reader should be able to predict, what the reader will do themselves, what the model is checked against and what it leaves out, and the questions a reader should be able to answer afterwards. Then the author's reasons in their own words. It is not the explanation; the scene is. Rayner reads only its intent header ([rules](../../docs/REFERENCE.md#scene)); the other labelled lines (**Reader**, **Changed condition**, **Reader's own work**, **Leaves out**) are for the author and a reviewer, and no check requires them.
- **`model.ts`: the system's constraints.** What the system allows, what each action does, and why it refuses one, with its tests against whatever the system can be checked against. Its limits are stated beside the constraints they qualify.
- **`scene.ts`: how the system is explained.** The steps, their words, which states and events each step shows, the settings and the live step. How one state looks goes in a picture module (`picture.ts`), so the scene reads as the explanation: a picture function builds and returns the parts, taking whatever it needs (the state, the stage for its colours `s.look` and the drawing kit, axes, positions, a seeded generator), and the scene keeps when and how they appear (entering, camera moves, plays, callouts and marks on the returned parts).

Colour from `s.look` (paper, ink, soft, emphasis, good, bad, raised, rule, muted), which reads on the stage's paper whatever its style; a palette is only the named style the stage is built from. The drawing kit (`rayner/drawing`) takes the stage first, the content next and one options object (`at`, `size`, `key`, and the rest); a kit picture with a key keys its parts (`key:box`, `key:label`), and a diagram part's pieces come from `d.shapes(id)` and `d.labels(id)`, so reach a part by key or accessor, never by `children[i]`.

The scene declares its types: `class Bucket extends Scene<Model, Shown>`, the model's type and the type of what is shown apart from it (`{}` for nothing; `Scene<{}, {}>` for a scene of staged steps only). `this.state`, `this.shown`, every view's draw (`view(this, (st, sh) => …)`), `s.diagramView`'s draw, machines and `SetState` are typed from them, so a scene needs no cast on its state. A state that changes shape by phase is typed as what it is, a union of the shapes or one record with optional parts, and a draw of one phase narrows to its shape: `having(st, 'longitude')` from `rayner/explain` returns the state as the shapes that hold that key and throws on a state of another shape, which `rayner check` counts as a draw that reads its state. `s.steps([...])` types each step from its own `state`. [Typed state](../../docs/REFERENCE.md#typed-state-and-shown) has the rules.

Write the script before you draw anything. Explainers grown from a model without one explain their own mechanics and never answer the reader's question. Explainers that open on a definition answer it in a way the reader cannot yet use.

3Blue1Brown's Summer of Math Exposition judged thousands of entries on four criteria ([rules](https://some.3b1b.co/rules)), and Grant Sanderson's advice to entrants adds the craft behind them ([announcement](https://rosetta.to/u/3blue1brown/make-math-videos-summer-of-math-exposition-announcement), [SoME4 prizes](https://3blue1brown.substack.com/p/some4-prizes)). Write the script against them:

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

- **Reader questions.** The script's `## Check yourself` list. Ask the reader to explain the mechanism or transfer it to an unseen condition. Avoid definitions alone and recall of seeded dates or labels. An expert may answer without the lesson; that does not invalidate the exercise. Evidence of learning needs newcomers, their prior knowledge, and their reasoning before and after reading.
- **Test it alone.** Read the scene's steps back as a newcomer would: does each make the next feel inevitable, and could they answer the script's reader questions?

The script starts with an intent header, which Rayner reads: the `#` question, the labelled lines and `## Check yourself`. [The reference's Scene section](../../docs/REFERENCE.md#scene) gives its rules (which lines are required, what each becomes, that a scene declaring them too is refused, and how `answers.ts` computes an answer from the model so `rayner check` fails when the two differ). [`scenes/tutorial/hanoi/script.md`](../../scenes/tutorial/hanoi/script.md) is the smallest complete script; the README prints it, and a test keeps that copy equal to the file. Below the header the script is the author's own prose: why this example, what the reader should take away, what was tried and dropped. There is no word quota, and it does not have to read as the page reads. Every explainer in `scenes/explainers/` and `scenes/tutorial/` is written this way.

Before drawing, check the causal links: what observation needs explaining, what rule makes the result follow, and what changed condition would alter it? Explain a prerequisite or name it as an input. A chart built from a rule does not derive that rule; a trusted calculation does not explain its mechanism. Use a second viewpoint when the current one cannot show the relationship the prose asks the reader to infer. The script decides what the explainer says; the model and its tests decide whether it is true.

## What must be true

Each of these is a result, with the way it is checked. Use any technique that gets there.

| The explainer… | Checked by |
| --- | --- |
| Draws every value from a model, tested against the real source | A fidelity test per scenario and step ([Test the model](#test-the-model)) |
| Shows pictures that follow the model's state | `rayner check` compares every `view` with its draw of the state at the end of every step, redraws every `s.steps` picture from the state it recorded, and draws every state a `Machine` reaches. A Mermaid diagram is checked against its pinned snapshot instead, and a hand-placed callout only by your tests |
| Names each part once: a key belongs to one mobject on the stage | `rayner check` fails a key two mobjects hold at the end of a step. Two copies of one diagram need their own keys, and two tables, flows, bars, stats or legends need their own `key` |
| Motivates the question early, starts from a concrete case, earns each name and builds to one aha | Reading it against [Script first](#script-first) and the [rubric](../../docs/EXPLAINER-RUBRIC.md) |
| Names its answer within the first third of the steps, as the payoff of a concrete problem | `rayner check` fails if no step states `meta.answer` and reports where it first appears; reading it decides whether it is early and earned |
| Spends every step on a new inference: no step that an earlier one already made, and no walkthrough that derives an answer an opening step already stated | Reading it against the rubric's economy criterion. When you add an opening that states the answer, delete or repurpose the later step that derives it |
| Fits each step on a phone: the point in the caption's first sentence, about 80 words at most, and `meta.answer` about 20 | Reading it; `rayner describe` prints every caption to count |
| Ends on the practical boundary or the strongest comparison | Reading it. A list of what the model leaves out goes in the script's **Leaves out** line and the model; a second topic goes in a detail step |
| Gives the reader something to do that the explanation then answers | Reading it as a reader; [Make the reader act](#make-the-reader-act) |
| Has pictures readable at 1280 px and on a phone, with nothing colliding, and a description in words for each | `rayner check` for desktop and conservative phone estimates; `rayner review` for actual served geometry |
| Works as served: every step from a fresh link, every scenario, phone and desktop | `rayner review` |
| Says nothing a setting would make false, and claims no more than it tests | Reading every scenario against the model and its sources; `rayner check` lists each sentence with "every", "never" or "only" that no declared claim backs ([Claims, words and limits](#claims-words-and-limits)) |
| Teaches with the caption hidden: a colour or dash the words name is named on the stage too | `rayner check` fails a caption or line that names a colour or a pattern no word on the stage says; a `legend` from `rayner/drawing`, a label, or a line that keys it (`Red: the route.`) answers it |
| Uses the reader's words, introducing any code name where it first appears | `rayner check` lists each code name in the steps' words with the step that first uses it |
| Teaches better than the alternative: a still, a code diff, or a page written without Rayner | Asking honestly; [the benchmark](https://github.com/adewale/rayner/blob/main/bench/explainers/README.md) for changes to Rayner itself |

Checks establish deterministic, readable pictures; they cannot establish that a caption is true or that a reader learns. Do not weaken a check, bless a corrupt snapshot or skip a scenario to get a pass; a checker defect needs a valid example it wrongly rejects and an invalid one it must still reject.

## Make the reader act

Readers learn from what they do more than from what they watch. In a blind comparison of three Rayner explainers with pages the same models wrote without Rayner, from one script, the reviewer preferred the plain page in all three pairs, twice over, mainly because those let the reader commit to predictions and drive a live machine ([the benchmark](https://github.com/adewale/rayner/blob/main/bench/explainers/README.md)). A [`Machine`](https://github.com/adewale/rayner/blob/main/docs/MACHINES.md) replays events through the model, has every reachable state checked, and at the step where it last played gives the reader a button per event, so the reader drives the model themselves. Where the subject is not driven by events, use what else exists:

- **Ask, then answer.** A step asks a reader question and the next step answers it. The rail hides a step's title until the reader reaches it, so "Answer: …" is safe on the answering step; keep the answer out of the asking step itself.
- **A scenario that changes the outcome.** A setting is the reader's own lever; give them one whose other option changes the conclusion. A setting whose other option only changes the numbers doubles the scenarios and teaches nothing: drop it.
- **Questions the page can answer.** Where a reader question is about events (merge again, delete then look up), a live machine lets the reader find the answer by pressing.
- **The reader questions at the end**, from `meta.questions`.

## Which way to step

A step's picture can come from four places. Choose by what the reader needs, then let the checks hold you to it:

| Way | Use it when | What `rayner check` proves |
| --- | --- | --- |
| Hand-written steps (`this.step`, then plays) | The motion between pictures is the point and no model generates it: code morphing along its diff, a walk over a diagram | Every frame seeks to what was played, nothing moves during the caption hold, and resting pictures are readable and uncrowded. That the values are true is your fidelity test's job, not check's |
| `s.steps([...])` | Separate pictures, each wholly decided by its own state, with no motion between them that teaches | Each step redrawn from the state it recorded matches the picture drawn then, and a draw that ignores its state fails |
| Views (`view(scene, draw)`, `sync()`) | One picture that follows the model across steps and morphs as it changes. `sync()` pairs the parts by their keys, so give a card or panel its `key`, or say `match: 'text'` for a bare readout | Each view shows what its draw makes of the state at the end of every step |
| A `Machine` | The subject is driven by events and the reader should drive it | Every state the events reach, from `start` and from the live step's state, is drawn and must be readable, uncrowded, described, unlike every other state's description, and show its state; every authored transition is played, holding the invariants and landing on the state's picture. `rayner review` opens the live states as served, and the buttons must be what `outcome` gives |

The cost rises down the table, and so does what is checked: a machine checks states no step shows, which a hand-written step never does. `rayner init --machine` writes a machine explainer (a door that locks) that passes `rayner check` and `rayner review` as written.

A good live step, the step where the machine last plays:

- **Every refusal says why.** Return `refuse(reason)` from the branch of `next` that refuses, a clause that follows the event's name ("open: the door is locked, so unlock it first") and names the rule with the state's own values. A refusal with no reason (`undefined`) shows "Not possible here", which tells a reader who pressed to find out nothing. Pin each reason in the model's test; the browser test and the review hold every button's reason to `outcome`.
- **The story's limits are bounds, not refusals.** Where the model would go on but the explainer stops (the client sends ten requests), return the reason from `bound`. `rayner check` fails a bound on an event the model refuses anyway.
- **The step leaves events to press.** End it in a state where some event goes somewhere, and ideally one is refused with its reason, so the first press teaches. When no event goes anywhere from it, the player starts the reader from `start` instead; when none goes anywhere from either, there are no buttons and the review has nothing to visit, so check `describe`'s `machines` for the live `step`.
- **What a press changes reads on a phone.** `rayner review` fails a live state whose changed labels read under 12 px at 390 px in the whole picture and every close-up of the step, and a label under 14 px at a 1280 px stage anywhere.
- **Motion can wait.** Without a `transition`, each view morphs to the new state by key, staged so a word and its replacement never overlap. Author a `transition` with `t.choreograph(view)` where the motion carries the explanation; check plays every one from every reachable state.

## Loop

Commands are `rayner <command>`, from the `rayner-cli` package (install it beside `rayner`: `npm install --save-dev rayner rayner-cli`; scenes import only `rayner`), or `npm run rayner -- <command>` in a checkout; `rayner --help` prints the commands, the options and how to install Chromium for diagram capture.

1. `rayner init <directory>` writes the tutorial's explainer: `script.md`, `scene.ts`, the model `model.ts` and its test `model.test.ts`; `rayner init --machine <directory>` writes a [machine](#which-way-to-step) explainer instead, with `scene.review.json`. Rewrite the script first; its [intent header](../../docs/REFERENCE.md#scene) becomes the page's title, answer, reader questions and what the model is checked against. Keep one default-exported `Scene` subclass with static `meta` (sources, and `lang` if not English; the id is the folder's name) and, if a second scenario teaches something, static `settings`.
2. `rayner preview scene.ts --watch` while you work; `see` and `describe` give any step as text and JSON when you need to read it without a browser.
3. `rayner check scene.ts` until it passes. It runs the folder's `model.test.ts` first and fails, naming the failing tests, when the model test does.
4. `rayner review scene.ts --out public/<id>.html` when the scene settles. It checks every scenario, reviews the served page at phone and desktop widths, and keeps that exact page with its receipt. Look at its screenshots.

The [engine map](https://github.com/adewale/rayner/blob/main/docs/ENGINE.md) lists what already exists (a camera that zooms without moving anything, code that morphs along its diff, morphs matched by text or shape, charts of the model's numbers, pictures rebuilt from `scene.state`), and [the reference](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#engine-features) names an explainer that uses each. Read it before building something by hand.

## Start from an example

Each explainer in [`scenes/explainers/`](https://github.com/adewale/rayner/blob/main/scenes/explainers) shows a technique. Copy the nearest one rather than starting blank; these are ways that worked, not rules:

<!-- generated from test/public-names.json by `node tools/repo/public-names.ts --write`: examples -->
| You are explaining | Start from | It shows |
| --- | --- | --- |
| Two algorithms or policies on the same input | `scenes/tutorial/lru-mru` (what `rayner init` writes) | One card with a column per policy, read from the model's trace; one scenario that favours each policy; captions tested against the model |
| A code change and what it does to a system | `mr-cache` | `TransformDiff` on the code, the same edit replayed on the diagram with `ops`, a setting for hit or miss |
| Authoring feature reference | `feature-tour` | Choose a feature scenario: the recipe step shows the author-written API, the result step runs it. See [scope and specialized APIs](../../docs/FEATURE-TOUR.md) |
| A protocol or request flow | `oauth-pkce` | A sequence diagram revealed message by message (`build: 'frame'`, `reveal`); a setting that adds the attacker's step |
| A sequence of separate pictures, one per step | `bloom-filter`, `git-branches` | `s.steps([...])`: each step carries its `state` and a `draw(state, s)` for its picture; `rayner check` redraws every step after the run and fails one that comes out different |
| A data structure changing step by step | `ring-buffer` | No diagram: native shapes drawn as views of `scene.state`, a `Machine` of push and pop, each event's motion authored with the transition's `t.choreograph`, `c.follow` for the pointers |
| A state machine | `state-machine` | A state diagram driven by the real reducer as a `Machine`, code spans boxed from the row it read |
| A model the reader could drive with events | `scenes/tutorial/door` (what `rayner init --machine` writes), `statecharts` (the frother) | A `Machine` over the model's step, refusals with reasons, a live last step; `rayner check` draws every reachable state |
| Nested or parallel states | A Mermaid `stateDiagram-v2` with composites and regions ([recipe](../../docs/REFERENCE.md#state-machines-and-graphs)); `statecharts` when position carries meaning | `statecharts`: native boxes and arrows drawn from a model's states and transitions; a keyed `view` whose parts keep their identity as a grid becomes regions; a flat and a structured drawing side by side |
| A race or ordering bug | `latest-search` | A real controlled-promise run that opens on the unguarded race (the page ends on the older query) before naming the ticket that fixes it; guard and completion order change the displayed result |
| A rate or a model's numbers over time | `token-bucket`, `seasons` | `token-bucket`: `Axes`, `lineGraph`, `g.follow` for the gauge and the line from one elapsed time; `seasons`: `Axes.plot`; a setting that reruns the model |
| Identity, hashing or text that changes | `exgit`, `glyph` | `exgit`: Git's objects drawn as `view`s of the repository's state and synced as each command runs, a `BraceLabel` on the abbreviated id; `glyph`: `TransformMatchingShapes` pairs letters by their outlines |
| Keyed cells or nodes rearranged between pictures of the same state | `periodic-groups` | `view(...).sync()`, which matches by key; `matchByKey({ fallback })` for unkeyed parts that should stay put, `{ text: 'whole' }` when a relabelled part is a new thing (`statecharts`); `find(key)` to address a part |
| A real tool's behaviour, checked against it | `isdigit`, `gtfs`, `traffic-policy` | A model checked against the tool's own output, with a fidelity test |
| Records, schedules or shares | `gtfs` (ER, gantt), `pg-page` (pie), `cert-renewal` (timeline) | Diagram families beyond flowcharts |
| A subject in another language | `quotient-familial` | `meta.lang: 'fr'`; descriptions in French |
| A drawing made by hand, values said on it | `pen-and-pencil` | `s.sketch` with a pen and pencil, `s.focus` on the camera, `s.carry`, `s.dimension` and `s.callout` instead of cards |
| A claim about viewpoint or projection | `great-circle` | `seenFrom` and a turned model from `rayner/geo`: 3D earns its place when the claim is about how a thing looks from somewhere (a straight line on a globe is curved on the map). Otherwise a 2D section in the right plane reads better, as `seasons` draws the Sun's rays |
| A requested face in text and diagrams | `font-metrics` | EB Garamond, real cuts and `lettering: 'natural'` diagram measurements |
| Sound compared with a visible score | `melody-rhythm` | Optional `step.audio`, two piano rolls from the played notes, an unchanged-timing control; see [score audio](../../docs/REFERENCE.md#optional-score-audio) |
| Explicit panel placement and field order | `layout-direction` | RTL `start`/`end` placement, a card's LTR override and updates that keep their columns |
<!-- end of generated examples -->

A state machine, statechart or graph is usually best as a Mermaid `stateDiagram-v2` or flowchart with `s.show`: layout and connector routing come with it, and composite states, regions, marks, walks and keyed morphs work on its parts. Draw by hand when position itself carries meaning the layout cannot keep.

## Test the model

The scene asks the model; it never states an answer it did not get from one. This is the check that matters most, and the one no other tool gives you. These steps apply when you write or change a model; a change to layout, captions or publishing needs none of them.

1. Put the model in its own module, with no drawing in it. Each explainer's folder holds its own: `scenes/explainers/<id>/model.ts`, with its picture module beside it; only what several explainers share lives in `scenes/explainers/lib/`: formatting helpers (`format.ts`) and the property tests' shared settings (`pbt.ts`). An explainer that reuses another's model imports its inputs too, never a copy of them, so the two cannot drift; and its notes claim no reuse the code does not do.
2. Check the model against its source: run the real program or library, or use its published test vectors, and pin the version you ran in the `meta.sources` links (`isdigit` links CPython at tag `v3.15.1`). If you cannot run the source, pin exactly what you relied on instead (the tagged source file, the RFC section or the published test vectors) and say in your report that you read it but did not run it. Never leave a placeholder where a pin belongs.
3. At each step, record the model's values on `this.state` (`isdigit` sets `this.state.outcome = run.outcome` from the model's run; a step in `s.steps` records its `state`). What is shown that is not the model, such as which picture a phase shows, goes on `this.shown`.
4. Add a test that runs every scenario and asserts each step's state equals the model. Keep the evidence in the explainer's folder: the model's own test in `model.test.ts` (which `rayner check` runs), oracles in `oracle/` and what they recorded in `fixtures/`, and name those files in backticks in the script's **Checked against** line, which `rayner check` requires to be there. In this repository, the step-state check is the folder's `fidelity.ts`, using `assertStepState(trace, step, { … })`, called from `test/explain-fidelity.test.ts`; scene and picture assertions go in `scene.test.ts`, and a picture built with `view` adds `assertViewFollowsState` there. Make the test fail first: break the model and watch it go red.

## Claims, words and limits

These follow the statechart skill that checks a TLA+ model and draws it for the person deciding whether its behaviour is right: every rule the reader accepts is checked, the chart speaks the reader's words, simplifying never hides an outcome, and the hand-off says what the model leaves out.

- **A sweeping sentence is a rule; check it or narrow it.** A sentence with "every", "never", "only", "always" or "whenever" claims more than the scenarios on screen. Back it with `meta.claims: [{ says, test }]`: `says` is a phrase of the sentence and `test` names the test that holds it, as `"test/<file>.test.ts: <part of its name>"`. Write the test if there is none, and make it fail first. When the sentence speaks only of what its own step draws ("every round in the strip"), mark it `{ says, shown: true }` instead. Otherwise narrow the sentence until it says only what the explainer shows. Never weaken a test to make a claim hold. `rayner check` lints declared phrases and evidence references, and lists unlinked scope sentences. Test paths are relative to the scene's folder (`"model.test.ts: <part of its name>"`), or else to the directory where you invoke the command; static `node:test` names are checked, but tests are not run and their assertions are not verified. Read the referenced test and run it yourself. The scan covers step prose, not stage labels or check answers.
- **Speak the reader's words.** A title, line or caption names what the reader sees, not the code behind it. A code name (`int()`, `skipUntil`, `A->C#0`) belongs only where the reader needs it, introduced where it first appears. `rayner check` lists each one with the step that first uses it.
- **Simplify without hiding an outcome.** When a picture or a story is too busy, coarsen labels first, then leave out steps, but keep every scenario a setting offers reachable, never merge two scenarios that end differently, and never show part of a comparison. Record a consequential omission in the script's **Leaves out** line and beside the model's constraint it qualifies; state it in a caption too when the reader needs it to interpret the result.
- **Say what the model leaves out.** State the model's assumptions beside the constraints they qualify, in `model.ts`, and the scope the explainer intends in the script's **Leaves out** line; keep every caption inside those limits. End the reader's explanation with its practical boundary, rather than an inventory of implementation omissions: the token-bucket page's "accepted at every rate" held at the three rates it offered and failed at one it never built (`fork`).
- **Doubt the model before the source.** Replay a claim against the real thing where you can, one step at a time. When they disagree, the model is wrong until shown otherwise. A claim that rests on the explainer's own model and nothing outside it (a hand model, a perception claim) says so in its sentence.

## Engine constraints

These are how the engine works, not advice; breaking one breaks the build or the page.

- One scene, one clock: never call `Scene.play()` concurrently. Put simultaneous animations in one `play(a, b)`.
- No awaited animation inside `try`/`catch` or `.catch()` in `construct()`; handle model errors in plain code first.
- Finish every change before a step's last `play()` ends: the picture must not move during the caption hold.
- Walks use real links; a missing link is a bug in the diagram or the model, never a reason to draw a shortcut.
- Morphs with `ops` must reproduce the next diagram through Agentic Mermaid's mutation replay. Without `ops`, call it a visual transition.
- A setting may change diagrams, captions, numbers and which steps exist; keep the palette fixed. A scene may have at most 64 scenarios, and its page must fit [the page budget](../../docs/REFERENCE.md#page).
- Default lettering is embedded Inter and JetBrains Mono. Other scripts, replacement faces, real bold and italic, and maths need a `lettering` request in `static meta` and committed snapshots; unsupported or unrequested characters fail the build. See [Lettering on request](https://github.com/adewale/rayner/blob/main/docs/LETTERING.md) and REFERENCE, Maths.
- Arabic or Hebrew text sets its own reading direction; `stage` and card `direction` choose spatial order; set a diagram's flow in its Mermaid source.

## Reporting

Report the commands you ran, the artifact paths and what the checks found. Do not claim:

- that a local build was deployed, released or tried by an outside author;
- that a model is a complete implementation, or that a caption proves a security or scientific claim;
- support for styles, scripts or SVG features the collection does not test;
- that a passing build replaces a visual review, or that readers learned anything you did not observe.

The engine is a fork of Lantern by Ivar Vong (MIT). Keep the MIT and font notices, and do not imply endorsement by Lantern or Agentic Mermaid.

The reviewed page is ready to upload with its header recipe and optional loader; another build is unnecessary. Where the stage helpers do not tell the reader review what a caption's subject is, name it in `scene.review.json`'s `subjects`; see [reader review](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#reader-review). For judging a finished explainer, or choosing a gallery hero, use the [rubric](../../docs/EXPLAINER-RUBRIC.md).
