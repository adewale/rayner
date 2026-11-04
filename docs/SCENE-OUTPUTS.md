# Frames, text and traces from native scenes

## Use case

Use this when a documentation builder, test, CLI, agent or application needs the
outputs Lantern's JSON document produced, without adopting a JSON scene language
or publishing a whole reader page. Write a native TypeScript scene once, then ask
for an SVG frame, a text frame, structured state or its step index. Ordinary input
data can select the scene's model and cases.

Lantern's `sceneFromDoc(doc)` compiled nodes, edges, code, state and operation lists
into a native Scene. Rayner removed that compiler and its HTTP service, not the
underlying outputs. It does not accept old documents directly and does not promise
pixel-identical reproduction of deleted layout defaults or historical renderers.

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
`requestScene({ cached: true })` binds data to a Scene class; changing that to
`false` produces the database case. Its `route()` function supplies the result,
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
| Add/remove/move/style/indicate | `FadeIn`, `FadeOut`, `.animate`, `Indicate` |
| `note`, duration and hold | `Text`, step captions, `runTime`, `wait()` |

This is a mapping of capabilities, not a source-to-source compatibility layer.
TypeScript additionally permits arbitrary model code, reusable functions, custom
paths and animations. JSON remains appropriate for input parameters, snapshots,
traces and output records; it need not describe the animation program itself.

## Public output APIs

```ts
import {
  SnapshotSink, renderAt, renderText, renderElements,
  traceScene, indexScene, stepTime,
} from 'rayner';
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
const state = scene.describe();             // state at this sampled frame
const trace = await traceScene(Request);    // complete step-boundary trace
```

Copy `recipes/document.ts` beside this code, or import your own Scene class instead.
[The runnable runner](../recipes/render.ts) uses these same public APIs. Text is a
spatial approximation, not a full accessible transcript; publication combines
captions and explanatory descriptions in its transcript.

| Requested result | API | Former Lantern service equivalent |
| --- | --- | --- |
| One SVG | `renderAt` into `SnapshotSink` | `/frame.svg` |
| Text at a time | `renderText` on that sampled scene | `/text` |
| Element records | `renderElements` | `/elements.json` |
| Full step/state trace | `traceScene` | `/trace.json` |
| Step timing and duration | `indexScene` | `/index.json` |
| Every SVG frame | `new SceneClass(new StringSink()).run()`; read sink's `frames` | frame-sequence rendering (`/render`) |

These are capability correspondences, not restored HTTP routes or wire schemas.
An application can wrap them in its own HTTP handlers around registered native
scenes and their inputs. Rayner ships no replacement Worker deployment or generic
scene-document endpoint. The Node runner's filesystem code is not Worker code.

## Time and step semantics

`stepTime` returns a step's **start**, not its final resting picture. In the example,
the `result` step follows the completed decision, so its start already shows the
answer. For a trace record `record`, sample the last frame with
`Math.max(record.t0, (record.t1 ?? record.t0) - 0.5 / trace.fps)`.
The helper implementing this is internal, not a package export. Check the chosen
step exists before sampling.

`renderAt` samples the first frame at or after the requested time, on the scene's
fixed frame grid. A time past the end returns the final frame. `traceScene` records
state before/after steps, not every intermediate value. Use `scene.describe()` at
explicit sample times if you need intermediate parameter values as well.

For all SVG frames:

```ts
import { StringSink } from 'rayner';
const all = new StringSink();
await new Request(all, { fps: 30 }).run();
// all.frames contains SVG strings in frame order; it retains the whole run.
```

Use `SnapshotSink` for a single retained frame or implement `Sink.frame` to stream
frames rather than retaining a large sequence in memory. Forward `stepBegin` and
`stepEnd` too when composing a sink that needs step notifications.

## Live browser output and publication

In a browser module, pass a container element to `DomSink`, which appends its own SVG:

```ts
import { DomSink } from 'rayner';
const container = document.querySelector('#diagram');
if (!container) throw new Error('Missing diagram container');
await new Request(new DomSink(container)).run();
```

This runs the raw scene. It does not add the reader's Next/Previous controls,
scenario selection, transcript or deep-link handling. For those use `rayner build`
and the [publishing workflow](PUBLISHING.md). A raw engine example is not a lesson
that has passed `rayner check` or a served reader review.

## What is checked

`test/recipes.test.ts` checks both input cases against explicit expected results,
the displayed text and the trace's state/evidence. It also checks continuous
sample geometry and SVG seek/playback agreement. `npm run pack:smoke` runs the
recipes from a fresh installation, not just from the checkout. Those checks do
not certify arbitrary authors' models or every historical Lantern document.
