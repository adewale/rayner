# Restore, copies and sequencing

Three animations from manim's set. Each fixes its endpoints when it begins, so a
seek renders the byte-identical frame a full run produces (`test/anim-utils.test.ts`).
`Restore` and `TransformFromCopy` are conveniences, imported from `rayner/extras`: each is a
`Transform` (to the saved look, or of a copy). `Succession` is in `rayner`.
[Reusable choreography](CHOREOGRAPHY.md) covers the animations extracted from the
example collection.

## Restore: come back exactly

```ts
box.saveState();
await this.play(box.animate.setFill(s.bad).scale(1.5));
await this.play(new Restore(box));        // back to the saved look, animated
```

`saveState()` stores a deep copy on the mobject (`box.saved`). `restore()` returns to
it at once, `Restore` transforms back to it. After either, the mobject equals the saved
state exactly: points, style, and fields such as a `Text`'s string. That holds even
when the mobject changed shape on the way (morphed into a circle, which subdivides its
curves): `Restore` aligns to morph, then lands on the saved data itself.

The contract for structure: restore expects the family to have the same shape as when
saved, and then rewrites each member's data in place, so references to children stay
valid. If children were added or removed since, the saved children replace them
wholesale (as fresh copies); the mobject itself keeps its identity, parent and
updaters either way. Fields that name a part, such as `Code.lines`, name this
mobject's own children after a restore, not the saved copy's (`test/anim-utils.test.ts`,
"restore() on a Code keeps `lines` naming its own children, not the saved copy's"). The saved state stays, so you can restore again. `copy()` does not
carry it: a copy is a new mobject with no history.

## TransformFromCopy: derive one thing from another

```ts
await this.play(new TransformFromCopy(formula, result), formula.animate.setFill(s.soft));
```

A copy of `formula` morphs into `result`. `formula` stays where it is, unchanged, and
the scene holds `result` at the end. The copy is taken before any animation in the play
begins, so it is `formula` as the play found it whatever the argument order, and it is a
different mobject from the source, so the source can be animated in the same play. With
the source already on screen, `TransformFromCopy(a, b)` listed before or after an
animation of `a` renders the same frames byte for byte; with a source new to the scene
(`play(new Create(a), new TransformFromCopy(a, b))`) both orders draw the same paths, in
the order of the arguments (`test/anim-utils.test.ts`, "TransformFromCopy copies its source
before anything in its play begins, in either argument order").

TransformFromCopy is the supported way to morph a copy. The motion check lets a shape
appear over a staying shape only when it is a `TransformFromCopy` copy of it or has the
same shapes and paints, so a hand-made `Transform(t.copy(), other)` that changes glyph
shapes on its first frame is reported as a cut-in. A known gap: a `TransformFromCopy`
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
functions. A group rate function must not run time backwards. A `lagRatio` given to
`play()` does not stagger a `Succession`: its members stay one after another
(`test/anim-utils.test.ts`, "a lagRatio passed to play() leaves a Succession sequential").

Seeking is exact through a `Succession` too. Its members begin, and add their mobjects,
as it interpolates, so a seek into a play holding one still interpolates the frames it
skips, and stops skipping once a member brings an updater ("seeking into a Succession
whose member brings an updater matches the full run").

## In the explainers

- `saveState`/`Restore`: the [feature tour](https://github.com/adewale/rayner/blob/main/scenes/explainers/feature-tour/scene.ts)'s
  `restore` scenario moves a circle and restores it.
- `TransformFromCopy`: only the [feature tour](https://github.com/adewale/rayner/blob/main/scenes/explainers/feature-tour/scene.ts)'s
  `copy` scenario.
- `Succession`: [state-machine](https://github.com/adewale/rayner/blob/main/scenes/explainers/state-machine/scene.ts),
  [token-bucket](https://github.com/adewale/rayner/blob/main/scenes/explainers/token-bucket/scene.ts) and
  [ring-buffer](https://github.com/adewale/rayner/blob/main/scenes/explainers/ring-buffer/scene.ts) build each event's authored
  transition as a `Succession`, and a [machine](MACHINES.md) replays its events as one.
