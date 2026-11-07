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
redrawn in place.

The drawing area is 16 × 9 scene units, centred on `[0, 0]`, with positive y up.
An output width changes pixel size, not those coordinates. A `Box` is
`[minX, minY, maxX, maxY]`. A `Vec` is `[x, y]`.

## Geometry and paint

Points are world coordinates stored in `Float32Array`s. `shift`, `scale`, `rotate`
and `moveTo` change the points of the whole family. There is no separate model
transform matrix whose effect an inspector must reconstruct.

`VMobject.startNewPath(point)`, `addLineTo(point)`, `addCubic(handle1, handle2, end)`
and `closePath()` build paths, and `setPolygon(corners)` builds a closed polygon.
Use them, or the transforms above, rather than writing a point buffer yourself: they
keep the render cache and the cached layout bounds current, and a buffer written in
place leaves both stale. A shape of your own builds its points in `initPoints()`,
which its constructor calls.

A path is `subpaths`, one `Float32Array` of cubic Bézier points per subpath (its
start, then three points per curve), with `closed` saying which are closed; read
them, and change them with the methods above. `hasPoints()` says whether a mobject
has points of its own, as a Group does not. To walk a path: `numCurves(i?)` counts
the curves of subpath `i` or of the whole path, `pointOnCurve(i, c, t)` is the point
at parameter `t` on curve `c`, `curveLength(i, c)` and `arcLength()` measure a curve
and the whole path, `curveParamAt(i, c, s)` is the parameter a length `s` along a
curve reaches, and `pointFromProportion(t)` is the point a fraction `t` of the path's
length along it, which `MoveAlongPath` (`rayner/extras`) and the stage's sketch travel by.

`applyPointsFunction(fn)` maps every point of the family through `fn([x, y])`, and
`applyAffine(a, b, c, d, e, f)` applies the affine map `[a c; b d]p + [e f]` without
allocating per point; both work about the box's centre unless given `aboutPoint` or
`aboutEdge`. `boxPoint(direction)` is a point of the bounding box: `[0, 0]` its
centre, `[1, 1]` its upper right.

Style includes fill, stroke, their opacity and width, overall opacity, and optional
SVG paint details such as dashes and joins. `setFill`, `setStroke` and `setOpacity`
update it; `setStyle(style)` sets several fields at once, and `setColor(c)` sets fill
and stroke to one colour. `Create` and `Write` (`rayner/extras`) use the transient `drawFraction` to reveal a path.
Changing `style` or point arrays behind the supported methods risks stale caches.

