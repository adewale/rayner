# Vocabulary: one name per idea

Each idea in Rayner has one name, and each name means one thing. The names are chosen so that
the five invariants in [the engine map](ENGINE.md#correctness-by-construction) are easy to say,
and that page also defines the three records, trace, evidence and receipt. This page lists the
names, what each replaced, the decisions a domain-driven review made about them, and the names
considered and turned down.

The pass that fixed these names started from collisions. Turning state into a picture was
`render` in views, `draw` in a follow and in the scene library's step lists, and `build` in
`view(build)`, while `render` also named the output pipeline and `draw` a pen animation.
"Frame" meant the camera, an instant of a run and a step of the scene library. "Claim" meant a
sentence backed by a test, a frame-level check and a subject the review looks for. Each is
resolved below.

## The vocabulary

One row per idea.

| Idea | Name | Meaning | Replaces |
| --- | --- | --- | --- |
| Model | (plain functions) | Pure, tested functions in `model.ts`; `next(state, event)` for a machine | |
| Model state | `scene.state` | JSON only; the domain (a bucket's tokens, a statechart's configuration) and nothing about how it is shown; a step records it as `before` and `after` | |
| What is shown | `scene.shown` | JSON; which picture a phase shows, and the stage's description of its picture; a view's draw may read it, a machine never changes it; the trace records it as `shown` | `phase` and `reader` inside `scene.state` |
| Step | `scene.step(id, meta)` | A stop with a title, line and caption | |
| Reader questions | `meta.questions`, the script's `## Check yourself` list | The questions the player asks after the last step, each answer behind a disclosure; "check" is kept for verification | `meta.checks` |
| Step kind | `kind: 'short' \| 'main' \| 'detail'` | Which path a step is on: the reader's short path, the story, or a detail players skip | `reader: true`, `detail: true` |
| Scenario | `scenario`, `scenariosOf`, `scenarios` | One value for every setting | `variant`, `variantsOf`, `variants`, and `case`, `casesOf`, `cases` (`case` is reserved in JavaScript) |
| Picture | a `Mobject` tree | What a frame shows | |
| State to picture | `draw(state, shown?)` | The name for a function from state to picture: a view's `draw(state, shown)`, a step's `draw(state, stage)`, and `s.diagramView`'s draw, which returns what the diagram's picture marks | `render` (views), the parameterless `draw(stage)` (steps), `build` |
| View | `view(scene, draw)`, `view.sync()` | A picture kept equal to `draw(scene.state)`; sync morphs it there. Every `View` is one: the constructor takes `(scene, draw)` | `View.render` (now `View.draw`), `view(build)`, `stateView` |
| Staged steps | `stage.steps([...])` | A list of steps, each `{ id, title, line, caption, state, draw }`; each step's state becomes the model and its picture is drawn from it | `lesson()`, `readerFirst()`, `presentFrame()` and the three `*Frame` types in the scene library |
| The phone's opening | **`s.opening(...)`**, a step's `opening` keys | The parts a caption compares, which the first close-up holds together; set per step | `s.reading(...)` and `reading` ("reading" sat beside the reader and its reader steps) |
| Emphasis a scene draws itself | `emphasised(mobject, as)` | A mark the scene's own draw makes, tagged with what it shows where it is drawn; the phone's tour visits new emphasis first | `emphasises(scene, now)` from `explain/look.ts`, which the package did not export; `s.emphasise(now)`, a callback read from state beside the draw |
| What a mark says | `as` | The word a mark's description gives it, the same everywhere: a card's `lit: { row, as }`, a code panel's `lit: { lines, as }`, a diagram mark's `{ color, as }`, `emphasised(m, as)`. A code panel's highlighted lines are lit; `focus` means only the camera (`s.focus`) | `litAs` on a card; `focus` and `focusAs` on a code panel; `emphasised(m, what)` |
| A card or code panel | `card(s, rows, opts)`, `code(s, lines, opts)` in `rayner/drawing`; `s.card`, `s.code` | The kit builds the picture, placed as the stage places it (its direction and regions), and the stage verb builds with the kit and enters it. `Card` and `CodeBlock` are types only. The engine's `Code` is plain highlighted code text with no panel | `new Card(scene, palette, …)` and `new CodeBlock(scene, palette, …)`, which ignored the stage's direction; `s.cardPicture`, `s.codePicture` |
| A stage or diagram verb that animates | an action, `Action<T>`: what `s.card`, `s.focus`, `d.walk` and the rest return | An animation that is also a promise of what the verb gives: awaited it plays itself, handed to `play()`, a `Succession` or a group it plays there. It plays once ([actions](REFERENCE.md#actions)) | A `Promise` that played at once; `s.focus`'s `with` option for animations in the same play |
| Identity | `key`, `find(key)`, `findAll(match)` | How a part is addressed and kept across morphs: the same key in two pictures is the same part | `Mobject.id`, now internal: the renderer's number |
| What a part is for | `role` | A job many parts can share: the stage's `'backdrop'`, `'heading'` and `'chrome'`, a diagram's `'frame'`. Copies carry it; it is never an identity | Keys starting `__` (`__chrome`, `__heading`, `__paper`, `__frame`), which made a key double as a role and needed an exception in the one-key-one-part check |
| A part's own parts | `key:part` under a keyed picture (a tile's `key:box` and `key:label`), `d.shapes(id)` and `d.labels(id)` for a diagram part | How a scene reaches inside a kit picture or a diagram part: by key or accessor, never by child index | `children[i]` reaches into a tile, a callout, a marker or a diagram part |
| The colours to draw with | `s.look` (`Look`) | paper, ink, soft, emphasis, good, bad, raised, rule and muted, each reading on the stage's paper; a colour name means one colour everywhere, so `d.emphasis` and `scene.colors.emphasis` are the look's | `s.emphasis`, `s.soft`, `s.good`, `s.bad`, `s.raised`, `s.rule`, `s.palette` read for drawing, local `{ ...s.palette, soft, emphasis }` bundles; `accent` for the derived emphasis colour (`SceneColors.accent`, `d.accent`) |
| A named style's colours | `Palette`, `palette(name)` | The input a stage or diagram is styled from: `paper`, `ink`, the style's own `accent` and `muted`. Drawing code reads the look, not the palette | |
| The stage's paper rectangle | `s.backdrop`, role `'backdrop'` | The rectangle the stage is drawn on; "paper" names only its colour, `s.look.paper` | `s.paper`, role `'paper'` |
| Where a picture stands | `at` | The one placement word in the drawing kit: a point (a label's, a tile's, a legend's first entry), or the anchor a layout is shifted to (a flow's row, bars, a table's header row). What a picture measures or points at (a callout's target, a dimension's ends, a pin's point) is positional content, not placement | Positional `(x, y)`, the `y` and `xs` options |
| Text size | `size` | The text size in the drawing kit's options, the stage's annotations and notes, a legend and a diagram's notes; the engine's `Text` keeps `fontSize`, as in Manim | A positional size in `label` |
| A legend's layout | `stack: 'column' \| 'row'` | Entries stacked or side by side | `direction`, which means left-to-right or right-to-left on the stage and a card |
| Matching by key | `matchByKey()`, `match: 'key'` | Keyed parts pair with keyed parts; a view's `sync()` matches this way, staged, unless told otherwise | `match: 'keys'` |
| Enlarging diagram artwork | `d.enlarge(ids \| 'all')` | The diagram's parts scaled up inside its own box; the camera does not move (`s.focus` moves it) | `d.focus` |
| Event-driven model | `Machine`, `machinesOf(scene)` | `start`, `events`, `next`, `views`; `send`, `replay` | `Session`, `sessionsOf`; describe's `sessions` field (now `machines`) |
| Refused event | `next` returns `refuse(reason)`, the reason in the reader's words (`undefined` refuses with none) | Which buttons a reader cannot press in a state, and why; one function, so the buttons, their reasons and the model cannot disagree | A refused event returning the same state; `why(state, event)`, a reason in a function of its own |
| Where the story stops | `bound(state, event)` | An event the model would take but the explainer's story does not reach; the player says so instead of calling it refused | |
| Live step | the step a machine last played in (`lastPlayedIn`) | Where the player gives the reader a button per event, and where `rayner check` explores the machine | |
| A step's moments | the **still frame** (`stillFrame(step)`), the **hold** (`hold`, `holdFrame`), **rest** (the step's end: `t1`, `frame1`, the trace's `after`) | The still frame is where a step's picture stops changing: where its caption hold begins, else its last frame; the player, playing one step, stops there, while a continuous render plays on through the hold to `t1`. The hold is the caption's reading time, from `holdFrame` to `frame1`, which repeats the still frame's picture. Rest is the step as it ends, after its end listeners, its hold and any code after its last play: its **resting picture** is the one a link shows (`frame1`), the trace records its state as `after`, and a live step's reader starts from it (`LiveRun.rest`, `LogStart`'s `'rest'`), as `rayner check` explores from it. The still frame and rest show one picture, since check fails a picture that changes during the hold or after the last frame; only rest names a state, which code after the last play can still change | `restFrame`; a live run that stopped at the still frame; "timed playback"; "a live Step" for a step still running (a **running** `Step`, whose `frame1` is null; an `EndedStep` has one) |
| What the scene is doing | `scene.phase` (`ScenePhase`) | `idle`, `playing`, `waiting`, `ending-step`, `beginning-step` or `stopped`: the engine's lifecycle, never a story phase, which a scene keeps in `shown` (`shown.phase`) | `scene.stopped` |
| How a diagram is shown | `d.presentation` (`DiagramPresentation`) | `detached`, `live` (its own parts on the stage, which reveal, enlarge and morph move) or `viewed` (a view draws it); `live` here is not a live step | `d.shownBy`, the stage's map of diagram views |
| The reader's events | `sent` | The events a reader sent at a live step, in the URL beside `step` | |
| Authored transition | `transition: { [event]: (t) => Animation }` | The motion for an event, built from `{ event, before, after, target, choreograph }` when its turn comes; the views then land in place on the pictures of `after` | Hand animation in ring-buffer and state-machine |
| Authored transition parts | `t.choreograph(view)`: `morph`, `enter`, `leave`, `insert`, `own`, `follow`, `travel`, `rest`; `from`, `to`, `has` and `keys` read the two pictures | One event's motion, part by part, by key ([the calls](MACHINES.md#refused-events-bounds-and-authored-transitions)) | |
| A sampled value | `view.tween((t) => state)`; `c.follow({ from, to, draw }, { targets })` in a transition | A state, or one number, sampled between two ends and redrawn with `become` | |
| Taking another's data in place | `become(other)` | Keeps identity and keys; refuses to drop a keyed child | |
| Pen animation | `stage.sketch(m)` | Draw `m` stroke by stroke with a pen or pencil | `stage.draw(m)` |
| 2D camera | `Frame`, `scene.frame` | The box of the scene that is on screen | |
| 3D picture | `seenFrom(model, viewpoint)`, `depthOrder(picture)` in `rayner/geo` | Draws a 3D model through a viewpoint, `{ kind, yaw, pitch }`, as keyed 2D pieces in an explicit depth order (far, body, near). The viewpoint is ordinary state turned by a view's tween; Mercator and gnomonic maps are viewpoint kinds of the same model. Used by great-circle and henge. Not an engine type | |
| Frame-level check | `addInvariant`, `InvariantSink` | A predicate checked on every frame; returns `true` when it held | Calling invariants "claims" |
| Prose check | `meta.claims` | A sentence backed by a named test | |
| Review subjects | `scene.review.json`'s `subjects` | What a caption names, for the reader review to find on screen | that file's `claims` |
| Records | trace, evidence, receipt | What each step showed, what an animation decided, what a build produced ([defined in the engine map](ENGINE.md#correctness-by-construction)) | |
| Words for a picture | `describe` | The same word on the stage (`describe` on `s.keep` and `s.enter`), on a card, code panel and `Diagram` (`describe()` returns a `Description`), on a staged step (`describe(state)`), in `describeExplainer` and `rayner describe` | `Scene.describe()` for the state's JSON: it is `stateJson()` |
| Tables | `table(s, headers, rows, { key })`, rows `{ key, cells }` | The drawing kit's `table()`, with keyed cells: `key:row:column`, each row `key:row`, the header row `key:head`. A row's own `key` (or its index) is its identity, so a moved row is the same part; a duplicated row key or header is refused. Adopted by python-dict (entries keyed `e0`, `e1`, ...) and bloom-filter (lookups keyed by name, sample rows by row length) | A second table primitive |
| Graphs | `Diagram` | Captured from Mermaid; `walk`, `morph` and `picture` (its marks, notes and dimming, drawn from state) | A separate `Graph` type |

"Frame" still means two things: the 2D camera and an instant of a run. Manim has the same
overlap (`camera.frame` and frame rate), and context separates them. The step-list meaning is
gone.

## Decisions

A Domain-Driven Design reading found five vocabularies leaking into each other: the engine
(Manim's words, kept on purpose), the explanation (step, caption, stage, scenario), verification
(invariant, claim, trace, evidence), the reader's controls, and each explainer's own domain.
`draw(state)` is where an explainer's domain becomes pictures, which is why it has one name
everywhere. The review settled these:

- One word for a combination of settings, `scenario`, in code, reports and docs. `case` was
  tried first, but it is reserved in JavaScript, so a single one could not be named `case` in code.
- The model apart from what is shown. `scene.state` holds only the model, and `scene.shown` holds
  which picture a phase shows and the stage's description of its picture. A machine plays under
  one `shown`, and exploration draws its states under it.
- A step kind, `kind: 'short' | 'main' | 'detail'`, instead of the flags `reader: true` and `detail: true`.
- Subjects, not claims, in review. `scene.review.json` declares `subjects`, the CLI flag is
  `--subjects`, and "claim" means only `meta.claims`.
- One identity. `key` is a part's identity; `Mobject.id` is internal and left out of the
  published types.
- `seenFrom`, not `projected`. "Projection" is the CQRS word for a picture derived from state,
  so the 3D function is named for what it does.

The renames came with refactors that make a name's promise checkable:

- Staged steps are views of state. `stage.steps` draws each step's picture as a view of its
  state, and `rayner check` holds it to its draw as it holds every view: it fails one whose
  picture differs from a fresh draw at its step's end, or is the same whatever state it is drawn from. Constants computed once
  per scenario, such as henge's model, pass: they are the same in both runs.
- Refusal lives in `next`. There is no separate `allows`, since two functions could disagree about
  which events a state accepts.
- A transition lands on the model's picture. It is optional per event; with one, the authored
  motion plays and the views then land in place on `draw(after)`, and `rayner check` fails a
  transition that ends anywhere else.
- Keyed tables went in with python-dict as their first adopter, and bloom-filter is the second: its lookup rows are keyed by the name looked up and its sample rows by row length, so `bloom-pipeline:wolf:Filter` is wolf's answer in either scenario, and `scenes/explainers/bloom-filter/scene.test.ts` reads each keyed cell against the model. Its resting and sampled frames hashed the same before and after. `seenFrom` went in with
  great-circle; henge is the second adopter. Henge's flat cross-section globes could not move to
  it unchanged, since they drew Earth's axis across an opaque disc and `seenFrom` hides what the
  body hides. They were replaced instead: two tilted 3D Earths with a translucent body, the axis
  dashed inside it (`hidden: 'dashed'`) and solid where it stands out of each pole (`'behind'`).
  Henge also draws New York's sky as a sphere, from outside (the dome) and from its centre (the
  street, gnomonic), and turns the year with a view's tween over the orbital longitude.

## Names deliberately kept

- `Frame`, because Manim authors know `camera.frame`.
- `become` and `Transform`: animations named as verbs follow Manim's
  convention.
- `keep`, `enter`, `focus`, `carry` and `opening`: stage verbs read well at their call sites.
- `note` for a few words of secondary text, on the stage (`s.note`) and beside a diagram's part (`d.notePicture`, a picture's `notes`): in both a note comments on the picture rather than labelling it, and its owner says where it stands.
- `describe`: words for what is shown, on the stage, on a part and in `rayner describe`. What a scene returns as JSON for its trace is named for what it is: `stateJson()` and `shownJson()`.
- trace, evidence and receipt: three different records, each answering a different question.
- Updaters (`addUpdater`). No explainer registers one, but the Lantern explainer teaches them as
  its counterexample, with claims backed by tests that use them. Under the fixed clock a scene
  with updaters is still deterministic: a seek computes every frame before it rather than
  skipping. They cost seek speed, not invariant 1.
- `GrowFromEdge` and `PulseAlongPath`. They are stock animation vocabulary with a documented
  recipe, and adopter counts are the wrong test for a stock animation.

`Indicate` and `Flash` were kept on the same grounds until 0.2.0, and cut then, with `MathTex`'s
alias `Math` ([the changelog lists what 0.2.0 removed](../CHANGELOG.md#removed-from-the-public-api)).
A mark that fades before the resting picture invites what the checks reject, and in a namespace
agents mostly write, such a name is worse than none. `Circumscribe` stays, because it can `keep`.

## Not chosen, and why

- `render` for state to picture. It already names the output pipeline: `renderAt`, `renderFrame`,
  `renderElements`, `renderText`.
- `picture` as the function's name. It is a noun and stays the name for the result;
  `picture(state)` reads as a lookup.
- Renaming `Frame` to `Camera`. It breaks a published, Manim-familiar name to free a word the 3D
  work does not need.
- `Camera` for the 3D eye. It would clash with `Frame`'s documentation ("the scene's camera").
  In Manim a camera renders the scene; here the viewpoint is state that a view draws, and it
  should sound like state. For the same reason `viewpoint` is not an engine type.
- `Model`, `Store` or `Actor` for the event-driven model. `Model` is already the plain functions.
  `Store` suggests a reducer with no explorable graph. `Actor` (XState) suggests concurrency and
  messages between machines. `Machine` says states and events, and it is the word issue #88 used.
- `Session` for the same thing. It clashes with the HTTP sessions in the state-machine explainer
  and with its general meaning on the web.
- A public animation that sets the state (`SetState`). Outside a machine it would do what assigning
  `this.state` before a sync does, a second way to do one thing. A machine's events change the state
  at their turns in its schedule with an animation of their own, which no entry point exports.
- `story()` for staged steps. The script is already the story; the steps are how the stage
  shows it.
- A separate `Graph` and a second `table`. Two names for nodes and edges, or for rows and
  columns, would split checks and helpers that should apply to both. `Diagram.fromGraph` was
  not needed either: git-branches and exgit draw their graphs with the kit, and `Diagram.morph`
  already handles graph edits.
- `stateView`, a readout of state keys, and `StateReadout`. A card without a panel (`card(s, rows, { panel: false })`) in a `view` does the same.
- `s.cardPicture` and `s.codePicture`, stage methods that built a picture without entering it. A
  picture a view draws comes from the drawing kit, as `callout(s, …)` does, and the stage verb
  enters it; one convention for both, and a constructor that skipped the stage's direction is gone.
- `focus` for a code panel's highlighted lines. It is the camera's word (`s.focus`); the lines
  are lit, as a card's row is.
- `view(build)`, a view not made from state. It cannot be checked against the state, so the
  `View` constructor takes `(scene, draw)` and every View keeps a `draw` the checks can call
  again.
- `events` → `commands`. Statecharts and XState, the explainers' own domain, say events, and a
  refused event never reaches the trace.
- `view` → `projection`, a transition's `follow` → `sweep` (its adopters, ring-buffer and
  token-bucket, and the choreography guide already used the name), and `evidence` → `decisions`
  (only checks read it).

Deferred: `{ cue }` for narration belongs with video export (issue #7). Lighting, shading and
depth of field for 3D: nothing the scripts argue needs them.
