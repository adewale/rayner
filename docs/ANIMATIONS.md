# Transforms, saved states, copies and sequencing

`Transform`, in `rayner`, morphs one mobject into another, and its options cover what manim
spreads over several classes: pairing parts by what they are, returning to a saved state,
morphing a copy. `Succession`, in `rayner` too, plays animations one after another in one
play. Each fixes its endpoints when it begins, so a seek renders the byte-identical frame a
full run produces (`test/anim-utils.test.ts`). [Reusable choreography](CHOREOGRAPHY.md)
covers the animations extracted from the example collection.

## Transform and its options

```ts
new Transform(mobject, target, options?)    // target: a mobject, or 'saved'
```

| Option | Default | What it does |
| --- | --- | --- |
| `match` | `'index'` | How parts pair. `'index'`: the families pair leaf for leaf, by position, and each pair morphs. `'text'`, `'shapes'`, `'key'`, `{ by: 'key', text, unkeyed, fallback }` or a function from a part to its key: parts pair by what they are, and a part with no partner fades out or in ([matching](MATCHING.md)). The type is `Match` |
| `ordered` | `true` for `match: 'text'`, else `false` | A matched transform pairs runs of consecutive equal keys first, in reading order |
| `staged` | `false` | A matched transform's unmatched parts go over the first half and come over the second, so a word and the word replacing it never overlap |
| `fadeMismatches` | `true` | `false`: a matched transform morphs its unmatched parts into each other by index, fading only the leftovers |
| `fromCopy` | `false` | A copy of `mobject` morphs into `target`; `mobject` stays ([below](#fromcopy-derive-one-thing-from-another)) |
| `replace` | `false` for a morph by index; `true` when parts are matched, and with `fromCopy` | The scene holds `target` afterwards. A matched transform's source ends holding faded parts and copies of the target's new ones, so by default the scene takes the target; `fromCopy` refuses `false` |

`'saved'` as the target returns `mobject` to the state `saveState()` stored
([below](#back-to-a-saved-state-come-back-exactly)); it morphs by index and keeps `mobject`, so
it takes animation timing options, and refuses matching or handover options (`match`, `ordered`,
`staged`, `fadeMismatches`, `fromCopy` and `replace`), even redundant values such as `match: 'index'`
or `replace: false`. An option whose value is `undefined` counts as omitted.
The constructor enforces these option rules for TypeScript and JavaScript callers.
`TransformOptions` also rejects
`fromCopy: true` together with `replace: false`. Narrow a target typed as `Mobject | 'saved'`
before supplying options that only make sense for another mobject.
To add your own options, intersect the union: `type MyOptions = TransformOptions & { strength?: number }`.
A matched transform reports what it paired once it
has begun: `pairs`, `morphed`, `removed`, `added`, and `summary()`, a `MatchSummary` (`null` for a
morph by index), recorded as the step's `match` evidence. `TransformDiff` is a matched
`Transform` whose pairing is a code diff ([diff-driven](MATCHING.md#diff-driven)).

Earlier versions had a class for each of these; each is now the option on `Transform`:

| Before | Now |
| --- | --- |
| `new TransformMatchingText(a, b)` | `new Transform(a, b, { match: 'text' })` |
| `new TransformMatchingShapes(a, b)` | `new Transform(a, b, { match: 'shapes' })` |
| `new TransformMatching(a, b, { key })` | `new Transform(a, b, { match: key })` |
| `new TransformMatching(a, b, { key: matchByKey() })` | `new Transform(a, b, { match: 'key' })` |
| `matchByKey({ text, unkeyed, fallback })` | `{ by: 'key', text, unkeyed, fallback }`, a `KeyMatch`, as `match` |
| `new TransformFromCopy(a, b)` | `new Transform(a, b, { fromCopy: true })` |
| `m.saveState()`, then `new Restore(m)` | `m.saveState()`, then `new Transform(m, 'saved')` |

## Back to a saved state: come back exactly

```ts
box.saveState();
await this.play(box.animate.setFill(s.look.bad).scale(1.5));
await this.play(new Transform(box, 'saved'));   // back to the saved look, animated
```

`saveState()` stores a deep copy on the mobject. `restore()` returns to
it at once; `new Transform(box, 'saved')` transforms back to it, reading the saved state as
its play begins. After either, the mobject equals the saved
state exactly: points, style, and fields such as a `Text`'s string. That holds even
when the mobject changed shape on the way (morphed into a circle, which subdivides its
curves): the transform aligns to morph, then finishes on the saved data itself. Without a
saved state, the play throws as it begins, naming `saveState()`.

The contract for structure: restore expects the family to have the same shape as when
saved, and then rewrites each member's data in place, so references to children stay
valid. If children were added or removed since, the saved children replace them
wholesale (as fresh copies); the mobject itself keeps its identity, parent and
updaters either way. Fields that name a part, such as `Code.lines`, name this
mobject's own children after a restore, not the saved copy's (`test/anim-utils.test.ts`,
"restore() on a Code keeps `lines` naming its own children, not the saved copy's"). The saved state stays, so you can restore again. `copy()` does not
carry it: a copy is a new mobject with no history.

## fromCopy: derive one thing from another

```ts
await this.play(new Transform(formula, result, { fromCopy: true }), formula.animate.setFill(s.look.soft));
```

A copy of `formula` morphs into `result`. `formula` stays where it is, unchanged, and
the scene holds `result` at the end. The copy is taken before any animation in the play
begins, so it is `formula` as the play found it whatever the argument order, and it is a
different mobject from `formula`, so `formula` can be animated in the same play. Until the
play begins, the transform's `mobject` is an empty placeholder. With
the source already on screen, a `fromCopy` transform of `a` listed before or after an
animation of `a` renders the same frames byte for byte; with a source new to the scene
(`play(new Create(a), new Transform(a, b, { fromCopy: true }))`) both orders draw the same paths, in
the order of the arguments (`test/anim-utils.test.ts`, "fromCopy copies its source
before anything in its play begins, in either argument order").

`fromCopy` is the supported way to morph a copy. The motion check lets a shape
appear over a staying shape only when it is a `fromCopy` copy of it or has the
same shapes and paints, so a hand-made `new Transform(t.copy(), other)` that changes glyph
shapes on its first frame is reported as a cut-in. A known gap: a `fromCopy` transform
into a `Text` reports cut-outs of the target's glyphs at the handoff.

## Succession: one after another, in one play

```ts
await this.play(new Succession([
  new Create(box),
  box.animate.shift([1, 0]),
  new FadeOut(box),
]));
```

Each member begins when the previous ends, exactly as consecutive `play()` calls would:
its endpoints are fixed from the state the previous member left (an `.animate` member
builds its target then, too), and it finishes and is cleaned up at its own end (the box
is removed when the `FadeOut` ends). So members may drive the same mobject. Run time is
the sum of the members'. With run times in whole frames (the default 1 s, or any
multiple of 1/fps), frame counts and step times equal those of the consecutive plays,
and in the tests so do the frames, byte for byte. Otherwise they can differ by a frame:
each play rounds its own length to whole frames, a `Succession` rounds the total.

It nests both ways with `AnimationGroup` and `LaggedStart`. `play()`'s rule that two
animations may not drive one mobject at the same time looks through it: members of one
`Succession` may share a mobject, but none may share with an animation running beside
the `Succession`.

Time through a `Succession` is linear by default; members ease with their own rate
functions. A group rate function must not run its time back past the start of a member
that has finished. A `Succession` takes no `lagRatio`: its options have none, and `play()`
and its setter refuse one, naming the call (`test/anim-utils.test.ts`, "a Succession takes no
lagRatio").

A member begins at its turn, in turn order with whatever else begins at its turn in the same
frame. One that waits for what it reads (an action's beat that shows a diagram) holds the
`Succession`: the members after it begin once it has begun, so their side effects keep their
order even when the waiting member is shorter than a frame. When the play finishes a
`Succession` held this way, its `phase` stays `'begun'` until its last member has begun and
finished, then is `'finished'`.

Seeking is exact through a `Succession` too. Its members begin, and add their mobjects,
as it interpolates, so a seek into a play holding one still interpolates the frames it
skips, and stops skipping once a member brings an updater ("seeking into a Succession
whose member brings an updater matches the full run").

## In the explainers

- `saveState` and `new Transform(m, 'saved')`: [unified-diff](https://github.com/adewale/rayner/blob/main/scenes/explainers/unified-diff/scene.ts), where the frame that searches
  a file for a hunk's lines returns to the line it started from when the hunk fits nowhere.
- `fromCopy`: [float-sum](https://github.com/adewale/rayner/blob/main/scenes/explainers/float-sum/scene.ts), where a typed decimal's ring stays put
  and a copy of it settles on the double it is stored as.
- `match: 'text'`, `'shapes'` and `'key'`: [float-sum](https://github.com/adewale/rayner/blob/main/scenes/explainers/float-sum/scene.ts),
  [glyph](https://github.com/adewale/rayner/blob/main/scenes/explainers/glyph/scene.ts) and
  [string-length](https://github.com/adewale/rayner/blob/main/scenes/explainers/string-length/scene.ts) ([matching](MATCHING.md#in-the-explainers)).
- `Succession`: [state-machine](https://github.com/adewale/rayner/blob/main/scenes/explainers/state-machine/scene.ts),
  [token-bucket](https://github.com/adewale/rayner/blob/main/scenes/explainers/token-bucket/scene.ts) and
  [ring-buffer](https://github.com/adewale/rayner/blob/main/scenes/explainers/ring-buffer/scene.ts) build each event's authored
  transition as a `Succession`, and a [machine](MACHINES.md) replays its events as one.