A colour left out takes the scene's. `scene.colors` holds five (`paper`, `ink`, `soft`,
`emphasis`, `bad`), and a part built without a colour is marked with the role it takes
(`defaultColors`): text, lines, arrows and axes take `ink`, guide lines and a readout's keys
`soft`, `SurroundingRectangle`, `Circumscribe` and plotted data `emphasis`, and `Cross` `bad`.
When the part first enters the scene (`scene.add`, a play that draws it or morphs toward it, or
a parent already on stage), each field still holding its default takes the scene's colour, and a
field set since keeps what it was set to. A stage sets `scene.colors` from its look (`s.look`), so an
axis drawn without a `stroke` reads on any paper. A scene without a stage draws dark ink on white
paper, and the SVG sinks draw `paper` behind the frame unless given a `background`.
`lerpColor(a, b, t)` gives the colour `t` of the way from `a` to `b` in sRGB, as `#rrggbb`
(Manim's `interpolate_color`), for a colour between two of the look's.

Common layout operations are `nextTo`, `alignTo`, `arrange`, `moveTo`, `setWidth`
and `setHeight`; `arrangeInGrid(cols, { buff })` lays the children out row by row,
`cols` to a row, each centred in a cell as wide as the widest and as tall as the
tallest. Bounds describe geometry only; clipping, paint order and stroke
also decide what collides on screen, which is why `rayner check` measures painted
labels separately.

A `Text`'s `advance()` is its exact advance width and `textSize()` the size it is
drawn at now, after any scaling. `shapeRun(text, size)` shapes a string with the
text's own shaping and returns the run, `{ glyphs, width, ascent, descent }`, as
`font-metrics` reads it. `tabWidth` is the tab stop a text's tabs are laid out to,
which `Code` sets. A `DecimalNumber` shows `value` with `decimals` places between
`prefix` and `suffix`; `setValue(v)` redraws it in place for a new value, and
`DecimalNumber.format(v, decimals, prefix, suffix)` is the string it would show.

## Ownership, identity and copying

`group.add(child)` moves the child into that group, detaching it from its old
parent. A scene admits one root per subtree, so admitting a parent never paints a
child twice. `Scene.add`, `remove`, `replace`, `bringToFront` and `bringToBack`
control membership and draw order. The structure is a tree: do not insert a child
twice or make a cycle. `scene.familyMembers()` lists every mobject on the stage and
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

An `.animate` builder records chainable methods and constructs a target when the
play begins. Ordinary transforms capture endpoints at `begin()` and interpolate
between them. The scene applies the rate function before calling `interpolate`;
a custom animation must not apply it twice. Its `finish()` lands at the rate
function's endpoint, which need not be 1 (`thereAndBack` returns to the start).

Use one `play(a, b)` for simultaneous operations, `Succession` for sequential
operations and `AnimationGroup`/`LaggedStart` for grouped schedules. Never await two
concurrent `Scene.play()` calls: there is one scene clock. Two simultaneous
animations may not drive the same mobject or an ancestor and its descendant.
`Scene.play()` checks and rejects that conflict.

Capture starting values when an animation **begins**, not when it is constructed.
Earlier members of a `Succession` may change them. Define intermediate geometry
from that captured start and alpha rather than adding a per-frame displacement.
[FollowAngle](../recipes/continuous.ts) demonstrates the extension contract.

The default frame rate is 30. Time comes from the frame count: `scene.frameCount` is the
frames emitted so far, and `scene.time` the seconds they make. Sinks can wait for
browser display or return immediately offline, but cannot change the model's time
step. Exact comparisons are within the chosen frame grid, not arbitrary subframe
timestamps.

## Steps, state and evidence

`await this.step(name, metadata)` closes the previous step and begins the next.
Names are stable, unique URL identifiers. `title`, `line`, `caption` and `kind`
(`'short'`, `'main'` or `'detail'`) mean something to the reader; other metadata
can describe the model's inputs. A caption extends its step until it could be read,
so the step's resting picture, its last frame, can differ from its first.

`this.state` is the model: what the subject program is doing, and nothing about
how it is shown. Use `Scene<MyState>` for typed access. `this.shown` holds what is
shown apart from the model, such as which of several pictures a phase shows; a
view's `draw` may read it, and a machine never changes it. `stateJson()` copies
the model as JSON, with the parts helpers add with `addJson(fn)`; `shownJson()` copies
`shown`, with the parts added with `addJson(fn, 'shown')`, such as the stage's
description of its picture. The trace records the model as `before` and `after`
and the second as `shown`. Both accept plain JSON and finite numbers, and refuse
functions, class instances, cycles and non-finite values; shapes belong in the
scene tree.

Evidence is what an animation or operation did, attached to the step it happened
in, apart from the model. `this.record(kind, data)` adds a record, and every
animation's `evidence()` is recorded as it begins: a matching transform records
`{ kind: 'match', … }` and `TransformDiff` `{ kind: 'diff', … }`
([matching](MATCHING.md#evidence)), a view's sync its morph's counts with the view's
key as `view`, a follow or a view's tween its interval and targets, and a machine's event
`{ kind: 'event', event }`. `onStep` and `addJson` are the extension hooks,
and each returns its own remover; do not replace the scene's methods to attach
helpers.

A trace records what an author declared; it does not prove the declaration true.
Compare it with an independently checked program, and check the values on screen
too: a [view](VIEWS.md) ties a picture to the state it was drawn from.

## Updaters, derived pictures and seeking

`mobject.addUpdater((object, dt) => ...)` runs before a rendered frame. Camera
updaters run after ordinary objects. `mobject.update(dt)` runs the updaters of a mobject and
its descendants once, as the scene does before each frame. Clear registrations with `clearUpdaters()`
when they are no longer needed. An updater that integrates `velocity * dt` depends
on previous frames. The engine conservatively replays any play or wait with active
updaters, including an updater that merely reads the current value.

`view(scene, draw).sync()` registers no updater: it rebuilds a target from state
when its play begins and morphs to it. That suits discrete updates; it does not
evaluate a relationship between the two endpoints, which a [view's tween](CHOREOGRAPHY.md#following-one-number) does.

`renderAt(SceneClass, time, sink)` (`rayner/output`) reruns the scene up to the first frame at or after
the requested time (or the final frame if past the end), skipping the interpolations
of plays without updaters. A seek is a replay with skipping, not an index into a
precompiled timeline.

A sink stops a seek with `StopScene` (`rayner/output`). Do not catch animation errors broadly in
`construct()`: catching that signal can allow author code to mutate the stopped
scene. Handle known model errors before animating. The engine limits the damage:
a `StopScene` from a sink sets `scene.stopped`, and from then on `play()`, `wait()`,
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

For profiling, `perf.enable()` (`perf` is in `rayner/testing`) starts counters and spans, `perf.report()` explains
where measured work went, and `perf.chromeTrace()` returns trace-event JSON for a
trace viewer. Disable it with `perf.disable()`. Compare identical scenes, timestamps,
frame rates and output modes: a trace-only dry run is not a playback benchmark.
Measure a real workload before making a speed claim.
