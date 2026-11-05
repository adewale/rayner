# Vocabulary: one name per idea

**Status: in progress.** Steps 1 to 4 of the [order of work](#order-of-work) are done: refused events, authored transitions with `choreograph`, transition checks, ring-buffer and state-machine as machines, and [the player](MACHINES.md#the-player)'s event buttons at each machine's live step. Of step 5, keyed table cells are done, with python-dict as their first user. Done before them: `stage.steps` with its redraw check, and `Machine`, `match: 'key'`, invariants named as invariants, `draw` as the one name for state to picture, `stage.sketch`, and every `View` a view of state. This proposal renames and refactors Rayner's abstractions so that each idea has one name, each name means one thing, and the collection's own explainers go through the same checked path as the engine's examples. Most of it is renaming. The part that matters most is a refactor: making every explainer's picture a function of its state, so `rayner check` can prove it.

## Why

Correctness by construction rests on five invariants (see [Engine](ENGINE.md)): a frame is a pure function of time; each mobject has one writer; identity is a key; anything a reader can reach is a view of state; and every claim can fail. The names should make those invariants easy to say and hard to break. Today they do neither.

**One role, three names.** Turning state into a picture is called `render` in `view(scene, render)` and `View.render`, `draw` in `Follow({ draw })` and in the scene library's step lists, and `build` in `view(build)`. Each of those words also means something else. `render` is the output pipeline (`renderAt`, `renderElements`, `renderText`). `draw` is also `stage.draw(m)`, which animates a pen tracing `m`.

**One word, three ideas.** "Frame" is the 2D camera (`Frame`, `scene.frame`), one instant of a run ("every frame", `FrameCaptureSink`), and one step of the scene library (`LessonFrame`, `NarrativeFrame`, `ReaderFrame`, `presentFrame`). "Claim" is a sentence backed by a test (`meta.claims`), a frame-level check (the docstrings for `Scene.invariants` and `InvariantSink.vacuous()` called invariants "claims"), and a subject a caption names for review (`scene.review.json`'s `claims`). "Session" clashes with the HTTP sessions in the state-machine explainer and with the general meaning on the web, while issue #88 already calls the same thing "the live machine".

**The heart is mostly bypassed.** Of the 40 explainers:

| Path | Explainers | Is the picture checked against the state? |
| --- | --- | --- |
| `view(scene, render)` | 6 (feature-tour, periodic-groups, ring-buffer, state-machine, statecharts, token-bucket) | Yes: `viewMismatch`, and exploration for sessions |
| `Session` | 1 (statecharts) | Yes, in every reachable state |
| The scene library's `lesson()` (6) and `readerFirst()` (11) | 17 | No. Each step sets `scene.state` and, separately, calls `draw(stage)`, which never receives the state. Nothing checks that the picture shows it. |
| `scene.state = …` written in the scene's own code | 34 | Only where a view also exists |
| `stateView` | 0 | Unused |

So the invariant "anything reachable is a view of state" holds by construction for one explainer's sessions and a handful of views. The other explainers satisfy it by care, not by construction.

**What the open issues need.** Issue #88's player needs to know which events a state allows, an authored animation per event that still lands on `view(next)`, and checks on every edge as well as every state. Issue #7's narration needs named cues on the timeline. 3D needs a viewpoint that lives in state. Each of these is easier to add, and to name, once the vocabulary below is in place.

## The vocabulary

One row per idea. **Bold** marks a change.

| Idea | Name | Meaning | Replaces |
| --- | --- | --- | --- |
| Model | (plain functions) | Pure, tested functions in `model.ts`; `next(state, event)` for a machine | |
| Model state | `scene.state` | JSON only; the domain (a bucket's tokens, a statechart's configuration) and nothing about how it is shown; a step records it as `before` and `after` | |
| What is shown | **`scene.shown`** | JSON; which picture a phase shows, and the stage's description of its picture; a view's draw may read it, a machine never changes it; the trace records it as `shown` | `phase` and `reader` inside `scene.state` |
| Step | `scene.step(id, meta)` | A stop with a title, line and caption | |
| Step kind | **`kind: 'short' \| 'main' \| 'detail'`** | Which path a step is on: the reader's short path, the story, or a detail players skip | `reader: true`, `detail: true` |
| Scenario | **`scenario`**, `scenariosOf`, `scenarios` | One value for every setting | `variant`, `variantsOf`, `variants`, and `case`, `casesOf`, `cases` (`case` is reserved in JavaScript) |
| Picture | a `Mobject` tree | What a frame shows | |
| State to picture | **`draw(state, shown?)`** | The one name for a function from state to picture, wherever it appears | `render` (views), the parameterless `draw(stage)` (steps), `build` |
| View | `view(scene, draw)`, `view.sync()` | A picture kept equal to `draw(scene.state)`; sync morphs it there | `View.render` becomes **`View.draw`** |
| Staged steps | **`stage.steps([...])`** | A list of steps, each `{ id, title, line, caption, state, draw }`; each step's state becomes the model and the picture is drawn from it | `lesson()`, `readerFirst()`, `presentFrame()` and the three `*Frame` types in the scene library |
| Identity | `key`, `find(key)`, `findAll(match)` | How a part is addressed and kept across morphs: the same key in two pictures is the same part | **`Mobject.id`** leaves the published types; it is the renderer's number |
| Matching by key | `matchByKey()`, **`match: 'key'`** | Keyed parts pair with keyed parts | `match: 'keys'` |
| A state change | `SetState(scene, next, { event })` | A model step at its place in a schedule | |
| Event-driven model | **`Machine`**, `machinesOf(scene)` | `start`, `events`, `next`, `views`; `send`, `replay`, `reachable` | `Session`, `sessionsOf`; describe's `sessions` field becomes **`machines`** |
| Refused events | `next` returns **`undefined`** | Which buttons a reader cannot press in a state; one function, so the buttons and the model cannot disagree | A refused event returning the same state |
| Authored transition | **`transition: ({ before, after, event }) => Animation`** (new, per event) | The motion for an event; Rayner then swaps in `draw(after)`, so it always lands where the model says | Hand animation in ring-buffer and state-machine |
| A sampled value | `Follow({ from, to, draw }, { targets })` | One number sampled between two ends and redrawn with `become` | |
| Taking another's data in place | `become(other)` | Keeps identity and keys; refuses to drop a keyed child | |
| Pen animation | **`stage.sketch(m)`** | Draw `m` stroke by stroke with a pen or pencil | `stage.draw(m)` |
| 2D camera | `Frame`, `scene.frame` | The box of the scene that is on screen | |
| 3D picture | **`seenFrom(model, viewpoint)`** (built, in `rayner/drawing`), `depthOrder(picture)` | Draws a 3D model through a viewpoint, `{ kind, yaw, pitch }`, that is ordinary state turned by an ordinary `Follow`, as keyed 2D pieces in an explicit depth order (far, body, near). Mercator and gnomonic maps are viewpoint kinds of the same model. Not an engine type. | |
| Frame-level check | `addInvariant`, `InvariantSink` | A predicate checked on every frame; returns `true` when it held | Calling invariants "claims" |
| Prose check | `meta.claims` | A sentence backed by a named test | |
| Review subjects | **`scene.review.json`'s `subjects`** | What a caption names, for the reader review to find on screen | that file's `claims` |
| Authored transition parts | `choreograph(current, target)`: `morph`, `enter`, `leave`, `insert`, `own`, `rest` | One event's motion, part by part, by key | |
| Decisions | `evidence()` | What an animation decided, recorded as it begins | |
| Frames recorded | trace, `traceScene` | What each frame showed | |
| Output record | receipt (`claude/video-pacing`) | What a render produced | |
| Words for a picture | `describe` | The same word on the stage, on `Diagram`, in `describeExplainer` and `rayner describe` | |
| Tables | **`table(headers, rows, s, { key })`**, rows `{ key, cells }` | The drawing kit's existing `table()`, now with keyed cells: `key:row:column`, each row `key:row`, the header row `key:head`. A row's own `key` (or its index) is its identity, so a moved row is the same part; a duplicated row key or header is refused. Done; python-dict is its first user | A second table primitive |
| Graphs | `Diagram` | Captured from Mermaid; `walk`, `mark` and `morph` | A separate `Graph` type |

After the change, "frame" still means two things: the 2D camera and an instant of a run. Manim has the same overlap (`camera.frame` and frame rate), and context separates them. The step-list meaning goes.

### Names deliberately kept

- **`Frame`.** Manim authors know `camera.frame`.
- **`SetState`, `Follow`, `become`, `Transform`.** Animations named as verbs follow Manim's convention.
- **`keep`, `enter`, `focus`, `carry`, `reading`.** Stage verbs read well at their call sites.
- **`describe`.** It already means one thing everywhere: words for what is shown.
- **trace, evidence, receipt.** Three different records: what frames showed, what animations decided, what a render produced. [Engine](ENGINE.md) should define all three in one place.

## Refactors

### 1. Steps are views of state

`stage.steps()` moves the scene library's step lists into `rayner/explain` and closes the gap above:

```ts
// before: lesson(), in the scene library
{ id: 'paths', title, line, caption,
  state: { sunsets },
  draw: (s) => arcs(s) }          // never sees the state

// after
await s.steps([
  { id: 'paths', title, line, caption,
    state: { sunsets },
    draw: (state, kit) => arcs(state.sunsets, kit) },
]);
```

Each step clears the stage, makes its state the model, and shows its drawing with the reading order and description `presentFrame` gave. `{ kind: 'short' }` covers `readerFirst`: its steps are marked as the reader's short path, and each one's state is the model like any other step's.

**The new check.** After the run, `rayner check` redraws every step from its recorded state alone and compares it with the resting picture, by text and geometry, as session exploration already does for machine states. A `draw` that reads a variable changed by another step, rather than its own state, fails with the step's name. Constants computed once per scenario, such as henge's model, are fine: they are the same in both runs.

This changes the 6 `lesson()` explainers (birthday-paradox, bloom-filter, git-branches, henge, melody-rhythm, python-dict) and the 11 `readerFirst()` explainers (2password, glyph, gnome-files, just-bash, latest-search, mr-cache, pen-and-pencil, ring-buffer, state-machine, tailwind-gamut, wcag-map). The scene library keeps `lesson` and `readerFirst` as one-line wrappers until the collection has moved.

### 2. Machines, ready for the player

- `Session` becomes `Machine`, and statecharts' local `machine()` helper is renamed to avoid the clash.
- `next` returns `undefined` for an event the state refuses. The player disables that event's button (it stays focusable and says why), and exploration does not follow it. There is no separate `allows`: two functions could disagree about which events a state accepts.
- `transition` is optional per event. Without it an event plays the keyed morph, as now. With it the authored animation plays, then the views snap to `draw(after)`. That last morph is checked to be still, so a transition that ends somewhere else shows as motion that `rayner check` reports.
- Exploration checks every edge as well as every state. Each reachable edge's frames run through the invariant and legibility checks, and a failure is named by its shortest events plus the edge's event.

Ring-buffer and state-machine then become machines. Their resting pictures must stay identical, and their motion is authored rather than hand-placed.

### 3. One name for state to picture

`View.render` becomes `View.draw`, and `stage.draw(m)` becomes `stage.sketch(m)`. `Follow` already uses `draw`. The drawing kit `rayner/drawing` then reads as intended: it is what `draw` functions are written with.

### 4. Keyed tables and 3D pictures

These are new rather than renames, and each has two adopters:

| Addition | First adopter | Second adopter |
| --- | --- | --- |
| `table(..., { key })`, keyed cells (done) | python-dict (deletion and lookup as two machines; insertion is outside its script) | bloom-filter |
| `seenFrom(model, viewpoint)` in `rayner/drawing` | great-circle ([script](../scenes/explainers/great-circle/script.md)): built; its turn is a `Follow` over the viewpoint's pitch | henge's fixed-axis globes: not adopted, because their resting pictures cannot stay identical. Each is a cross-section in the orbital plane with Earth's axis drawn across the opaque disc; `seenFrom` hides the part of the axis inside the body, which is the depth rule it exists to keep |

### 5. Cuts

Each of these has no adopter, or breaks an invariant, or says something the engine already says another way:

| Cut | Users | Why |
| --- | --- | --- |
| `stateView` | 0 | A readout of state keys; `StateReadout` in a `view` does the same. |
| `view(build)` | 1 (monty-hall) | A view not made from state cannot be checked against it. Monty-hall moves to `view(scene, draw)`, and the `View` constructor itself takes `(scene, draw)`, so every View keeps a `draw` the checks can call again; a `draw` that reads anything outside the state is caught when a redraw disagrees. |
| `Diagram.fromGraph` (proposed) | 0 needed | Git-branches and exgit draw their graphs with the kit, and `Diagram.morph` already handles graph edits. |
| `allows` (proposed) | — | Folded into `next` returning `undefined`. |
| `viewpoint` as an engine type (proposed) | — | It is state; `seenFrom` is a drawing function. |

Kept after review, though first listed as cuts:

- **Updaters** (`addUpdater`). No explainer registers one, but the Lantern explainer teaches them as its counterexample, with claims backed by tests that use them. Under the fixed clock a scene with updaters is still deterministic: a seek computes every frame before it rather than skipping. They cost seek speed, not invariant 1.
- **`GrowFromEdge`, `PulseAlongPath`.** Stock animation vocabulary, as `Indicate` and `Flash` are, with a documented recipe. Adopter counts are the wrong test for a stock animation.

Deferred: `{ cue }` for narration belongs with video export on `claude/video-pacing` (#7). Lighting, shading and depth of field for 3D: nothing the scripts argue needs them.

## The domain-driven review

A Domain-Driven Design reading found five vocabularies leaking into each other: the engine (Manim's words, kept on purpose), the explanation (step, caption, stage, scenario), verification (invariant, claim, trace, evidence), the reader's controls, and each explainer's own domain. `draw(state)` is where an explainer's domain becomes pictures, which is why it is one name everywhere. The review's renames are done:

- **One word, scenario.** `variant` and its family became `case` words, and then `scenario` words, in code, reports and docs: `case` is reserved in JavaScript, so a single one could not be named `case` in code.
- **The model apart from what is shown.** `scene.state` holds only the model; `scene.shown` holds which picture a phase shows, and the stage's description of its picture. monty-hall, statecharts and feature-tour moved their `phase` there; `stage.steps` no longer writes one, and short paths no longer nest under `state.reader`. A machine plays under one `shown`, and exploration draws its states under it.
- **A step kind.** `kind: 'short' | 'main' | 'detail'` replaced `reader: true` and `detail: true`.
- **Subjects, not claims, in review.** `scene.review.json` declares `subjects` (version 2); `claims` means only `meta.claims`. The CLI flag is `--subjects`.
- **One identity.** `key` is the part's identity; `Mobject.id` is marked internal and left out of the published types.
- **`seenFrom`, not `projected`.** "Projection" is the CQRS word for a picture derived from state; the 3D function is named for what it does.

Not taken: `events` → `commands` (statecharts and XState, the explainers' own domain, say events; a refused event never reaches the trace), `view` → `projection`, `Follow` → `Sweep` (two adopters and a recipe already), and `evidence` → `decisions` (only checks read it).

## Compatibility

Nothing here has shipped, so every rename and cut changes outright, with no aliases. The scene library's `lesson` and `readerFirst` are removed once the 17 explainers have moved to `stage.steps`.

## Order of work

Each item is one commit with its own evidence, as the primitives in this PR were.

1. **Unreleased renames** (`Machine`, `machinesOf`, `machines`, `match: 'key'`) and the invariant docstrings. Evidence: sampled frames hash-identical for all 40 explainers; the full suite and `pack:smoke` pass.
2. **`draw` and `sketch`**, and the cuts above. Evidence: identical frames for every explainer; monty-hall's picture moves to `view(scene, draw)` with identical frames.
3. **`stage.steps`**, moving the 17 explainers one at a time. Evidence: identical frames per explainer. The redraw check is shown rejecting a deliberate defect: a `draw` that reads a counter incremented by each step.
4. **Refused events, `transition` and edge checks**; ring-buffer and state-machine as machines, and the player's event buttons (#88). Evidence: identical resting pictures. The edge check is shown rejecting a transition that ends one slot away from `draw(after)`.
5. **Additions**, each with its two adopters and a deliberate defect: a duplicated table key, and a viewpoint change that draws a back face in front. Keyed tables are in: `table()` refuses a duplicated row key or header by name, and a keyed morph pairs a moved row with itself (both in `test/lesson-layout.test.ts`); python-dict plays its deletions and lookups as machines on them, with resting pictures identical to before. Bloom-filter, the second adopter, is still to move. `seenFrom` is built with great-circle; `test/seen-from.test.ts` shows `depthOrder` rejecting a picture whose viewpoint changed without a redraw, and a turn drawn by morphing between two endpoint pictures, while a `Follow` holds at every frame. Its second adopter is open: henge's globes would change picture (above).

## Done when

- [ ] Every idea in the vocabulary table has one name in the code, the docs and the skill, and `grep` finds no other.
- [ ] Every explainer that steps through pictures does so through `stage.steps`, a view or a machine, and `rayner check` redraws each resting picture from its state.
- [ ] `Machine` refuses events through `next`, has `transition`, exploration covers edges, and ring-buffer and state-machine are machines.
- [ ] The cuts are gone from the code, the docs and the skill.

## Not chosen, and why

- **`render` for state to picture.** It already names the output pipeline: `renderAt`, `renderElements`, `renderText`.
- **`picture` as the function's name.** It is a noun and stays the name for the result; `picture(state)` reads as a lookup.
- **Renaming `Frame` to `Camera`.** It breaks a published, Manim-familiar name to free a word the 3D work does not need.
- **`Camera` for the 3D eye.** It would clash with `Frame`'s documentation ("the scene's camera"). In Manim a camera renders the scene; here the viewpoint is state that a view draws, and it should sound like state.
- **`Model`, `Store` or `Actor` for `Session`.** `Model` is already the plain functions. `Store` suggests a reducer with no explorable graph. `Actor` (XState) suggests concurrency and messages between machines. `Machine` says states and events, and it is #88's word.
- **Folding `SetState` into `Machine.send`.** `SetState` is the primitive and is used without a machine (periodic-groups) and by every machine's `send`. `send` is `SetState` plus syncs.
- **`story()` for staged steps.** The script is already the story; the steps are how the stage shows it.
- **A separate `Graph` and a second `table`.** Two names for nodes and edges, or for rows and columns, would split checks and helpers that should apply to both.
- **Leaving `lesson` and `readerFirst` in the scene library.** They are the collection's most used step helpers (17 explainers), and their pictures are not checked against their state: the largest gap between Rayner's principle and its practice.
