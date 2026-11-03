# Several drawings following the same parameter

**Status: API design, not an exported API.** The runnable
[continuous recipe](../recipes/continuous.ts) implements a small instance using
today's supported `Animation` extension point. This document specifies a general
abstraction, its integration and the tests required before exporting it. Existing
scenes, Agentic Mermaid capture and PR #89 do not depend on adopting it.

## The problem

One angle should determine a point's position, a radius, a graph cursor and a
number. One model time should determine a token bucket's level, chart position
and remaining capacity. Animating the pictures separately duplicates the model
and can make the pictures disagree in between endpoints.

`view.sync()` solves a different problem: build the next picture once and morph
to it. Interpolating opposite positions on a circle crosses its centre. Evaluating
the orbit from the intermediate angle follows the circle. Keep both operations.

An arbitrary updater can integrate over previous frames; a derived value can be
evaluated without them. The new abstraction must express that distinction rather
than registering every relationship as a frame-integrating updater.

## Proposed author surface

The following is proposed code, not something that currently imports from Rayner:

```ts
const rig = parameterRig(this, {
  id: 'orbit',
  parameters: { angle: { initial: 0, min: 0, max: Math.PI, unit: 'rad' } },
  model: p => orbit(p.angle),
});

rig.bind(dot,     { position: sample => sample.position });
rig.bind(radius,  { endpoints: sample => [[0, 0], sample.position] });
rig.bind(readout, { number: sample => sample.angle });

await this.play(rig.to({ angle: Math.PI }), { runTime: 1, rateFunc: linear });
```

`orbit` remains an ordinary, independently tested function. A rig has several
named scalar parameters, one derived model sample and several bindings. Binding
adapters implement supported operations (`position`, line `endpoints`, decimal
`number`, text and paint); applications can supply additional adapters with an
explicit target and the same mutation/ownership contract. This is not a general
reactive effect system.

The proposed types and operations are:

| Operation | Meaning |
| --- | --- |
| `parameterRig(scene, {id, parameters, model})` | Register a scene-local rig; infer the parameter tuple and model type |
| `rig.bind(target, adapters)` | Bind an existing mobject; return a remover; reject duplicate/overlapping target families |
| `rig.sample(values)` | Validate a complete tuple and return an immutable model sample without changing the drawing or current values |
| `rig.set(partialValues)` | Atomically evaluate and apply a tuple immediately, before admission or for an explicitly controlled paused preview |
| `rig.to(partialValues, options?)` | Return a scheduled animation; capture omitted parameters and starts when it begins |
| `rig.values` | Readonly snapshot of currently committed named values |
| `rig.dispose()` | Remove registrations and release bindings; retain the drawn objects |

No first-release implicit dependency discovery or arbitrary derived-node graph is
needed. The model receives only the current immutable parameter tuple. Shared
intermediate work belongs in that model and is evaluated once per sample; bindings
all read its result. Ordinary functions compose inside it without a new language.

## The four contracts

### 1. Named, validated parameters

Names are unique within a scene-local rig id; ids are unique within a scene.
Parameters have finite initial values, optional finite ordered bounds and optional
units. Unknown names and nonnumeric/nonfinite values are errors at JavaScript as
well as TypeScript boundaries. Empty partial updates leave values unchanged.

Targets are validated when an animation is built, but starts are captured in
`begin()`. Thus two `to()` calls constructed together still work in `Succession`.
At alpha 0 and 1 use the exact captured endpoints, not a numerically approximate
`start + (end - start) * alpha` result.

The scene applies the easing once. If an easing overshoots the declared domain,
reject the sample with rig id, parameter and value; do not silently clamp a model.
Authors can choose an easing inside the domain or declare a wider justified domain.
Phase wrapping is an explicit model operation: a full revolution is a continuous
angle interval, not a parameter reset hidden halfway through an animation.

### 2. One sample, then derived bindings

For each evaluated time, compute all parameter values first, run the model once,
then compute every binding's output from that same sample. Only then apply the
drawing changes, followed by rendering/inspection. Binding order must not change
results. A binding cannot use another binding's newly drawn geometry as its model.

