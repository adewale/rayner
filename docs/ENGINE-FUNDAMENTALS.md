# Engine fundamentals

Read this to draw, animate, inspect or extend a scene without the publishing
workflow. The [tutorial](TUTORIAL.md) covers authoring an explainer, and
[extension recipes](EXTENDING.md) give runnable examples. Every name below is a
public export of `rayner` unless another entry point is shown: sinks, seeking and
other ways to draw frames are `rayner/output`; traces, frame checks and profiling
are `rayner/testing`; `view` is `rayner/explain`; and `Write` and `Restore` are
`rayner/extras`.

## The model

A `Scene` runs a TypeScript program. That program creates a tree of `Mobject`s,
plays `Animation`s and marks named `step()` boundaries. A `Sink` receives the frames,
so changing the sink changes the output and leaves the scene alone.

| Primitive | Responsibility |
| --- | --- |
| `Mobject` | Key, children, style, geometry operations, layout and updaters |
| `Group` | Several mobjects treated as one ordinary mobject |
| `VMobject` | Drawable cubic Bézier subpaths, with open/closed flags |
| `Text`, `Code`, `DecimalNumber` | Text and numbers, rendered with glyph outlines |
| `Animation` | A time-dependent operation on a mobject; extension point for new motion |
| `Scene` | Admission, ordering, named steps, model state and one fixed-rate clock |
| `Frame` | The scene's camera, used as the SVG viewBox rather than drawn |
| `Sink` | A consumer of frames and optional step-boundary notifications |

The shapes are `Line`, `Arrow`, `CurvedArrow`, `Arc` (`{ center, radius, startAngle, angle }`,
radians counterclockwise), `Circle`, `Dot`, `Rectangle` and `Polygon` (`new Polygon(corners,
style)`, closed), with `Labeled` to put a label on one; the emphasis shapes are in
[Emphasis](EMPHASIS.md). `line.putStartAndEndOn(a, b)` moves a `Line`'s or an `Arrow`'s
ends to two points, its tip following, so a drawing whose ends come from a model is
redrawn in place. `line.start()` and `line.end()` are a `Line`'s ends. An `Arrow` is its
`line` and its `tip`, a `CurvedArrow` its `arc` and its `tip`, and a `Labeled` its `shape`
(the label, when it has no shape) and its `label`, so a scene can colour or place one piece.

The drawing area is 16 × 9 scene units, centred on `[0, 0]`, with positive y up.
An output width changes pixel size, not those coordinates. A `Box` is
`[minX, minY, maxX, maxY]`. A `Vec` is `[x, y]`.

## Geometry and paint

Points are world coordinates stored in `Float32Array`s. A `Mobject`'s `shift`, `scale`,
`rotate`, `stretch(k, axis)` and `moveTo` change the points of the whole family. There is no separate model
transform matrix whose effect an inspector must reconstruct.

`VMobject.startNewPath(point)`, `addLineTo(point)`, `addCubic(handle1, handle2, end)`
and `closePath()` build paths, and `setPolygon(corners)` builds a closed polygon.
Use them, or the transforms above, rather than writing a point buffer yourself: they
keep the render cache and the cached layout bounds current, and a buffer written in
place leaves both stale. A shape of your own builds its points in `initPoints()`,
which its constructor calls.

A path is `subpaths`, one `Float32Array` of cubic Bézier points per subpath (its
start, then three points per curve), with `closed` saying which are closed; read
them, and change them with the methods above. Each of those methods ends a write to the
arrays in place by bumping the points' version, which the renderer's path-data cache
keys on, so a write that goes round them would draw the old path;
`test/path-cache.test.ts` writes through every one and compares the cached path with
one computed afresh. `hasPoints()` says whether a mobject
has points of its own, as a Group does not. To walk a path: `numCurves(i?)` counts
the curves of subpath `i` or of the whole path, `pointOnCurve(i, c, t)` is the point
at parameter `t` on curve `c`, `curveLength(i, c)` and `arcLength()` measure a curve
and the whole path, `curveParamAt(i, c, s)` is the parameter a length `s` along a
curve reaches, and `pointFromProportion(t)` is the point a fraction `t` of the path's
length along it, which `MoveAlongPath` (`rayner/extras`) and the stage's sketch travel by.

