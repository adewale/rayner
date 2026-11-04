# Vocabulary: one name per idea

**Status: proposed, not built.** This proposal renames and refactors Rayner's abstractions so that each idea has one name, each name means one thing, and the collection's own explainers go through the same checked path as the engine's examples. Most of it is renaming. The part that matters most is a refactor: making every explainer's picture a function of its state, so `rayner check` can prove it.

## Why

Correctness by construction rests on five invariants (see [Engine](ENGINE.md)): a frame is a pure function of time; each mobject has one writer; identity is a key; anything a reader can reach is a view of state; and every claim can fail. The names should make those invariants easy to say and hard to break. Today they do neither.

**One role, three names.** Turning state into a picture is called `render` in `view(scene, render)` and `View.render`, `draw` in `Follow({ draw })` and in the scene library's step lists, and `build` in `view(build)`. Each of those words also means something else. `render` is the output pipeline (`renderAt`, `renderElements`, `renderText`). `draw` is also `stage.draw(m)`, which animates a pen tracing `m`.

**One word, three ideas.** "Frame" is the 2D camera (`Frame`, `scene.frame`), one instant of a run ("every frame", `FrameCaptureSink`), and one step of the scene library (`LessonFrame`, `NarrativeFrame`, `ReaderFrame`, `presentFrame`). "Claim" is both a sentence backed by a test (`meta.claims`) and a frame-level check: the docstrings for `Scene.invariants` and `InvariantSink.vacuous()` call invariants "claims". "Session" clashes with the HTTP sessions in the state-machine explainer and with the general meaning on the web, while issue #88 already calls the same thing "the live machine".

**The heart is mostly bypassed.** Of the 40 explainers:

