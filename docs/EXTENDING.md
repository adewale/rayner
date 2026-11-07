# Runnable extension recipes

Each recipe is a maintained example of one public extension point: a function, a
mobject, an animation, an invariant or a sink. What you build this way still works
with every ordinary Rayner operation, so a new combination needs no new branch in
the engine.

Run all five in a checkout (Node 24+, no browser):

```sh
npm ci
npm run build:lib
npm run recipes -- --out out/recipes
node --test test/recipes.test.ts
```

After installation in an author project:

```sh
node node_modules/rayner/dist/recipes/render.js --out out/recipes
```

Packages built from this source include the recipes; older releases may not. The
installed runner is compiled JavaScript, because Node does not strip TypeScript inside
`node_modules`; copy the `recipes/*.ts` sources into your project to edit them. They
import only from the public entry points (`rayner`, `rayner/explain`, `rayner/output` and
`rayner/testing`). `npm run check` type-checks them, the standard tests run
them, and `npm run pack:smoke` runs them from a fresh install. Their output is raw
engine content, not a checked explainer.

## Bind data to a scene and inspect it

[document.ts](../recipes/document.ts) takes an ordinary request input, computes a
route, and exposes it as a drawing, text and trace. [Scene outputs](SCENE-OUTPUTS.md)
covers every output API.

Try replacing `route` with your own deterministic model. Keep the model apart from
rendering, record its inputs and compare its outputs with a reference outside the
drawing; a test-vector generator, documentation build or agent can then supply
inputs without learning a JSON animation language.

## Make a reusable shape and composite

[extensions.ts](../recipes/extensions.ts) contains three independently useful units:

- `Diamond extends VMobject` builds one custom path with `setPolygon`.
- `StatusBadge extends Group` combines that path and a text label. Getters find
  the badge's own children, including after `copy()`.
- `statusRow(labels)` is an ordinary function arranging several badges, each keyed by its label so the scene finds one with `row.find(label)`.

All of them work with `FadeIn`, `Transform`, `Group`, copying, layout and the SVG
renderer without registering anything, because they are built from existing path
primitives. The copy test moves the cloned path and changes the cloned label, then
checks that the originals and parent references are unchanged.

Try a diamond containing another component, or the same badge in a chart and a
protocol diagram. Reuse a component through its mobject interface rather than
adding a badge-specific operation to the scene or renderer.

