# Extending Rayner

Rayner is extended from its public entry points, with no internal API: a function that
returns mobjects, a mobject, an animation, an easing, an invariant or a sink. What you
build this way works with every ordinary Rayner operation, so a new combination needs no
new branch in the engine. [`rayner/extras`](#the-extras) is Rayner extended that way, and
the [recipes](#the-recipes) are runnable examples of each extension point.

## The extras

`rayner/extras` holds animations, a shape and easings that were built into the engine and
now sit outside it, written as an author's own would be: each file under `extras/` imports
nothing but `rayner`, the engine's public entry point, and says in its comment which public
names it builds on. `test/extras.test.ts` fails if one imports anything else (an internal
module, another entry point, `rayner/testing` or a package), or drops its comment. Explainers
import it as they import any entry point, `import { GrowFromEdge } from 'rayner/extras'` (in
this checkout, by the relative path `../../../extras/index.ts`, as the collection reaches every
entry point), and so does the engine's own diagram code, which grows chart bars and sends
sequence-diagram tokens with it.

| Extra | What it does | Built on | Used by |
| --- | --- | --- | --- |
| `GrowFromEdge` | Fades in while growing along one axis from a fixed edge; options are a `GrowFromEdgeOptions` | `Animation`'s `doBegin` and `interpolateSubmobject`, `Mobject.copy`, `stretch` and `interpolate` | galton-board's bins; captured chart bars and Gantt tasks |
| `PulseAlongPath` | Travels a route while fading in and out, then leaves the stage | `MoveAlongPath`'s `doBegin`, `doInterpolate` and `doFinish` | galton-board's balls; captured sequence messages |
| `ArcBetweenPoints` | An arc from one point to another, turning through an angle | `Arc`'s options: it works out the centre, radius and starting angle | float-sum, galton-board |
| `rushInto`, `rushFrom`, `thereAndBack` | Easings: start slowly, settle slowly, go and come back | `smooth`, as a `RateFunc` | latest-search, token-bucket |

[Reusable choreography](CHOREOGRAPHY.md) says what the two animations promise about timing,
opacity and cleanup. A positive `angle` turns `ArcBetweenPoints` counterclockwise, as Manim's
does (`test/core.test.ts`), and `test/manim.test.ts` compares the easings with Manim's own
functions.

## Write an animation of your own

`GrowFromEdge` is the pattern for an animation: it fixes what it runs between as it begins,
and draws each frame from those ends and the progress alone. Here it is in full, from
[extras/animations.ts](../extras/animations.ts), as an author writes it against the package.

<!-- from extras/animations.ts -->
```ts
import { Animation, MoveAlongPath, linear } from 'rayner';
import type { AnimationOptions, Mobject, MoveAlongPathOptions, VMobject, Vec } from 'rayner';
```

Everything comes from `rayner`: the base class, and the types for its options. (`MoveAlongPath`,
`linear` and the other types are for `PulseAlongPath`, in the same file.)

<!-- from extras/animations.ts -->
```ts
export interface GrowFromEdgeOptions extends AnimationOptions {
  /** How much of its size along the axis it starts at, from 0 to 1; above 0 by default, so a path it starts as still has length. */
  initialScale?: number;
}
```

Its options are every animation's (`runTime`, `rateFunc`, `lagRatio`, `remover`) and one of its
own. A play's options reach it as they reach any animation.

<!-- from extras/animations.ts -->
```ts
/**
 * Fade in while growing along one axis from a fixed edge: a bar rising from its base, a task's span
 * spreading from its start. Built on `Animation`: as it begins it fixes two copies of the mobject, its
 * end and a start squashed against the edge with `stretch` and made transparent, and each frame
 * interpolates every part of the mobject between its two copies with `Mobject.interpolate`.
 */
export class GrowFromEdge extends Animation {
  /** The edge it grows from: [0, -1] the bottom, [0, 1] the top, [-1, 0] the left, [1, 0] the right. */
  readonly edge: Vec;
  readonly #axis: 0 | 1;
  readonly #initialScale: number;
  /** Each part of the mobject's family, with its start and its end; fixed as it begins. */
  #ends = new Map<Mobject, [start: Mobject, end: Mobject]>();
```

The comment says what it draws and what public API it is built on, as every extra's does. An
animation extends `Animation`, which holds the mobject it plays (`this.mobject`) and its timing.
Its own state is in fields; ES private (`#`) fields are fine on an animation, which is never
copied (a mobject is: see [copying](#make-a-reusable-shape-and-composite)).

<!-- from extras/animations.ts -->
```ts
  constructor(mobject: Mobject, edge: Readonly<Vec> = [0, -1], { initialScale = 0.001, ...opts }: GrowFromEdgeOptions = {}) {
    if (!Array.isArray(edge) || edge.length !== 2 || !Number.isFinite(edge[0]) || !Number.isFinite(edge[1]) ||
      Math.abs(edge[0]) + Math.abs(edge[1]) !== 1 || (edge[0] !== 0 && edge[1] !== 0))
      throw new TypeError('new GrowFromEdge(): the edge must be one unit step along an axis: [0, 1], [0, -1], [-1, 0] or [1, 0]');
    if (!Number.isFinite(initialScale) || initialScale < 0 || initialScale > 1)
      throw new RangeError('new GrowFromEdge(): initialScale must be a number from 0 to 1');
    super(mobject, opts);
    this.edge = [edge[0], edge[1]];
    this.#axis = edge[0] === 0 ? 1 : 0;
    this.#initialScale = initialScale;
  }
```

The constructor checks what a type cannot (an edge that is one unit step, a scale from 0 to 1)
and says so in Rayner's [error style](ENGINE.md#error-messages): the call, what is wrong, and the
allowed values. It reads nothing from the mobject: the mobject may still move, change or be
restyled before the animation plays, so nothing is copied yet.

<!-- from extras/animations.ts -->
```ts
  protected override doBegin(): void {
    // The ends are copies made now, never in the constructor: the mobject may change before it plays.
    const end = this.mobject.copy();
    const start = this.mobject.copy();
    for (const part of start.family()) part.style.opacity = 0;
    start.stretch(this.#initialScale, this.#axis, { aboutEdge: this.edge });
    // A copy's family lists its parts in the same order as the mobject's.
    const parts = this.mobject.family(), from = start.family(), to = end.family();
    this.#ends = new Map(parts.map((part, i) => [part, [from[i]!, to[i]!]]));
    super.doBegin();
  }
```

`doBegin` runs as the play begins. It fixes the two ends: the mobject as it is now, and a copy of
it made transparent and squashed against the edge with `stretch` and `aboutEdge`, so that edge
stays put. Each part of the mobject is paired with its counterparts in the two copies. Then
`super.doBegin()` lets `Animation` set up the frames, and draw the first, at progress 0.

<!-- from extras/animations.ts -->
```ts
  protected override interpolateSubmobject(part: Mobject, _asItBegan: Mobject, alpha: number): void {
    const [start, end] = this.#ends.get(part)!;
    part.interpolate(start, end, alpha);
  }
}
```

`Animation` calls `interpolateSubmobject` for each part of the mobject on every frame, with
`alpha`, the progress its `rateFunc` gives (staggered part by part when the animation has a
`lagRatio`), and the part as it was when the play began, which this animation does not need.
`Mobject.interpolate` sets the part between its two ends. The frame depends on `alpha` and the
ends alone, never on the frame before, so a frame sought on its own (a link to a step, `rayner
check`'s seeks) draws exactly what a played run draws there. At `alpha` 1 the part is its end,
the mobject as it was, so the play finishes where the scene left it, as `rayner check` expects a
step's resting picture to be.

That is the whole pattern. `doFinish` need not be written: `Animation` finishes on the last
frame's progress. An animation that moves along something other than its parts' own ends
overrides `doInterpolate` instead, as `PulseAlongPath` does on top of `MoveAlongPath`, and one
that must undo something as it ends (give back an opacity, say) overrides `doFinish`. Test it as
the extras are tested: `sampleAnimation(animation, alpha)` from `rayner/testing` draws a frame
at any progress outside a play, in any order, and `test/choreography.test.ts` holds both
animations to their promises.

## The recipes

Each recipe is a maintained example of one public extension point.
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
import only from the public entry points (`rayner`, `rayner/explain`, `rayner/drawing`,
`rayner/extras` and `rayner/testing`). `npm run check` type-checks them, the standard tests run
them, and `npm run pack:smoke` runs them from a fresh install. Their output is raw
engine content, not a checked explainer.

### Bind data to a scene and inspect it

[document.ts](../recipes/document.ts) takes an ordinary request input, computes a
route, and exposes it as a drawing, its state and a trace. [Scene outputs](SCENE-OUTPUTS.md)
covers every output API.

Try replacing `route` with your own deterministic model. Keep the model apart from
rendering, record its inputs and compare its outputs with a reference outside the
drawing; a test-vector generator, documentation build or agent can then supply
inputs without learning a JSON animation language.

### Make a reusable shape and composite

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
`copy()` makes the copy without calling your constructor, so keep a mobject's state in ordinary
fields (a TypeScript `private` one is fine), never ES private (`#`) fields or methods, which the copy
would lack: copying one, as a transform or a fade does, is refused with a `TypeError` that names your
class and the member. It gives the copy its
own arrays, maps and sets; copy what they hold, and anything else mutable, in `copyData`. Do not
assume `copy()` knows how to clone an arbitrary closure or external handle.

### Make several objects follow one parameter

[continuous.ts](../recipes/continuous.ts) supplies `orbit(angle)`, `makeOrbit()` and
`FollowAngle extends Animation`. One angle determines a dot's position, the radius
endpoint and a decimal readout. Sample the middle of the one-second sweep, frame 15 at 30 fps:

```sh
npm run recipes -- --scene continuous --frame 15 --out out/orbit
```

The dot is at the top of the circle and the number reads 1.57, because the recipe
evaluates the orbit throughout the motion; interpolating the two opposite endpoint
pictures would put the dot through the centre.

`sampleAnimation(animation, alpha)` from `rayner/testing` draws one frame of it outside a play,
in any order, which is how `test/recipes.test.ts` checks the dot stays on the circle.

`FollowAngle` captures the initial value in `doBegin()`, makes an immutable sample
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
3. Capture changing endpoints in `doBegin()`. Never use ambient time, unseeded random
   values or mutable external inputs to decide intermediate geometry.
4. Stay inside the model's domain. This recipe's angle is in `[0, pi]`, and its
   rate function must stay in `[0, 1]`; overshooting easings are refused by the
   model's domain check.
5. Finish in `doFinish()` where the last frame drew. `rayner check` compares each step's
   picture as it ends, after its last play has finished, with its resting frame,
   since `rayner describe` and the shots draw the step as it ends.

The recipe fixes drawing coordinates at construction, so shifting, scaling or
rotating the dependent group does not survive the next sample; a camera move is
unaffected. The exported form of this idea is a [view's tween](CHOREOGRAPHY.md#following-one-number):
one sampled number, a `draw` that returns the picture at it, and the targets it
writes, named for the one-writer check.

### Hold an invariant on every frame

[invariants.ts](../recipes/invariants.ts) moves a dot half way round a circle twice
and registers one invariant: the dot stays on its circle.

```ts
this.addInvariant('the dot stays on its circle', (scene) => {
  const dot = scene.find('orbit:dot');
  if (!dot) return; // nothing to check on this frame
  return Math.abs(Math.hypot(...dot.center()) - 2) <= 1e-3 || 'the dot is off its circle';
});
```

A check, an `Invariant`, reads the scene by key and changes nothing. It returns a message when the
invariant fails, `true` when it held, and nothing when there was nothing to check on
that frame. An invariant that never holds in a whole run tested nothing, so
`rayner check` fails it, which keeps a misspelt key from passing. `rayner check` runs
every registered invariant on every frame of every scenario, so an invariant about what
happens between steps (a gauge meeting a line, a pointer on its circle) fails at the
first frame that breaks it. Sampled from its angle by a view's tween, the dot holds; morphed
between its two ends with `Transform`, it cuts through the centre, and the recipe's test
finds those frames. `token-bucket` and `ring-buffer` declare invariants of this kind.

The recipe's `invariantFailures(Scene, inner?)` runs them in a test, with a sink of its own, and
it is the pattern for a check of your own: a sink receives every frame of a full run, reads the
scene (`scene.invariants`, each a function of the scene), changes nothing, and hands the frame on
to an `inner` sink, so several checks share one run. `rayner check` composes its own invariant
sink with its motion and legibility sampling this way. A seek skips frames, so the sink sets no
`skipUntil` and every frame is computed. After the run it gives each failure, `{ invariant, step,
frame, t, message }`; how many frames each invariant ran and held on; and the invariants that ran
and never held.

### Consume a scene in another application

[render.ts](../recipes/render.ts) shows the output adapter: it chooses a registered
Scene class and writes SVG, its state and its trace. Replace file writes
with your application's response, cache or editor view. A sink can stream frames
instead. Keep host-specific imports in that adapter rather than adding filesystem
or DOM assumptions to your model.

In a document generator, `toSvgString(await renderFrame(Scene, frame))` returns a frame; on a
page, embed the page `rayner build` writes. See
[Scene outputs](SCENE-OUTPUTS.md#live-browser-output-and-publication).

### Compose built-in animation techniques

[choreography.ts](../recipes/choreography.ts) uses `GrowFromEdge` and `PulseAlongPath`
from `rayner/extras` with native shapes and a readout drawn from state.
[Reusable choreography](CHOREOGRAPHY.md) documents their timing, ownership, opacity,
snapshot and cleanup contracts.

## When two extensions meet

Each extension point has one rule for what happens when two of them act on the same scene. Where a rule is enforced, breaking it fails at once instead of changing the picture quietly.

| Extension point | When two meet | Enforced by |
| --- | --- | --- |
| A function that returns mobjects | Each call returns new mobjects, so two calls share nothing. A key names one part on the stage. | `keyedParts()` refuses a repeated key; `rayner check` fails a key held by two mobjects at the end of a step. |
| A mobject | A mobject has one parent: adding it to a second group moves it out of the first. A copy has a new id and no parent but keeps its key, so a copy left beside its original repeats the key. | `add()` moves the child; `rayner check` names the repeated key. |
| An animation | One `play()` drives a mobject once: two animations on the same mobject, or on one inside the other, throw. A `Succession`'s members run in turn and may share mobjects. Separate plays run one after another. | `play()` throws, naming both animations and the mobject. |
| An invariant | Every registered invariant runs on every frame, each on its own, and none may change the scene. Each must hold on at least one frame of a run. | `rayner check` runs every one and fails an invariant that never held. |
| A sink | Sinks never meet inside the scene. A sink reads each frame and hands it to the sink it wraps, or a fan sends each frame to several sinks in order. | By construction: the scene calls one sink. |
| A machine's transition | An event plays one transition, and the transition must end on what the views draw from the new state. Without one, the views morph to the new state by key. | `rayner check` plays every event from each explored state, within the machine's limit, and compares where each finishes with the views' draw. |

## Test an extension

Test an extension with the same tools Rayner's own suite uses, without a browser. From `rayner/testing`, `traceScene` runs a scene and returns each step's state, evidence and timing. From `rayner`, `renderFrame` and `toSvgString` give the picture at a frame. The invariants recipe's sink runs invariants over a full run. [test/recipes.test.ts](https://github.com/adewale/rayner/blob/main/test/recipes.test.ts) tests the five recipes this way: the copied composite owns its own children, the sampled orbit stays on its circle, and the morphed one leaves it. Give each extension one test of normal use and one that shows its limit failing.

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
