# Several drawings following the same parameter

**Status: one exported animation, [`Follow`](CHOREOGRAPHY.md#follow).** It
samples one number between two ends at the eased alpha and calls `apply` with it,
names the mobjects it writes for the one-writer check, registers no updater, and
so seeks to the frame a full run renders. The [continuous recipe](../recipes/continuous.ts)
shows the same idea written by hand as an ordinary `Animation`. This note records
the survey that fixed that size, taken on 2026-11-03 across all 40 explainers.

## The problem

One model quantity should decide several drawings at once: a day the orbit, chart
cursor and readout; an elapsed time the bucket's level and the chart's climb.
Animating the pictures separately can make them disagree between endpoints, and a
`View.sync` morphs two endpoint pictures, which is right for rearrangements but
does not evaluate the model in between.

The engine already has the guarantee this needs: a frame is `interpolate(rateFunc(alpha))`
over endpoints fixed in `begin()`, and only an active updater disables seek
skipping (`Scene.hasUpdaters()`). Any animation whose `interpolate` writes
absolute geometry from alpha is seek-exact for free; `test/recipes.test.ts`
proves it for the recipe's `FollowAngle`.

## What the survey found

- **No scene registers an updater**, and none uses `DecimalNumber`. The private
  `Animation` subclasses in scenes are `Nudge` (`lantern`, a deliberately
  history-dependent counter-example), `SyncToCall` (`token-bucket`) and the
  recipe's `FollowAngle`.
- **One explainer changed: `token-bucket`.** Its refill member drew the chart's
  climb with `Create` while the gauge waited at the previous level and jumped in
  the spend member, so gauge and chart disagreed during refill. The model's
  between-call balance, `min(capacity, previous + elapsed × rate)`, has a corner
  at the cap, so an endpoint `Transform` of the gauge would also have been wrong
  when it fills. A `Follow` over the elapsed time now writes the gauge level and
  the climb's drawn share from that formula, so they agree at every frame. Accept
  and reject stay discrete, in the second member. Every resting picture is unchanged.
- **`seasons` has nothing to migrate.** No step varies a day; every Earth is a
  static drawing. A day-driven interval would be new content.
- **`ring-buffer`'s head and tail pointers travelled a chord** when a `Transform`
  moved them between slots, so mid-frame an arrow was inside its ring. That is a
  discrete index, and the existing `pathFunc` option now carries the morph along
  the ring's arc; no parameter is involved.
- No scene interpolates two opposite points on a circle. The orbit exists only in
  the recipe.
- **Issue 88, the live machine, needs none of this.** It is discrete: `next(state, event)`
  then a keyed `View` redraw, checked with `viewMismatch`. Reduced motion is alpha 1.
  A reader slider would be continuous input, and nothing plans one.

## The exported shape

```ts
new Follow(
  { from: prev.at, to: call.at, apply: (t) => { setLevel(balanceAt(t)); drawTo(rise, climbed, t); } },
  { targets: [level, rise], runTime: 0.3 },
);
```

`from` is read in `begin()`, so the animation is correct inside a `Succession`.
`apply` writes absolutely from the sampled value and never from the previous
frame; that purity is a documented contract, as it is for updaters. The one
engine change beside the class is `targets()`: every animation now reports the
mobjects it writes, a `Follow` reports its list, and `play()` admits and checks
them without wrapping live mobjects in a new `Group`, which would reparent them.

This is the smallest shape that composes with what exists. The model stays an
ordinary function the tests already check; the animation is one member among
`Transform`s in an `AnimationGroup` or `Succession`; the writers are declared and
the frame is a pure function of alpha, so identity, ownership and seeking hold
when it is combined with the rest, which is the compositionality the proposal
asked for. A reader control that drives the same value would call `apply` with
the reader's number; nothing plans one.

## What is deliberately not built

A parameter rig with named parameters, binding adapters, a registry and a
describer namespace adds nothing to the seek guarantee the engine already gives,
and no scene supplies the multiple parameters, concurrent rigs or custom adapters
its validation rules exist for. The one need it would have served, several
separately owned targets under one writer check, is `targets` above. Agentic
Mermaid capture, `d.morph` and the diagram helpers are unaffected either way.
