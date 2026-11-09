# Views: the picture as a function of state

A readout, a counter or a status line should show the program's state. A `View`
draws that picture from the state, so the two cannot drift apart:

```ts
import { Scene, Text, FadeIn } from 'rayner';
import { view } from 'rayner/explain';
import type { View } from 'rayner/explain';

class Ring extends Scene<{ len: number; head: number }, {}> {   // the model's type, and what is shown's
  readout!: View<Text>;                    // kept on the scene, so a test can reach it
  override async construct() {
    this.state = { len: 0, head: 0 };
    this.readout = view(this, (s) => new Text(`len ${s.len}  head ${s.head}`, { font: 'mono' }), { place: 'left' });
    await this.play(new FadeIn(this.readout));

    await this.step('push-a');
    this.state.len = 1;                         // the program changes
    await this.readout.sync({ match: 'text' });   // the picture follows: 'len 0' -> 'len 1', the rest stays still
  }
}
```

This is manim's `always_redraw` in the engine's form. The picture changes only
when you play `sync()`, and each change is a matching transform from the old
picture to the new one. `sync()` returns an [action](REFERENCE.md#actions), as a stage
verb does: await it, or hand it to `play()`, a `Succession` or a group. The draw's arguments are typed from the scene: the scene
declares its model and shown types, `Scene<Model, Shown>`, and `view(this, draw)`
infers `draw(state: Model, shown: Shown)` ([typed state](REFERENCE.md#typed-state-and-shown)).

## How a sync plays

`always_redraw` rebuilds the picture every frame with an updater, and an active
updater makes a seek replay frame by frame ([fundamentals](ENGINE-FUNDAMENTALS.md#updaters-derived-pictures-and-seeking)).
A View registers no updater. A sync plays an ordinary animation whose endpoints are
fixed when its turn comes:

1. When its turn comes it calls `draw(scene.state, scene.shown)`, which builds the new
   picture from the state as it is **then**.
2. It scales and moves the new picture to where the current one is (see
   [Placement](#placement)).
3. It sets up a matching transform from the current picture to the new one, so
   each frame is a pure function of alpha.
4. When it finishes the View swaps its child for the new picture, so it holds
   exactly what `draw` made, including the `text` field.

A play with a sync in it therefore skips like any other during a seek, and lands
on the byte-identical frame a full run renders, mid-sync included
(`test/view.test.ts`). A sync morphs between two endpoint pictures; it does not
evaluate the model between them. For a value that should be sampled along the
way, tween the state: `view.tween((t) => stateAt(t), opts)` sets the scene's state
to `stateAt(t)` at every frame, `t` from 0 to 1 at the eased alpha, and writes the
view's draw of it into the picture, so the picture is that draw at every frame and
the play ends with the state at `stateAt(1)` ([following one
number](CHOREOGRAPHY.md#following-one-number)). Like a sync, a tween takes the picture on screen
when it begins, not when it is made, so in `new Succession([view.sync(), view.tween(f)])` it draws
into the picture the sync swapped in.

## Changing what is shown

Every way to change the picture changes the state and lets the views draw it. They differ in when the state changes and who decides it:

| I want to… | Use | Because |
| --- | --- | --- |
| Change the model for a step and show the change | Assign `this.state` (or one field), then `await v.sync()` | A sync draws the state as it is when it begins, so a change made before the play is the one it shows. This is the common case: about 250 assignments to the state and 80 syncs in the collection. Several model steps in a row are a loop of assignments and plays (periodic-groups' fill step, the choreography recipe) |
| Let the reader drive the model with events, and have every state they reach checked | A [`Machine`](MACHINES.md): `machine.replay(events)` in the scene, `machine.send(event)` for one | Each event adopts the state the tested `next` computes at its turn in the schedule, then the views' sync or the event's transition play: a schedule built for a state, which `rayner check` explores from every reachable state and the player replays at the live step. [Nine explainers](MACHINES.md#nine-machines) and two tutorial scenes |
| Show a sequence of steps, each its own picture of its own state | `s.steps([...])` | It makes each step, sets its state, clears the stage and fades in its `draw` as a view of that state, so `rayner check` redraws every step from its state. 34 lists in 22 explainers |
| Move a value continuously, the picture right at every frame | `v.tween((t) => stateAt(t))` | A sync morphs between two endpoint pictures; a tween sets the state at every frame and redraws, so a dot on a circle stays on it ([following one number](CHOREOGRAPHY.md#following-one-number)). great-circle, henge |
| Author an event's motion part by part | The transition's `t.choreograph(v)`, and `c.follow` for parts that follow one number | It names the keyed parts of the view's picture now and of its picture of the next state, animates them in your order, and `rest()` lands the parts no call named, so the transition still ends on the state's picture ([authored transitions](MACHINES.md#refused-events-bounds-and-authored-transitions)) |

A sync, a tween, a machine's `send` and `replay`, and the stage's and diagrams' verbs are all [actions](REFERENCE.md#actions), so they play the same way: awaited, or together in one play, `this.play(v.sync(), d.walk(hops))`, or in turn in a `Succession`. Each plays once, and a step that ends with one made in it and never played fails, so an action cannot be left unplayed by mistake. They differ in when they read the state: a sync, a tween and a machine's events draw the state as it is when their turn comes, while a stage or diagram verb is decided when it is called, so what it shows does not follow a change of state made after the call: draw state in a view.

A machine's schedule is built before it plays, so its events change the state at their turns inside it, with an animation of its own that only machines use; a scene's own code changes the state by assignment.

## API

```ts
view(scene: Scene<S, Sh>, draw: (state: S, shown: Sh) => M, opts?): View<M, S, Sh>   // draw(scene.state, scene.shown) at each sync; kept for the checks; a bare View type is a view of any scene
having(state, ...keys)  // the state as the shapes that hold these keys, or a TypeError: for a draw of one phase (below)

view.current            // the picture on screen (the View's one child)
view.texts              // the strings it shows, in family order
view.sync({ runTime, rateFunc, lagRatio, match, staged }?)   // an Action: await it or compose it; by key and staged unless told otherwise
view.rebuild()          // rebuild now, unanimated: for a View not on screen yet
view.tween((t) => state, { runTime, rateFunc }?)   // an Action: the state at t, drawn at every frame (above)
```

`sync()` and `rebuild()` are one pair: each redraws the view from the state as it is
and puts the new picture where the current one stands, scaled as it is. `sync()` is
an action that morphs the picture there when its turn comes, for a view on
screen. `rebuild()` swaps the picture at once and returns the view, for a view not
on screen yet, such as one about to be faded in after the state changed; on screen
it would jump, which the motion check reports.

Most draws read only the model, `state`. A picture that depends on which of several
pictures is showing, which is not part of the model, reads it from `shown`, the
scene's `this.shown`.

A scene whose state changes shape by phase declares the shapes, as a union or as one
record with optional parts, and a draw of one phase narrows to its shape:
`view(this, (st) => year(having(st, 'longitude')))`. `having` returns the state typed
as the shapes that hold those keys, optional parts made present (a `Having<S, K>`), and throws for a state
that lacks one. `rayner check` draws every view from other steps' states as well as its
own ([below](#the-fidelity-check-the-picture-side)), and a draw that throws on a state of
another shape has read its state, so the check counts it as depending on it. The same
narrows an optional part of what is shown: `having(sh, 'flow').flow`.

- **Identity.** The View is what scenes hold, add, put in groups and lay out. A
  sync only swaps its child, so the View stays in the scene and in any Group
  that holds it. References to the *old picture* go stale; take `view.current` again.
- **Composable.** `sync()` is an action, so
  `this.play(readout.sync({ match: 'text' }), token.animate.shift([1, 0]))` works, and so does a
  `Succession`, `AnimationGroup` or `LaggedStart` that contains it. Its run time, easing and lag
  are the sync's own options; a run time given to `play()` stretches it, as it stretches any action.
- **Built at its turn.** Because `draw` runs when its turn comes, a sync created
  before a state change still shows the state at play time, and a sync inside a
  `Succession` builds after the members before it have run, as `.animate`
  members do.
- **Picture contract.** `draw` must return a new mobject each call, not a cached
  one or one inside another mobject, because the old picture morphs into the new
  one. Put style in `draw` too: `setOpacity` on the View lasts only until the
  next sync.

### `match`

`match` takes a `ViewMatch`, one of these:

| `match` | morphs with | good for |
|---|---|---|
| `'key'` (default) | `TransformMatching` with `matchByKey()` | pictures whose containers carry `key`s: a keyed card, panel, cell or node keeps its identity wherever it moves, its parts morph inside it, unkeyed parts fade ([matching](MATCHING.md#keyed-components)) |
| `'text'` | `TransformMatchingText` | a bare `Text` readout, code without keys: unchanged characters stay where they are |
| `'index'` | `Transform`, family position by position | geometry whose structure persists (bars, a gauge); `DecimalNumber` counting |
| `'shapes'` | `TransformMatchingShapes` | pictures whose parts come and go |
| a `MatchKey` function | `TransformMatching` with that key | identity you know: a node id, a colour; `matchByKey({ fallback })` to keep unkeyed parts too, `matchByKey({ text: 'whole' })` when a keyed word's change is a new identity |

A key sync whose two pictures carry no keys below their roots would pair nothing, so its play
throws and names the fix: key the draw's parts (a card's or panel's `key` option, or `part.key`),
or say `match: 'text'`, `'shapes'` or `'index'`. A bare `Text` is such a picture: the key of a
picture's root is not read, and its glyphs carry none.

`staged` (default `true`, for every `match`) takes the parts that go and the parts that come in
turn: the old ones fade out over the first half and the new ones fade in over the second, so a
word and its replacement never overlap. `staged: false` fades both at once, while the matched parts
morph. A sync by `'index'` has no parts that go or come, so `staged` changes nothing for it.

A sync records what its matching transform paired as evidence, `{ kind: 'match', matched,
morphed, removed, added }`, with the View's key as `view` when it has one; a sync by `'index'`
and one whose picture did not change record none.

### A picture that did not change

If the rebuilt, placed picture matches the current one, the sync sets up no
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

- `place: 'left' | 'center' | 'right'` (a `ViewPlace`; default `'center'`, and a readout wants
  `'left'`), kept as `view.place`, is the point held still: the left edge, centre or right edge of the
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

A card, a code panel, a diagram's marks and notes, and an annotation are never changed in
place: a picture that changes is drawn by a view, and what it marks comes from the state, or
from `shown` when it is presentation rather than model. A draw is synchronous and builds its
picture whole, so each has a builder a draw can call, which puts the mark in the picture and
lets the part describe itself. The drawing kit builds cards, code panels and annotations
(`card`, `code` and `callout` from `rayner/drawing`); the stage's `s.card`, `s.code` and
`s.callout` enter the same pictures for a part that does not change.

```ts
import { view, having } from 'rayner/explain';
import { card, code, callout } from 'rayner/drawing';

// A marked card: the row the state names is lit, and the description says so.
const counts = view(this, (st) =>
  card(s, rows(st), { at: box, lit: { row: st.chosen, as: 'this check' } }), { place: false });
await s.enter(counts);                      // no describe: the card describes itself, its lit row too

// A code panel with lit lines, and a callout beside the lit line, from the same state.
const program = view(this, (st) => {
  const panel = code(s, lines(st), { at: box, lit: { lines: st.passes ? [1, 2] : 1, as: 'run' } });
  const line = panel.code.lines[1]!.box()!;
  return new Group(panel, callout(s, line, `returns ${st.passes}`, { side: 'right', color: st.passes ? s.look.good : s.look.bad }));
}, { place: false });

// A diagram note, placed as a diagram picture places one, from the state's words.
const note = view(this, (st) => d.notePicture('Capture', `${st.families} families`, { side: 'below' }), { place: false });

// The whole diagram with its marks and notes, keyed apart from a second picture of the same diagram.
const wrong = view(this, (st) => d.picture(marksOf(st), { notes: notesOf(st), prefix: 'wrong:' }), { place: false });

// The usual form: the stage shows the diagram by a view of what `shown` marks
// (the scene's shown type: { flow?: { marked: string[]; walked: [string, string][] } }).
this.shown.flow = { marked: [], walked: [] };
const flow = s.diagramView(d, (_st, sh) => {
  const f = having(sh, 'flow').flow;
  return { marks: { ...d.trail(f.walked), ...Object.fromEntries(f.marked.map((id) => [id, { color: s.look.bad, as: 'rejected' }])) } };
});
this.shown.flow = { marked: ['Reject'], walked: [] };
await this.play(flow.sync());
```

A diagram shown by a view keeps its live parts off the stage (its `d.presentation` is
`{ kind: 'viewed', view }`). A `reveal`, `morph` or `enlarge` moves the live parts, so it refuses a
viewed diagram: hand the stage back with `s.liveDiagram(d)` first and call `s.diagramView` again
afterwards, which shows it by the same view. A walk runs over the view as it is; its token travels the same routes the picture draws.

- **Marks are part of the picture.** `lit` puts the card's or panel's bar on its row
  (`{ row, as }`) or lines (`{ lines, as }`), `as` the word its description gives them; unlit, the bar is there and hidden, so a sync from unlit to lit morphs one
  family shape. A staged step's redraw from its recorded state draws the bar again,
  so `rayner check` compares it with what was drawn. The view check compares text, so it covers a
  mark through the description rather than the bar's place.
- **Parts describe themselves.** A card, a code panel, a note, a dimension line and a pin say
  what they are wherever they sit: kept, inside a view, inside a group, inside a staged step's
  picture. A `describe` on `s.keep`, `s.enter` or a staged step speaks for the rest of the
  picture, not for those parts, so it never repeats a card.
- **A diagram picture is described as the diagram.** While a view shows a picture (after
  `s.diagramView`, or `d.showBy(view)` for a view of the scene's own), the stage describes the diagram as the picture shows it, in the live
  diagram's words: each note drawn with `notePicture` or `notes`, each mark given as
  `{ color, as }` by its word, and dimmed parts said so.
- **They say what they emphasise** to the phone's close-ups, by key, so a redrawn mark at the
  same place with the same words is not new emphasis. [The reference says what counts as
  emphasis](REFERENCE.md#the-phones-opening-emphasis-and-review-subjects), and how a scene
  marks its own drawing with `emphasised(mobject, as)`.
- **Two pictures of one diagram.** Every part of a diagram picture is keyed by its id, so two
  on the stage at once would give one key to two parts. `prefix` puts a word before every key in
  the picture, the frame's too; marks, notes and dimming still
  name parts by their ids in the diagram.
- **Annotations without the camera.** `callout`, `dimension` and `pin` build at the draw's own
  coordinates and size. The stage's helpers build the same pictures in screen coordinates while
  the camera is away, so prefer the helpers for an annotation drawn into a zoomed view.

## Other readouts

- **A readout of state is a card.** `card(s, rows, { key, panel: false })`
  in a view writes values inside a drawing without a panel (`ring-buffer`, `token-bucket`);
  synced with the default keyed, staged sync, a changed value fades across and an unchanged one
  stays. Give it `width` so its labels keep their places as values grow.
- **`DecimalNumber`** in a view with `match: 'text'` morphs digit by digit:
  unchanged digits stay and changed digits fade across. With
  `sync({ match: 'index' })` its own interpolation runs, and the number counts
  through the values in between (`0 -> 5 -> 10`).
