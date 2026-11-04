# Camera

Every scene has a camera, `scene.frame`: the box of the scene that is on screen. By default
it is the whole 16 × 9 frame at the origin. Move it to zoom onto code, pan across a diagram,
or follow a moving token, without touching anything you drew.

## What it is

`Frame` is a mobject whose only points are its corner box `[x0, y0, x1, y1]`, in scene
units. That has three consequences:

- **It moves like any mobject.** `shift`, `scale`, `moveTo`, `.animate` and `Transform` all
  work on it, and an animated camera interpolates as points: pure in alpha over endpoints
  fixed at `begin()`, so seeking through a camera move is byte-identical to a full run.
- **It is never drawn.** It is not a VMobject, so it produces no element.
- **It is not a transform of the points.** Moving the camera changes no other mobject's
  points; `box()`, `center()`, layout calls and traces read the same world coordinates
  whether the camera is home or zoomed in.

It lives on the scene, not in `scene.mobjects`, so walks over the drawn list (renderers,
verifiers, `clear()`, a scene's own bookkeeping) never meet it, although `play()` animates
it like anything else.

## Moving it

```ts
await this.play(this.frame.animate.fit(code, { margin: 0.5 }));  // zoom onto the code block
await this.play(this.frame.animate.scale(0.5).moveTo(dot));      // twice as close, centered on dot
await this.play(this.frame.animate.reset());                     // back to the whole frame
```

| | |
|---|---|
| `fit(target, { margin })` | the smallest 16:9 box holding `target` (a mobject or a `Box`) plus `margin` on every side (default 0.5), centered on it |
| `reset()` | the default box: 16 × 9 at the origin |
| `zoom` | magnification: 1 for the 16-wide frame, 2 when it is 8 wide |
| `width()`, `height()`, `center()`, `box()` | as on any mobject |

`fit`, `reset`, `scale` and `moveTo` keep the 16:9 aspect; `stretch` would not, and a
non-16:9 box is letterboxed by the SVG renderer, which shows more than the box.

Calling these without `.animate` between plays moves the camera in one frame, a cut, and
the motion verifier reports it (see below).

A camera can also follow something with an updater; frame updaters run after every other
mobject's, so it sees this frame's positions:

```ts
this.frame.scale(0.5).addUpdater((f) => f.moveTo(token));
```

## What sinks do with it

- **SVG string** (`toSvgString`, `StringSink`, `SnapshotSink`): the frame box becomes the
  `viewBox` (integer user units, y flipped in the same helper that writes clip rects). The
  `width`/`height` attributes are unchanged, and the background rect covers whatever the
  viewBox shows. Path data and `transform` attributes do not change when only the camera
  moves: `renderElements` returns the identical record objects frame to frame.
- **Live DOM** (`DomSink`): writes `viewBox` only when it changed. A pure camera move is one
  DOM write per frame.
- **Clips**: `clipBox` is in world coordinates and so are clip rects; the viewBox only
  changes what part of the world is visible, so clipped groups zoom with everything else.
- **Text** (`renderText`): the grid shows the frame box, so zoomed content reads larger.
- **Pages and PNGs**: they render through the sinks above. `rayner shots`
  and the gallery tiles turn on culling (below). A page's reader zoom narrows the `viewBox` inside the camera's box, so an
  author's camera move keeps playing under it ([reference](REFERENCE.md#controls-and-accessibility)).

## Rendering off-screen content

By default the sinks write every mobject, on screen or not. `renderElements(scene, { cull: true })`
and `toSvgString(scene, { cull: true })` (type `RenderOptions`) leave out a leaf whose box, grown
by its stroke, leaves under 2 output pixels of the view (2 × view width ÷ `width`, the output's
width in pixels, default 1280; `toSvgString` passes its own `width`), and skip a group whole only
when it clears the view by 0.5 units. Culling is a pure function of the state, so seeks are
unaffected, and the records it keeps are the same objects as without it. Every PNG the
authoring tools draw turns it on, because resvg 2.6.2 aborts on an element with `opacity`
whose visible box is empty: seasons' noon zoom leaves a glyph fading at opacity 0.054 beyond
the frame. DOM sinks leave it off and keep one element per mobject. Tests:
`test/camera.test.ts`, "cull: true leaves out what the camera cannot show; off by default" and
"cull: 2 pixels of the output width, so a wider output keeps a thinner strip".

## How the verifier sees it

`MotionSink` samples every leaf in screen space, after the camera, in units of the default
16-wide frame, so the thresholds keep their meaning: they describe what a reader sees. A
smooth camera move is smooth motion of everything on screen and reports nothing. A camera
cut moves every leaf at once and reports a teleport for each. When the camera is home,
screen space is exactly world space.

## How `check` measures labels

`rayner check` measures a native label on screen: its world size times the camera's zoom,
which for a view `w` × `h` units is min(16 ÷ w, 9 ÷ h), since a view out of 16:9 is
letterboxed and its tighter side sets the scale. A label passes when, in some frame where it
is drawn (opacity and draw fraction at least 0.95) and inside the camera's view, it reaches
14 px on a 1280 px stage. It is credited with its zoomed size only in a step's completed
(resting) frame; in any other frame it counts at no more than its size with the camera home,
so a camera that glides past a small label does not make it read
([reference](REFERENCE.md#checks)).

## In the explainers

- [seasons](../scenes/explainers/seasons/scene.ts), "noon": the stage's `s.focus(box, { exact: true })`
  onto a box the scene computes, a 2× zoom onto the noon angle with labels sized for the zoomed
  view, and `s.focus('all')` at the start of the next step. The stage keeps the heading and its
  line on screen over a paper band while the camera is away, so the box keeps the band's strip
  free of content.
- [lantern](../scenes/explainers/lantern/scene.ts), "begin": `s.focus(box, { exact: true })` onto
  the classes the step is about and the listing below them, with the heading kept on screen.

The diagram helper `d.focus(ids, { camera: true })` moves the same camera; without `camera` a focus
enlarges the artwork inside the diagram's box ([reference](REFERENCE.md#diagrams)). With
`d.focus(…, { camera: true })` or a raw `this.frame` move, the heading falls outside the view while
zoomed; `s.focus` (the [stage](REFERENCE.md#stage)) keeps it on screen.