`applyPointsFunction(fn)` maps every point of the family through `fn([x, y])`, and
`applyAffine(a, b, c, d, e, f)` applies the affine map `[a c; b d]p + [e f]` without
allocating per point; both work about the box's centre unless given `aboutPoint` or
`aboutEdge`. `box()` is the family's bounding box, a `Box`, or null when nothing in it
has points. It is cached; every engine method that changes points or children clears the
cache, and code that changes points another way, an animation's own `doInterpolate` or a
custom mobject that assigns new point arrays, calls `invalidateBox()` after, which clears the
mobject's cache and its ancestors'. `boxPoint(direction)` is a point of that box: `[0, 0]` its centre, `[1, 1]`
its upper right; `center()`, `top()`, `bottom()`, `left()` and `right()` are five of them,
and `width()` and `height()` its size.

Style includes fill, stroke, their opacity and width, overall opacity, and optional
SVG paint details such as dashes and joins. A mobject's `style` is a `StyleRecord`: its
`Style` with every field filled in but those paint details and `drawFraction`. `setFill`, `setStroke` and `setOpacity`
update it; `setStyle(style)` sets several fields at once, and `setColor(c)` sets fill
and stroke to one colour. `Create` and `Write` (`rayner/extras`) use the transient `drawFraction` to reveal a path.
Changing `style` or point arrays behind the supported methods risks stale caches.