The model and adapter calculations must be synchronous, deterministic and free of
history: no `dt` accumulation, ambient clock, random draw or mutable network result.
External results are pinned inputs; stochastic models need explicit seeds. The
calculated patch is validated before application. A failed calculation must not
leave half the targets updated. Custom apply adapters must not throw after mutation
or write outside their declared target; that is a documented extension contract,
not something TypeScript or frozen inputs can universally enforce.

Coordinates are absolute world coordinates, matching the current engine. Optional
placement is an explicit immutable origin/scale/rotation input to the model or a
standard adapter, never read back from the previously drawn target. Moving a whole
rig between plays requires updating that placement input before sampling again;
there is no implicit attempt to recover an unknown transform from live points.
Camera movement remains independent.

### 3. Stable identity and one writer

A binding updates the same outer `Mobject`; it does not replace or reparent it.
For text, the bound Text identity stays stable although its glyph children may be
rebuilt. Bind only to parts whose identity is stable for the interval. A generic
View's old child or a replaced diagram part is not such a reference.

The first release claims the whole target subtree, conservatively, rather than
attempting property-level concurrent writes. One bind can update several properties.
Reject two bindings claiming the same object or an ancestor/descendant pair.
Several rigs can animate concurrently when their parameter handles and target
families are disjoint. Ordinary animations may change those objects between rig
animations; they may not write them concurrently with a rig's animation.

Lower `rig.to()` to a scheduled animation that declares **all** written targets and
its parameter handles before `begin()`. Use the existing `Scene.play()` overlap
check through the animation-group schedule interface. Do not hide extra target
writes behind one invisible ValueTracker mobject, which would bypass that check.
The implementation can use a specialised AnimationGroup whose evaluation computes
the shared sample before applying its binding members. It must preserve nested
group and Succession scheduling, including zero runtime and rate endpoints.

Bindings do not reparent imported diagram marks into a new group just to obtain
ownership. Grouping is a schedule/ownership declaration, not a change to the drawn
tree. Binding lists are fixed while an animation runs; removing a target or morphing
its owner during the interval is refused, rather than writing a stale reference.

### 4. Reproducible evaluation and inspection

The same captured interval and parameter tuple must yield the same model sample,
geometry, strings and paint regardless of prior requested frames. Bindings use
absolute setters, not repeated scale/shift operations on current geometry.
Repeated and out-of-order evaluations must be harmless.

Attach an opt-in describer producing, for example,
`parameters: { orbit: { values: {angle: 1.57}, model: {...} } }`. The scene-local
registry owns this namespace and rejects an authored-state collision; multiple
rigs must not silently overwrite each other. The model sample must satisfy the
existing plain-JSON state rules. Record completed parameter transitions once per
step as evidence, not once per render, so skipped frames cannot change evidence.

Traces still record step boundaries. `renderAt` plus `describe()` inspects an
intermediate sample. Neither is a log of every continuous input. A future reader
control must record its accepted inputs, seed and discrete events if its session
is to be replayed; it must not leave a slider's final value as unexplained state.

## How it fits beneath existing scenes

1. Keep `Scene.construct`, `play`, named steps, existing mobjects and sinks. A rig
   animation is another accepted schedule, so scenes opt in one interval at a time.
2. Capture its starts and binding membership at `begin()`. At each interpolation,
   sample parameters, compute the model and apply bindings before the sink reads
   the scene. The final value is also committed when a whole play is skipped.
3. Do not register an updater for these bindings. Current endpoint-based skip
   logic can jump across the interval and evaluate the requested alpha. Plays with
   ordinary stateful updaters retain replay; no new purity claim is made for them.
4. Add the opt-in descriptions/evidence through existing hooks. Unused scenes keep
   their output, trace shape and bundle contents. No continuous-input reader or
   schema change is necessary for this first authoring capability.

The runnable FollowAngle recipe already exercises this path using one ordinary
group as its declared animation target. The general API must handle separately
owned targets without changing their hierarchy, plus validation and lifecycle.
That is the remaining implementation work, not a need to replace the renderer.

A later evaluator could expose
`sample(time, inputs, events) -> state + drawing + descriptions` and let steps,
sliders and media exporters share it. Do not claim arbitrary async scene programs
can automatically compile to that function. Stateful simulations still require
replay/checkpoints, and events such as deletion and request acceptance remain
discrete transitions rather than fractional states.

