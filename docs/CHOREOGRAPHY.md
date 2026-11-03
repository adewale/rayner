# Reusable animations from the example collection

These built-ins extract choreography already used by the collection. They work
with native mobjects as ordinary animations: pass them to `play`, `AnimationGroup`,
`LaggedStart` or `Succession`. They require no stage or diagram controller.

| Repetition | Public animation | Collection use |
| --- | --- | --- |
| Stretch from a baseline while fading in | `GrowFromEdge` | Captured chart bars grow from the bottom; Gantt tasks from the left |
| Move a temporary token along a route while it fades in and out | `PulseAlongPath` | Captured sequence-message build-ins |
| Adopt the next model state at a particular point inside a schedule | `SetState` | Ring-buffer operations and periodic-table configuration steps |
| Drive several drawings from one sampled number | `Follow` | Token bucket: the gauge and the chart's climb from the same elapsed time |

The first two replace private classes in `explain/diagrams.ts`. `SetState` replaces
the duplicated `Apply` class in the ring-buffer and periodic-groups examples. The
diagram controller retains graph adjacency/reveal checks, recording and descriptions.
The animations themselves know geometry and time, not graph semantics.

## Run the recipe

```sh
npm run build:lib
npm run recipes -- --scene choreography --time 0.5 --out out/choreography
```

After installation, use the compiled runner:

```sh
node node_modules/rayner/dist/recipes/render.js --scene choreography --out out/choreography
```

[The full recipe](../recipes/choreography.ts) shows parallel growth and route travel,
then two state/view updates in a succession. The output runner also writes its
text frame, element records, step index and trace. Use `--step result` for the final
readout. These are raw engine examples; a published lesson also needs its own
model, descriptions, script and reader review.

## GrowFromEdge

```ts
import { GrowFromEdge, DOWN, LEFT } from 'rayner';
await this.play(new GrowFromEdge(bar, DOWN));
await this.play(new GrowFromEdge(task, LEFT, { runTime: 0.6 }));
```

Signature: `new GrowFromEdge(mobject, edge = DOWN, options?)`.

The edge must be `UP`, `DOWN`, `LEFT` or `RIGHT`. The corresponding edge of the
current world-coordinate bounding box stays fixed; the perpendicular dimension
does not shrink. This is one-axis growth, not uniform scaling about a point.
Placement and authored paint/opacity are captured when the play begins. At its
normal endpoint, the object has exactly its authored geometry and styles.

Options are `AnimOpts` plus `initialScale`, a finite value in `[0, 1]`, default
`0.001`. The small default avoids a degenerate starting path; zero is supported.
Opacity starts at zero independently of this scale. Standard duration, easing and
family lag apply. As with other transforms, an easing that ends somewhere other
than 1 lands at that point in the interpolation.

## PulseAlongPath

```ts
import { PulseAlongPath, AnimationGroup } from 'rayner';
await this.play(new AnimationGroup([
  new PulseAlongPath(tokenA, routeA),
  new PulseAlongPath(tokenB, routeB),
]));
```

Signature: `new PulseAlongPath(mobject, path, options?)`.

At the play's beginning, capture the token geometry, each family member's authored
opacity and a copy of the route. At eased progress `a`, position follows
`MoveAlongPath` and opacity is the authored opacity times `sin(pi * a)`. The token
is strongest halfway along. Child opacity ratios are preserved; existing dimming
is not overwritten with full strength. Applying an easing also changes that pulse's
timing; the default is linear.

Options are `MoveAlongPathOpts`. With the default `fromCurrent: true`, any initial
offset from the route is blended away rather than snapping on the first frame.
Use `fromCurrent: false` to start exactly on the route. A live route edited after
the animation begins does not change this traversal.

The token is removed by default. Cleanup restores its authored opacity so it can
be reused, retaining the position it reached. With `remover: false` it stays in the
scene at the invisible end of the pulse. It is not a persistent indication for a
resting picture: leave a mark or diagram trail when the reader needs that evidence.
No adjacency assertion or walk record is implied by moving along an arbitrary path.

## SetState

