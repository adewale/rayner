# Runnable extension recipes

These are maintained examples of public extension points, not additional scene
languages. Copy a function, add a mobject, write an animation or change a sink;
each still works with ordinary Rayner operations. The goal is to make an unexpected
combination possible without a new branch inside the engine.

Run all four in a checkout (Node 24+, no browser):

```sh
npm ci
npm run build:lib
npm run recipes -- --out out/recipes
node --test test/recipes.test.ts
```

After installation in an author project:

```sh
node node_modules/rayner/dist/recipes/render.js --out out/recipes
```

The recipes are included in packages built from this source; older releases may
not include them. The installed runner is compiled JavaScript: Node does not strip
TypeScript inside `node_modules`. Copy the accompanying `recipes/*.ts` sources to
your own project if you want to edit them. Public imports are `rayner`, never private engine paths.
They are type-checked by `npm run check`, exercised by the standard tests and run
from the fresh archive by `npm run pack:smoke`. Their output is raw engine content,
not a substitute for checking a complete published lesson.

## Bind data to a scene and inspect it

[document.ts](../recipes/document.ts) takes an ordinary request input, computes a
route, and exposes it as a drawing, text and trace. [Scene outputs](SCENE-OUTPUTS.md)
explains the Lantern document use case and every output API.

Try replacing `route` with your own deterministic model. Keep the model independent
of rendering, record its inputs and compare outputs to a reference outside the
drawing. This lets a test-vector generator, documentation build or agent supply
cases without learning a JSON animation language.

## Make a reusable shape and composite

[extensions.ts](../recipes/extensions.ts) contains three independently useful units:

- `Diamond extends VMobject` builds one custom path with `setPolygon`.
- `StatusBadge extends Group` combines that path and a text label. Getters find
  the badge's own children, including after `copy()`.
- `statusRow(labels)` is an ordinary function arranging several badges.

All can participate in `FadeIn`, `Transform`, `Group`, copying, layout and the SVG
renderer. No renderer registration is required: they use existing path primitives.
The copy test moves the cloned path and changes the cloned label, then verifies
the originals and parent references remain correct.

Try a diamond containing another component, or use the same badge in a chart and
a protocol diagram. Reuse the component through its mobject interface; avoid
adding a badge-specific operation to the scene or renderer.

For a custom class with mutable fields outside its children, read
[copying and ownership](ENGINE-FUNDAMENTALS.md#ownership-identity-and-copying).
Do not assume `copy()` knows how to clone an arbitrary closure or external handle.

## Make several objects follow one parameter

[continuous.ts](../recipes/continuous.ts) supplies `orbit(angle)`, `makeOrbit()` and
`FollowAngle extends Animation`. One angle determines a dot's position, the radius
endpoint and a decimal readout. Sample the middle of the motion:

```sh
npm run recipes -- --scene continuous --time 0.5 --out out/orbit
```

The dot is at the top of the circle and the number reads 1.57. Interpolating two
opposite endpoint pictures would put the dot through the centre instead. This
recipe evaluates the relationship throughout the motion.

`FollowAngle` captures the initial value in `begin()`, makes an immutable sample
from alpha, applies absolute updates and publishes that sample as scene state.
It registers no updater. Its animation target is the whole dependent group, so
the existing `play()` overlap checker rejects another simultaneous animation of
the dot. The dot, line and numeric mobjects retain their identities.

Try replacing the orbit function with a spring extension, a gauge or a probability
distribution and adding another dependent readout. Keep these constraints:

1. Use absolute updates from the current sample; never accumulate `dt` or read the
   previously drawn point as a model input.
2. Write only the animation's owned subtree. Its callback may publish the same
   sample to state but must not secretly animate another object.
3. Capture changing endpoints at `begin()`. Never use ambient time, unseeded random
   values or mutable external inputs to decide intermediate geometry.
4. Stay inside the model's domain. This recipe's angle is in `[0, pi]`, and its
   rate function must stay in `[0, 1]`; overshooting easings are refused by the
   model's domain check.

The recipe fixes drawing coordinates at construction. Do not shift/scale/rotate
the dependent group and expect later sampling to retain that placement: absolute
updates use its original coordinate system. Camera animation is independent.
[Sampled parameters](PARAMETERS.md) records which explainers a general version
would change, and the small shape it would take if one is migrated.

## Consume a scene in another application

[render.ts](../recipes/render.ts) shows the output adapter: it chooses a registered
Scene class and writes SVG, text, elements, traces and an index. Replace file writes
with your application's response, cache or editor view. A sink can stream frames
instead. Keep host-specific imports in that adapter rather than adding filesystem
or DOM assumptions to your model.

In a browser, `DomSink` draws into an SVG element; in a document generator,
`SnapshotSink` returns a frame. See the live-browser example in
[Scene outputs](SCENE-OUTPUTS.md#live-browser-output-and-publication).

## Compose built-in animation techniques

[choreography.ts](../recipes/choreography.ts) uses `GrowFromEdge`, `PulseAlongPath`
and `SetState` with native shapes and a state-derived readout. These are exported
engine animations extracted from repeated techniques in the collection, unlike
the sampled-parameter recipe. [Reusable choreography](CHOREOGRAPHY.md) documents
their timing, ownership, opacity, snapshot and cleanup contracts.

## Composition, compositionality and modularity

Composition is using a diamond, label and animation together. Modularity is keeping
their implementations behind separate interfaces. Compositionality is the stronger
promise that their behaviour remains understandable when combined: a copied badge
names its own children, a nested animation captures its start at the right time,
and a second writer is rejected instead of silently changing the result.

The recipes test those promises, not just whether one screenshot looks plausible.
They do not require every combination to work: ownership, domains and copy rules
make the supported combinations explicit. Publish an extension's assumptions and
a runnable counterexample for its limits, alongside its happy-path example.
