# Views: the picture as a function of state

A readout, a counter or a status line should show the program's state. Today a
scene changes the state and then, separately, builds the new text and
transforms the old one into it, and nothing checks that the two agree. A `View`
makes the picture a function of the state instead:

```ts
import { Scene, Text, FadeIn, view } from 'rayner';

class Ring extends Scene {
  override async construct() {
    this.state = { len: 0, head: 0 };
    const readout = view(this, (s) => new Text(`len ${s.len}  head ${s.head}`, { font: 'mono' }), { place: 'left' });
    await this.play(new FadeIn(readout));

    await this.step('push-a');
    this.state.len = 1;                    // the program changes
    await this.play(readout.sync());       // the picture follows: 'len 0' -> 'len 1', the rest stays still
  }
}
```

This is manim's `always_redraw` idea in the engine's form. The picture changes only
when you play `sync()`, and each change is a matching transform from the old
picture to the new one.

## Why not updaters

`always_redraw` rebuilds the picture every frame with an updater. A Rayner scene
can't afford that. A play with an active updater can never be skipped during a
seek (`Scene.hasUpdaters()`), because updaters integrate over frames. One
per-frame readout would make every seek into that scene replay frame by frame.

A View never registers an updater. `sync()` is an ordinary animation whose
endpoints are fixed at `begin()`:

1. At `begin()` it calls `build()` (or `render(scene.state)`), which builds the
   new picture from the state as it is **then**.
2. It scales and moves the new picture to where the current one is (see
   Placement).
3. It sets up a matching transform from the current picture to the new one.
   Each frame is a pure function of alpha.
4. At `finish()` the View swaps its child to the new picture, so it holds
   exactly what `build()` made, including the `text` field.

So a play with a sync in it skips like any other during a seek. A seek renders
the byte-identical frame that a full run renders, including frames in the
middle of a sync (`test/view.test.ts`).

## API

```ts
view(build: () => M, opts?): View<M>                                    // build reads whatever it closes over
view(scene: Scene<S>, render: (state: S) => M, opts?): View<M>           // render(scene.state); kept for fidelity checks
stateView(scene, keys, { fontSize, at, gap, format, place }?): View<StateReadout>

view.current            // the picture on screen (the View's one child)
view.shown              // the strings it shows, in family order
view.sync({ runTime, rateFunc, lagRatio, match }?)   // an Animation: play it, compose it
view.rebuild()          // rebuild now, unanimated: for a View not on screen yet
```

- **Identity.** The View is what scenes hold, add, put in groups and lay out. A
  sync only swaps its child, so the View stays in the scene and in any Group
  that holds it. References to the View and layout code that reads it keep
  working. References to the *old picture* go stale; take `view.current` again.
- **Composable.** `sync()` is an `Animation`.
  `this.play(readout.sync(), token.animate.shift(RIGHT))` works. So does a
  `Succession([...])`, `AnimationGroup` or `LaggedStart` that contains it.
- **Built at its turn.** Because `build()` runs at `begin()`, a sync created
  before a state change still shows the state at play time. A sync inside a
  `Succession` builds when its turn comes, after the members before it have
  run. This is the same rule `.animate` members of a Succession follow.
- **Picture contract.** `build()` must return a new mobject each call, not one
  it caches or one that is inside another mobject. The old picture morphs into
  the new one, and a picture can't morph into itself. Put style in `build()`
  too: a rebuilt picture is styled by `build()`, not by whatever was done to the
  old one (`setOpacity` on the View lasts until the next sync).

### `match`

| `match` | morphs with | good for |
|---|---|---|
| `'text'` (default when either picture contains a `Text`) | `TransformMatchingText` | readouts, code: unchanged characters stay where they are |
| `'index'` (default otherwise) | `Transform`, family position by position | geometry whose structure persists (bars, a gauge); `DecimalNumber` counting |
| `'shapes'` | `TransformMatchingShapes` | pictures whose parts come and go |
| a `MatchKey` function | `TransformMatching` with that key | identity you know: a node id, a colour |