```ts
import { SetState, Succession, stateView } from 'rayner';
const readout = stateView(this, ['count']);
await this.play(new Succession([
  new SetState(this, { count: 3 }), readout.sync(),
  new SetState(this, { count: 9 }), readout.sync(),
]));
```

Signature: `new SetState(scene, nextState)`.

It draws nothing and defaults to zero duration. When its turn begins, it replaces
the whole scene state. This puts model updates inside an existing schedule, so a
following View sync sees that operation's state instead of the final state of the
whole sequence. Assigning `scene.state` outside the schedule remains appropriate
for a simple immediate change before one `play()`.

The constructor validates and copies the snapshot with Rayner's plain-JSON rules;
later changes to the input cannot change it. Each begin assigns a fresh copy, so
reusing the animation does not share mutable state. Typed scenes require their
state type. Invalid numbers, cycles, functions and class instances are refused
instead of being silently altered by `JSON.stringify`.

Use it on the scene it names. A nested schedule bound to another scene is rejected
before it starts. State changes on the same scene share a non-drawing ownership
target, so parallel `SetState`s are rejected by the normal overlap checker. Put
them in a `Succession`. Independent code or custom animations that write state
outside this convention are still the author's responsibility.

The snapshot must come from your model or source, not an invented answer. `SetState`
does not execute an asynchronous program, verify a model or interpolate categorical
states. Seeking replays the state changes at their scheduled turns.

## Follow

```ts
import { Follow, linear } from 'rayner';
await this.play(new Follow(
  { from: 0, to: Math.PI, apply: (angle) => { dot.moveTo(orbit(angle)); radius.putStartAndEndOn([0, 0], orbit(angle)); readout.setText(angle.toFixed(2)); } },
  { targets: [dot, radius, readout], runTime: 1, rateFunc: linear },
));
```

Signature: `new Follow({ from, to, apply }, { targets, ...AnimOpts })`.

One number, sampled between `from` and `to` at the eased alpha, decides every
drawing `apply` writes, so a bucket's level and the chart's climb agree at every
frame and a dot evaluated from its angle stays on its circle where a morph between
two endpoint pictures would cut through the centre. `from` is a number or a
function read when the play begins, so a member of a `Succession` starts where the
one before left the value. The value is exact at alpha 0 and 1; an easing that
overshoots samples past the ends, as a `Transform` would.

`apply` writes absolute geometry, text and paint from its one argument and never
from what the previous frame left (`setPolygon`, `moveTo`, `setText`, a style
field), so repeated and out-of-order evaluation is harmless and a seek renders the
frame a full run renders. That is a documented contract, as it is for updaters;
the engine cannot check it. No updater is registered, so seeking still skips.

`targets` names every mobject `apply` writes. `play()` admits them to the scene
and refuses a second writer of any of them in the same play, including another
`Follow`, through the ordinary ownership check (`targets()` is what every
animation now reports). With `remover: true` all of them leave the scene after
the play. Non-finite values, an empty target list and a `from()` that returns
`NaN` at begin are refused before anything is drawn.

The token bucket's refill member uses it: elapsed time between two requests drives
the gauge through `min(5, previous + elapsed × rate)` and the climbing line's drawn
share through `drawFraction`, so the gauge no longer waits at the old balance while
the line climbs, and the corner where the cap takes over appears in both at once.
The accept or refuse that follows stays a discrete `Transform` in the next member.

## Composition and verification

Growth and pulse capture geometry at `begin()`; `SetState` freezes the supplied
snapshot at construction and applies a fresh copy when its turn begins. All three
support the existing fixed-frame seek model and expose their written target to
the ordinary schedule ownership checks. Growth and pulse can be sampled out of
order without integrating previous frames.
`SetState` is a discrete scheduled action; it is not a continuous binding or a
reversible state transition.

`test/choreography.test.ts` checks independent geometric/opacity expectations,
the old growth/message-token frame sequences, malformed inputs, state isolation,
conflicting writers, nested schedules and SVG/trace seek equality, and for `Follow`
begin-time starts in a `Succession`, refused writers, admission and removal of every
target, and a mid-sweep dot that sits on its circle. The installed
package smoke runs the compiled recipe and checks its final model state. Other
simple uses of FadeIn/FadeOut, Create and Transform remain ordinary compositions.
