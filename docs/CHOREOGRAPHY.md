# Reusable animations from the example collection

These built-ins were extracted from techniques the example collection repeated.
They are ordinary animations on native mobjects: pass them to `play`,
`AnimationGroup`, `LaggedStart` or `Succession`, with no stage or diagram controller.

| Repetition | Public animation | Collection use |
| --- | --- | --- |
| Stretch from a baseline while fading in | `GrowFromEdge` | Captured chart bars grow from the bottom; Gantt tasks from the left |
| Move a temporary token along a route while it fades in and out | `PulseAlongPath` | Captured sequence-message build-ins |
| Adopt the next model state at a particular point inside a schedule | `SetState` | Every [machine](MACHINES.md) event; periodic-groups' configuration steps |
| Drive drawings from one sampled number | `view.tween`; `c.follow` in an authored transition | Great circle and henge: a globe and a sky redrawn from a turning viewpoint; token bucket: the gauge and the chart's climb from the same elapsed time; ring-buffer pointers turning round the ring |

The first two replaced private classes in `explain/diagrams.ts`, whose diagram
controller keeps the graph adjacency and reveal checks, recording and descriptions:
the animations know geometry and time, not graphs.

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
then two state and view updates in a succession. The runner also writes its text
frame, element records, step index and trace; `--step result` gives the final
readout. These are raw engine examples: a published explainer also needs a model,
descriptions, a script and a reader review.

## GrowFromEdge

```ts
import { GrowFromEdge } from 'rayner';
import { SetState, view } from 'rayner/explain';
await this.play(new GrowFromEdge(bar, [0, -1]));                 // up from its bottom edge
await this.play(new GrowFromEdge(task, [-1, 0], { runTime: 0.6 })); // right from its left edge
```

Signature: `new GrowFromEdge(mobject, edge = [0, -1], options?)`.

The edge must be one unit step along an axis: `[0, 1]`, `[0, -1]`, `[-1, 0]` or `[1, 0]`. The corresponding edge of the
current world-coordinate bounding box stays fixed and the perpendicular dimension
keeps its size, so the growth is along one axis.
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

Options are `MoveAlongPathOpts`, a type exported only from `rayner/extras` (beside `MoveAlongPath`), though `PulseAlongPath` itself is in `rayner`. With the default `fromCurrent: true`, any initial
offset from the route is blended away rather than snapping on the first frame.
Use `fromCurrent: false` to start exactly on the route. A live route edited after
the animation begins does not change this traversal.

The token is removed by default. Cleanup restores its authored opacity so it can
be reused, retaining the position it reached. With `remover: false` it stays in the
scene at the invisible end of the pulse. It is not a persistent indication for a
resting picture: draw a mark, or a diagram picture's `trail`, when the reader needs that evidence.
No adjacency assertion or walk record is implied by moving along an arbitrary path.

## SetState

```ts
import { Succession } from 'rayner';
import { Card, palette, SetState, view } from 'rayner/explain';
const colors = palette('github-dark');
const readout = view(this, (s) => new Card(this, colors, [['count', s.count]], { panel: false, key: 'readout' }), { place: false });
const sync = () => readout.sync();
await this.play(new Succession([
  new SetState(this, { count: 3 }), sync(),
  new SetState(this, { count: 9 }), sync(),
]));
```

Signature: `new SetState(scene, nextState | (current) => nextState, { event? })`.

Given a function, it computes the next state from a copy of the state when it begins,
so a member of a replay starts where the one before left it; with `event`, it records
`{ kind: 'event', event }` as it begins. [Machines](MACHINES.md) build on this form.

It draws nothing and defaults to zero duration. When its turn begins it replaces
the whole scene state, so a View sync after it in the same schedule draws that
operation's state rather than the last state of the sequence. For one change before
one `play()`, assigning `scene.state` directly is enough.

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

## Following one number

A sync morphs between two pictures; some values must be sampled along the way, so a
dot evaluated from its angle stays on its circle where a morph between its ends would
cut through the centre. There are two forms, one for a view and one for parts of an
authored transition.

