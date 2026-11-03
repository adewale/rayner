# Engine fundamentals

Read this when you want to draw, animate, inspect or extend a scene without using the
whole publishing workflow. The [tutorial](TUTORIAL.md) covers authoring a lesson;
[extension recipes](EXTENDING.md) give runnable examples. All names below are public
exports from `rayner` unless a different entry point is shown.

## The model

A `Scene` runs a TypeScript program. That program creates a tree of `Mobject`s,
plays `Animation`s and marks named `step()` boundaries. A `Sink` receives the frames.
Changing the sink changes the output, not the scene's explanation.

| Primitive | Responsibility |
| --- | --- |
| `Mobject` | Identity, children, style, geometry operations, layout and updaters |
| `Group` | Several mobjects treated as one ordinary mobject |
| `VMobject` | Drawable cubic Bézier subpaths, with open/closed flags |
| `Text`, `Code`, `DecimalNumber` | Text and numbers, rendered with glyph outlines |
| `Animation` | A time-dependent operation on a mobject; extension point for new motion |
| `Scene` | Admission, ordering, named steps, model state and one fixed-rate clock |
| `Frame` | The scene's camera, used as the SVG viewBox rather than drawn |
| `Sink` | A consumer of frames and optional step-boundary notifications |

The drawing area is 16 × 9 scene units, centred on `[0, 0]`, with positive y up.
An output width changes pixel size, not those coordinates. A `Box` is
`[minX, minY, maxX, maxY]`. A `Vec` is `[x, y]`.

## Geometry and paint

Points are world coordinates stored in `Float32Array`s. `shift`, `scale`, `rotate`
and `moveTo` change the points of the whole family. There is no separate model
transform matrix whose effect an inspector must reconstruct.

`VMobject.startNewPath(point)`, `addLineTo(point)`, `addCubic(handle1, handle2, end)`
and `closePath()` build paths. `setPolygon(corners)` is convenient for closed
polygons. Use those methods instead of writing a point buffer yourself: they keep
the geometry caches current. If custom code mutates a point buffer in place, call
`touchPoints()` on the object whose points changed and `invalidateBox()` afterwards:
the first updates the render-cache version, the second invalidates layout bounds.
One does not replace the other. Prefer path builders and geometric methods.

Style includes fill, stroke, their opacity and width, overall opacity, and optional
SVG paint details such as dashes and joins. `setFill`, `setStroke` and `setOpacity`
update it. `Create`/`Write` use the transient `drawFraction` to reveal a path.
Changing `style` or point arrays behind the supported methods risks stale caches.

Common layout operations are `nextTo`, `alignTo`, `arrange`, `moveTo`, `setWidth`
and `setHeight`. Bounds describe geometry, not a complete screen-pixel collision
proof: clipping, paint order and stroke also matter. The publishing checks inspect
those separately.

## Ownership, identity and copying

`group.add(child)` makes the child belong to that group, detaching it from its old
parent. A scene admits one root for a subtree: admitting a parent must not paint a
child twice. `Scene.add`, `remove`, `replace`, `bringToFront` and `bringToBack`
control scene membership and draw order. Avoid inserting the same child twice or
creating a cycle; a tree is the supported structure.

`id` is a runtime identity. `key` is an optional semantic name useful for matching.
Neither a current numeric id nor a position in a child's array is a persistent
domain identifier. Use your own semantic keys when the domain supplies identity.

`copy()` clones the tree and mutable geometry/style, gives copies new identities,
and clears updaters and saved-state history. A custom composite should expose its
parts through getters into its own children, as [StatusBadge](../recipes/extensions.ts)
does. If it stores named child references, implement `rebindReferences(source, map)`
so the clone names its children, not the original's. Use `copyData(source)` for
additional mutable data that the base class cannot copy itself.

`saveState()` stores a copy. `restore()` restores immediately; `Restore` does it as
an animation. A generic transform can align or replace child structure, so retain
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

The default frame rate is 30. Time comes from the frame count. Sinks can wait for
browser display or return immediately offline, but cannot change the model's time
step. Exact comparisons are within the chosen frame grid, not arbitrary subframe
timestamps.

## Steps, state and evidence

`await this.step(name, metadata)` closes the previous step and begins the next.
Names should be stable, unique URL identifiers. `title`, `line`, `caption` and
`detail` have reader meanings; other metadata can describe the model's inputs.
A caption may extend the step to allow reading. The resting picture is therefore
different from the picture at a step's start.

`this.state` contains what the subject program is doing. Use `Scene<MyState>` for
typed access. `describe()` snapshots its JSON representation plus registered
describers. State and recorded evidence accept plain JSON data and finite numbers;
functions, class instances, cycles and nonfinite values are refused. Shape objects
belong in the scene tree, not in `state`.

`this.record(kind, data)` records what an animation or operation did. It is evidence
attached to a step, distinct from subject state. `onStep` and `addDescriber` are
supported extension hooks; each returns its own removal function. Do not replace
the scene's methods to attach helpers.

A trace records what an author declared. It does not prove the declaration true.
Compare the trace with an independently checked program or reference, and check
the visible values too. [Views](VIEWS.md) help connect state to its picture.

## Updaters, derived pictures and seeking

`mobject.addUpdater((object, dt) => ...)` runs before a rendered frame. Camera
updaters run after ordinary objects. Clear registrations with `clearUpdaters()`
when they are no longer needed. An updater that integrates `velocity * dt` depends
on previous frames. The engine conservatively replays any play or wait with active
updaters, including an updater that merely reads the current value.

`view(scene, render).sync()` is different: it rebuilds a target from state at the
start of the play and morphs to that target. It is useful for discrete updates.
It does not continually reevaluate a nonlinear relationship between endpoints.

`renderAt(SceneClass, time, sink)` reruns the scene up to the first frame at or after
the requested time (or the final frame if past the end). Endpoint-based plays can
skip intervening interpolations. Stateful updaters cannot. This is replay with
skipping, not constant-time indexing into a precompiled timeline.

A sink stops a seek with `StopScene`. Do not catch animation errors broadly in
`construct()`: catching that signal can allow author code to mutate the stopped
scene. Handle known model errors before animating. [Sampled parameters](PARAMETERS.md)
records what a directly sampled alternative to updaters would buy the collection.

## Outputs, checks and performance

[Scene outputs](SCENE-OUTPUTS.md) documents snapshots, text, elements, traces,
step indexes, full frames and live DOM playback. They all consume native scenes.
Embedded fonts make ordinary glyph geometry independent of installed browser
fonts; [requested lettering](LETTERING.md) adds scripts and maths through snapshots.

Use [Testing Rayner](TESTING.md) to choose checks. There are different questions:
domain truth, geometry/replay correctness, motion continuity, readable served paint
and whether readers understand. Success on one does not establish the others.
`MotionSink` plus `analyzeMotion` inspect sampled motion; they are not an editorial
or mathematical oracle.

For profiling, `perf.enable()` starts counters and spans, `perf.report()` explains
where measured work went, and `perf.chromeTrace()` returns trace-event JSON for a
trace viewer. Disable it with `perf.disable()`. Compare identical scenes, timestamps,
frame rates and output modes: a trace-only dry run is not a playback benchmark.
Grouping glyph runs, avoiding unnecessary redraws and retaining fast seeking help,
but measure an actual workload before making a speed claim.