## Agentic Mermaid

Keep layout and semantic capture at build time. Agentic Mermaid renders diagram
families and styles; the importer lowers its paths and labels into native groups
with semantic ids. A rig can bind an independent token/readout to those captured
parts or their route geometry. No Mermaid renderer runs on each animation frame.

For example, resolve `d.get(id)` and a route from the captured diagram once, then
let progress drive a token along that route and derive its numeric readout from
the same progress. A token-on-route picture alone is not a verified graph walk:
record endpoints/edge identity and retain `d.walk`'s adjacency and reveal checks
if presenting it as a journey the graph permits.

Structural changes remain `d.morph(next, {ops})`, checked against Agentic Mermaid
mutation at build time. End bindings before a morph and resolve the new parts
afterwards; a stable semantic id does not promise the same runtime Group survives.
Do not continuously reposition a node and leave its captured connectors behind.
Continuous node dragging or per-frame graph layout would require a separate route
and layout contract and is outside this first parameter capability.

Likewise, do not bypass diagram mark/dim helpers for semantic claims: a raw paint
binding does not automatically update their descriptions. Provide an adapter that
preserves description/contrast obligations or bind to separate native overlays.
Additional animated formula strings must be declared for lettering capture;
continuous numeric readouts should use existing digit glyphs rather than demand
an unbounded stream of new typeset snapshots.

## PR #89 and migration

Reviewed against open [PR #89](https://github.com/adewale/rayner/pull/89), head
`f57a1bcb3d850b68041237b564707ebcebc21e7a`, on 2026-11-03. Its scripts, model/source
checks, transfer questions, finite cases and served-paint review remain valuable
independently. This is a companion capability, not a replacement for its lesson work.

| Existing work | Parameter integration |
| --- | --- |
| Separate `script.md`, model, model test and scene; `meta.answer` and `meta.checks` | Preserve the question, answer and tests. The rig consumes the model, not the prose. Our raw recipes do not claim to satisfy the PR's complete lesson requirements. |
| Seasons' shared calendar, declination and daylight calculations | Use one calendar/day parameter to derive orbit, chart cursor and readouts from the existing functions. Do not introduce another approximate calendar inside the animation. |
| Token bucket's reference and finite rate cases | Parameterise elapsed time between fixed request events. Evaluate refill from the same event history; keep accept/reject and token subtraction discrete. |
| Melody/rhythm model | A beat/playhead can drive highlighting and a readout; audio scheduling remains the existing audio owner's responsibility. Do not schedule audio as a side effect of resampling a frame. |
| Python dict, Git, guarded promise handlers and statecharts | Keep model-derived discrete transitions. Continuous animation can show travel or emphasis; it must not fabricate intermediate program states or replace their external oracles. |
| Finite-case source and served-reader checks | Retain all existing reviewed cases and resting pictures. Add intermediate samples and domain boundaries for each continuous interval; do not call a sampled range exhaustive. |

The PR is open and its head can change. Do not overwrite its tutorial or regenerate
its snapshots just to add these docs. Merge the companion documentation and recipes
with the final public API, rerun their installed-package checks, then migrate a
small example interval while retaining its external model and served-paint checks.
The PR does not establish a general continuous-input reader or improved learning.

## Required implementation evidence

Before exporting `parameterRig`, retain the recipe's independent geometric oracle
and add checks for multiple parameters, invalid JS inputs/bounds/names, exact
endpoints, rejected easing overshoot, an unchanged parameter, and atomic rejection
before applying any patch. Sample repeated/reversed times and nested schedules.

Test begin-time capture in Succession, zero-duration transitions, hidden/removed
targets, duplicate and ancestor/descendant bindings, ordinary-animation conflicts,
independent concurrent rigs, disposal and copying without shared live registrations.
Check actual visible numbers against the model, not only trace-to-trace agreement.
Verify seek/full SVG equality and identical evidence with skipped frames.

Then exercise a captured diagram route and a published native example at existing
reader widths. New controls would additionally need keyboard, history, paused
redraw, cancellation and input-log checks. Benchmark identical scenes with bindings
and updaters separately; do not infer constant-time seeking or a speedup from an
API shape alone.
