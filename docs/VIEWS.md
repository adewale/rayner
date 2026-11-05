# Views: the picture as a function of state

A readout, a counter or a status line should show the program's state. A `View`
draws that picture from the state, so the two cannot drift apart:

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

This is manim's `always_redraw` in the engine's form. The picture changes only
when you play `sync()`, and each change is a matching transform from the old
picture to the new one.

## How a sync plays

`always_redraw` rebuilds the picture every frame with an updater, and an active
updater makes a seek replay frame by frame ([fundamentals](ENGINE-FUNDAMENTALS.md#updaters-derived-pictures-and-seeking)).
A View registers no updater. `sync()` is an ordinary animation whose endpoints are
fixed at `begin()`:

1. At `begin()` it calls `draw(scene.state, scene.shown)`, which builds the new
   picture from the state as it is **then**.
2. It scales and moves the new picture to where the current one is (see
   [Placement](#placement)).
3. It sets up a matching transform from the current picture to the new one, so
   each frame is a pure function of alpha.
4. At `finish()` the View swaps its child for the new picture, so it holds
   exactly what `draw` made, including the `text` field.

A play with a sync in it therefore skips like any other during a seek, and lands
on the byte-identical frame a full run renders, mid-sync included
(`test/view.test.ts`). A sync morphs between two endpoint pictures; it does not
evaluate the model between them. For a value that should be sampled along the
way, use [`Follow`](CHOREOGRAPHY.md#follow).

## API

```ts
view(scene: Scene<S>, draw: (state: S, shown) => M, opts?): View<M>   // draw(scene.state, scene.shown) at each sync; kept for the checks

view.current            // the picture on screen (the View's one child)
view.texts              // the strings it shows, in family order
view.sync({ runTime, rateFunc, lagRatio, match, staged }?)   // an Animation: play it, compose it; staged: what goes leaves before what comes
view.rebuild()          // rebuild now, unanimated: for a View not on screen yet
```

Most draws read only the model, `state`. A picture that depends on which of several
pictures is showing, which is not part of the model, reads it from `shown`, the
scene's `this.shown`.

- **Identity.** The View is what scenes hold, add, put in groups and lay out. A
  sync only swaps its child, so the View stays in the scene and in any Group
  that holds it. References to the *old picture* go stale; take `view.current` again.
- **Composable.** `sync()` is an `Animation`, so
  `this.play(readout.sync(), token.animate.shift(RIGHT))` works, and so does a
  `Succession`, `AnimationGroup` or `LaggedStart` that contains it.
- **Built at its turn.** Because `draw` runs at `begin()`, a sync created
  before a state change still shows the state at play time, and a sync inside a
  `Succession` builds after the members before it have run, as `.animate`
  members do.
- **Picture contract.** `draw` must return a new mobject each call, not a cached
  one or one inside another mobject, because the old picture morphs into the new
  one. Put style in `draw` too: `setOpacity` on the View lasts only until the
  next sync.

### `match`

| `match` | morphs with | good for |
|---|---|---|
| `'text'` (default when either picture contains a `Text`) | `TransformMatchingText` | readouts, code: unchanged characters stay where they are |
| `'index'` (default otherwise) | `Transform`, family position by position | geometry whose structure persists (bars, a gauge); `DecimalNumber` counting |
| `'shapes'` | `TransformMatchingShapes` | pictures whose parts come and go |
| `'key'` | `TransformMatching` with `matchByKey()` | pictures whose containers carry `key`s: a keyed cell or node keeps its identity wherever it moves, its parts morph inside it, unkeyed parts fade ([matching](MATCHING.md#keyed-components)) |
| a `MatchKey` function | `TransformMatching` with that key | identity you know: a node id, a colour; `matchByKey({ fallback })` to keep unkeyed parts too, `matchByKey({ text: 'whole' })` when a keyed word's change is a new identity |

Once the play has begun, `sync.summary()` reports what a matching transform paired
(`{ matched, morphed, removed, added }`); it is `null` for `'index'` and for a
no-op. `sync.inner` is the transform itself. The sync records the same counts as
evidence, with the View's key as `view` when it has one.

### A picture that did not change

If the rebuilt, placed picture matches the current one, `begin()` sets up no
transform. "Matches" means the same family shape and point counts, points within
1e-5, equal styles and equal strings. Nothing moves, the current child stays, and
the sync **still takes its run time**, so step timing, frame numbers and
`Succession` timings follow from the program alone rather than from whether the
state happened to change. If you don't want the hold, don't play the sync.

A rate function that does not land on 1 (`thereAndBack`) ends on the old
picture, and the View does not swap; the fidelity check below reports that step.

## Placement

A rebuilt picture goes where the old one was, so a readout whose text grows does
not drift. This is `Text.setText`'s anchor rule applied to any picture:

- `place: 'left' | 'center' | 'right'` (default `'center'`; a readout wants
  `'left'`) is the point held still: the left edge, centre or right edge of the
  picture's layout box, at its vertical middle. The layout box counts each `Text`
  by its advance box rather than its ink, as `setText` does, so the anchor does
  not depend on which letters the text holds.
- Moving the View (`view.moveTo(...)`, `toEdge`, a Transform) moves the picture,
  and the next build lands there too.
- Scaling the View carries over: the View compares the current picture's layout
  height with what `draw` last returned and scales the next build by the ratio.
  Only uniform scale carries; a rotation does not.
- `place: false` turns this off: `draw` decides where the picture goes, and moving
  the View lasts only until the next sync.

Add the View, or play `FadeIn(view)`, before its first sync. A sync on a View that
is not on screen adds it abruptly.

## The fidelity check: the picture side

`specs/rayner.md` asks for a named pattern: "a scene's state at each step must
equal the program's". `test/explain-fidelity.test.ts` checks the state side with
`assertStepState` (`test/lib/explainer-state.ts`). A View adds the picture side:
**at the end of every step, the View shows what the traced state draws.**

```ts
import { assertViewFollowsState } from './lib/view-fidelity.ts';

// Runs the scene once. At each step's end it compares view.texts with draw(step.after, step.shown).
await assertViewFollowsState(Ring, (scene) => (scene as Ring).readout);
```

It fails on a scene that changes state and forgets to sync, and on a picture drawn
from the wrong fields. It compares text (`pictureText`: every `Text` in the picture,
in family order), not geometry. The pure form, `viewMismatch(view, state, { shown, draw })`,
is exported from the library and returns `null`, or a message saying what the View
shows and what the state draws.

Because every View keeps its `draw`, `rayner check` can also redraw a View for any
state a [`Machine`](MACHINES.md) reaches. A `draw` that reads a variable outside the
state is caught the same way: the redraw disagrees with what was shown.

## Cards, code, annotations and notes from state

The stage's helpers enter and animate: `card.mark`, `code.focus`, `s.callout` and `d.note`
each play. A draw is synchronous and builds its picture whole, so each of them has a builder
a draw can call, which puts the mark in the picture and lets the part describe itself:

```ts
import { Card, CodeBlock } from 'rayner/explain';
import { callout } from 'rayner/drawing';

// A marked card: the row the state names is lit, and the description says so.
const counts = view(this, (st) =>
  new Card(this, s.palette, rows(st), { at: box, lit: st.chosen, litAs: 'this check' }), { place: false });
await s.enter(counts);                      // no describe: the card describes itself, its lit row too

// A focused code panel, and a callout beside the focused line, from the same state.
const program = view(this, (st) => {
  const code = new CodeBlock(this, s.palette, lines(st), { at: box, focus: st.passes ? [1, 2] : 1, focusAs: 'run' });
  const line = code.code.lines[1]!.box()!;
  return new Group(code, callout(s, line, `returns ${st.passes}`, { side: 'right', color: st.passes ? s.good : s.bad }));
}, { place: false });

// A diagram note, placed as d.note places one, from the state's words.
const note = view(this, (st) => d.notePicture('Capture', `${st.families} families`, { side: 'below' }), { place: false });

// The whole diagram with its marks and notes, keyed apart from a second picture of the same diagram.
const wrong = view(this, (st) => d.picture(marksOf(st), { notes: notesOf(st), prefix: 'wrong:' }), { place: false });
```

- **Marks are part of the picture.** `lit` and `focus` put the card's or panel's bar where
  `mark` and `focus` leave it; unlit, the bar is there and hidden, so a sync from unlit to lit
  morphs one family shape. A staged step's redraw from its recorded state draws the bar again,
  so `rayner check` compares it with what was drawn. The view check compares text, so it covers a
  mark through the description rather than the bar's place.
- **Parts describe themselves.** A card, a code panel, a note, a dimension line and a pin say
  what they are wherever they sit: kept, inside a view, inside a group, inside a staged step's
  picture. A `describe` on `s.keep`, `s.enter` or a staged step speaks for the rest of the
  picture, not for those parts, so it never repeats a card.
- **They say what they emphasise.** A lit row, a focused line and a note report themselves to
  the phone's close-ups as `mark` and `focus` do, so a scene that draws them needs no
  `s.emphasise`. Marks on a diagram picture still need one, since the picture copies the
  diagram's look and not its words.
- **Two pictures of one diagram.** Every part of a diagram picture is keyed by its id, so two
  on the stage at once would give one key to two parts. `prefix` puts a word before every key in
  the picture (keys that start `__` are roles and keep theirs); marks, notes and dimming still
  name parts by their ids in the diagram.
- **Annotations without the camera.** `callout`, `dimension` and `pin` build at the draw's own
  coordinates and size. The stage's helpers build the same pictures in screen coordinates while
  the camera is away, so prefer the helpers for an annotation drawn into a zoomed view.

## Other readouts

- **`StateReadout`** keeps its fixed layout of `Text` slots and is not built on
  View; its `values` read its children, so a `copy()` names its own `Text`s.
  Lantern's scenes at the fork base address those slots by index, which a View's
  swap would break ([upstream](UPSTREAM.md)). For a new scene, draw the readout in
  a view: `view(this, (s) => new StateReadout([['tokens', s.tokens]]), { place: 'left' })`.
  Left placement holds the longest key's left edge, so the keys stay put while
  values grow. `StateReadout` draws grey keys and white values, which suit a dark
  stage; on another palette, recolour the rows in `draw`, as the ring buffer does
  for dusk.
- **`DecimalNumber`** in a view with the default `'text'` morphs digit by digit:
  unchanged digits stay and changed digits fade across. With
  `sync({ match: 'index' })` its own interpolation runs, and the number counts
  through the values in between (`0 -> 5 -> 10`).
- **The explainer layer's `Card.set`** compares each row's string and crossfades a
  changed row's new `Text` in. A card can instead make its values a view, as the
  ring buffer does; a changed row then morphs glyph by glyph, and
  `match: () => undefined` restores the crossfade. `Card` itself has not moved to
  views, because that would change every card's frames.

## In the explainers

- [state-machine](https://github.com/adewale/rayner/blob/main/scenes/explainers/state-machine/scene.ts) draws its whole session
  `Card` in a view, beside views of the diagram, the ring on the current state and the
  reducer; [ring-buffer](https://github.com/adewale/rayner/blob/main/scenes/explainers/ring-buffer/scene.ts) keeps a card's
  panel and labels and makes the ring, the head, tail and length readout, and the
  card's values views; [token-bucket](https://github.com/adewale/rayner/blob/main/scenes/explainers/token-bucket/scene.ts)
  draws its gauge, chart, request chips and readout as views.
  `test/explain-models.test.ts` runs `assertViewFollowsState` on the state-machine
  card, the three ring-buffer views and the token-bucket readout at every step of
  every scenario.
- A state that changes several times inside one play needs each change at its turn,
  or every sync would draw the last state. [`SetState`](CHOREOGRAPHY.md#setstate)
  is that member, and a [`Machine`](MACHINES.md) builds each event from a `SetState`
  and its views' syncs; all three scenes above are machines.