For a custom class with mutable fields outside its children, read
[copying and ownership](ENGINE-FUNDAMENTALS.md#ownership-identity-and-copying).
Do not assume `copy()` knows how to clone an arbitrary closure or external handle.

## Make several objects follow one parameter

[continuous.ts](../recipes/continuous.ts) supplies `orbit(angle)`, `makeOrbit()` and
`FollowAngle extends Animation`. One angle determines a dot's position, the radius
endpoint and a decimal readout. Sample the middle of the motion:

```sh
npm run recipes -- --scene continuous --time 0.5 --out out/orbit
```

The dot is at the top of the circle and the number reads 1.57, because the recipe
evaluates the orbit throughout the motion; interpolating the two opposite endpoint
pictures would put the dot through the centre.

`FollowAngle` captures the initial value in `begin()`, makes an immutable sample
from alpha, applies absolute updates and publishes that sample as scene state.
It registers no updater. Its animation target is the whole dependent group, so
the existing `play()` overlap checker rejects another simultaneous animation of
the dot. The dot, line and numeric mobjects retain their identities.

Try replacing the orbit function with a spring extension, a gauge or a probability
distribution and adding another dependent readout. Keep these constraints:

1. Use absolute updates from the current sample; never accumulate `dt` or read the
   previously drawn point as a model input.
2. Write only the animation's owned subtree. Its callback may publish the same
   sample to state but must not secretly animate another object.
3. Capture changing endpoints at `begin()`. Never use ambient time, unseeded random
   values or mutable external inputs to decide intermediate geometry.
4. Stay inside the model's domain. This recipe's angle is in `[0, pi]`, and its
   rate function must stay in `[0, 1]`; overshooting easings are refused by the
   model's domain check.

The recipe fixes drawing coordinates at construction, so shifting, scaling or
rotating the dependent group does not survive the next sample; a camera move is
unaffected. The exported form of this idea is a [view's tween](CHOREOGRAPHY.md#following-one-number):
one sampled number, a `draw` that returns the picture at it, and the targets it
writes, named for the one-writer check.

## Hold an invariant on every frame

[invariants.ts](../recipes/invariants.ts) moves a dot half way round a circle twice
and registers one invariant: the dot stays on its circle.

```ts
this.addInvariant('the dot stays on its circle', (scene) => {
  const dot = scene.find('orbit:dot');
  if (!dot) return; // nothing to check on this frame
  return Math.abs(Math.hypot(...dot.center()) - 2) <= 1e-3 || 'the dot is off its circle';
});
```

A check reads the scene by key and changes nothing. It returns a message when the
invariant fails, `true` when it held, and nothing when there was nothing to check on
that frame. An invariant that never holds in a whole run tested nothing, so
`rayner check` fails it, which keeps a misspelt key from passing. `rayner check` runs
every registered invariant on every frame of every scenario, so an invariant about what
happens between steps (a gauge meeting a line, a pointer on its circle) fails at the
first frame that breaks it. Sampled from its angle by a view's tween, the dot holds; morphed
between its two ends with `Transform`, it cuts through the centre, and the recipe's test
finds those frames. `token-bucket` and `ring-buffer` declare invariants of this kind.

`InvariantSink` (`rayner/testing`) runs them, and it is the pattern for a check of your own: a sink
receives every frame of a full run, reads the scene, and hands the frame on to an inner
sink, so several checks share one run. `rayner check` composes it with its motion and
legibility sampling this way. A seek skips frames, so run invariants over a full run.
After the run, `failures` lists each failure as an `InvariantFailure`, `{ invariant, step,
frame, t, message }`; `checked` and `held` count, per invariant, the frames it ran on and the
frames it held on; and `vacuous()` names the invariants that ran and never held.

## Consume a scene in another application

[render.ts](../recipes/render.ts) shows the output adapter: it chooses a registered
Scene class and writes SVG, text, elements, traces and an index. Replace file writes
with your application's response, cache or editor view. A sink can stream frames
instead. Keep host-specific imports in that adapter rather than adding filesystem
or DOM assumptions to your model.

In a browser, `DomSink` (`rayner/output`) draws into an SVG element; in a document generator,
`SnapshotSink` returns a frame. See the live-browser example in
[Scene outputs](SCENE-OUTPUTS.md#live-browser-output-and-publication).

## Compose built-in animation techniques

[choreography.ts](../recipes/choreography.ts) uses the exported `GrowFromEdge`
and `PulseAlongPath` with native shapes and a readout drawn from state.
[Reusable choreography](CHOREOGRAPHY.md) documents their timing, ownership, opacity,
snapshot and cleanup contracts.

## When two extensions meet

Each extension point has one rule for what happens when two of them act on the same scene. Where a rule is enforced, breaking it fails at once instead of changing the picture quietly.

| Extension point | When two meet | Enforced by |
| --- | --- | --- |
| A function that returns mobjects | Each call returns new mobjects, so two calls share nothing. A key names one part on the stage. | `keyedParts()` refuses a repeated key; `rayner check` fails a key held by two mobjects at the end of a step. |
| A mobject | A mobject has one parent: adding it to a second group moves it out of the first. A copy has a new id and no parent but keeps its key, so a copy left beside its original repeats the key. | `add()` moves the child; `rayner check` names the repeated key. |
| An animation | One `play()` drives a mobject once: two animations on the same mobject, or on one inside the other, throw. A `Succession`'s members run in turn and may share mobjects. Separate plays run one after another. | `play()` throws, naming both animations and the mobject. |
| An invariant | Every registered invariant runs on every frame, each on its own, and none may change the scene. Each must hold on at least one frame of a run. | `InvariantSink`; `rayner check` fails an invariant that never held. |
| A sink | Sinks never meet inside the scene. A sink reads each frame and hands it to the sink it wraps, or a fan sends each frame to several sinks in order. | By construction: the scene calls one sink. |
| A machine's transition | An event plays one transition, and the transition must end on what the views draw from the new state. Without one, the views morph to the new state by key. | `rayner check` explores every reachable event and compares where each lands with the views' draw. |

## Test an extension

Test an extension with the same tools Rayner's own suite uses, without a browser. From `rayner/testing`, `traceScene` runs a scene and returns each step's state, evidence and timing. From `rayner/output`, `SnapshotSink` and `renderAt` give the picture at a time. `InvariantSink` runs invariants over a full run. [test/recipes.test.ts](https://github.com/adewale/rayner/blob/main/test/recipes.test.ts) tests the five recipes this way: the copied composite owns its own children, the sampled orbit stays on its circle, and the morphed one leaves it. Give each extension one test of normal use and one that shows its limit failing.

## Composition, compositionality and modularity

Composition is using a diamond, a label and an animation together; modularity is
keeping their implementations behind separate interfaces. Compositionality is the
stronger promise that their behaviour stays predictable when combined: a copied badge
names its own children, a nested animation captures its start when its turn comes, and
a second writer is rejected rather than silently changing the result.

The recipes test those promises rather than one plausible screenshot. Not every
combination works: ownership, domains and copy rules say which do. Publish an
extension's assumptions, and a runnable counterexample for its limits, beside its
example of normal use.
