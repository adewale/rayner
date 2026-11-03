# Several drawings following the same parameter

**Status: a recipe, not an export.** The [continuous recipe](../recipes/continuous.ts)
derives a dot, a radius line and a readout from one angle inside one ordinary
`Animation`, with no updater, so seeking to a time renders the frame playing to
it renders. This note records what the collection would gain from a general
version, surveyed on 2026-11-03 across all 40 explainers, and what that bounds.

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
- **One explainer would change: `token-bucket`.** Its refill member draws the
  chart's climb with `Create` while the gauge waits at the previous level and
  jumps in the spend member, so gauge and chart disagree during refill. The
  model's between-call balance, `min(capacity, previous + elapsed × rate)`, has a
  corner at the cap, so an endpoint `Transform` of the gauge would also be wrong
  when it fills. A sampled animation over the elapsed time, writing the gauge
  level and the drawn extent of the climb from that formula, makes them agree at
  every frame. Accept and reject stay discrete, in the second member.
- **`seasons` has nothing to migrate.** No step varies a day; every Earth is a
  static drawing. A day-driven interval would be new content.
- **`ring-buffer`'s head and tail pointers travel a chord** when a `Transform`
  moves them between slots, so mid-frame an arrow is inside its ring. That is a
  discrete index, and the existing `pathFunc` option fixes it; no parameter is involved.
- No scene interpolates two opposite points on a circle. The orbit exists only in
  the recipe.
- **Issue 88, the live machine, needs none of this.** It is discrete: `next(state, event)`
  then a keyed `View` redraw, checked with `viewMismatch`. Reduced motion is alpha 1.
  A reader slider would be continuous input, and nothing plans one.

## The exportable shape, if token-bucket is migrated

```ts
// Proposed, not exported. FollowAngle with the orbit taken out.
new Follow({ from: () => prev.after, to: call.found, apply: (t) => { level.setHeight(climb(t)); rise.setDrawFraction(...); } },
  { targets: [level, rise], runTime, rateFunc: linear });
```

`from` is read in `begin()`, so the animation is correct inside a `Succession`.
`apply` writes absolutely from the sampled value and never from the previous
frame; that purity is a documented contract, as it is for updaters. The one
engine change is a `targets` list that `play()`'s overlap check reads like
`AnimationGroup.mobjects`, because wrapping live mobjects in a new `Group`
would reparent them. Until a scene needs that, the recipe is the supported path
and a scene copies it privately, as `token-bucket` already does for `SyncToCall`.

## What is deliberately not built

A parameter rig with named parameters, binding adapters, a registry and a
describer namespace adds nothing to the seek guarantee the engine already gives,
and no scene supplies the multiple parameters, concurrent rigs or custom adapters
its validation rules exist for. The one need it would serve, several separately
owned targets under one writer check, is the `targets` list above. Agentic
Mermaid capture, `d.morph` and the diagram helpers are unaffected either way.