`sync.summary()` reports what a matching transform paired once the play has
begun (`{ matched, morphed, removed, added }`). It is `null` for `'index'` and
for a no-op. `sync.inner` is the transform itself.

### A picture that did not change

If the rebuilt, placed picture matches the current one, `begin()` sets up no
transform at all. "Matches" means the same family shape and point counts, points
within 1e-5, equal styles and equal strings. Nothing moves and the current
child stays as it is. The sync **still takes its run time**. A play's length
must not depend on whether the state happened to change, so step timing, frame
numbers and Succession timings stay predictable from the program alone. If you
don't want the hold, don't play the sync.

A rate function that doesn't land on 1 (`thereAndBack`) ends on the old
picture, and the View does not swap. The fidelity check below will report that
step.

## Placement

A rebuilt picture goes where the old one was, so a readout whose text grows
doesn't drift. This is `Text.setText`'s anchor rule, generalized to any picture:

- `place: 'left' | 'center' | 'right'` (default `'center'`; `stateView` uses
  `'left'`) is the point that is held: the left edge, center or right edge of
  the picture's layout box, at its vertical middle. The layout box counts each
  `Text` by its advance box rather than its ink, exactly as `setText` does, so
  the anchor doesn't depend on which letters the text holds.
- Moving the View (`view.moveTo(...)`, `toEdge`, a Transform) moves the picture,
  and the next build lands there too.
- Scaling the View carries over. The View compares the current picture's layout
  height with what `build()` last returned, and scales the next build by the
  ratio. Only uniform scale carries; a rotation does not.
- `place: false` turns all this off: `build()` decides where the picture goes,
  and moving the View lasts only until the next sync.

Showing a View: add it, or play `FadeIn(view)`, before its first sync. A sync
on a View that is not on screen yet adds it, and it appears abruptly.

## The fidelity check: the picture side

`specs/rayner.md` asks for a named pattern: "a scene's state at each step must
equal the program's". The state side already exists: `test/explain-fidelity.test.ts`
compares every case's step states with the program's answers, using
`assertStepState` from `test/lib/explainer-state.ts`. A View adds the picture
side: **at the end of every step, the View shows what the traced state
renders.**

```ts
import { assertViewFollowsState } from './lib/view-fidelity.ts';

// Runs the scene once. At each step's end it records view.shown, then compares
// it with render(step.after) from the trace.
await assertViewFollowsState(Ring, (scene) => (scene as Ring).readout);
```

It fails on a scene that changes state and forgets to sync, and on a picture
built from the wrong fields. It compares text (`pictureText`: every `Text` in
the picture, in family order), not geometry. The pure form,
`viewMismatch(view, state)`, is exported from the library, and
`assertViewFollowsState` calls it at each step end. It returns `null`, or
a message that says what the View shows and what the state renders. Views made
with `view(scene, render)` or `stateView` keep `render` for these checks; for a
`view(build)` closure, pass the render function explicitly.

## Migration notes

### `StateReadout`

`StateReadout` keeps its layout and is **not** reimplemented on top of View.
Its `values` are read from its children, so a `copy()` names its own `Text`s.
Lantern's own scenes at the fork base (deleted here, see [upstream](UPSTREAM.md))
treat it as a fixed layout of `Text` slots:

- its `state-machine` transforms `readout.values.event` by index;
- its `token-bucket` removes the value slots and positions its own text in their
  place;
- `DocScene`'s `set` op transforms `readout.values[k]`.

A View swaps its picture at every sync, and with it every `values[k]`
reference. Those scenes would break, or need rewriting, which would change
their frames. Their golden traces would probably survive (traces hash state
and step timing), but their pictures would not. This matters for an offer
upstream, where they still exist.

For new scenes, use the view form. It is the same rows, rebuilt from state:

