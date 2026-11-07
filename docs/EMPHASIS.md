# Emphasis

Shapes that point at part of the picture and stay there until you remove them,
plus `Circumscribe`, which can either pulse or stay.

## Why emphasis should stay

A reader stops on each step's last frame, its resting picture, and looks at it
while reading the caption. An emphasis that pulses and fades is gone by then. When
the first fourteen explainers were reviewed as a reader sees them, nine had steps
that ended exactly like the step before, because highlights had pulsed away and
tokens had walked off; `rayner check` now fails such a step. A mark that stays still
says "this one" on the frame the reader sees. Use these shapes when the step is
about the thing marked. There is no passing glance: `Indicate` and `Flash` were cut
in 0.2.0, because such a mark has faded by the resting picture, and a step it was all
that changed fails the check.

## The shapes

Each takes a target, either a mobject or a `Box` (`[minX, minY, maxX, maxY]`), and
is built once from the target's box at that moment. Like manim's, the shape is a
snapshot: if the target moves later, the shape stays where it was. Move both, or
build a new one.

| Shape | Says | Defaults |
| --- | --- | --- |
| `new SurroundingRectangle(t, { buff, cornerRadius })` | this one | the scene's emphasis colour as its stroke, no fill, `buff` 0.15 |
| `new Underline(t, { buff })` | this word, this value | the scene's ink, `buff` 0.1 below the bottom edge |
| `new Cross(t, { scale })` | not this, removed, rejected | the scene's `bad` colour, stroke 0.06, both diagonals of the box |
| `new Brace(t, direction, { buff, depth, sharpness })` | this span, as a whole | the scene's ink, `buff` 0.1, `depth` 0.2 |
| `new BraceLabel(t, text, direction, { fontSize, color, buff, labelBuff })` | this span is _n_ | a Brace and a Text beyond its tip |

`Underline` is imported from `rayner/extras`, the rest from `rayner`. All take the usual style fields (`stroke`, `strokeWidth`, `fill`, ...). A colour left out is the scene's for that role ([default colours](ENGINE-FUNDAMENTALS.md#geometry-and-paint)): on a stage, its palette's. Draw order
is chosen for `Create`. The rectangle starts at its top-left corner and goes
clockwise. The underline runs left to right. The cross draws upper-left to
lower-right first. A brace runs from one end, through the tip, to the other.

**Braces.** `direction` is the side of the box the brace goes on, and the tip
points that way: `[0, -1]` (the default) puts the brace under the target. All four directions are
the same drawing. The brace is built pointing down, as wide as the box is across
`direction`, then rotated into place, so a vertical brace is the horizontal one
turned. It is a stroked path, not a filled one, so it has the same stroke weight
and color as the outlines next to it, and `Create` traces it once, the way a pen
would. `brace.tip()` and `brace.direction()` are computed from the points, so they
stay correct after the brace is copied, moved or rotated.
`brace.putAtTip(mobject, buff)` places anything (a value, an icon) past the tip.
`BraceLabel` does that with a Text, and its `brace` and `label` getters read by
child index, so they still work on copies.

## Circumscribe

```ts
await this.play(new Circumscribe(target));                  // pulse: draw in, fade out, gone
await this.play(new Circumscribe(target, { keep: true }));  // draw in and stay
```

The outline draws in over the first two thirds of the run. In the last third it
fades out (`fadeOut: false` retracts it along its path instead), and the scene
removes it when the play ends. With `keep: true`, the outline stays at full
strength after drawing in and remains in `scene.mobjects`, so the step's last
frame shows it. That also means the step's last frame differs from the previous
step's, which `rayner check` requires. Remove it later with
`new FadeOut(c.outline)`.

Options: `color` (the scene's emphasis colour), `shape` (`'rect'`, or `'circle'` through the box's
corners plus `buff`), `buff` (0.15), `strokeWidth`, `cornerRadius`, `keep`,
`fadeOut`, `runTime` (1). A circle around a long, flat target is large, so use
`'circle'` for compact targets and `'rect'` for lines of text.

The animation's mobject is the outline itself, which is how `play()` adds it to
the scene. The outline exists from construction, so a scene can keep a reference
to it, and it is refitted to the target's box when the play starts. Constructing
the animation early and then moving the target still circles the target where it
ends up. The draw-in is a `drawFraction` reveal, like `Create`, and the fade is an
opacity ramp, so the motion verifier sees no pop or cut. At run times below about
0.4 s the fade is short enough to count as a pop.

## With code and regions

A `Box` target lets you mark a region without grouping its contents. Putting code
lines into a new `Group` would take them out of their `Code`. To mark a span of
lines, build the box from the lines themselves:

```ts
const code = new Code(lines);
const [a, b] = [code.lines[2]!.box()!, code.lines[4]!.box()!], all = code.box()!;
const span: Box = [all[0], b[1], all[2], a[3]];        // lines 2..4, full block width
this.add(code);
await this.play(new Create(new SurroundingRectangle(span, { buff: 0.06, cornerRadius: 0.06 })));
await this.play(new Create(new BraceLabel(span, 'the retry loop', [1, 0], { fontSize: 0.22 })));
```

`Code.highlight(i)` is a filled bar behind one line, for the line about to run;
an outline or brace points at a span while the caption says something about it.
A code panel's `focus` option, a diagram picture's marks and `d.notePicture` build
on the same idea for explainers, drawn from state by a [view](VIEWS.md).

## In the explainers

- `SurroundingRectangle`: [glyph](https://github.com/adewale/rayner/blob/main/scenes/explainers/glyph/scene.ts) (advance cells),
  [mr-cache](https://github.com/adewale/rayner/blob/main/scenes/explainers/mr-cache/scene.ts) (lines that run, from a `Box` of code lines),
  [state-machine](https://github.com/adewale/rayner/blob/main/scenes/explainers/state-machine/scene.ts) (the reducer row, from a code span's box,
  and a ring on the current state, drawn in a view so it moves with the state),
  [ring-buffer](https://github.com/adewale/rayner/blob/main/scenes/explainers/ring-buffer/scene.ts) (the slot an operation touched).
- `Circumscribe({ keep: true })`: [mr-cache](https://github.com/adewale/rayner/blob/main/scenes/explainers/mr-cache/scene.ts) (the KV lookup)
  and the feature tour's `emphasis` scenario.
- `Underline` (from `rayner/extras`): the feature tour's `underline` scenario only.
- `Cross`: [ring-buffer](https://github.com/adewale/rayner/blob/main/scenes/explainers/ring-buffer/scene.ts), on a refused value, and
  [latest-search](https://github.com/adewale/rayner/blob/main/scenes/explainers/latest-search/scene.ts), on a response the guard drops. On one flat
  line of code a `Cross` reads as a strikethrough rather than an X.
- `BraceLabel`: [glyph](https://github.com/adewale/rayner/blob/main/scenes/explainers/glyph/scene.ts) (each font's measured width) and
  [exgit](https://github.com/adewale/rayner/blob/main/scenes/explainers/exgit/scene.ts) (the seven digits that name a blob).