| Path | Explainers | Is the picture checked against the state? |
| --- | --- | --- |
| `view(scene, render)` | 4 (feature-tour, periodic-groups, statecharts, token-bucket) | Yes: `viewMismatch`, and exploration for sessions |
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
| State | `scene.state` | JSON only; what a step records and `describe` reports | |
| Step | `scene.step(id, meta)` | A stop with a title, line and caption | |
| Picture | a `Mobject` tree | What a frame shows | |
| State to picture | **`draw(state)`** | The one name for a function from state to picture, wherever it appears | `render` (views), the parameterless `draw(stage)` (steps), `build` |
| View | `view(scene, draw)`, `view.sync()` | A picture kept equal to `draw(scene.state)`; sync morphs it there | `View.render` becomes **`View.draw`** |
| Staged steps | **`stage.steps([...])`** | A list of steps, each `{ id, title, line, caption, state, draw }`; the state is set with `SetState` and the picture is a view of it | `lesson()`, `readerFirst()`, `presentFrame()` and the three `*Frame` types in the scene library |
| Identity | `key`, `find(key)`, `findAll(match)` | How a part is addressed and kept across morphs | |
| Matching by key | `matchByKey()`, **`match: 'key'`** | Keyed parts pair with keyed parts | `match: 'keys'` |
| A state change | `SetState(scene, next, { event })` | A model step at its place in a schedule | |
| Event-driven model | **`Machine`**, `machinesOf(scene)` | `start`, `events`, `next`, `views`; `send`, `replay`, `reachable` | `Session`, `sessionsOf`; describe's `sessions` field becomes **`machines`** |
| Allowed events | **`machine.allows(state, event)`** (new) | Which buttons a reader can press in a state | A refused event returning the same state |
| Authored transition | **`transition: ({ before, after, event }) => Animation`** (new, per event) | The motion for an event; Rayner then swaps in `draw(after)`, so it always lands where the model says | Hand animation in ring-buffer and state-machine |
| A sampled value | `Follow({ from, to, draw }, { targets })` | One number sampled between two ends and redrawn with `become` | |
| Taking another's data in place | `become(other)` | Keeps identity and keys; refuses to drop a keyed child | |
| Pen animation | **`stage.sketch(m)`** | Draw `m` stroke by stroke with a pen or pencil | `stage.draw(m)` |
| 2D camera | `Frame`, `scene.frame` | The box of the scene that is on screen | |
| 3D viewpoint | **`viewpoint`** (new) | `{ yaw, pitch, kind }` held in state; `projected(model, viewpoint)` draws a 3D model as a picture | |
| Frame-level check | `addInvariant`, `InvariantSink` | A predicate checked on every frame; returns `true` when it held | Calling invariants "claims" |
| Prose check | `meta.claims` | A sentence backed by a named test | |
| Timeline cue | **`{ cue }` on `play` options** (new) | A name for when an animation begins, for narration to align to (#7) | |
| Decisions | `evidence()` | What an animation decided, recorded as it begins | |
| Frames recorded | trace, `traceScene` | What each frame showed | |
| Output record | receipt (`claude/video-pacing`) | What a render produced | |
| Words for a picture | `describe` | The same word on the stage, on `Diagram`, in `describeExplainer` and `rayner describe` | |
| Tables | `table(rows, columns, { key })` | The drawing kit's existing `table()`, which gains keyed cells (`table:row:col`) | A second table primitive |
| Graphs | `Diagram`, plus **`Diagram.fromGraph({ nodes, edges })`** (new) | Nodes keyed by id, whether captured from Mermaid or built natively; `walk`, `mark` and `morph` work on both | A separate `Graph` type |

After the change, "frame" still means two things: the 2D camera and an instant of a run. Manim has the same overlap (`camera.frame` and frame rate), and context separates them. The step-list meaning goes.

### Names deliberately kept

- **`Frame`.** Published in 0.1.0, and Manim authors know `camera.frame`.
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
], { reader: false });
```

Each step clears the stage, sets the state with `SetState`, and shows `view(scene, draw)` with the reading order and description `presentFrame` gives today. `{ reader: true }` covers `readerFirst`, whose values now go under `state.reader` the same way.

**The new check.** After the run, `rayner check` redraws every step from its recorded state alone and compares it with the resting picture, by text and geometry, as session exploration already does for machine states. A `draw` that reads a variable changed by another step, rather than its own state, fails with the step's name. Constants computed once per case, such as henge's model, are fine: they are the same in both runs.

This changes the 6 `lesson()` explainers (birthday-paradox, bloom-filter, git-branches, henge, melody-rhythm, python-dict) and the 11 `readerFirst()` explainers (2password, glyph, gnome-files, just-bash, latest-search, mr-cache, pen-and-pencil, ring-buffer, state-machine, tailwind-gamut, wcag-map). The scene library keeps `lesson` and `readerFirst` as one-line wrappers until the collection has moved.

### 2. Machines, ready for the player

- `Session` becomes `Machine`, and statecharts' local `machine()` helper is renamed to avoid the clash.
- `allows(state, event)` is optional. Without it every event is allowed, and an event that leaves the state unchanged counts as refused, as now.
- `transition` is optional per event. Without it an event plays the keyed morph, as now. With it the authored animation plays, then the views snap to `draw(after)`. That last morph is checked to be still, so a transition that ends somewhere else shows as motion that `rayner check` reports.
- Exploration checks every edge as well as every state. Each reachable edge's frames run through the invariant and legibility checks, and a failure is named by its shortest events plus the edge's event.

Ring-buffer and state-machine then become machines. Their resting pictures must stay identical, and their motion is authored rather than hand-placed.

### 3. One name for state to picture

`View.render` becomes `View.draw`, and `stage.draw(m)` becomes `stage.sketch(m)`. `Follow` already uses `draw`. The drawing kit `rayner/drawing` then reads as intended: it is what `draw` functions are written with.

### 4. Tables, graphs, cues and viewpoints

These are new rather than renames, but each takes its name from the table above so that it lands in place:

| Addition | First adopter | Second adopter |
| --- | --- | --- |
| `table(..., { key })` | python-dict (insert and delete as a machine) | bloom-filter |
| `Diagram.fromGraph` | git-branches | exgit |
| `{ cue }` | token-bucket, on `claude/video-pacing` | python-dict deletion |
| `viewpoint` and `projected` | great-circle ([script](../scenes/explainers/great-circle/script.md)) | seasons' globe views, whose resting pictures must stay identical |

## Compatibility

Rayner 0.1.0 is published. Names that shipped in it keep an alias for every 0.2.x release, are marked deprecated in the changelog, and are removed in 0.3.0. Names that have not been released change outright before 0.2.0.

| Name | Shipped in 0.1.0? | Plan |
| --- | --- | --- |
| `Session`, `sessionsOf`, describe's `sessions` | No | Rename outright |
| `match: 'keys'` | No | Rename outright |
| `view(scene, render)` | Yes | A parameter name only: no break. The docs change. |
| `View.render` | Yes | `View.draw`, with a deprecated `render` getter |
| `stage.draw(m)` | Yes | `stage.sketch(m)`, with a deprecated `draw` alias |
| `lesson`, `readerFirst` | Not public (scene library) | Wrappers over `stage.steps`, then removed |

## Order of work

Each item is one commit with its own evidence, as the primitives in this PR were.

1. **Unreleased renames** (`Machine`, `machinesOf`, `machines`, `match: 'key'`) and the invariant docstrings. Evidence: sampled frames hash-identical for all 40 explainers; the full suite and `pack:smoke` pass.
2. **`draw` and `sketch`**, with aliases. Evidence: identical frames; the consumer type test still compiles against the deprecated names.
3. **`stage.steps`**, moving the 17 explainers one at a time. Evidence: identical frames per explainer. The redraw check is shown rejecting a deliberate defect: a `draw` that reads a counter incremented by each step.
4. **`allows`, `transition` and edge checks**; ring-buffer and state-machine as machines. Evidence: identical resting pictures. The edge check is shown rejecting a transition that ends one slot away from `draw(after)`.
5. **Additions**, each with its two adopters and a deliberate defect: a duplicated table key, a graph edge to a missing node, a cue named but never played, a viewpoint change that draws a back face in front.

## Done when

- [ ] Every idea in the vocabulary table has one name in the code, the docs and the skill, and `grep` finds no other.
- [ ] Every explainer that steps through pictures does so through `stage.steps`, a view or a machine, and `rayner check` redraws each resting picture from its state.
- [ ] `Machine` has `allows` and `transition`, exploration covers edges, and ring-buffer and state-machine are machines.
- [ ] Deprecated aliases exist for every 0.1.0 name changed, and the changelog lists them.

## Not chosen, and why

- **`render` for state to picture.** It already names the output pipeline: `renderAt`, `renderElements`, `renderText`.
- **`picture` as the function's name.** It is a noun and stays the name for the result; `picture(state)` reads as a lookup.
- **Renaming `Frame` to `Camera`.** It breaks a published, Manim-familiar name to free a word the 3D work does not need.
- **`Camera` for the 3D eye.** It would clash with `Frame`'s documentation ("the scene's camera"). In Manim a camera renders the scene; here the viewpoint is state that a view draws, and it should sound like state.
- **`Model`, `Store` or `Actor` for `Session`.** `Model` is already the plain functions. `Store` suggests a reducer with no explorable graph. `Actor` (XState) suggests concurrency and messages between machines. `Machine` says states and events, and it is #88's word.
- **Folding `SetState` into `Machine.send`.** `SetState` is the primitive and is used without a machine (token-bucket, periodic-groups, ring-buffer). `send` is `SetState` plus syncs.
- **`story()` for staged steps.** The script is already the story; the steps are how the stage shows it.
- **A separate `Graph` and a second `table`.** Two names for nodes and edges, or for rows and columns, would split checks and helpers that should apply to both.
- **Leaving `lesson` and `readerFirst` in the scene library.** They are the collection's most used step helpers (17 explainers), and their pictures are not checked against their state: the largest gap between Rayner's principle and its practice.
