# Changelog

## 0.2.0 (2026-11-06)

Rayner turns a tested TypeScript model into a step-through explanation a reader can drive, published as one portable HTML page. This is the first release meant for authors (0.1.0 and 0.1.1 were previews); it requires Node 24 or later, authoring targets Ubuntu and macOS, and diagram capture needs Chromium. Start with [the tutorial](docs/TUTORIAL.md); [the reference](docs/REFERENCE.md) covers the API and the command line, and [upstream](docs/UPSTREAM.md) records what changed from Ivar Vong's Lantern, which Rayner forks.

### Authoring explainers

- An explainer is three files: `script.md` states the intent for its author, `model.ts` expresses the system's constraints, and `scene.ts` explains the system, with a picture module for how a state looks.
- A script's intent header (`# question`, labelled lines such as **Answer** and **Checked against**, and `## Check yourself`) is read as the scene's metadata. [Reference](docs/REFERENCE.md#scene)
- The intent header is the one home of the title, answer, reader questions and what the model is checked against. A scene that declares them too is refused.
- The page shows what the model is checked against under Sources.
- `answerOf(this)` in `rayner/explain` reads the script's answer, so a caption that states it keeps no copy. `withIntent(Scene, scriptText)` in `rayner/testing` adopts a script for a test that runs a scene directly. `withIntent`, `loadProject` and the command adopt the intent afresh each time, from the metadata the scene declares, so a changed or removed line, or a removed header, is not kept.
- `meta.id` defaults to the scene's folder name (or its file's name when the file is not `scene.ts`).
- A `meta.id`, declared or taken from the folder, must be one path segment of lowercase letters, digits and `-`, and not a Windows device name (`con`, `nul`, `com1` and the rest), and step names must be unique ignoring case, so no page or share page is written outside its folder, over another, or where Windows cannot write it. The catalog and evidence validators hold an id to the same rule, so an id collection takes is one the site takes; a step named for a device keeps its query link instead of a share page.
- `demos:build` and `site:export` refuse two explainers whose page ids are equal ignoring case, and a scene whose `meta.id` is not its catalog id, so no page in a site is written over another. [Publishing](docs/PUBLISHING.md)
- `static meta` has a type, `ExplainerMeta` (with `PlayerMeta` for `meta.player`), exported from `rayner/explain`: `static meta = { … } satisfies ExplainerMeta`. Collection and `loadProject` refuse a meta key it does not name, and a `player` key `PlayerMeta` does not, naming the key and the keys it takes. Every explainer and tutorial scene declares its meta this way.
- `rayner check` fails a view whose draw never depends on its state (or on what is shown) at any step that shows it. [Checks](docs/REFERENCE.md#checks)
- `emphasised(m, what)` in `rayner/drawing` marks a part as emphasis where it is drawn, so the close-up tour and the descriptions find it in the picture; a diagram's picture reports its own marks the same way.
- `s.diagramView(d, draw)` shows a diagram by a view of the state (its marks, notes and dimming, as `d.picture` takes them); `s.liveDiagram(d)` hands back for a morph, reveal or enlargement. `d.trail(hops)` gives a walk's trail as marks. mr-cache is converted.
- `d.presentation` says how a diagram is on the stage, a `DiagramPresentation`: `detached`, `live` (with the view `s.liveDiagram` took it out of, or null), or `viewed` with its view. `s.diagramView`, `d.showBy`, `s.liveDiagram`, `d.hide` and `s.clear` set it. A reveal, enlargement or morph of a viewed diagram throws "call `s.liveDiagram(d)` first", where it used to bring the live parts back beside the view, with every key on stage twice. `d.showBy(view)` takes the live diagram off the stage itself. `d.hide()` and `s.clear()` leave the diagram detached, with no view, no notes and no enlargement. `d.root` is read-only; a scene may take the root or the view off the stage itself, and a root put back on the stage while a view shows the diagram, or a replaced view put back beside the live diagram, is refused as the stage next describes it, as a step ends or begins (`this.step():`), since each key would be drawn twice. [Diagrams](docs/REFERENCE.md#diagrams)
- `stage()` runs once per scene; a second call throws instead of adding a second backdrop, heading and step listeners. Options are typed, and a call checks at run time only the values a type cannot hold to its range: `stage()` checks the palette's four hex colours and its heading size, and `card()` and `code()` (and `s.card`, `s.code`) refuse a `size` or `width` that is not a finite number above 0; none refuses an unknown key, which TypeScript refuses. A `stage()` that refuses its options leaves the scene without a stage, with no listener or mobject added, so a retry registers its listeners once. A stage with no style or palette adopts only the first diagram's palette, as documented; a later diagram in another style no longer recolours the backdrop and heading. The stage reads the camera from `this.frame`, so a callout, sketch or heading after a camera move the scene made itself is sized for that camera. [Stage](docs/REFERENCE.md#stage)
- A view's sync and tween finish the morph they drive, so it ends finished, as an animation the scene begins does.
- `view.tween` takes the picture on screen when it begins, so in `new Succession([view.sync(), view.tween(f)])` it draws into the picture the sync swapped in rather than the one it replaced. [Views](docs/VIEWS.md)
- A picture is never changed in place. Cards, code panels and diagrams that change are drawn by views from the state (the model) and `scene.shown` (how it is shown), and synced by key. Removed: `Diagram.mark`, `unmark`, `dim`, `note`, `clearNotes` and `walk`'s `trail`; `Card.set` and `mark`; `CodeBlock.focus`, `morph` and `clearMarks`; `s.emphasise`; and the engine's `StateReadout`. [Card and CodeBlock](docs/REFERENCE.md#card-and-codeblock), [views](docs/VIEWS.md#cards-code-annotations-and-notes-from-state)
- Cards and code panels take their marks as options: `lit: { row, as }` on a card, `lit: { lines, as }` and `added` on a code panel; `width` and `fitHeight` keep a panel's size; `key` keys their parts, so a sync keeps what stays, fades a changed value or line across and moves the bar. A code line is keyed by its text, so a line that moves pairs with itself. `panel: false` gives a card with no panel, which is how a readout of state is drawn. A card or panel carries its bar from the start, so a view or staged step draws the mark from state, described and emphasised.
- A keyed card keys each row's label by the row's place (`key:row:i`), so a repeated label keys every row once.
- The word for what a mark says is `as` everywhere: a card's and a code panel's `lit`, a diagram mark's `{ color, as }`, and `emphasised(m, as)`. A code panel's highlighted lines are lit, so `focus` means only the camera.
- What is shown may change between a machine's events (a guided tour moving a code panel's lit line); exploration and the live player draw under what the machine last played under.
- The phone's close-ups count a mark redrawn at the same keyed place with the same words as the same emphasis, not new.
- Views, `Machine` and choreography moved from `src/` to `explain/` and are imported from `rayner/explain`; `src/` is the engine taken from Lantern.
- Two opt-in entry points: `rayner/geo` (`seenFrom` and the globe, out of `rayner/drawing`) and `rayner/extras` (`Write`, `TransformFromCopy`, `Restore`, `MoveAlongPath`, `ArcBetweenPoints`, `Square`, `Underline`, out of `rayner`).
- `view.tween((t) => state)` moves the state through time and redraws the view at every frame; `c.follow(spec, { targets })` does the same for parts of an authored transition. `Follow` is no longer exported.
- [Changing what is shown](docs/VIEWS.md#changing-what-is-shown) says which way to change the state for which job: assignment and sync, a machine, `s.steps`, a tween or an authored transition.
- Every folder in `scenes/explainers/` now holds its own `script.md`, `scene.ts`, `model.ts` (where it has a model) and `picture.ts` (where its drawing is worth separating).
- Models and pictures moved out of `scenes/explainers/lib/`, which keeps only the shared `format.ts` and `pbt.ts`. `notes.md` files are folded into the script, the model and the picture module.
- An explainer is a `Scene` subclass with named steps. Each step has a title, a short `line` drawn under it on the picture and a caption under the stage, and holds until the caption could be read.
- `static settings` declares the reader's choices, and every scenario (one value for every setting) is built ahead of time. [Settings](docs/REFERENCE.md#settings)
- A step's `kind: 'short' | 'main' | 'detail'` puts it on the reader's short path, in the story, or under Details and sources.
- A step's `title`, `line` and `kind` are declared on `StepMeta` by `rayner/explain`, which exports `StepKind`, and collection refuses a title or line that is not a string or a kind that is not short, main or detail, naming the step. The engine types and reads only a step's `caption`, for its reading hold.
- `scene.state` holds the model as plain JSON and `scene.shown` holds what is shown apart from it. The trace records both at every step.
- `describe` means words for what is shown wherever it appears. A scene returns its state and what is shown as JSON with `scene.stateJson()` and `scene.shownJson()`, and a helper adds its own JSON to them with `scene.addJson(part, into)`. A card's, code panel's and diagram's `describe()` returns a `Description` (`{ what, parts, blank? }`), exported from `rayner/explain` with `DescriptionPart`.
- A helper's `addJson` part never replaces a key: one the state, what is shown or another part already has with another value throws when the JSON is read. `walks` in the state and `picture` in what is shown are the helpers' keys.
- JSON values are compared and deduplicated with their keys sorted, so a state built in another key order is the same state: to the watched changes, to describe's changed keys, to a machine's reachable states and the state its event was built for, to the live player and to Copy link.
- A scene declares the types of its model and of what is shown, `class X extends Scene<Model, Shown>`, and `this.state`, `this.shown`, a view's draw (`view(this, (st, sh) => …)`), `s.diagramView`'s draw, machines and `view.tween` are typed from them. Every explainer, tutorial scene and recipe declares its types, and none casts its state. Untyped, both are JSON records. [Typed state](docs/REFERENCE.md#typed-state-and-shown)
- `having(state, ...keys)` in `rayner/explain` narrows a state that changes shape by phase, or an optional part of what is shown, to the shapes that hold those keys, and throws on a state of another shape, which `rayner check` counts as a draw reading its state.
- Functions, class instances, cycles and non-finite numbers in `scene.state` or `scene.shown` are refused with a field path.
- `meta.answer` is the explanation's one-sentence answer, which some step must state. `meta.questions` are the reader questions the player asks after the last step: the script's `## Check yourself` list. `describeExplainer` and `rayner describe` give them as `questions`, and `answers.ts` computes their answers as `questions`.
- `meta.watch` names the state a reader should follow, and the player shows each step's changes to it ("Tokens left: 5 → 0").
- A watched number is written by the repository's own table for the scene's description language (English for a language with no description words), not by the engine's `Intl`, so the transcript the command writes and the page agree; French descriptions write their numbers the same way. [Locale](docs/ENGINE.md#locale)
- `rayner init` writes the tutorial's LRU/MRU explainer with its script, model and model test. [Tutorial](docs/TUTORIAL.md#2-generate-the-explainer)
- `rayner init --machine` writes a machine explainer (a door that locks): a model that refuses with reasons, its test, a live step and review subjects. It passes `check` and `review` as written.
- `stage(this)` adds the paper, a heading that follows each step, and helpers for diagrams, cards, code panels, notes, dimensions, pins, callouts and the camera. [Stage](docs/REFERENCE.md#stage)
- A stage region is named (`at: 'main'`) or given as a box with `regionBox('side', { top: 3.05 })`, which returns the region's box with any edge moved. The `REGIONS` table is not exported. [Regions](docs/REFERENCE.md#regions)
- `s.steps([...])` presents a list of steps, each drawn by `draw(state, s)` from its own state and typed by it, so one list holds steps whose states differ.
- `s.sketch` draws a path stroke by stroke with a pen or pencil.
- The collection's explainers use only what the package exports, and a test fails any scene that imports anything else, so an outside author can write what they write.
- The drawing kit's `card(s, rows, opts)` and `code(s, lines, opts)` build a card or code panel for a view's draw, in the stage's colours and placed as the stage places it: `at: 'start' | 'end'` and a card's field order follow the stage's direction (`s.direction`). `s.card` and `s.code` build with them and enter the panel. [Card and CodeBlock](docs/REFERENCE.md#card-and-codeblock)
- `s.look` holds the colours a scene draws with, each reading on the stage's paper: `paper`, `ink`, `soft`, `emphasis`, `good`, `bad`, `raised` and `rule` (the panel colours) and `muted`. A palette (`palette(name)`, the `Palette` type) is the named style a stage is built from, not what a scene draws with. `lerpColor` mixes two colours. [Colours](docs/REFERENCE.md#colours)
- A colour name means one colour: the emphasis colour is `emphasis` in `s.look`, in `scene.colors` and on a diagram (`d.emphasis`).
- `s.backdrop` is the rectangle the stage is drawn on; "paper" names only its colour.
- `diagramResolverOf(scene)` returns the scene's diagram resolver, whose `diagram(spec)` lays out a diagram, so `new Diagram(...)` can be measured before anything is drawn.
- A picture that should follow the model is a `view(scene, draw)`, and `view.sync()` morphs it to the current state. [Views](docs/VIEWS.md#api)
- `view.sync()` matches parts by key and stages the change by default: what goes fades out before what comes fades in. `staged` defaults to `true` for every `match`; `staged: false` fades both at once. A key sync whose pictures carry no keys is refused with the fix: key the parts, or say `match: 'text'`, `'shapes'` or `'index'`. [Views](docs/VIEWS.md#match)
- Parts with the same `key` are the same part across morphs (`matchByKey`, `match: 'key'`), and `find(key)` and `findAll` address them. [Matching](docs/MATCHING.md#which-key)
- A scene changes its state by assigning `this.state` and syncing its views; several model steps in a row are a loop of assignments and plays. `SetState` is not exported: a machine's events change the state at their turns in its schedule. [Changing what is shown](docs/VIEWS.md#changing-what-is-shown)
- `become` takes another mobject's data in place, keeping its identity.
- A mobject's family is a tree: `add` refuses the mobject itself or one of its ancestors, and `remove` takes out only its own children, leaving a mobject in another group where it is.
- `GrowFromEdge` grows bars and `PulseAlongPath` sends tokens along routes.
- Mermaid diagrams in all 15 Agentic Mermaid families are captured at build time and animated by part id with `reveal`, `walk`, `enlarge` and `morph`; their marks, notes and dimming are drawn from state by `d.picture`. [Diagrams](docs/REFERENCE.md#diagrams)
- `d.enlarge(ids, { zoom })` enlarges parts of a diagram inside its own box, and `d.enlarge('all')` puts the artwork back; it was `d.focus`, a word the camera's `s.focus` also uses.
- The stage's verbs that animate (`s.show`, `s.card`, `s.code`, `s.note`, `s.enter`, `s.clear`, `s.clearOverlays`, `s.focus`, `s.carry`, `s.sketch` and `s.callout`), a diagram's `reveal`, `walk`, `enlarge`, `morph` and `hide`, a view's `sync` and `tween`, and a machine's `send` and `replay` return an action (`Action<T>`): awaited, it plays itself, one play per beat; handed to `play()`, a `Succession` or a group, it plays there, so `this.play(s.focus(box), d.walk(hops))` moves the camera while a token travels. Its `value` is the card, panel or diagram it gives. An action plays once, and a step that ends with an action made in it and never played fails. [Actions](docs/REFERENCE.md#actions)
- A morph can carry its edits (`ops`), which the build replays through Agentic Mermaid and checks against the target source.
- `mermaid.pie(slices, options)` and `mermaid.frontMatter(config)` in `rayner/explain` build Mermaid source from typed values.
- `mermaid.pie` and `mermaid.frontMatter` refuse a zero or negative slice, a repeated label, an empty title or an empty config at the call, naming the value.
- A colour left out is the scene's: `scene.colors` (paper, ink, soft, emphasis, bad), which a stage sets from its look. Without a stage a scene draws dark ink on white paper.
- Text, lines, arrows and axes drawn without a colour take the ink, guide lines the soft colour, `SurroundingRectangle`, `Circumscribe` and plotted data the emphasis colour, and `Cross` the colour for rejected.
- Those defaults were Manim's white, yellow and red, made for a black background; the scene's colours read on any paper.
- The SVG sinks' background is the scene's paper. It was `#1a1a1a`.
- `Mobject.role` says what a part is for, apart from its identity.
- The stage's backdrop, heading and chrome have the roles `'backdrop'`, `'heading'` and `'chrome'` instead of the keys `__paper`, `__heading` and `__chrome`.
- A diagram's frame has the role `'frame'` and a key of its own diagram's instead of `__frame`, so two diagrams on one stage have two frames and a diagram picture's `prefix` covers every key.
- `rayner check` holds every key to one part, with no exception.
- `callout`, `dimension`, `pin` and `legend` in `rayner/drawing` build the annotations, for a draw to build from state or for `s.enter`; `s.callout` builds a callout with the same function from the points the camera shows, so it keeps its size on screen while the camera is away, and draws it in.
- `pin` takes `side: 'left'` to put its label left of the head.
- `legend(s, items, { key })` in `rayner/drawing` draws a key of swatches (fill, line, outline, dashed or not) with their meanings, keyed, in the stage's ink, stacked in a column or a row (`stack`).
- A legend describes itself as its colour→meaning pairs, naming each colour.
- `rayner check` fails a step whose caption or line names a colour or a pattern (dashed, dotted) that no word on the stage says, so a resting picture teaches with its caption hidden.
- A legend, a label or a line that keys the look (`Red: the route.`) answers that check.
- `d.picture(marks, { notes, dim, prefix })` draws a diagram's notes and dimming from state and prefixes its keys, so two pictures of one diagram can share the stage.
- `d.notePicture` builds one note, placed as a diagram picture places its notes, for a view's draw.
- A diagram shown by its picture is described as the picture shows it, with marks named by `{ color, as }`, notes and dimming.
- A card, a code panel, a diagram note, a dimension line or a pin describes itself wherever it is drawn, including a view's current picture and a staged step. A `describe` speaks for the rest.
- A staged step's `describe(state)` says what its picture shows when its meaning is geometry rather than labels.
- Text is drawn as outlines of the embedded Inter and JetBrains Mono.
- Through snapshots committed beside the scene, an explainer can ask for Greek, Cyrillic, Latin Extended, Arabic, Devanagari, Hebrew and Chinese. [Lettering](docs/LETTERING.md#supported-requests)
- An explainer can also ask for other OFL or Apache-2.0 faces, real bold and italic, and TeX maths with `MathTex`. [Lettering](docs/REFERENCE.md#lettering-on-request)
- The player's own words and the generated picture descriptions exist in English and French.
- A step can carry a short score that the reader plays with Web Audio, with a playhead over the drawn notes. Pages without audio leave that code out. [Score audio](docs/REFERENCE.md#optional-score-audio)

### Models and machines

- `end(state)` on a machine says where its story ends. From a finished state the model's moves are past the story and its refusals stay refusals, so a live step that ends finished starts the reader from `start`.
- `s.opening(...subjects, { keep: true })` names a phone opening once for every later step.
- `rayner init` starters may import `rayner/drawing`.
- Every value on screen comes from a model the scene imports, and the model's tests compare it with the real thing.
- The collection's models are compared with CPython, Git, rustc, Go's rate limiter, XState, ERFA, Python's `unicodedata` and others, against frozen answers, so the tests run without those tools installed.
- A `Machine` drives a model with events. Its spec gives `start`, `events`, `next(state, event)`, `bound`, button `labels` and the views drawn from the state. [Machines](docs/MACHINES.md#making-one)
- A machine refuses an empty event name or one with a comma, which a shared link, joining the reader's events with commas, would split. One validator (`isIdentifier` in `explain/settings.ts`) holds the names a link carries or a file is named by: events, `meta.id` and the step names that get share pages.
- A machine is identified across runs by its events in order, its start and its views' keys, not by its place alone: the live player refuses a run to the live step that made a different machine there (`runLive():`), and `rayner check` explores on that same run. The build ships each live machine's place and identity with the page, so its first run at a live step is held to the rule too.
- The live player and `rayner check` start a live step from one point, the step's end: after its end listeners, its caption hold and any code the scene runs after its last play, where the trace records the step's `after`. The reader's events start from that state, on the step's resting picture, and check explores the machine from the same run (`runLive` in `explain/live.ts`), so an end listener that plays, or a state set after the last play, reaches both alike. [The player](docs/MACHINES.md#the-player)
- The run to a live step (`runLive`, `liveSteps`, `LivePlace`, `logStart`, and `liveBase`, the one way the player and the tools find where a reader's log starts) is in `explain/live.ts`, which has no DOM, so the command's collection no longer imports the player; the run draws through a sink of its own, which skips frames until an event is animated, rather than writing the scene's sink and skip time.
- `next` returns `refuse(reason)` for an event the state refuses, the reason in the reader's words, or `undefined` for a refusal with no reason.
- `bound` says where the story stops though the model would go on.
- `replay` plays events as one schedule, which seeks and traces like any other play and records each event.
- `outcome(state, event)` says what an event does.
- `reachable(from)` lists every state reachable from a starting point, breadth first, with the shortest events that reach it.
- An event without authored motion morphs each view to the new state by key, staged, so a word and the word replacing it never overlap. [Default transition](docs/MACHINES.md#the-default-transition)
- A view's `sync()` stages its morph the same way by default, and the matching transforms' `staged` option stages one anywhere.
- An event can have authored motion: its `transition` is built from the states either side when its turn comes. The views then land on the model's picture of the new state.
- A transition may return an action that waits for what it reads, `s.show` of a diagram not laid out yet or `d.morph`: the play waits for it as its turn comes, before its next frame, and draws the frames an action that waited for nothing would.
- A view whose parts do not line up one to one by key when a transition lands (a part with no key, or a key two siblings share) is redrawn from the state, so no part is drawn twice.
- A transition's `t.choreograph(view)` morphs, brings in and takes out keyed parts in the author's order, landing whatever it does not name.
- Nine of the collection's explainers are machines: statecharts, ring-buffer, state-machine, token-bucket, monty-hall, latest-search, oauth-pkce, just-bash and python-dict. [Nine machines](docs/MACHINES.md#nine-machines)
- The statecharts machine covers both charts and is checked against XState's explored graph. python-dict's deletions and lookups are two machines on keyed tables.
- Invariants hold each machine's claims through every reachable state: the guarded search page never shows a stale result, and with PKCE the malicious app never gets a token.
- Every refusal says which rule refuses, from the model: "the host knows where the car is, and never opens its door".
- Each explainer folder holds its own evidence: `model.test.ts`, `scene.test.ts`, `fidelity.ts`, `oracle/` and `fixtures/`, named in its script's Checked against line; `npm test` runs `scenes/*/*/*.test.ts`. [An explainer's own evidence](docs/TESTING.md#an-explainers-own-evidence)

### The player and reader

- On a page at least 1100 px wide a live step's buttons sit at the top of the steps rail, beside the picture, so the reader presses an event and watches it without scrolling.
- On narrower pages a live step's buttons stay under the caption.
- The buttons' line reads "Try it yourself: carry on from this picture" or "Try it yourself, from the beginning" ("À vous de jouer…" in French).
- The transcript says "press" for an event, where it said "send".
- On a phone, a view row kept in place for another step's tour shows its view count instead of an empty gap.
- A hidden Try button is no longer painted or focusable.
- The notice for an unknown setting or option names it in the reader's words, in English as in French: “The setting “Speed” has no option “9”.”
- `build` writes one self-contained page per explainer: every scenario, a poster, a transcript, sources and licence notices.
- A built page makes no network requests, uses no storage, and must fit in 1.5 MiB of HTML and 450 KiB gzipped.
- The explainer is one tile: the title and scenario picker over the stage, then the stepper row, the step's words and the transcript. [The tile](docs/REFERENCE.md#the-tile)
- On pages at least 1100 px wide the tile has a steps rail beside it.
- The step bar counts teaching steps and names a step only once the reader has reached it, so a later "Answer: …" cannot give an earlier question away.
- Next stays in place however long the caption is.
- After the last step the player asks the reader questions, each answer behind a disclosure.
- At a live step, the step where a machine last played, the reader drives the machine: one button per event, then Undo and Reset. [The player](docs/MACHINES.md#the-player)
- An event the model refuses, or one past where the story stops, stays focusable with `aria-disabled` and says why.
- The events sit in the URL as `sent=`, so a link reopens the same picture, and Back takes an event back.
- A polite status line says what each event changed.
- Leaving a live step closes the run held for the reader's next press, and the player keeps the eight resting pictures it drew most recently, so a long exploration holds bounded memory. [The player](docs/MACHINES.md#the-player)
- A run held for the reader's next press names the step it ran to; the player takes it only at that step, and closes one that arrives for another step or another log.
- The page carries its default scenario's trace, so the player shows it without running the scene first; another scenario runs once, for its trace and its phone close-ups together. [Page](docs/REFERENCE.md#page)
- Every trace the player holds, shipped or run in the page, keeps of each step's state only the watched keys and no evidence (`PlayerTrace`), and the player's code can read that state only as watched changes.
- A scenario whose run throws in the page leaves the stage usable: the player keeps the scenario it had and says so.
- On a phone the stage is taller than 16:9.
- The stage's camera and the close-ups read one zoom, `zoomOf(box)` in `src/units.ts`, set by the tighter side of a box out of 16:9, so `s.focus(box, { exact: true })` with such a box keeps the heading where it is on screen.
- On a phone each step opens on a close-up of what it changed, or of the subjects `s.opening(...)` names, zoomed so its labels read at 12 px.
- Next view tours the step's other close-ups, starting with what the step newly emphasised.
- A page narrowed onto a phone width plans the close-ups for the stage's final size, so it offers the same views as a fresh load at that size.
- Pinch and drag zoom up to 6× and keep the drawing sharp.
- Arrow keys step from the moment the page loads. [Controls](docs/REFERENCE.md#controls-and-accessibility)
- The stage has a one-sentence description, and "What the picture shows" opens the full one.
- Under reduced motion a step crossfades to its resting picture.
- A loader embeds the page in an iframe that resizes to its content, and host and page exchange step and goto messages. [Embedding](docs/REFERENCE.md#embedding)
- An explainer can opt into checked palette colours, square corners and a minimum stage width.

### The scene's timeline

- One `play()`, `wait()` or `step()` runs at a time: one started while another runs throws, telling the author to await it, so two plays cannot interleave their frames and an unawaited step cannot record steps out of order. `scene.phase` (a `ScenePhase`) says what the scene is doing, `'stopped'` once a sink has stopped the run. A step listener may still play and wait inside its step. [Reference](docs/REFERENCE.md#scene)
- `scene.onStepEnd(listener)` runs as each step is about to end, before its caption hold. The unplayed-action check uses it instead of replacing `endCurrentStep`. A listener that returns with a play still running is refused under the call it was registered with, `this.onStep():` or `this.onStepEnd():`.
- The live player's run stops the scene as the live step ends, with the engine's own stop, instead of a subclass that wrapped `play` and `wait`. The stop's callback is held to the listener rule: one that returns with a play still running is refused, and that play counts no further frame. The scene is then stopped for good (`scene.phase` is `'stopped'`), a callback that throws included, so a `construct()` that catches the stop cannot run on.
- A sink may say which frames it skips (`Sink.skipUntil`), as the scene's `skipUntil` option does, and move it between plays; the scene skips a frame either asks to. These are skip time's only two writers: the player's runner and `renderFrame` skip through their sinks. Each must be a time in seconds, 0 or more, or `Infinity`: a negative option is refused as the scene is made, and a sink's `NaN`, negative time or non-number when a play or wait reads it (`sink.skipUntil:`).
- The stage keeps its heading, band, step number and line drawn last through the engine's top layer, instead of replacing the scene's `add`. A heading being replaced stays on top until it has faded out. The layer moves last the root that holds each kept part, so a group added later around one stays on top, and it raises them again before every frame and step boundary the scene hands its sink, and before a frame drawn outside the frame loop (`renderAt` and `renderFrame` past the end, the live player's landing frames), so a direct write to `scene.mobjects` is undone before anything is drawn.
- A step records its caption hold's frame, `holdFrame`, beside its time, `hold`, as it records `frame0` and `frame1` beside `t0` and `t1`; `stillFrame(step)` is where its picture stops changing. The player, the live player, `rayner check` and the tools read these frames instead of working them out from rounded times.
- `renderFrame(SceneClass, frame, sink)` in `rayner/output` draws one frame by its number, so `renderFrame(Scene, step.frame1, sink)` is a step's resting picture. The player, the build's poster, `rayner see`, the link-preview cards and `rayner check`'s seeks draw a step's frame this way, and the player finds where a step's play starts by its `frame0`, never by converting a frame to a time. [Scene outputs](docs/SCENE-OUTPUTS.md#time-and-step-semantics)
- `this.step(name, (before) => meta)` takes its metadata from a function of the step it closes, for words that report that step's timing (fork). Step metadata is copied as JSON when the step begins, and checked, in either form, once the step before has ended. The copy, `currentStep.meta`, is frozen deeply: a write to it throws the language's own `TypeError` instead of changing the recorded caption and its hold. A trace's `StepRecord.meta` is typed read-only, as it is frozen.
- `loadProject` and the `rayner` command refuse a step that draws no frame of its own, since it would show the step before's picture, and hold every scenario to the same step-name rules. The refusal names the call that collected the steps: `loadProject():`, or the scene's file for the command.
- Every step a trace records has ended, so a `StepRecord`'s `t1`, `frame1` and `after` are always there and typed so; a run stopped inside a step leaves that step out. Only the scene's own `Step` marks a step still running, with a null `t1` and `frame1`, and `stillFrame` of one is Infinity. An `EndedStep`, exported from `rayner`, is a step that has ended, its `t1` and `frame1` numbers: a sink's `stepEnd`, a step's metadata function and `traceRun`'s `AtRest` callback are given one.
- `scene.frame.zoom` is the zoom the stage shows the camera's box at, the tighter side of a box out of 16:9, as `rayner check` and the close-ups measure it.
- `rayner describe`, the contact sheet, the site's cards and the demos' posters draw every step's resting picture from one run of the scene instead of a seek per step.
- What begins later in a play is held to one writer per mobject as it begins, against everything else the play drives then: a `Succession`'s member at its turn, and what an action's beat or a machine's transition makes. An action's beat that fades in the circle a `FadeOut` beside it fades out is refused, as the same pair in one `play()` is.
- `rayner check` reads every step's resting picture as the step ends, as describe and the shots do; its landing check holds that picture to the step's last played frame.
- An animation has a `phase` (an `AnimationPhase`: idle, begun, landing or finished). `landing` is a `Succession` its play has finished while a member that waits still has to begin and land, or a group holding one; `finished` means landed, every member with it. A second `begin()` while begun, and `interpolate()` or `finish()` before `begin()`, throw; one animation listed twice in a play is refused, where it used to begin twice and leave its mobject invisible.
- A custom animation overrides the protected hooks `doBegin()`, `doInterpolate(alpha)` and `doFinish(alpha)`; `begin()`, `interpolate()` and `finish()` keep the phase around them for every caller, whether a hook is a method or a class field. An animation whose `begin`, `interpolate`, `finish` or `land` is not the engine's, that redefines `phase`, `runTime` or `lagRatio`, or that answers `waiting()` other than as the engine's groups do, is refused as it begins, in a play, in a group or at a `Succession`'s turn (one driven without a scene too), whether the override is a subclass method, a class field, an assignment, `Object.defineProperty`, a patched prototype or a swapped one; a subclass method is refused when its first instance is made. A protected hook called directly from plain JavaScript, and a call patched in mid-play, still skip the guard. [Fundamentals](docs/ENGINE-FUNDAMENTALS.md)
- `Mobject.invalidateBox()` is public: code that changes a mobject's points other than through the engine's methods (an animation's own `doInterpolate`, a custom mobject assigning new point arrays) calls it to clear the cached box, as the explainer layer's labels, panels and annotations do. [Fundamentals](docs/ENGINE-FUNDAMENTALS.md)
- A play that fails leaves no animation begun, whether it fails as it begins or later: a `Succession`'s member that throws at its turn, what a beat or a transition made whose read fails or that the one-writer check refuses, a frame or a sink that throws. It lands everything it began, finishing what had begun and beginning nothing more, so each animation can play again; a composed action is abandoned, its running beat landing with its `after` while no later beat is made and its `end` does not run. An action whose begin fails (its `start` or its first beat throwing) stays unplayed, so it can play again and its step names it if it never does. A group whose member throws as it begins lands the members it began, and so does a list begun at its turn in the play, what an action's beat or a machine's transition makes: the beat then runs no `after`. An abandoned action has played: awaited, awaiting it again gives the same failure; composed, a second play is refused.
- `fps` must be above 0 and at most 240; run times, lag ratios and `wait()` times must be finite and not negative, and an animation's `runTime` and `lagRatio` are checked whenever they are set and fixed while it plays. A `Succession`'s `lagRatio` is 1 and refuses another. A `play()` with no animation throws instead of drawing a frame.
- What begins at its turn in a play (a `Succession`'s member, what an action's beat or a machine's transition makes) begins in turn order whether or not something waits for what it reads, so the drawing order and the evidence no longer flip when one waits. An animation listed after one that waits, in a play, a group or a group inside a `Succession`, joins the stage and records its evidence after it too. A `Succession` begins nothing after a member that waits until it has begun, so a waiting beat shorter than a frame plays, held and then landed, instead of failing as if its play had ended.
- A `Succession` or group exposes its members' `ready()` and lays out their times as the play begins, so `s.show` composes inside a `Succession` or group. A `Succession` refuses a rate function that runs its time backwards.
- `DecimalNumber` blends its value only with another number: transformed into a `Text`, it ends as that text instead of `NaN`.
- `Scene.captionWpm` is read from the scene's own class, and a caption in a script written without spaces counts every one and a half letters as a word instead of the whole caption as one. `captionWords(caption)` in `rayner` is that count, for words that report a caption's length (fork's timing step). [Reference](docs/REFERENCE.md#scene)
- A frame with no updater on stage no longer builds a family list per top-level mobject.
- `indexScene` and `traceScene` read one dry run, and an index's steps are the scene's own `Step` records, evidence included, rather than copies of some of their fields.

### Checks

- `rayner check` runs every scenario and fails on motion that pops, cuts or teleports. [Checks](docs/REFERENCE.md#checks)
- `rayner check` fails a picture that changes after its caption's hold begins, and a direct link that draws differently from playing to the step.
- `rayner check` fails colliding text, connectors over labels, labels under 14 px on a 1280 px stage, and a kept drawing with no description.
- `rayner check` fails a character the fonts cannot draw, a declared answer no step states, and awaited animations inside `try`/`catch`.
- `rayner check`'s report draws each step's resting picture as text (`restingFrames`) as `describeExplainer` draws it (`drawing`): one drawing, without the heading that names the step.
- Each `s.steps` picture is a view of its step's state, so `rayner check` redraws it from the state its trace recorded, as it does every view, and fails a step whose picture differs or whose `draw` draws the same picture from any state; the separate staged-step check is gone.
- `rayner check` explores every machine on the stage where the machine last played, from its start and from the state the reader finds there. It explores inside the player's own run to that step, while the scene can still play, and plays each authored transition there as a reader's event plays it, in a play of its own (`machine.transitionPlay`): what the transition makes at its turn may wait for what it reads, as on the page, and every invariant is checked on every frame it draws. [What check does](docs/MACHINES.md#what-check-does-with-a-machine)
- Exploration fails a reachable state that collides, shows a small label, has no description, does not show its state or is described like another.
- `rayner check` plays every authored transition, checking the invariants on the way, and fails one that does not land on the model's picture.
- The review fails a live state whose changed labels read under 12 px on a phone in every view.
- `scene.addInvariant(name, check)` states what must hold on every frame, mid-animation included. `rayner check` fails the first frame that breaks it.
- `rayner check` fails an invariant that never held, since one that finds nothing to check has usually misspelt a key.
- `rayner review` builds the page and visits every resting step of every scenario at 390 and 1180 px in Chromium. [Reader review](docs/REFERENCE.md#reader-review)
- At each resting step the review checks the painted subjects, complete close-up tours, overflow, console errors and outside connections.
- `scene.review.json` declares subjects from the caption's meaning, and `--out page.html` saves the exact page the review checked.
- `meta.claims` links a sentence to a named `node:test` declaration and checks that the test exists; it does not run the test or establish what it asserts.
- `rayner check` seeks to each step's resting frame as well as two frames before it, and fails a step whose picture as it ends, after its last play has landed, differs from its resting frame. The caption-hold check compares each frame's memoised element strings instead of building an SVG document per frame.
- `rayner check` runs the `model.test.ts` beside the scene first and fails, naming each failing test; the report records `model: { file, tests, passed }`, and `skipped` when some were.
- An explainer's `answers.ts` computes its script's answer and its reader questions' answers from the model; `rayner check` fails when `script.md` says otherwise, and reports `answers: { file, compared }`.
- `rayner check` fails a path in backticks in the script's Checked against line that is not in the explainer's folder, and reports them as `checkedAgainst`.
- A claim's test is looked for in the scene's folder first, so `meta.claims` can name `model.test.ts: …`.

### Drawing kit and 3D

- `rayner/drawing` draws the parts explanations keep needing as ordinary keyed mobjects: `keyed`, `label`, `tile`, `segment`, `dot`, `table`, `stat`, `flow`, `bars`, and the card and code panel the stage enters, `card` and `code`. [Drawing kit](docs/REFERENCE.md#drawing-kit)
- Every kit function takes the stage first, its content next and one options object: `at` places the picture, `size` is its text size and `key` its address. `table`, `stat`, `flow`, `bars` and `legend` require a `key`, so two of one kind on a stage cannot collide. Kit text is made with the scene's shaping. The card and code panels take `size` as well; only the engine's `Text` and `Code` keep `fontSize`.
- A keyed kit picture keys its parts under its key (a tile's `key:box` and `key:label`, a callout's `key:line`, `key:dot` and `key:text`, a flow's arrows), and `d.shapes(id)` and `d.labels(id)` give a diagram part's own shapes and labels, so no scene reaches into a picture by child index.
- `table()` measures its columns and keys every part: the header row, each header, each row, each cell (`key:<row>:<header>`) and the rule.
- A `table()` row given as `{ key, cells }` keeps its identity wherever it moves, and a duplicated row key or header is refused by name. python-dict and bloom-filter key their rows.
- `seenFrom(model, viewpoint)` draws a 3D model on a sphere through an orthographic, perspective, gnomonic or Mercator viewpoint. [3D](docs/REFERENCE.md#3d-seenfrommodel-viewpoint)
- `seenFrom` draws keyed 2D pieces in an explicit depth order, and `depthOrder` is an invariant that checks that order on every frame.
- Each piece `seenFrom` draws records a `SeenPiece` (its part, layer and model lines), beside the `SeenPicture` the drawing records; `seenPictures(m)` finds the drawings.
- A camera move is a `view.tween` over the viewpoint. The great-circle explainer draws its globe and both maps from one model.
- A stage can run right to left (`direction: 'rtl'`): cards and logical regions mirror, and text keeps its own reading direction. [Spatial direction](docs/REFERENCE.md#spatial-direction)

### Tooling and publishing

- `test/layers.test.ts` reads the layer table in ENGINE.md's "Layers" section, so the doc places every `explain/` module and the test cannot drift from it. It holds the command to importing nothing repository-only, and lists the engine's `@internal` members the explainer layer, the player and the command use, with the files that use them and why, so a new use across the layers fails until it is listed. [Layers](docs/ENGINE.md#layers)
- `scene.lettering.json` stores its runs and font inputs in code-unit order, the site manifest and the live-site report sort their paths the same way, and `test/locale.test.ts` refuses `localeCompare`, `toLocale…` calls, Intl formatters and an Intl object made without its locale in anything Rayner writes. [Locale](docs/ENGINE.md#locale)
- Every public name is documented: `test/public-names.test.ts` fails when no guide in `docs/` names an exported value or type, a public member of an exported class or a stage member, and `node tools/repo/public-names.ts --docs` lists the surface. Only an options bag (`...Opts`, `...Options`) counts as documented by a documented signature that shows it; every other type is named in a guide. A member counts only in a section that also names its owner class, or written with its owner's receiver (`s.card`, `view.sync`). [Public names](docs/ENGINE.md#public-names)
- Every error an author can see starts with the call that failed (`card():`, `s.card():`, `new NumberLine():`, `meta.watch:`), says what is wrong in one sentence with no final full stop, ends with the fix when it is known, is a `TypeError` for a wrong type or shape and a `RangeError` for a value out of range, and names a mobject by its key, text or kind, never its internal id. What a machine's transition makes at its turn is named by the send, `machine.send("UP")`, and a part both script.md and the scene declare is refused under the script's path by the command and by `loadProject` alike. `test/error-messages.test.ts` holds the library and the player to it; the command's artifact readers name their call too (`catalog():`, `catalogEvidence():`, `sceneInputs():`). [Error messages](docs/ENGINE.md#error-messages)
- The `rayner` command initialises, previews (with `--watch`), captures snapshots, checks, reviews, builds, draws contact sheets and describes a scene. [Command line](docs/REFERENCE.md#command-line)
- `rayner describe` prints every scenario and step as JSON: the state, what changed, the invariants, the machines, and the picture in words and as text. [Describe](docs/REFERENCE.md#describe)
- `rayner see` prints one step for a person at a terminal, and `describeExplainer` gives a script the same object.
- `rayner/testing` loads an explainer for an author's test: `loadProject(Scene, folder)` adopts its script's intent, reads its pinned snapshots and traces every scenario; `loadSnapshots(folder)` reads the snapshots alone; `pictureWordsAt(trace, step)` gives a step's picture in words; and `diagramFindings(snapshot)` a pinned snapshot's verifier warnings. The collection's scene tests use them. [An explainer's test](docs/REFERENCE.md#an-explainers-test)
- `loadProject` draws a scene's lettering from the `scene.lettering.json` beside it, as its page does, and refuses lettering with no snapshot, or one pinned for another request, saying to run `rayner snapshots`. font-metrics' scene test uses it. Every `loadProject` takes its turn with the lettering, a scene with none included, so overlapping calls each trace their scenarios with their own faces (the embedded faces alone for a scene with none), and put back the faces in place before them. A selection whose faces cannot be decoded changes nothing, so the next run puts back the faces really in place rather than failing with that selection's error.
- Traces are typed from the scene class: `traceScene(Explainer)` returns a `TraceOf<typeof Explainer>`, whose states are `Jsonified<S>` of the scene's `Scene<S, Sh>`, and `loadProject`, `LoadedProject` and `LoadedScenario` carry the same types. `withSettings`, `bindSnapshots` and `bindLettering` return the class typed as the one they bind. latest-search declares the union of its staged and machine states, and its tests and several fidelity checks read state without casts. [Typed traces](docs/REFERENCE.md#typed-traces)
- `npm run site:export` publishes the built pages with their descriptions and `llms.txt`. [Publishing](docs/PUBLISHING.md#export-the-collection)
- The export adds a share page and preview image per step, Open Graph and Twitter tags, oEmbed responses, known embed heights and response headers.
- Each build writes a receipt of its inputs and a header recipe whose CSP pins the page's inline script and style.
- The exported `catalog.json` is version 2: its totals and each scene count `scenarios`, where version 1 counted `cases`. A host that renders the catalog reads the version and the new field.
- Snapshots are no longer keyed to hashes of Rayner's own code, so editing a scene or the engine no longer rewrites committed snapshots. [Snapshots](docs/REFERENCE.md#snapshots)
- A diagram snapshot is recaptured when its spec or the Agentic Mermaid release changes.
- A lettering snapshot is recaptured when it lacks a drawn run, or when its format or capture tool (shaper, requirements, vendored shapers, fallback fonts) changes.
- `test/snapshot-capture.test.ts` captures every committed snapshot afresh in CI and fails on any difference.
- `scene.snapshots/index.json` drops `sourceHash` and `importer`.
- The outline workflow's `scene.lettering.json` is version 3, without `sourceHash` or `payloadHash`, and stores each outline as path data (`"M0.5-0.25L…Z"`) where version 2 stored segment objects: committed snapshots are about 45% smaller, and font-metrics' page 12 KB smaller gzipped. The subset workflow's is still version 1.
- `inputs.json` beside a built page is version 3, without `engineHash` or `importer`, which its `buildHash` already covers.
- `npm run bench` compares reader timings between two revisions in Chromium and reports a small sample as inconclusive.
- The engine works without the page: [engine fundamentals](docs/ENGINE-FUNDAMENTALS.md), the runnable [extension recipes](docs/EXTENDING.md) and [scene outputs](docs/SCENE-OUTPUTS.md) cover frames, text and traces from native scenes.
- Repository-only tooling (site export, gallery, catalog, release, bench, CI scope, vendoring) moved to `tools/repo/`; no package ships it.
- The code's layers, from the engine up to the command, and what each may import are in [the engine map](docs/ENGINE.md#layers), with where the code departs from them; `test/layers.test.ts` holds the rules that hold.
- Rayner is two packages: `rayner`, the vocabulary and runtime, with no dependencies, and `rayner-cli`, the `rayner` command, at the same version. Install both. [Quick start](README.md#quick-start)
- `rayner-cli` holds the player, diagram capture and lettering capture (its Python, requirements, font script and maths typesetter); `rayner` keeps only what replays their snapshots.
- A release publishes and retains both archives; `npm run pack:smoke` installs both, and `rayner` alone, and type-checks every explainer and recipe against the packed declarations. [Releasing](docs/RELEASING.md)
- Every `rayner` command starts without loading the TypeScript compiler, which only the build fingerprint uses: `rayner version` takes about 0.3 s and 105 MB, where it took 0.7 s and 165 MB.
- `rayner check` keeps each scenario's motion samples in columns of numbers: seasons' check peaks near 470 MB, where it peaked near 800 MB, with the same motion findings.
- `rayner preview --watch` rebuilds when `script.md` changes too, and runs one rebuild at a time: saves made during a rebuild start one more when it ends, not one each. Each rebuild adopts the script afresh: a script that loses its intent header drops the title, answer, questions and checked-against line it gave.
- Diagram capture starts one Chromium per kind of diagram lettering however many diagrams wait for it, and closes each.
- A page whose scenarios make no diagram carries no diagram code (`rayner check` fails a diagram only a reader's event draws; each scene counts the diagrams made on it, so the decision reads only the scenes the project and its exploration ran): the build swaps `explain/diagrams.ts` for a stand-in `Diagram` alone, since the label helpers the player reads are in `explain/labels.ts`. Every page's style is minified: lru-mru's page is 203 KB gzipped, where it was 216 KB. [What a page leaves out](docs/ENGINE.md#what-a-page-leaves-out)
- The SVG writer writes a straight segment as `L`, where it wrote a cubic, in the poster and on the live stage alike: font-metrics' page is 16 KB smaller gzipped, lru-mru's 2.6 KB.
- No page ships the shaper's Brotli decoder: every page uses the SFNT faces, and the build converts a lettered page's WOFF2 cuts and subsets to SFNT. feature-tour's page is 259 KB gzipped, where it was 319 KB; font-metrics' 316 KB, where it was 390 KB. [Embedded browser fonts](docs/ENGINE.md#embedded-browser-fonts)
- `rayner check`'s bare runtime bundles the scene once per explainer, as the page bundles it (its SFNT faces and its diagram code), runs each scenario in a fresh context, and fails a trace whose steps differ in time, hold, state or what they show, or a last frame drawn differently; it compared only step names, the final state and that something was drawn.
- The frame, its home box and the SVG units come from `src/units.ts`, the page's query keys from `explain/page-query.ts`, and a scene's default id from `sceneIdOf`, where the stage, the player, the check and the host loader each wrote their own copy; a machine's landing lasts one of the scene's frames, not a fixed 1/30 s. [Layers](docs/ENGINE.md#layers)

### Removed from the public API

These 0.1.x exports had no explainer using them. [The engine map](docs/ENGINE.md#public-names) gives the rule.

- The vector helpers `add`, `sub`, `mul`, `dot`, `norm`, `normalize`, `lerp`, `rotate` and `angleOf` are internal. The `Vec` type stays.
- The nine direction constants (`ORIGIN`, `UP`, `DOWN`, `LEFT`, `RIGHT`, `UL`, `UR`, `DL`, `DR`) are gone: write the vector, `[0, -1]` for `DOWN`.
- The fourteen Manim colours (`WHITE`, `BLACK`, `GREY`, `GREY_D`, `BLUE`, `BLUE_D`, `TEAL`, `GREEN`, `YELLOW`, `GOLD`, `RED`, `MAROON`, `PURPLE`, `ORANGE`) are gone.
- In place of a Manim colour, colour from the stage's look (`s.look.emphasis`, `s.look.bad`) or write the hex value.
- `easeInQuad`, `easeOutQuad`, `easeOutBack` and `wiggle` are gone; any `(t) => number` is a rate function.
- `tokenize`, `diffTokens` and `hunkHeader` are internal; `diffLines` and `parseUnifiedDiff` still make hunks for `TransformDiff`.
- `Indicate` and `Flash` are gone: each mark had faded by the step's resting picture, and `rayner check` fails a step whose resting picture is the step before's.
- In place of `Indicate` and `Flash`, mark with `Circumscribe({ keep: true })` or the [emphasis shapes](docs/EMPHASIS.md).
- `MathTex`'s alias `Math` is gone, since it hid JavaScript's `Math`; import `MathTex`.
- `rayner` and `rayner/explain` are now the scene vocabulary only. A scene may not import `rayner/testing`.
- Drawing a scene's frames outside the page moved to `rayner/output`: `toSvgString`, `renderElements`, `renderText`, `renderAt`, `indexScene`, `stepTime` and `StopScene`.
- The sinks `StringSink`, `SnapshotSink`, `DomSink`, `SeekSink` and `NullSink` moved to `rayner/output`.
- Author tooling moved from `rayner` to `rayner/testing`: `traceScene`, `TraceSink`, `MotionSink`, `analyzeMotion`, `InvariantSink`, `viewMismatch`, `machinesOf`, `jsonObject`, `loadFonts`, `takeMissingGlyphs` and `perf`.
- `describeExplainer`, `scenariosOf`, `scenarioName`, `withSettings` and `bindSnapshots` moved from `rayner/explain` to `rayner/testing`.
- `edgePartOf` and `stagedStepsOf` are internal; use `d.findings()` and `d.link()`. `findingsOf` is `diagramFindings` in `rayner/testing`, for a pinned snapshot read without its diagram.
- `seenFrom` and `seenPictures` return `SeenDrawing`s, typed with the `seenPicture` each records and the `seen` each piece records, so a scene reads them without a cast.
- `resolveSettings` takes any `{ settings }`, so a scene can ask what a link would open without casting, and throws a `RangeError` for a value or a setting the scene does not take.
- `Card`, `CodeBlock`, `CardRow`, `CardOptions` and `CodeOptions` are exported from `rayner/drawing`, beside the `card` and `code` that make them, not from `rayner/explain`.
- `rayner/audio` is gone: `AudioClip`, `ScoreNote` and `StepAudio` are types, which carry no code, so `rayner/explain` exports them beside `StagedStep`, whose `audio` they type.
- `s.dimension`, `s.pin` and `s.legend` are gone: enter the kit's picture, `s.enter(pin(s, point, { label }))`. No explainer used them with the camera away from home, where they differed from the kit's.
- `s.card` and `s.code` take no `enter: false`: to bring several panels in in one fade, build them with the kit and enter them, `s.enter(card(s, rows), code(s, lines))`.
- `ViewSync` is internal: `view.sync()` returns an action. `View` is exported as a type only: `view(scene, draw)` makes one.
- The diagram camera move (`d.focus(ids, { camera: true, also })`) is gone: `s.focus` moves the camera.
- `s.focus`'s `with` option is gone: play the other animations in the same play, `this.play(s.focus(box), new FadeIn(m, { runTime: 0.9 }))`.
- The free `choreograph(current, target)` is not exported: a transition's `t.choreograph(view)` is the one form.
- `Card` and `CodeBlock` are exported as types only, and their constructors are internal: the drawing kit's `card(s, rows, opts)` and `code(s, lines, opts)` build them, in the stage's direction and regions, which `new Card(scene, palette, …)` ignored. `s.cardPicture` and `s.codePicture` are gone; a view's draw calls the kit.
- A card's `lit` and `litAs` are one option, `lit: { row, as }`; a code panel's `focus` and `focusAs` are `lit: { lines, as }`; `emphasised(m, what)` names its words `as`. The words a description and the phone read are unchanged.
- `Scene.clear()` is the internal `Scene.removeAll()`. A scene clears the stage with `s.clear()`, which fades.
- The package exports its entry points only. `rayner/internal/*`, which exposed every compiled module, is gone; `rayner-cli` reaches the library's compiled modules through a resolve hook of its own.
- `rayner/lettering` is gone: import the `LetteringRequest` type from `rayner`. Its functions, which only the build and a lettered page call, are internal.
- Class members that are implementation details are `private`, `protected` or `@internal`, and the published declarations leave the internal ones out:
  - `Mobject`'s caches and alignment (`_bbox`, `_pv`, `_mrec`, `_colors`, `mergeLeaves`, `touchPoints`, `interpolateData`, `alignData`, `alignFamily`, `matchingFrameFor`) are internal. Its subclass hooks `rebindReferences`, `copyData`, `afterPointsChanged`, `pushIntoChildren` and `nullCopy` are `protected`, as is `Animation.createStartingMobject`; `Animation.cleanUpFromScene` is internal.
  - `Scene`'s `sink`, `skipUntil`, `emitFrame`, `beginAnimations` and `hasUpdaters` are internal, and `current` is private: read `currentStep`.
  - `View`'s `placed`, `measure`, `commit`, `swap`, `build`, `builtSize` and `scaleK`, and `ViewSync`'s `inner` and `next`, are internal.
  - `Machine`'s `outcome`, `model`, `after`, `reachable`, `transitionFor`, `playedUnder` and `lastPlayedIn`, which `rayner check` and the player use, are internal, and its `scene` is private; a scene calls `send` and `replay`, and reads `spec`.
  - `Diagram`'s `spec`, `snapshot`, `parts`, `visible`, `order` and `emphasis` are read-only, `parts`, `visible` and `order` as a `ReadonlyMap`, `ReadonlySet` and `readonly string[]`; only the diagram's own calls change them. `View`'s `draw` is read-only and its `place` private.
  - `Diagram`'s `build`, `buildPlan`, `forget`, `showLive`, `described` and `frameBox` are internal; `s.show`'s `build` option builds a diagram in.
  - `Card` and `CodeBlock` keep their scene and colours private, `Card.panel` and `Card.bar` are readonly, as `CodeBlock`'s are, and `CodeBlock.marks` is a readonly list.
  - `Labeled`'s and `Axes`' child indexes are private: read `shape`, `label`, `xLabel` and `yLabel`.
  - The renderer's point buffers and path data (`pointArrays`, `boundingPointArrays`, `pathData`, `toPathD`, `roundedRelative`, `Text.frameBox`), a morph's alignment (`splitCurve`, `insertNCurves`, `zipFamilies`, `starting`, `slots`, `allMobjects`, `subAlpha`, `paints`, and `Transform`'s `ownsTarget`, `sameStructure` and `targetCopy`), `play()`'s `setOptions` and `ready`, `AnimationGroup`'s schedule, the animations' stored options, `Mobject.updaters`, `Text`'s cluster matching, `TransformMatching`'s plan and `DomSink`'s DOM plumbing are internal. `interpolateSubmobject` is `protected`.
  - `LetteringSnapshot`, `PackedLetteringSnapshot`, `StoredLetteringSnapshot` and `Outcome` are no longer exported.
  - Run-time state with no author purpose is internal: `Mobject.saved` (`restore()` and `Restore` read it), `Frame.corners` (read `box()`), `Text.run`, `Animation.families`, `MoveAlongPath.offset`, `Succession.active`, `TransformMatching.fadesIn` and `frames`, `DomSink.nodes`, `anchor` and `patch` (a `DomSink` with `realtime: false` draws every frame at once), `TraceSink.records` (read `steps()`) and `MotionSink.frames` and `labels` (hand the sink to `analyzeMotion`).
  - `analyzeMotion` names a leaf by its key, else its text, else its kind, inside the nearest keyed or lettered ancestor, never by the renderer's id.
  - A mobject's `children` is a read-only list and its `parent` is read-only. `add`, the new `insert(index, ...mobs)` and `replaceChild(old, ...replacements)`, and `remove` are the ways to change a family; each keeps every child's `parent` and the cached box in step and refuses a cycle, which pushing into `children` could make. Both are held outside the mobject, so no write to it changes them, and `family()` refuses a mobject that defines either on itself or overrides either in its class. [Fundamentals](docs/ENGINE-FUNDAMENTALS.md#ownership-identity-and-copying)
  - `Scene.stopped` is gone: read `scene.phase === 'stopped'`. `Scene.endCurrentStep` is gone: pass `step()` a function of the step it closes. `restingFrame` and `restingTime` in `explain/trace.ts` are gone: read a step's `frame1`.

### Known limits

- Each event a reader sends runs the scene again to the live step before it moves, which takes tens to a few hundred milliseconds.
- `rayner review` does not yet visit a live step or send events through the served page.
- Exploration stops at a machine's limit, 256 states by default, so ring-buffer's states are a sample and a reader can reach rings no check drew.
- Phone close-ups are not worked out for explored states.
- Some machines stop where their story does: ring-buffer pushes the values 1 to 9, token-bucket's client sends ten requests, and just-bash's script writes its file once.
- Past a machine's stopping point the player says the story stops, not that the model refuses.
- The checks establish deterministic, readable pictures. They cannot establish that a caption is true or that a reader learns from it, so test each model against its source.
- Windows is not supported.

## 0.1.1 (2026-10-29)

A preview release, superseded by 0.2.0. It was tagged in git and never published to npm.

- Put step captions next to their pictures. Hide Next view and its instructions when a step has only one view.
- Refresh phone tour controls after a viewport resize while preserving the reader’s current zoom and step.
- Keep the cache hit/miss result and the token-bucket rate comparison together at phone widths, with readable labels and model-derived outcomes.
- Compress embedded diagram snapshots losslessly, enforce raw/gzip page budgets and record startup under 4× CPU slowdown.
- Add a public EB Garamond example with real bold and italic, captured from the requested source fonts.
- Add WebKit served-paint review and native macOS Safari reader checks. Keep installed-package checks on both Mac architectures while concentrating pure property tests in the full and minimum-Node lanes.
- Preserve tested release archives and manifests on GitHub Releases. Refuse an existing npm version or an undated changelog entry, and verify the registry’s integrity before exposing a release.
- Pin GitHub Actions and the existing vendored glyph bundle. Correct the 0.1.0 release status without changing its tag or published archive.

## 0.1.0 (2026-10-29)

A preview release, superseded by 0.2.0.

First release of the `rayner` package, a fork of Ivar Vong's Lantern.

- Author technical explainers as TypeScript scenes with reader settings, named steps and captions.
- Build portable HTML pages with transcripts, picture descriptions, linkable steps, embedding support and response-header recipes. The browser runtime has no dependencies.
- Capture Agentic Mermaid diagrams at build time and animate their parts by id. Check every declared case, including imported-label collisions and visible route crossings, before publishing.
- Use native shapes, camera movement, charts, code diffs and matching transforms alongside diagrams. Text starts centred on its advance box; scene admission avoids duplicate subtree painting.
- Request additional scripts, replacement faces, real bold and italic, and typeset maths through committed lettering snapshots. See [supported requests](docs/LETTERING.md).
- Review every catalog step at phone and desktop widths, including actual painted subjects and close-up tours. The WCAG Focus Visible step opens on the criterion its caption explains.
- Use the `rayner` CLI to initialise, preview, capture, check, build and inspect scenes. PNG contact sheets are included.
- Run `rayner review` on an outside author's scene, with optional independent caption claims. Watched previews recapture requested lettering after edits.
- Export a generated catalog and deployment manifest with complete build inputs; stage and validate the collection before replacing its files and response-header rules.

- Compare reader timings with `npm run bench`: interleaved BASE/HEAD browser runs, retained traces and explicit inconclusive results for small samples. See the [measurement limits](docs/REFERENCE.md#reader-timing-measurements).

Requires Node 24 or later. Authoring targets Ubuntu and macOS; Windows is not yet supported. Diagram capture needs Chromium. Additional lettering capture needs Python and the documented source fonts; committed snapshots replay without them.

The [tutorial](docs/TUTORIAL.md) covers the first scene. [Publishing](docs/PUBLISHING.md) covers hosting and embedding. [Upstream](docs/UPSTREAM.md) records engine fixes and attribution.
