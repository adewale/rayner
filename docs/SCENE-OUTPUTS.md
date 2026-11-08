# Frames, text and traces from native scenes

## Use case

Use this when a documentation builder, test, CLI, agent or application needs the
outputs Lantern's JSON document produced, without a JSON scene language or a whole
reader page. Write a native TypeScript scene once, then ask for an SVG frame, a text
frame, structured state or its step index. Ordinary input data can choose the scene's
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
version may not contain them. The runner writes `document.svg`, `document.txt`,
`document.elements.json`, `document.trace.json` and `document.index.json`. Add
`--frames` to write the full SVG frame sequence as `document.frames.json`.

[The scene](../recipes/document.ts) explains a request's cache/database decision.
`requestScene({ cached: true })` binds data to a Scene class; `false` gives the
database path. Its `route()` function supplies the result,
and the state-derived readout follows it. Inputs are copied when binding the class
so a caller cannot mutate a later replay by changing the original input object.

## From document concepts to TypeScript

| Lantern document concept | Native Rayner equivalent |
| --- | --- |
| `nodes`: box, state, slot, pointer, value, text | `Rectangle`, `Circle`, `Square`, `Arrow`, `Text`, `DecimalNumber`; combine with `Group`/`Labeled` |
| `edges` and labels | `Arrow`/`CurvedArrow` with `Labeled`, or captured Agentic Mermaid diagrams |
| `at`, relative placement | `moveTo`, `nextTo`, `alignTo`, `arrange` |
| `code`, `focus` | `Code`, `highlight`, spans and emphasis animations |
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

Drawing a scene's frames somewhere is `rayner/output`; a trace is author tooling, in `rayner/testing`.

```ts
import { SnapshotSink, renderAt, renderText, renderElements, indexScene, stepTime } from 'rayner/output';
import { traceScene } from 'rayner/testing';
import { requestScene } from './document.ts';

const Request = requestScene({ cached: false });
const index = await indexScene(Request);
const time = stepTime(index, 'result');
if (time === null) throw new Error('Unknown step');
const sink = new SnapshotSink();
const scene = await renderAt(Request, time, sink);

const svg = sink.svg;                       // one SVG frame
const text = renderText(scene);             // lossy spatial text view
const elements = renderElements(scene);     // geometry/paint records
const state = scene.stateJson();            // the model at this frame; shownJson() for what is shown
const trace = await traceScene(Request);    // complete step-boundary trace
```

Copy `recipes/document.ts` beside this code, or import your own Scene class instead.
[The runnable runner](../recipes/render.ts) uses these same public APIs. Text is a
spatial approximation, not a full accessible transcript; publication combines
captions and explanatory descriptions in its transcript.

| Requested result | API | Former Lantern service equivalent |
| --- | --- | --- |
| One SVG | `renderAt` (at a time) or `renderFrame` (at a frame, such as a step's `frame1`) into `SnapshotSink` | `/frame.svg` |
| Text at a time | `renderText` on that sampled scene | `/text` |
| Element records | `renderElements`, one `ElementRecord` per drawn element | `/elements.json` |
| Full step/state trace | `traceScene` | `/trace.json` |
| Step timing and duration | `indexScene`, a `SceneIndex` (`{ fps, duration, frames, steps }`, whose steps are the scene's own `Step` records, from the dry run `traceScene` is read from too) | `/index.json` |
| Every SVG frame | `new SceneClass(new StringSink()).run()`; read sink's `frames` | frame-sequence rendering (`/render`) |

These are capability correspondences, not restored HTTP routes or wire schemas.
An application can wrap them in its own HTTP handlers around registered native
scenes and their inputs. Rayner ships no replacement Worker deployment or generic
scene-document endpoint. The Node runner's filesystem code is not Worker code.

## Time and step semantics

`stepTime` returns a step's **start**, not its final resting picture. In the example,
the `result` step follows the completed decision, so its start already shows the
answer. A step's resting picture is its last frame, which its record names by number:
`renderFrame(SceneClass, record.frame1, sink)` draws it, for a trace record or a
`SceneIndex` step alike. Check the chosen step exists before drawing it.

`renderFrame` draws one frame by its number, the `frameCount` the scene reaches as it
draws it, as a step's `frame0`, `frame1` and `holdFrame` record; a number past the end
draws the final frame. It skips the frames before it as `renderAt` does, and never
finds a frame by a rounded time.

`renderAt` samples the first frame at or after the requested time, on the scene's
fixed frame grid. A time past the end returns the final frame. It runs the scene into a
`SeekSink(target, t, { stopAfterFirst })`, which hands its `target` only the frames from `t` on
(`forwarded` counts them) and, with `stopAfterFirst`, stops the run after the first. `traceScene` returns a `Trace`,
`{ fps, duration, frames, steps }`, typed from the scene class ([typed traces](REFERENCE.md#typed-traces)), recording the model before and after each step and what was shown at its end, not every
intermediate value; call `scene.stateJson()` at chosen sample times for those. It runs the
scene into a `TraceSink`, whose `steps()` are those records: hand one to a run of your own to
trace it beside other output.

For all SVG frames:

```ts
import { StringSink } from 'rayner/output';
const all = new StringSink();
await new Request(all, { fps: 30 }).run();
// all.frames contains SVG strings in frame order; it retains the whole run. all.last() is the final one.
```

Use `SnapshotSink` for a single retained frame or implement `Sink.frame` to stream
frames rather than retaining a large sequence in memory. Forward `stepBegin` and
`stepEnd` too when composing a sink that needs step notifications; `stepEnd` is handed an
`EndedStep`, whose `t1` and `frame1` are numbers. A sink that draws only from
some time on says so with `skipUntil`: frames that end before it are counted, not drawn, as with
the scene's own `skipUntil` option (the scene skips a frame either asks to), and the sink may move
it between plays.

## Live browser output and publication

In a browser module, pass a container element to `DomSink`, which appends its own SVG element, its `svg`:

```ts
import { DomSink } from 'rayner/output';
const container = document.querySelector('#diagram');
if (!container) throw new Error('Missing diagram container');
await new Request(new DomSink(container)).run();
```

By default the sink plays in real time (`realtime: true`): when the page falls more than a
frame behind, it drops that frame's DOM patch rather than slow the clock, counting it in
`dropped`, but never goes longer than `maxFreezeMs` (100) without a patch. `{ realtime: false }`
patches every frame as fast as the scene runs.

This runs the raw scene, without the reader's Next and Previous controls, scenario
selection, transcript or deep links; for those, use `rayner build` and the
[publishing workflow](PUBLISHING.md). A raw scene has not passed `rayner check` or a
served reader review.

## What is checked

`test/recipes.test.ts` checks both inputs against explicit expected results, the
displayed text and the trace's state and evidence. It also checks continuous
sample geometry and SVG seek/playback agreement. `npm run pack:smoke` runs the
recipes from a fresh installation, not just from the checkout. Those checks do
not certify arbitrary authors' models or every historical Lantern document.