A view tweens the state. `view.tween(stateAt, opts)` sets the scene's state to
`stateAt(t)` at every frame, `t` running from 0 to 1 at the eased alpha, and writes the
view's draw of that state into its picture:

```ts
import { linear } from 'rayner';
this.state = { angle: 0 };
const orbit = view(this, (st) => drawOrbit(st.angle as number), { place: false });
await this.play(orbit.tween((t) => ({ angle: Math.PI * t }), { runTime: 1, rateFunc: linear }));
```

The picture is the view's draw of the state at every frame, so `rayner check` holds it
to its draw as it holds any view, and the play ends with the state at `stateAt(1)`,
with no `SetState` after it. `stateAt` must be a function of `t` alone and return JSON.
The great-circle explainer turns its globe this way, and the henge explainer runs its
year and lowers its camera.

Parts of an authored transition follow with `c.follow(spec, opts)` on the
transition's choreography:

```ts
const refill = c.follow(
  { from: prev.at, to: call.at, draw: (t) => [fill(balanceAt(t)), climbTo(axes, climbed, t)] },
  { targets: [level, rise], runTime: REFILL_S },
);
```

A target named by key is owned, as `c.own(key)`; a mobject target is one the author
already holds, such as an inserted part. One number, sampled between `from` and `to`
at the eased alpha, decides every target, so a bucket's level and the chart's climb
agree at every frame. `from` is a number or a function read when the play begins, so a
member of a `Succession` starts where the one before left the value. The value is
exact at alpha 0 and 1; an easing that overshoots samples past the ends, as a
`Transform` would.

`draw` returns the picture at the value, one fresh mobject per target, and each is
written into its target with `become`. A follow therefore writes nothing but its
declared targets, which `play()`'s one-writer check covers, and writes them only from
the value, so nothing carries over from the previous frame and a seek renders the
frame a full run renders. It registers no updater, so seeking still skips.

`play()` admits the targets and refuses a second writer of any of them in the same
play (every animation reports its `targets()`). With `remover: true` all of them leave
the scene after the play. Refused before anything is drawn: non-finite values, an
empty or repeated target list, a `from()` that returns `NaN` at begin, a `draw` that
returns the wrong number of pictures or a target itself, and a picture whose different
shape would drop a keyed part.

The token bucket's refill draws the gauge at `min(5, previous + elapsed × rate)` and
the climbing line up to the same elapsed time, so the corner where the cap takes over
appears in both at once; the accept or refuse that follows is a discrete `Transform`.
The ring buffer turns each pointer through one angle, from the slot it leaves to the
slot it reaches, so its invariant that the pointers stay on their circle holds on
every frame. [Sampled parameters](PARAMETERS.md) records why each changed.

`mobject.become(other)` (manim's name) is the write a follow or a tween makes: it takes `other`'s
points, style and fields in place, keeping this mobject's key and parent.
With the same family shape each member takes its counterpart's data, so children
keep their identities too. A different shape replaces the children, as a readout
whose number gains a digit needs; that is refused when any child carries a key, so a
keyed part cannot silently vanish. `other` is not changed.

## Composition and verification

Growth and pulse capture geometry at `begin()`; `SetState` freezes the supplied
snapshot at construction and applies a fresh copy when its turn begins. All three
support the existing fixed-frame seek model and expose their written target to
the ordinary schedule ownership checks. Growth and pulse can be sampled out of
order without integrating previous frames.
`SetState` is a discrete scheduled action; it is not a continuous binding or a
reversible state transition.

`test/choreography.test.ts` checks independent geometry and opacity expectations,
the old growth and message-token frame sequences, malformed inputs, state isolation,
conflicting writers, nested schedules and SVG and trace seek equality; for a follow,
begin-time starts in a `Succession`, refused writers, admission and removal of every
target, and a mid-sweep dot that sits on its circle. The installed-package smoke test
runs the compiled recipe and checks its final model state.