A colour left out takes the scene's. `scene.colors` holds five (`paper`, `ink`, `soft`,
`emphasis`, `bad`), and a part built without a colour is marked with the role it takes
(`defaultColors`, each a `ColorRole`): text, lines, arrows and axes take `ink`, guide lines and a readout's keys
`soft`, `SurroundingRectangle`, `Circumscribe` and plotted data `emphasis`, and `Cross` `bad`.
When the part first enters the scene (`scene.add`, a play that draws it or morphs toward it, or
a parent already on stage), each field still holding its default takes the scene's colour, and a
field set since keeps what it was set to. A stage sets `scene.colors` from its look (`s.look`), so an
axis drawn without a `stroke` reads on any paper. A scene without a stage draws dark ink on white
paper, and the SVG sinks draw `paper` behind the frame unless given a `background`.
`lerpColor(a, b, t)` gives the colour `t` of the way from `a` to `b` in sRGB, always as `#rrggbb`
(Manim's `interpolate_color`), for a colour between two of the look's. Both ends are hex colours,
`#rgb` or `#rrggbb`, and it throws a `RangeError` naming any other.

Common layout operations are `nextTo`, `alignTo`, `arrange`, `moveTo`, `setWidth`
and `setHeight`, and `toEdge(direction, buff)` puts a mobject against an edge of the frame; `arrangeInGrid(cols, { buff })` lays the children out row by row,
`cols` to a row, each centred in a cell as wide as the widest and as tall as the
tallest. Bounds describe geometry only; clipping, paint order and stroke
also decide what collides on screen, which is why `rayner check` measures painted
labels separately.

A `Text`'s `advance()` is its exact advance width and `textSize()` the size it is
drawn at now, after any scaling. `shapeRun(text, size)` shapes a string with the
text's own shaping and returns the run, `{ glyphs, width, ascent, descent }`, as
`font-metrics` reads it. `angle()` is the angle the text has been turned through, in radians,
`italic` whether it was made italic, `font` its `FontName` (`'sans'` or `'mono'`), and
`shaping` the `TextShaping` it was made with: the scene's, when `this.text` made it. `tabWidth` is the tab stop a text's tabs are laid out to,
which `Code` sets. A `DecimalNumber` shows `value` with `decimals` places between
`prefix` and `suffix`; `setValue(v)` redraws it in place for a new value, and
`DecimalNumber.format(v, decimals, prefix, suffix)` is the string it would show.

## Ownership, identity and copying

`group.add(child)` moves the child into that group, last on top, detaching it from its old
parent; `group.insert(index, child)` puts it at `index` instead (`0` draws it under the rest),
and `group.replaceChild(old, ...replacements)` puts replacements where `old` stands. A
mobject's `children` and `parent` are read-only, so these methods and `group.remove(child)`
are the only ways to change a family, and each keeps every child's `parent` and the cached
box in step. Both are held outside the mobject, so no write to the mobject, from plain
JavaScript or through a cast, changes them; a `children` or `parent` defined on the mobject
itself (`Object.defineProperty`), or a getter for either in a subclass, would hide them from
whatever reads the property, so `family()`, and so `box()`, refuses a mobject that has one. Code
that reads `m.children` before any `family()` would still see such a property, and a class's
prototype is checked the first time one of its mobjects is walked, so one patched after that, from
plain JavaScript, is not seen. `family()` is the mobject and every descendant, depth first. A scene admits one root per subtree, so admitting a parent never paints a
child twice. `Scene.add`, `remove` and `replace`
control membership and draw order; what the stage keeps over everything else (its heading,
band, step number and line) stays last through each of them: the root that holds it, which is
the group around it once one wraps it, is moved last, and that is done again before every frame
and step boundary the scene hands its sink, and before a frame drawn outside the frame loop
(`renderFrame` past the end, the live player's landing frames), after a direct
write to `scene.mobjects` too. A sink handed the scene by other code reads the list as it stands. The structure is a tree: `add`, `insert` and
`replaceChild` refuse the mobject itself or one of its ancestors, which would make a cycle,
and `group.remove(child)` takes out only the group's own children, leaving a mobject in
another group where it is. `scene.familyMembers()` lists every mobject on the stage and
each of its descendants, root by root, for a test or a check that looks for a part.
`sameShapeAs(other, points?)` says whether two families have the same shape, every
member of one class with as many children, and with `points` the same point counts:
what `become` keeps identities through.

A part's identity is its `key`, an optional name you give it: `find(key)`,
`findAll`, keyed matching, invariants and reviews all address parts by key. A
position in a child array is not an identity, and `Mobject.id`, the renderer's
number, is internal. Give keys from the domain (`slot:3`, `state:idle`) when the
domain has identities.

`copy()` clones the tree with its geometry, style and keys (a copy is a new
object that still answers to the same key), and clears updaters and saved state. A custom composite should expose its
parts through getters into its own children, as [StatusBadge](../recipes/extensions.ts)
does. If it stores named child references, override the protected hook
`rebindReferences(source, map)` so the clone names its children, not the original's.
Override `copyData(source)`, also protected, for additional mutable data that the base
class cannot copy itself.

`saveState()` stores a copy. `restore()` restores immediately; `Restore`
(`rayner/extras`) does it as an animation. A generic transform can align or replace child structure, so retain
references only to parts whose identity your operation promises to preserve.
See [restoration and sequencing](ANIMATIONS.md).

## Animations and the clock

```ts
await this.play(new FadeIn(box), { runTime: 0.4 });
await this.play(box.animate.shift([2, 0]).setFill('#58c4dd'));
await this.play(new Transform(box, target));
```

`play()` takes `Playable`s: an `Animation`, an `AnimationGroup` (either is a
`ScheduledAnimation`), or a `.animate` builder, an `AnimateBuilder`, which records
chainable methods and constructs a target when the play begins.
`new Transform(m, target, { replace })` morphs `m` into its `target`: each frame
sets it between the two with `m.interpolate(start, end, alpha)`, each point travelling in a
straight line, and with `replace: true` the scene holds `target` in `m`'s place afterwards.

A custom animation extends `Animation`. Its `mobject` is what it animates, and `runTime`,
`rateFunc` (a `RateFunc`, from the fraction of the run time elapsed to progress), `lagRatio`
and `remover` are its timing options, as on an `AnimationGroup`. `targets()` lists the
mobjects it writes, its `mobject` unless it says otherwise: what `play()` admits to the
scene and allows one writer each. `evidence()` is what it records as it begins, or null.
The scene calls an animation's `begin()`, `interpolate(alpha)` and `finish()`; a custom
animation overrides their protected hooks, `doBegin()`, `doInterpolate(alpha)` and
`doFinish(alpha)`, and calls `super.doBegin()` where it extends one. Ordinary transforms
capture endpoints in `doBegin()` and interpolate between them. The scene applies the rate
function before calling `interpolate`; a custom animation must not apply it twice. Its
`doFinish()` lands at the rate function's endpoint, which need not be 1 (`thereAndBack`
returns to the start), and must land where its last frame drew: `rayner check` compares
each step's picture as it ends with its last frame.

An animation's `phase`, an `AnimationPhase`, is `'idle'` until it begins, `'begun'`
while it plays, `'landing'` once its play has finished it while members of it still begin
and finish in turn (a `Succession` whose member waits, as below, or a group holding one), and
`'finished'` once it has landed, every member with it. A second `begin()` while begun or
landing throws, and so do `interpolate()` and `finish()` before `begin()`; a finished animation
may begin again. The guards are the public calls themselves, on `Animation` and
`AnimationGroup`, so every caller goes through them (the scene, a group, a `Succession`,
an animation that drives another) and a hook keeps them in whatever form it is written,
a method or a class field. An animation whose `begin`, `interpolate`, `finish` or `land` (the
landing after a failure, below, whose hook is `doLand`) is not the engine's is refused, and so
is one that redefines `phase`, `runTime` or `lagRatio`, or answers `waiting()` (whether a play
and a `Succession` wait for it) other than as the engine's groups do: as a method in a subclass
when its first instance is made, and in every form (a subclass's method or accessor, a class
field, an assignment, `Object.defineProperty`, a prototype patched after the first instance, a
swapped prototype) where every play and every group member passes before it begins:
`Scene.play`, a group's begin, a `Succession`'s for each member at its turn (with a scene or
without one), and `begin()` itself. Two ways round the guard remain, both open only to plain
JavaScript or a cast: calling a protected hook (`doInterpolate`) directly, and patching a
lifecycle call in while the animation plays.

A play that fails leaves no animation begun. When an animation throws as it begins, a
group lands the members it began before the one that threw, and `play()` lands the
animations before it; so does a list begun at its turn inside the play (what a beat or a
transition makes, a `Succession`'s member), and then what made the list has made nothing. When the play fails after it has begun (a `Succession`'s member that
throws at its turn, something made at its turn whose read fails or that the one-writer
check refuses, a frame or a sink that throws), `play()` lands every animation it was
given. Landing finishes what has begun, as the end of its play would, and begins nothing
more: a `Succession`'s later members never begin, and an action is abandoned, its running
beat landing (with its `after`, if its animations had begun) while no later beat is made
and its `end` does not run; the action is then abandoned, and awaiting it, or playing it again,
throws. Each landed animation can play again; an action, which plays once, cannot. A stop is not a failure: a scene stopped by its sink (`StopScene`) is stopped
for good, and its picture stays as the stopping frame drew it.

A run time and a lag ratio are finite and not negative, given to the constructor, to
`play()` or set on the animation (`a.runTime = 2`), and fixed while it plays: a play counts
its frames from them as it begins, so setting either on a begun animation throws. A
`Succession`'s lag ratio is 1, since its members run one after another; setting another
throws. A `play()` given no animation, with or without options, throws: `wait()` holds the
picture.

Use one `play(a, b)` for simultaneous operations, `Succession` for sequential
operations and `AnimationGroup`/`LaggedStart` for grouped schedules. There is one scene
clock, so one `play()`, `wait()` or `step()` runs at a time, and one started while
another runs throws (`scene.phase` says which runs). Two simultaneous
animations may not drive the same mobject or an ancestor and its descendant, and one
animation may not be listed twice. `Scene.play()` checks and rejects both, as it begins and
again for whatever begins later in it, a `Succession`'s member at its turn included. A `Succession`'s
time only runs forward, since a finished member does not run again: it refuses a rate
function that falls anywhere, given to it or to `play()`, and throws if a group around
it runs its time backwards. A group exposes its members' `ready()`, so `play()` waits for
what any of them reads before it begins, and lays out its members' times as the play
begins. What is made only when its turn comes, a machine's transition or an action's beat, may
read something not ready yet: the play waits for it there, before drawing its next frame, so the
frames are the same as if it had waited for nothing. What begins at its turn (a `Succession`'s
member, what a beat or a transition makes) begins in turn order, whether or not something
waits: once one waits, whatever comes after it in the frame waits behind it, so the drawing
order and the recorded evidence follow the turns. That holds for an animation begun beside
one that waits, too, listed after it in a play, a group, or a group that is a `Succession`'s
member: it begins with the play or the group, and joins the stage and records its evidence
in its turn, after what the waiting one made. A `Succession` whose member waits begins
nothing after it until that member has begun, so a waiting member shorter than a frame still
plays, begun and then landed within its frame, with its side effects in their order, and a
waiting last member of no run time begins and lands as the play finishes.

Capture starting values when an animation **begins**, not when it is constructed.
Earlier members of a `Succession` may change them. Define intermediate geometry
from that captured start and alpha rather than adding a per-frame displacement.
[FollowAngle](../recipes/continuous.ts) demonstrates the extension contract.

The default frame rate, `scene.fps`, is 30, and the constructor refuses one outside
(0, 240]: a trace keeps times to 1 ms, and up to 240 fps that still finds the frame.
`wait(seconds)` refuses a time that is not finite or is negative. Time comes from the frame count: `scene.frameCount` is the
frames emitted so far, and `scene.time` the seconds they make. Sinks can wait for
browser display or return immediately offline, but cannot change the model's time
step. Exact comparisons are within the chosen frame grid, not arbitrary subframe
timestamps.

## Steps, state and evidence

`await this.step(name, metadata)` closes the previous step and begins the next.
Names are stable, unique URL identifiers. `title`, `line`, `caption` and `kind`
(`'short'`, `'main'` or `'detail'`) mean something to the reader; other metadata
can describe the model's inputs. Metadata is copied as JSON when the step begins, and the
copy, `currentStep.meta`, is frozen deeply, so a write to it throws rather than change the
caption, its hold or the trace (the language's own `TypeError`, which names the property; see
[error messages](ENGINE.md#error-messages)); given a function, `step()` calls it with the step it has just closed. A caption extends
its step until it could be read, so the step's resting picture, its last frame, can differ
from its first. Each step draws at least one frame of its own (`loadProject` and the command
refuse one that does not). Each moment is recorded as a time and a frame: `hold` and
`holdFrame` where a caption hold begins, and `t1` and `frame1` where the step ends;
the player, playing one step, stops at the still frame, the hold frame or else the last,
while a continuous render of the scene plays on through the hold to `t1`, and links show
`frame1`. The still frame and `frame1` show one picture, but code after the step's last play
and its end listeners can still change the state between them, so a step's state is read at
its end, as the trace's `after` records it: the live player and `rayner check`'s exploration of
a machine start there (`Scene.stopAt`, which stops a run as a named step ends, for good, even
when its callback throws). A step that has ended is an `EndedStep`, whose `t1` and `frame1`
are numbers: what a sink's `stepEnd` hears, what a metadata function is given and what
`AtRest` sees; a running `Step`'s are null. The
[vocabulary](VOCABULARY.md) names these moments. `TraceSink` copies them into the trace as each step ends, so every step of a trace has its end (a run stopped inside a step leaves that step out), and `traceRun`'s `AtRest` callback (`src/trace.ts`) hands the scene, showing each
step's resting picture, to the tools that draw every step, so `rayner describe`, the
contact sheet and the site's cards run each scene once.

`this.state` is the model: what the subject program is doing, and nothing about
how it is shown. Use `Scene<MyState>` for typed access. `this.shown` holds what is
shown apart from the model, such as which of several pictures a phase shows; a
view's `draw` may read it, and a machine never changes it. `stateJson()` copies
the model as JSON, with the parts helpers add with `addJson(fn)`; `shownJson()` copies
`shown`, with the parts added with `addJson(fn, 'shown')`, such as the stage's
description of its picture. A part never replaces a key: one it writes that the
model, what is shown or another part already has with another value throws when the
JSON is read. So a helper's keys are reserved, `walks` in the state (a diagram's
recorded walks) and `picture` in what is shown (the stage's description), and a
scene that names its own `walks` is refused rather than overwritten. The trace
records the model as `before` and `after` and the second as `shown`. Both accept plain JSON and finite numbers, and refuse
functions, class instances, cycles and non-finite values; shapes belong in the
scene tree.

Evidence is what an animation or operation did, attached to the step it happened
in, apart from the model. `this.record(kind, data)` adds a record, an `Evidence`
(`{ kind, ...data }`), and every
animation's `evidence()` is recorded as it begins: a matching transform records
`{ kind: 'match', … }` and `TransformDiff` `{ kind: 'diff', … }`
([matching](MATCHING.md#evidence)), a view's sync its morph's counts with the view's
key as `view`, a follow or a view's tween its interval and targets, and a machine's event
`{ kind: 'event', event }`. `onStep`, `onStepEnd` and `addJson` are the extension hooks,
and each returns its own remover; do not replace the scene's methods to attach
helpers. A step listener may play and wait inside the step: `onStep`'s as the step
begins, `onStepEnd`'s as it is about to end, before its caption hold; one that throws
stops the step from ending (an action never played does, in `rayner/explain`).

A trace records what an author declared; it does not prove the declaration true.
Compare it with an independently checked program, and check the values on screen
too: a [view](VIEWS.md) ties a picture to the state it was drawn from.

## Updaters, derived pictures and seeking

`m.addUpdater((object, dt) => ...)` registers an `Updater`, which runs before a rendered frame. Camera
updaters run after ordinary objects. `m.update(dt)` runs the updaters of a mobject and
its descendants once, as the scene does before each frame. Clear registrations with `m.clearUpdaters()`
when they are no longer needed. An updater that integrates `velocity * dt` depends
on previous frames. The engine conservatively replays any play or wait with active
updaters, including an updater that merely reads the current value. A frame with no
updater on stage walks the tree without building a family list.

Updaters are exempt from the one-writer rule. They run after the frame's animations
have interpolated, so on a mobject both drive, whatever the updater writes wins for
that frame and the animation keeps the rest: a label that follows a dot by an updater
can still fade in, the fade writing its opacity and the updater its place. An updater
that writes what an animation writes overrides it silently, so give a moving part one
of the two.

`view(scene, draw).sync()` registers no updater: it rebuilds a target from state
when its play begins and morphs to it. That suits discrete updates; it does not
evaluate a relationship between the two endpoints, which a [view's tween](CHOREOGRAPHY.md#following-one-number) does.

`renderFrame(SceneClass, frame, sink)` (`rayner/output`) reruns the scene up to one frame by its
number (or the final frame if past the end), skipping the interpolations of plays without
updaters. A seek is a replay with skipping, not an index into a precompiled timeline. The
number is the frame count a step records as `frame0`, `frame1` or `holdFrame`, so a step's
resting picture is `renderFrame(SceneClass, step.frame1, sink)`, found without converting a
frame to a time.

A sink stops a seek with `StopScene` (`rayner/output`). Do not catch animation errors broadly in
`construct()`: catching that signal can allow author code to mutate the stopped
scene. Handle known model errors before animating. The engine limits the damage:
a `StopScene` from a sink sets `scene.phase` to `'stopped'`, and from then on `play()`, `wait()`,
`step()` and every frame rethrow it before doing anything, so a swallowed stop emits
no further frame. Plain code between the catch and the next scene call (a `shift()`,
a write to `this.state`) still runs, which is why `rayner check` fails the pattern.

## Outputs, checks and performance

[Scene outputs](SCENE-OUTPUTS.md) documents snapshots, text, elements, traces,
step indexes, full frames and live DOM playback. They all consume native scenes.
Embedded fonts make ordinary glyph geometry independent of installed browser
fonts; [requested lettering](LETTERING.md) adds scripts and maths through snapshots.

[Testing Rayner](TESTING.md) says which check answers which question: domain truth,
geometry and replay, motion continuity, readable served paint, or whether readers
understand. A pass on one says nothing about the others. `MotionSink` and
`analyzeMotion` (`rayner/testing`) inspect sampled motion; they judge neither the editing nor the maths.
`analyzeMotion(sink)` returns a `MotionEvent` for each teleport, resize, pop, cut,
flicker or handoff in the frames a `MotionSink` sampled: `{ kind, frame, t, step, what, magnitude, detail }`.

For profiling Rayner itself, `perf.enable()` (in `src/perf.ts`, internal to the repository) starts counters and spans, `perf.report()` explains
where measured work went, and `perf.chromeTrace()` returns trace-event JSON for a
trace viewer. Disable it with `perf.disable()`. Compare identical scenes, timestamps,
frame rates and output modes: a trace-only dry run is not a playback benchmark.
Measure a real workload before making a speed claim.