```ts
const rv = stateView(this, ['tokens', 'lastRefill'], { at: [-2.6, 2.3] });   // or:
const rv = view(this, (s) => new StateReadout([['tokens', s.tokens], ['lastRefill', s.lastRefill]], { at: [-2.6, 2.3] }), { place: 'left' });
this.state.tokens = 9;
await this.play(rv.sync(), { runTime: 0.5 });
```

Left placement holds the longest key's left edge, so the keys stay put while
values grow.

### `DecimalNumber`

`n.setValue(v)` and `Transform(n, n.copy().setValue(v))` still work. In a View,
choose what the change should look like:

- `view(() => new DecimalNumber(state.x), { place: 'left' })` with the default
  `'text'` morphs digit by digit. Unchanged digits stay, and changed digits
  fade across.
- With `sync({ match: 'index' })`, `DecimalNumber`'s own interpolation runs, and
  the number counts through the values in between (`0 -> 5 -> 10`).

### The explainer layer's `Card.set`

`explain/panels.ts`'s `Card` hand-rolls the same idea. `Card.set(changes)`
compares each row's string, builds a new right-anchored `Text` for each changed
row, scales it into the row's room, and crossfades old to new. A View-based
migration would look like this:

1. Keep the card's frame (panel, labels, mark bar) as it is. Make the values
   column one `view(scene, (s) => valuesColumn(s, rows), { place: 'right' })`,
   where `valuesColumn` lays out right-anchored mono `Text`s at the row pitch and
   applies the same `room` scaling.
2. `set(changes)` becomes: write `changes` into the state the column renders
   from, then `scene.play(column.sync({ runTime }))`. Unchanged rows don't move,
   because matching pairs their glyphs with themselves; changed rows morph
   glyph by glyph instead of crossfading. If the crossfade look matters, use
   `match: () => undefined`: nothing pairs, so every old glyph fades out and
   every new one fades in.
3. `card.values.get(label)` becomes a lookup into `column.current`, taken
   fresh after each sync.

The visible change from crossfade to glyph morph is why this has not been
done. `Card` stays as it is until the explainer layer chooses to switch, and
its demo receipts would need regenerating when it does.

## In the explainers

- **Cards as views.** [state-machine](../scenes/explainers/state-machine/scene.ts) builds its whole
  `Card` in `view(this, render)`; [ring-buffer](../scenes/explainers/ring-buffer/scene.ts) keeps a card's
  panel and labels and makes only its values a view, beside two more views (the
  head, tail and length readout, and the waiting push argument).
  `test/explain-models.test.ts` runs `assertViewFollowsState` on all of them and on
  the token bucket's readout, at every step of every case.
- **State that changes inside one play.** A sync builds at its turn, but
  `scene.state` is whatever the scene last wrote, so a `Succession` of several
  operations would show the last one's state at every sync. Two scenes add a member
  that writes the state when its turn comes: [ring-buffer](../scenes/explainers/ring-buffer/scene.ts)'s
  `Apply` (an `Animation` that draws nothing, placed before the syncs it feeds) and
  [token-bucket](../scenes/explainers/token-bucket/scene.ts)'s `SyncToCall` (a `ViewSync` subclass whose
  `begin()` sets the state, then syncs). Both are scene code, listed among the
  [helper candidates](REFERENCE.md#engine-features), not library code.
- **Colours.** `stateView` draws `StateReadout`'s fixed colours (grey keys, white
  values), which suit a dark stage such as the token bucket's github-dark. A scene on
  another palette builds `view(this, (st) => new StateReadout(...))` and recolours the
  rows in `render`, as the ring buffer does for dusk.

Copying a composite preserves references to its own copied children. Custom
`Mobject` subclasses that keep named child references implement
`rebindReferences(source, copies)`; it runs after copying and restoring the tree.
Use the supplied map for child references and retain external services such as
the owning scene. `Card`, `CodeBlock` and `Code` use this contract. Updating or
marking a copied panel leaves the original panel unchanged.
