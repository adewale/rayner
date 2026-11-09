# Several drawings following the same parameter

**Status: built as a view's tween and a transition's follow ([following one number](CHOREOGRAPHY.md#following-one-number)).** This
note records the survey, taken on 2026-11-03 across the 40 explainers the collection then held (a dated survey figure, not a current count), that fixed its
size, and the larger design it turned down. The [continuous recipe](../recipes/continuous.ts)
shows the same idea written by hand as an ordinary `Animation`.

## The problem

One model quantity should decide several drawings at once: a day decides the orbit,
chart cursor and readout; an elapsed time decides the bucket's level and the chart's
climb. Animated separately, the pictures can disagree between endpoints, and a
`View.sync` morphs between two endpoint pictures without evaluating the model in
between.

The engine already gives the guarantee this needs. A frame is
`doInterpolate(rateFunc(alpha))` over endpoints fixed as the play begins, and only an active
updater on the stage or the camera stops a seek from skipping, so any animation whose
`interpolate` writes absolute geometry from alpha is seek-exact.
`test/recipes.test.ts` shows it for the recipe's `FollowAngle`.

## What the survey found

- **No scene registered an updater**, and none used `DecimalNumber`. The private
  `Animation` subclasses in scenes were `Nudge` (`lantern`, a deliberately
  history-dependent counterexample), `SyncToCall` (`token-bucket`, since replaced by a
  machine event and the readout's sync) and the recipe's `FollowAngle`.
- **`token-bucket` changed.** Its refill member drew the chart's climb with `Create`
  while the gauge waited at the previous level and jumped in the spend member, so
  gauge and chart disagreed during refill. The between-call balance,
  `min(capacity, previous + elapsed × rate)`, has a corner at the cap, so an endpoint
  `Transform` of the gauge would also have been wrong when it fills. A follow over
  the elapsed time now writes the gauge level and the climb's drawn share from that
  formula. Every resting picture is unchanged.
- **`ring-buffer` changed too.** A `Transform` moved the head and tail pointers along
  a chord between slots, so mid-move an arrow was inside its ring. The survey had
  counted a pointer as a discrete index; the motion between two indexes is a
  continuous angle, and a follow now draws each pointer afresh at each sampled angle.
- **`seasons` has nothing to migrate.** No step varies a day; every Earth is a static
  drawing, and a day-driven interval would be new content. No scene interpolates two
  opposite points on a circle; the orbit exists only in the recipe.
- **The live machine ([#88](https://github.com/adewale/rayner/issues/88)) needs none
  of this.** It is discrete: `next(state, event)`, then a keyed `View` redraw checked
  with `viewMismatch`. A reader slider would be continuous input, and nothing plans one.

## What was built

A follow samples one number, draws the picture at it and writes that picture into the
mobjects it names, with `become`. The engine changes beside the class were `targets()`,
which every animation reports and `play()` admits and checks, and `Mobject.become`.
That is the smallest shape that composes with what exists: the model stays an ordinary
tested function, the animation is one member among `Transform`s in an `AnimationGroup`
or `Succession`, and because the writers are declared and each frame is a pure
function of alpha, identity, ownership and seeking still hold when it is combined with
the rest. [Reusable choreography](CHOREOGRAPHY.md#following-one-number) documents its contract.

## What is deliberately not built

A parameter rig with named parameters, binding adapters, a registry and a describer
namespace adds nothing to the seek guarantee the engine already gives, and no scene
needs the multiple parameters, concurrent rigs or custom adapters its validation rules
exist for. The one need it would have served, several separately owned targets under
one writer check, is `targets`. Agentic Mermaid capture, `d.morph` and the diagram
helpers are unaffected either way.
