# Changelog

## 0.2.0 (unreleased)

This is the first release meant for authors; 0.1.0 and 0.1.1 were previews. It requires Node 24 or later. Authoring targets Ubuntu and macOS; `rayner review` and diagram capture need Chromium. Start with [the tutorial](docs/TUTORIAL.md). [The reference](docs/REFERENCE.md) covers the API and the command line.

### Authoring explainers

- An explainer is a folder: `script.md` states its intent, `model.ts` holds the system's rules, `scene.ts` explains it, and a picture module draws a state where that is worth separating. `rayner init` writes the tutorial's explainer this way.
- A script's intent header (`# question`, the labelled lines **Answer** and **Checked against**, and `## Check yourself`) is the scene's title, answer, checked-against line and reader questions. A scene that declares any of them as well is refused. `answerOf(this)` reads the answer, so a caption that states it keeps no copy. [Reference](docs/REFERENCE.md#scene)
- `static meta` has a type, `ExplainerMeta` (`PlayerMeta` for `meta.player`): write `static meta = { … } satisfies ExplainerMeta`. Collection refuses a key it does not name.
- `meta.id` defaults to the folder's name. It must be one path segment of lowercase letters, digits and `-`, and not a Windows device name. Step names must be unique ignoring case. `demos:build` and `site:export` refuse two page ids equal ignoring case.
- `meta.watch` names the state a reader follows, and the player shows each step's change to it ("Tokens left: 5 → 0"). `meta.questions` are asked after the last step. `meta.claims` ties a sentence to a named test and checks that the test exists.
- A step takes `title`, `line`, `caption` and `kind: 'short' | 'main' | 'detail'`, which puts it on the reader's short path, in the story or under Details. The engine reads only the caption; `rayner/explain` declares the rest on `StepMeta` and exports `StepKind`. `this.step(name, (before) => meta)` takes its words from the step it closes. Step metadata is copied as JSON and frozen when the step begins.
- A scene declares its types, `class X extends Scene<Model, Shown>`: `this.state` holds the model as JSON and `this.shown` what is shown apart from it, and views, machines and `view.tween` are typed from them. Functions, class instances, cycles and non-finite numbers are refused with their path. `having(state, ...keys)` narrows a state that changes shape. [Typed state](docs/REFERENCE.md#typed-state-and-shown)
- A scene's state and what is shown read as JSON through `scene.stateJson()` and `scene.shownJson()`, and a helper adds its own part with `scene.addJson(part, into)`. A part that would replace a key with another value throws.
- `stage(this)` runs once per scene. Its options are typed; at run time it checks only what a type cannot say: the palette's hex colours, the heading size and the style's name. `card()` and `code()` check their `size` and `width` the same way. `s.look` holds the colours a scene draws with (`paper`, `ink`, `soft`, `emphasis`, `good`, `bad`, `raised`, `rule`, `muted`). A region is named (`at: 'main'`) or given as a box with `regionBox('side', { top: 3.05 })`. A stage can run right to left (`direction: 'rtl'`). [Stage](docs/REFERENCE.md#stage)
- `s.steps([...])` presents a list of steps, each drawn from its own state. `s.sketch` draws a path stroke by stroke. `s.opening(...subjects)` names what a phone opens a step on.
- The stage's animating verbs (`s.show`, `s.card`, `s.code`, `s.note`, `s.enter`, `s.clear`, `s.clearOverlays`, `s.focus`, `s.carry`, `s.sketch`), a diagram's `reveal`, `walk`, `enlarge`, `morph` and `hide`, a view's `sync` and `tween`, and a machine's `send` and `replay` return an `Action<T>`. Awaited, it plays itself. Handed to `play()`, a `Succession` or a group, it plays there, so `this.play(s.focus(box), d.walk(hops))` moves the camera while a token travels. Its `value` is what it gives. An action plays once, and a step that ends with one made in it and never played fails. [Actions](docs/REFERENCE.md#actions)
- A picture is never changed in place. What changes is drawn by a `view(scene, draw)` from the state and what is shown, and `view.sync()` morphs it by key, staged by default: what goes fades out before what comes fades in (`staged: false` fades both at once). A key sync whose pictures carry no keys is refused. `view.tween((t) => state)` redraws the view at every frame. [Views](docs/VIEWS.md)
- [Changing what is shown](docs/VIEWS.md#changing-what-is-shown) says which way to change the state for which job: assignment and sync, a machine, `s.steps`, a tween or an authored transition.
- Cards and code panels take their marks as options: `lit: { row, as }` on a card, `lit: { lines, as }` and `added` on a code panel, with `width`, `fitHeight` and `key`. `panel: false` draws a card with no panel, which is how a readout of state is drawn. The word for what a mark says is `as` everywhere.
- Diagrams: `d.enlarge(ids, { zoom })` enlarges parts inside the diagram's box (it was `d.focus`). `d.picture(marks, { notes, dim, prefix })` draws marks, notes and dimming from state for a view, `d.notePicture` one note, and `d.trail(hops)` a walk's trail. `s.diagramView(d, draw)` shows a diagram by a view, and `s.liveDiagram(d)` hands back for a reveal, enlargement or morph; `d.presentation` says which. A morph can carry its edits (`ops`), which the build replays through Agentic Mermaid. `d.shapes(id)`, `d.labels(id)`, `d.findings()` and `d.link()` read a part. [Diagrams](docs/REFERENCE.md#diagrams)
- `mermaid.pie(slices)` and `mermaid.frontMatter(config)` build Mermaid source from typed values. `diagramResolverOf(scene)` lays out a diagram before anything is drawn.
- A colour left out is the scene's (`scene.colors`), which a stage sets from its look: text, lines and axes take the ink, guides the soft colour, `SurroundingRectangle`, `Circumscribe` and plotted data the emphasis colour, and `Cross` the colour for rejected. These were Manim's white, yellow and red. The SVG sinks' background is the scene's paper, where it was `#1a1a1a`.
- `Mobject.role` says what a part is for. `keyed(m, key)` from `rayner` keys a part and returns it, and refuses an empty key with a `RangeError`; `m.key` is read-only. Parts with the same `key` are the same part across morphs (`matchByKey`, `match: 'key'`), and `find(key)` and `findAll` address them. A mobject's family is a tree: `children` and `parent` are read-only, and `add`, `insert` and `remove` change it, refusing a cycle. `become` takes another mobject's data in place.
- `GrowFromEdge` grows bars and `PulseAlongPath` sends tokens along routes.
- A custom animation overrides the protected hooks `doBegin()`, `doInterpolate(alpha)` and `doFinish(alpha)`; the engine begins, draws and finishes it, and `Animation` has no public `begin()`, `interpolate()` or `finish()`. Every other member the engine reads on `Scene` and on each exported mobject, animation and sink class is private, keyed by a symbol or a module function, so a member an author writes on a subclass of one, under any name, never changes a run. `sampleAnimation(animation, alpha)` in `rayner/testing` draws one frame for a test. A mobject with points of its own overrides `pointArrays()` (with `pointKind()` and `boundingPointArrays()`); code that writes points in place calls `touchPoints()` and `invalidateBox()`. [Fundamentals](docs/ENGINE-FUNDAMENTALS.md)
- A mobject keeps its state in ordinary fields, not ES private ones: `copy()` makes a copy without calling its constructor, and gives it its own arrays, maps and sets; `restore()` and `become()` take every field, whatever its name. Copying a mobject whose class declares an ES private (`#`) member, as a transform, a fade or `saveState()` does, throws a `TypeError` that names the class and the member, instead of the language's own error at the copy's first use. [Copying](docs/ENGINE-FUNDAMENTALS.md#ownership-identity-and-copying)
- A step can carry a short score that the reader plays with Web Audio. Pages without audio leave that code out. [Score audio](docs/REFERENCE.md#optional-score-audio)

### Drawing kit and 3D

- `rayner/kit` is the default way to draw a picture by hand: the type scale `TYPE` with its phone-safe floor `MIN_TEXT` (0.56 units, which `words()` will not go below), `STROKE`, `RADIUS`, `SPACE`, `MARGIN` and `PLATE_HEIGHT`; `tones(s)`, the stage's colours by role; `words`, `box`, `plate`, `connector` and `route`; `addAll`; and `beats`, `flight` and `pass`, transitions in which changed words are replaced and a token travels its route. It is the reusable part of the Poppy series' kit, which a test holds to drawing the same marks and playing the same frames. [Kit](docs/REFERENCE.md#kit)
- `rayner/drawing` draws the parts explanations keep needing as keyed mobjects: `keyedParts`, `label`, `tile`, `segment`, `dot`, `table`, `stat`, `flow`, `bars`, `legend`, `callout`, `dimension`, `pin`, `emphasised`, and the panels `card` and `code`. Each takes the stage first, its content next and one options object (`at`, `size`, `key`). `table`, `stat`, `flow`, `bars` and `legend` require a `key`; `tile`, `dot`, `callout`, `dimension` and `pin` take one optionally. A keyed picture keys its parts under its key. `label` and `segment` take no `key`: key them with `keyed()`. [Drawing kit](docs/REFERENCE.md#drawing-kit)
- `table()` rows given as `{ key, cells }` keep their identity wherever they move; a duplicated row key or header is refused.
- `emphasised(m, as)` marks a part as emphasis where it is drawn, so the close-up tour and the descriptions find it.
- The types an exported function returns or takes options in can be named: `SeenDrawing` from `rayner/geo`, `AboutOptions`, `Shaper` and `Run` from `rayner`, `LineMark` from `rayner/drawing`, and `ToolKind` and `Side` from `rayner/explain`. `Side` replaces `NoteSide`, and is a callout's side too.
- A tab in a code panel reaches the next stop by columns: a combining mark, a joiner or a variation selector takes none, so a tab stop lands in the same place in every Node and browser, whatever grapheme rules its Unicode version has. [Code](docs/CODE.md#spans)
- `rayner/geo` draws a 3D model on a sphere: `seenFrom(model, viewpoint)` through an orthographic, perspective, gnomonic or Mercator viewpoint, as keyed pieces in an explicit depth order that the `depthOrder` invariant checks on every frame. [3D](docs/REFERENCE.md#3d-seenfrommodel-viewpoint)

### Models and machines

- A `Machine` drives a model with events. Its spec gives `start`, `events`, `next(state, event)`, `bound`, `end`, button `labels`, the `views` drawn from the state, and optional authored `transition`s. `next` returns `refuse(reason)` for an event the state refuses, in the reader's words. An event name may not be empty or contain a comma. `machine.spec` is frozen, and its `start` is a fresh copy at each read, so nothing changes the model once the machine is made. [Machines](docs/MACHINES.md#making-one)
- An event without authored motion morphs each view by key, staged. A transition's `t.choreograph(view)` morphs, brings in and takes out keyed parts in the author's order, and `c.follow(spec, { targets })` tweens parts of it. The views finish on the model's picture of the new state.
- At a live step, the step where a machine last played, the reader drives the machine: one button per event, then Undo and Reset. The events sit in the URL as `sent=`. `rayner init --machine` writes a machine explainer. [The player](docs/MACHINES.md#the-player)
- Each explainer folder holds its own evidence: `model.test.ts`, `scene.test.ts`, `fidelity.ts`, `answers.ts`, `oracle/` and `fixtures/`, named in its script's Checked against line. [An explainer's own evidence](docs/TESTING.md#an-explainers-own-evidence)

### The player and reader

- The explainer is one tile: the title and scenario picker over the stage, then the stepper, the step's words and the transcript. Pages at least 1100 px wide add a steps rail, which holds a live step's buttons. [The tile](docs/REFERENCE.md#the-tile)
- The step bar names a step only once the reader has reached it. After the last step the player asks the reader questions, each answer behind a disclosure.
- The page carries its default scenario's trace, so it shows without running the scene first. Each trace keeps only the watched keys of each step's state.
- On a phone the stage is taller than 16:9 when the scenario has close-ups, as tall as its most zoomed close-up uses (up to 4:5), and each step opens on a close-up of what it changed, or of what `s.opening` names. A scenario whose every label reads on the whole picture keeps a 16:9 stage, so its picture is not letterboxed, framed or standalone.
- A scenario whose run throws in the page leaves the stage usable. Under reduced motion a step crossfades to its resting picture.
- An explainer can opt into checked palette colours, square corners and a minimum stage width (`meta.player`).
- A built page must fit in 1.5 MiB of HTML and 450 KiB gzipped. A page whose scenarios make no diagram carries no diagram code, and no page ships a Brotli decoder.

### The scene's timeline

- One `play()`, `wait()` or `step()` runs at a time: one started while another runs throws. A step listener may play and wait inside its step. `scene.phase` (`ScenePhase`) says what the scene is doing. `scene.onStepEnd(listener)` runs as each step is about to end. [Reference](docs/REFERENCE.md#scene)
- A scene is sought by frame. A step records `frame0`, `frame1` and `holdFrame` beside its times; `renderFrame(SceneClass, frame, sink?)` in `rayner/output` draws one frame, so `renderFrame(Scene, step.frame1)` is a step's resting picture. Every step a trace records has ended (`EndedStep`). [Scene outputs](docs/SCENE-OUTPUTS.md#time-and-step-semantics)
- A sink says which frames it skips (`Sink.skipUntil`). `NullSink` and `TraceSink` skip every frame; `new TraceSink({ skipUntil: 0 })` draws them all. `SceneOptions` is `{ fps }`.
- `fps` must be above 0 and at most 240. Run times, lag ratios and wait times must be finite and not negative. A `play()` with no animation, and an animation listed twice in one play, throw. A `Succession` takes no `lagRatio`. An animation's `rateFunc` is checked when set, and none of its timing changes while it plays. A play refused before anything begins leaves its animations' options as they were.
- A play's `rateFunc` and `lagRatio` reach an action as they reach an animation: `play(view.sync(), { rateFunc: linear })` eases the sync linearly, and a there-and-back rate function works on a one-beat action, in `play()` or in a group. A `Succession` refuses a rate function only where it would run its time back past a member that has finished. `view.tween` takes `TweenOptions` (`runTime`, `rateFunc`), exported from `rayner/explain`; a tween draws one sampled state, so it takes no `lagRatio`, and a play's has nothing to stagger in it. [Actions](docs/REFERENCE.md#actions)
- A play that fails lands what it began, so each animation can play again.
- What begins at its turn in a play begins in turn order, and is held to one writer per mobject against everything else the play drives.
- An animation has a `phase` (`AnimationPhase`: idle, begun or finished).
- An animation with `remover: true` takes every one of its `targets()` off the scene after its play, as `c.follow` does; a custom animation that overrides `targets()` no longer leaves all but its `mobject` behind.
- `DecimalNumber` transformed into a `Text` ends as that text instead of `NaN`. `Scene.captionWpm` is read from the scene's own class, and a caption in a script without spaces counts every one and a half letters as a word.

### Checks

- `rayner check` runs the `model.test.ts` beside the scene first, and fails when `answers.ts` computes an answer `script.md` does not state. [Checks](docs/REFERENCE.md#checks)
- It fails a view whose draw never depends on its state, a picture that changes after its caption's hold begins, a step whose picture as it ends differs from its resting frame, and a step that draws no frame of its own.
- It fails a caption or line that names a colour or pattern no word on the stage says; a legend or a label that keys the look answers it.
- It holds every key to one part on the stage.
- It explores every machine from where it last played: each reachable state must not collide, must show readable labels and must be described apart from the others, and every authored transition must finish on the model's picture.
- `scene.addInvariant(name, check)` states what must hold on every frame. `rayner check` fails the first frame that breaks it, and an invariant that never held.

### Tooling and publishing

- Rayner is two packages at one version: `rayner`, the vocabulary and runtime, with no dependencies, and `rayner-cli`, the `rayner` command with the player. Install both. [Quick start](README.md#quick-start)
- Diagram capture and lettering capture are add-ons. A scene that draws no Mermaid diagram and asks for no lettering runs `init`, `check`, `see`, `describe`, `build`, `snapshots`, `preview` and `shots` with Node alone: the command loads no Agentic Mermaid, no Playwright browser and no Python for it. `review` still opens the page in Chromium. [Add-ons](docs/REFERENCE.md#add-ons)
  - `agentic-mermaid` and `svgpath` are optional peer dependencies of `rayner-cli`, so `npm install rayner-cli` no longer installs them. To draw Mermaid diagrams, run `npm install --save-dev agentic-mermaid@0.5.1 svgpath@2.6.0`, and install Chromium to capture them. A diagram that `scene.snapshots/` does not hold, or a morph whose edits must be replayed, fails with the scene, the diagram and that install line when the packages are missing. Pinned snapshots, natural-lettering ones included, replay without the add-on or Chromium.
  - When no Chromium can be found, `review` and diagram capture say how to install it (`npx playwright-core install chromium`, or `CHROMIUM_EXECUTABLE_PATH`) instead of Playwright's own error.
  - `shots` draws its contact sheet with resvg and needs no browser.
- The entry points are `rayner` (the engine), `rayner/explain` (stage, views, diagrams, machines, settings), `rayner/kit`, `rayner/drawing`, `rayner/geo`, `rayner/output` (drawing frames outside the page) and `rayner/testing` (author tooling). A scene may not import `rayner/testing`.
- `rayner/testing` loads an explainer for its tests: `loadProject(Scene, folder)` adopts the script and traces every scenario; `assertStepState`, `assertSteps` and `assertViewFollowsState` assert against the model; `withIntent`, `loadSnapshots`, `pictureWordsAt`, `diagramFindings` and `diagramOf` read the rest. Traces are typed from the scene class (`TraceOf`). [An explainer's test](docs/REFERENCE.md#an-explainers-test)
- `rayner see` prints one step for a person at a terminal. `rayner describe` prints every scenario and step as JSON, including the machines and invariants. `rayner preview --watch` rebuilds when `script.md` changes too.
- Every error an author can see starts with the call that failed (`card():`, `meta.watch:`), says what is wrong in one sentence, and is a `TypeError` for a wrong type and a `RangeError` for a value out of range. [Error messages](docs/ENGINE.md#error-messages)
- Snapshots are no longer keyed to hashes of Rayner's code, so editing a scene or the engine does not rewrite them. `scene.snapshots/index.json` drops `sourceHash` and `importer`. `scene.lettering.json` is version 3, storing outlines as path data. `inputs.json` is version 3. [Snapshots](docs/REFERENCE.md#snapshots)
- The exported `catalog.json` is version 2: its totals count `scenarios`, where version 1 counted `cases`.

### Removed from the public API

[The engine map](docs/ENGINE.md#public-names) gives the rule a public name meets.

- The package exports its six entry points only. `rayner/lettering` is gone: import the `LetteringRequest` type from `rayner`.
- Moved to `rayner/testing`: `traceScene`, `TraceSink`, `loadFonts`, `describeExplainer` and `withSettings`, and the types `Trace` and `StepRecord`. `CaseDescription` is `ScenarioDescription` there, and `findingsOf` is `diagramFindings`.
- `MotionSink`, `analyzeMotion`, `viewMismatch`, `takeMissingGlyphs`, `bindSnapshots`, and `variantsOf` and `caseName` (renamed `scenariosOf` and `scenarioName`) are internal: `rayner check` checks motion, views and missing glyphs, `loadProject` traces every scenario from its pinned snapshots, and `assertViewFollowsState` checks a view in a test.
- Members no scene, recipe or guide used are gone or private: `Code.highlight` and `lineCenter` (a code panel's `lit` bars a line), `NumberLine.p2n`, `unitSize` and `tickValues`, `Axes.p2c`, `originPoint`, `crossX`, `crossY` and `shaping`, `s.backdrop`, and `DomSink`'s `maxFreezeMs`, `realtime` and `dropped`.
- Moved to `rayner/output`: `toSvgString`, `renderElements`, `renderText`, `StopScene`, `StringSink`, `DomSink` and `NullSink`.
- Moved to `rayner/explain`: `view`, `View` (a type), `ViewMatch` and `ViewPlace`. `Palette` comes from `rayner`, and `Card`, `CodeBlock`, `CardRow` and `CardOptions` from `rayner/drawing`.
- Option types end in `Options` where they ended in `Opts` (`AnimationOptions`, `TextOptions`, `ViewOptions` and the rest). The code panel's options are `CodeBlockOptions`, apart from the engine `Code`'s `CodeOptions`.
- Seeking by time is gone: `renderAt`, `SeekSink`, `indexScene`, `stepTime` and `SceneIndex`. Draw a frame with `renderFrame`. `SnapshotSink` is internal: `renderFrame` returns the scene at its frame.
- The scene's `skipUntil` option is gone: a sink's `skipUntil` says what it skips.
- `Scene.stopped` is gone: read `scene.phase === 'stopped'`. `Scene.endCurrentStep` is gone: give `step()` a function of the step it closes. `Scene.clear()` is gone: `s.clear()` fades the stage. `bringToFront` and `bringToBack` are gone: `add` moves a root to the front.
- The vector helpers `add`, `sub`, `mul`, `dot`, `norm`, `normalize`, `lerp`, `rotate` and `angleOf` are internal; the `Vec` type stays. The direction constants (`ORIGIN`, `UP`, `DOWN`, `LEFT`, `RIGHT`, `UL`, `UR`, `DL`, `DR`) are gone: write the vector, `[0, -1]` for `DOWN`.
- The Manim colours (`WHITE`, `BLACK`, `GREY`, `GREY_D`, `BLUE`, `BLUE_D`, `TEAL`, `GREEN`, `YELLOW`, `GOLD`, `RED`, `MAROON`, `PURPLE`, `ORANGE`) are gone: colour from `s.look` or write the hex value. `lerpColor` mixes two `#rgb` or `#rrggbb` colours and throws a `RangeError` for any other.
- `easeInQuad`, `easeOutQuad`, `easeOutBack` and `wiggle` are gone; any `(t) => number` is a rate function.
- `Indicate` and `Flash` are gone, since each mark had faded by the step's resting picture: mark with `Circumscribe({ keep: true })` or the [emphasis shapes](docs/EMPHASIS.md).
- `Write`, `Square` and `Underline` are gone: write `new Create(m, { lagRatio: 0.3 })`, a `Rectangle` and a `Line`.
- `MathTex`'s alias `Math` is gone, since it hid JavaScript's `Math`.
- `tokenize`, `diffTokens`, `hunkHeader` and the `Token` types are internal; `diffLines` and `parseUnifiedDiff` still make hunks for `TransformDiff`.
- `perf` is internal, and `MotionOptions` is gone.
- Options no scene set are gone: `NumberLine`'s `includeTicks`, `tickSize`, `numbersToInclude`, `numbersToExclude`, `labelDirection` and `includeTip`, `AxesOptions.xAxisStyle`, `BraceOptions.sharpness`, and a transform's `pathFunc` with its `PathFunc` type.
- `Text.text` is read-only: `setText()` changes it.
- The engine's `StateReadout` and `stateView` are gone: draw a readout with `card(s, rows, { panel: false })` in a view.
- `ViewSync` is internal: `view.sync()` returns an action.
- `Mobject.replaceChild`, `applyAffine` and `arrangeInGrid`, `VMobject.numCurves`, `curveLength` and `curveParamAt`, `AnimationGroup.mobjects` (read `targets()`), `Transform.ownsTarget` and `sameStructure`, and the option echoes `Circumscribe.fadeOut`, `GrowFromEdge.initialScale`, `MoveAlongPath.fromCurrent` and `TransformMatching.fadeMismatches` are gone; the options stay. `Scene.time`, `frameCount` and `mobjects` are read-only.
- Pictures are not changed in place, so these are gone: `Diagram.mark`, `unmark`, `dim`, `note` and `clearNotes`, `walk`'s `trail` option, `Card.set` and `mark`, `CodeBlock.focus`, `morph` and `clearMarks`, and `s.emphasise`. Draw the marks from state with a view and `d.picture`, or with the panels' `lit` option.
- `d.focus` is `d.enlarge`, and its camera move is gone: `s.focus` moves the camera. `s.focus`'s `with` option is gone: play the other animations in the same play.
- `s.dimension`, `s.pin` and `s.callout` are gone: enter the kit's picture, `s.enter(pin(s, point, { label }))`, or draw it in, `new Create(s.keep(callout(s, target, text)), { lagRatio: 0.15 })`.
- A part's key is set with `keyed(m, key)`, not by assigning `m.key`.
- `s.card` and `s.code` take no `enter: false`: build several panels with the kit and enter them together, `s.enter(card(s, rows), code(s, lines))`.
- `REGIONS` is not exported: name a region, or use `regionBox`.
- `edgePartOf` is internal: use `d.link()`.
- `Diagram.parts` is internal: read a part from `d.snapshot.parts`, or through `d.shapes(id)`, `d.labels(id)` and `d.link()`. `d.describe()` takes no argument.
- `Card` and `CodeBlock` are types only: the kit's `card()` and `code()` build them.
- `LetteringSnapshot` is not exported.
- Members that are implementation details are `private`, `protected` or `@internal`, and the published declarations leave the internal ones out. Among them: `Mobject`'s caches and alignment, `Scene`'s sink and frame loop, `View`'s `placed`, `measure`, `commit` and `swap`, `Diagram`'s `build` and `frameBox`, the renderer's point buffers, and `Mobject.saved`, `Text.run` and `TraceSink.records` (read `steps()`). `Diagram`'s fields are read-only.

### Known limits

- Each event a reader sends runs the scene again to the live step, which takes tens to a few hundred milliseconds.
- `rayner review` does not visit a live step or send events through the served page.
- Exploration stops at a machine's limit, 256 states by default, so ring-buffer's states are a sample.
- Phone close-ups are not worked out for explored states.
- The checks establish deterministic, readable pictures. They cannot establish that a caption is true, so test each model against its source.
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
