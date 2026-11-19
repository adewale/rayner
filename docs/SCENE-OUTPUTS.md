# Frames, state and traces from native scenes

## Use case

Use this when a documentation builder, test, CLI, agent or application needs the
outputs Lantern's JSON document produced, without a JSON scene language or a whole
reader page. Write a native TypeScript scene once, then ask for an SVG frame,
structured state or its step index. Ordinary input data can choose the scene's
inputs.

Lantern's `sceneFromDoc(doc)` compiled nodes, edges, code, state and operation lists
into a native Scene. Rayner removed that compiler and its HTTP service and kept the
outputs. It does not read old documents, and does not reproduce deleted layout
defaults or renderers pixel for pixel.

## Run the complete example

Node 24 or later is sufficient. No browser or diagram capture is needed.

In a checkout:

```sh
npm ci
npm run build:lib
npm run recipes -- --scene document --step result --out out/document
```

In a separate ESM author project after installing `rayner`:

```sh
node node_modules/rayner/dist/recipes/render.js --scene document --step result --out out/document
```

These recipes ship in the package built from this source. A previously published
version may not contain them. The runner writes `document.svg`, `document.state.json`
and `document.trace.json`. Add `--frames` to write the full SVG frame sequence as
`document.frames.json`.

[The scene](../recipes/document.ts) explains a request's cache/database decision.
`requestScene({ cached: true })` binds data to a Scene class; `false` gives the
database path. Its `route()` function supplies the result,
and the state-derived readout follows it. The input is read when binding the class
so a caller cannot change a later replay by changing the original input object.

## From document concepts to TypeScript

| Lantern document concept | Native Rayner equivalent |
| --- | --- |
| `nodes`: box, state, slot, pointer, value, text | `Rectangle`, `Circle`, `Arrow`, `Text`, `DecimalNumber`; combine with `Group`/`Labeled` |
| `edges` and labels | `Arrow`/`CurvedArrow` with `Labeled`, or captured Agentic Mermaid diagrams |
| `at`, relative placement | `moveTo`, `nextTo`, `alignTo`, `arrange` |
| `code`, `focus` | `Code`, spans and emphasis animations |
| `state`, `readout`, `set` | Typed `Scene` state, a model function and `view(this, draw).sync()` |
| Named `steps` and metadata | `await this.step(name, metadata)` |
| Sequential ops / arrays of simultaneous ops | Sequential `await this.play(...)` / one `this.play(a, b)` |
| Add/remove/move/style/indicate | `FadeIn`, `FadeOut`, `.animate`, `Circumscribe` and the [emphasis shapes](EMPHASIS.md) |
| `note`, duration and hold | `Text`, step captions, `runTime`, `wait()` |

This maps capabilities; it is not a source-to-source compatibility layer. TypeScript
also allows arbitrary model code, reusable functions, custom paths and animations. JSON
is still the format for input parameters, snapshots, traces and output records, but
not for the animation program itself.

## Public output APIs

Drawing a scene's frames is `rayner`'s own: `renderFrame`, `toSvgString` and `StringSink`. A trace is author tooling, in `rayner/testing`. Each step's resting picture in words and drawn as text is in `describeExplainer` (`rayner/testing`), and `rayner see` prints one step's for a terminal.

```ts
import { renderFrame, toSvgString } from 'rayner';
import { traceScene } from 'rayner/testing';
import { requestScene } from './document.ts';

const Request = requestScene({ cached: false });
const trace = await traceScene(Request);    // complete step-boundary trace
const result = trace.steps.find((s) => s.step === 'result');
if (!result) throw new Error('Unknown step');
const scene = await renderFrame(Request, result.frame1);

const svg = toSvgString(scene);             // one SVG frame
const state = scene.stateJson();            // the model at this frame; shownJson() for what is shown
```

Copy `recipes/document.ts` beside this code, or import your own Scene class instead.
[The runnable runner](../recipes/render.ts) uses these same public APIs. A published
page's transcript combines captions and explanatory descriptions for a reader who
cannot see the picture.

| Requested result | API | Former Lantern service equivalent |
| --- | --- | --- |
| One SVG | `toSvgString` of the scene `renderFrame` returns at a frame, such as a step's `frame1` | `/frame.svg` |
| A step's picture in words and as text | `describeExplainer`, whose steps carry both | `/text` |
| Full step/state trace, with each step's timing and the duration | `traceScene`, a `Trace` (`{ fps, duration, frames, steps }`) | `/trace.json`, `/index.json` |
| Every SVG frame | `new SceneClass(new StringSink()).run()`; read sink's `frames` | frame-sequence rendering (`/render`) |

These are capability correspondences, not restored HTTP routes or wire schemas.
An application can wrap them in its own HTTP handlers around registered native
scenes and their inputs. Rayner ships no replacement Worker deployment or generic
scene-document endpoint. The Node runner's filesystem code is not Worker code.

## Time and step semantics

A scene is sought by frame. A step's record names its frames by number: `frame0` where it
begins, `holdFrame` where its caption hold begins, and `frame1`, its resting picture, which
`renderFrame(SceneClass, record.frame1, sink)` draws. Check the chosen step exists before
drawing it.

`renderFrame` runs the scene to one frame by its number, the `frameCount` the scene reaches as it
draws it, hands that frame to the sink it is given (none by default) and returns the scene there;
a number past the end gives the final frame. It counts the frames before it
without drawing them, and never finds a frame by a rounded time. Frame `k` is at time
`k / fps`. `traceScene` returns a `Trace`,
`{ fps, duration, frames, steps }`, typed from the scene class ([typed traces](REFERENCE.md#typed-traces)), recording the persistent model before and after each step, an optional local `state` for a staged specimen, and what was shown at its end, not every
intermediate value; call `scene.stateJson()` at chosen sample times for those. It runs the
scene into a `TraceSink`, whose `steps()` are those records: hand one to a run of your own to
trace it beside other output.

For all SVG frames:

```ts
import { StringSink } from 'rayner';
const all = new StringSink();
await new Request(all, { fps: 30 }).run();
// all.frames contains SVG strings in frame order; it retains the whole run. all.last() is the final one.
```

Use `renderFrame` and `toSvgString` for a single frame, or implement `Sink.frame` to stream
frames rather than retaining a large sequence in memory. Forward `stepBegin` and
`stepEnd` too when composing a sink that needs step notifications; `stepEnd` is handed an
`EndedStep`, whose `t1` and `frame1` are numbers. A sink that draws only from
some time on says so with `skipUntil`, the one way to skip frames: frames that end before it are
counted, not drawn, and the sink may move it between plays. It is a time in seconds, 0 or more, or
`Infinity` to skip every frame, as `TraceSink` does and `{ skipUntil: Infinity, async frame() {} }`,
a sink that draws nothing, does; the scene refuses `NaN` or a
negative time when a play or wait next reads it. A sink without it draws every frame, and
`new TraceSink({ skipUntil: 0 })` traces a run that draws them all.

## Live browser output and publication

To show a scene on a host page, embed the page `rayner build` writes: it plays the scene with the
reader's Next and Previous controls, scenario selection, transcript and deep links, and it has passed
`rayner check` ([publishing](PUBLISHING.md)). For a still, put `toSvgString(await renderFrame(Scene, frame))`
in the page. A raw run of the scene in a page of your own has neither.

## What is checked

`test/recipes.test.ts` checks both inputs against explicit expected results and
the trace's state and evidence. It also checks continuous
sample geometry and SVG seek/playback agreement. `npm run pack:smoke` runs the
recipes from a fresh installation, not just from the checkout. Those checks do
not certify arbitrary authors' models or every historical Lantern document.
