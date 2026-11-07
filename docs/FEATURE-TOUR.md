# Look up an authoring feature

The [feature tour](https://oshineye.dev/projects/rayner/feature-tour) asks the question an author brings to Rayner: how do I write that? It is one scene with 29 prebuilt scenarios, one per authoring feature, and each scenario opens with an author's question, such as "How do I show one shape turning into another?". The default scenario is `animation`, because there a direct link shows only the end of the motion. For the local tour, run `npm run demos:build && npm run demos:serve` and open [feature-tour.html](http://127.0.0.1:5175/explainers/feature-tour.html).

Every scenario has two steps. **Recipe** shows the lines an author writes for the feature and asks the reader to predict the next step's picture. **Result** runs those lines and splits the picture: on the left, what the reader saw before the feature ran; on the right, what it leaves at rest, which is what a reader who opens the step from a link sees. The camera scenario has no before panel, because a focused camera frames the whole picture; it draws a ruler across the stage instead, and after the zoom a label says how many of the stage's 16 units the view frames and that the circle has not moved.

Choosing another feature starts at its **Recipe**, even when you were viewing a Result, and transcript links also start at Recipe. A direct link to a result, such as `feature-tour.html?feature=camera&step=result`, still opens the result. Each scenario has its own link, for example `feature-tour.html?feature=state&step=recipe`.

## Using a recipe in your own scene

A recipe is an excerpt. The tour's [runnable source](https://github.com/adewale/rayner/blob/main/scenes/explainers/feature-tour/scene.ts) adds the imports, styling, positions and before panels around it. In an installed project, import the classes and functions you use from `rayner`, and `stage` and `settingsOf` from `rayner/explain`; [the reference](REFERENCE.md) lists their options. In every recipe, `this` is your `Scene` and `s` is `const s = stage(this);`, declared in `construct()` before the first step. Put an excerpt after the step whose picture it changes, unless the excerpt calls `this.step` itself. The `settings` recipe's `static settings` declaration belongs in the class body, outside `construct()`.

| Choose `feature=` | Code the recipe shows | Further options |
| --- | --- | --- |
| `steps`, `settings` | `this.step`, `s.enter`, `static settings`, `settingsOf(this)` | [Scene](REFERENCE.md#scene), [settings](REFERENCE.md#settings) |
| `diagram` | `s.show({source})`, `d.walk(...)`, `s.diagramView(d, ...)` with `d.trail(...)` | [Diagram actions and the 15 families](REFERENCE.md#diagrams) |
| `code`, `code-diff` | `view` of `CodeBlock` / `s.codePicture` with `focus` and `added` | [Code spans](CODE.md), [native diff](MATCHING.md#diff-driven) |
| `diff` | `parseUnifiedDiff`, `TransformDiff({hunks})`, `diffLines` | [Diff-driven](MATCHING.md#diff-driven) |
| `animation`, `matching`, `keys`, `restore`, `copy` | `Transform`, `TransformMatchingText`, `TransformMatching({key: matchByKey()})`, `saveState` / `Restore`, `TransformFromCopy` | [Matching](MATCHING.md), [sequencing and copies](ANIMATIONS.md) |
| `write`, `arc`, `rates` | `Write`, `ArcBetweenPoints`, `MoveAlongPath`, `rateFunc: smooth`, `rushInto`, `rushFrom`, `thereAndBack` | [Animations](ANIMATIONS.md), [choreography](CHOREOGRAPHY.md) |
| `emphasis`, `underline`, `brace`, `annotations`, `drawing` | `Circumscribe({keep:true})`, `Underline`, `Brace`, `s.pin`, `s.sketch` | [Emphasis shapes](EMPHASIS.md), [stage helpers](REFERENCE.md#stage) |
| `camera` | `s.focus(subject)`, `s.focus('all')` | [Camera and framing](CAMERA.md) |
| `chart`, `number-line`, `bars`, `decimal` | `Axes`, `axes.lineGraph`, `NumberLine`, `line.n2p`, `bars`, `DecimalNumber` | [Plots, bars and number lines](GRAPHING.md), [the drawing kit](REFERENCE.md#drawing-kit) |
| `state` | `this.state`, `view(this, ...)`, `label.sync()` | [State views and fidelity checks](VIEWS.md) |
| `direction`, `palette` | `stage(this, {direction:'rtl'})`, card at `start`, `stage(this, {palette: palette('nord')})` | [Logical layout](REFERENCE.md#spatial-direction), [stage options](REFERENCE.md#stage) |
| `math` | `lettering: {math: true}`, `MathTex` | [Maths](REFERENCE.md#maths) |
| `globe` | `seenFrom`, `between`, `view.tween` | [3D](REFERENCE.md#3d-seenfrommodel-viewpoint), [following one number](CHOREOGRAPHY.md#following-one-number) |

When you copy a recipe, copy the before panel's job too. A step whose motion is the point should leave something that shows where it started, the way each result here leaves the circle beside the square.

## What the tour leaves out

The 29 scenarios cover the common authoring families, and every scene-facing name a guide teaches that no explainer otherwise uses. They do not list every exported class, option, animation or diagram family. The features below need build-time setup or more than two steps, so this page points to where each one is documented:

- **Additional writing systems, faces, weight and italic:** add `static meta = { id: 'alphabet', title: 'Αλφάβητο', lettering: { scripts: ['Grek'] } };` before drawing `new Text('Αλφάβητο')`, then capture and commit `scene.lettering.json` as described in [Lettering](REFERENCE.md#lettering-on-request). Arabic, Devanagari and Hebrew, replacement faces and real bold or italic use the [outline workflow](LETTERING.md#supported-requests).
- **Played scores:** the [melody and rhythm scene](https://github.com/adewale/rayner/blob/main/scenes/explainers/melody-rhythm/scene.ts) draws both piano rolls from the note data supplied to `step.audio`. Sound starts only after a reader gesture; see [score audio](REFERENCE.md#optional-score-audio) for clip limits and cancellation.
- **Maths capture:** the `math` scenario draws a formula from committed outlines. Capturing new ones needs the pinned Latin Modern Math font and `rayner snapshots`, as [Maths](REFERENCE.md#maths) describes.
- **Diagram families and geometry:** change `source` in `s.show({source: 'graph LR\nA --> B'})` to another supported family, and call `d.reveal`, `d.mark`, `d.dim`, `d.note`, `d.focus` or `d.morph` as the story needs. For natural font measurements, set `s.show({source, lettering: 'natural'})`; it needs a requested face and refreshed snapshots. See [diagrams](REFERENCE.md#diagrams) and [measurements](LETTERING.md#diagram-measurements).
- **Graph areas, sequencing and the rest of the emphasis shapes:** the [engine feature inventory](REFERENCE.md#engine-features) links the author-side constructor and an existing explainer for each. To test a picture driven by your model, use the [view fidelity check](VIEWS.md#the-fidelity-check-the-picture-side).
- **Event-driven models:** a [`Machine`](MACHINES.md) replays events through your model, and `rayner check` draws every state they reach.

The tour shows how the API behaves, and a passing `rayner check` shows that every scenario seeks correctly, stays legible and has words for every drawing. Neither shows that your explainer's claims are true, so test the domain model on its own before publishing.

To see these features answer a reader's question in a full explainer, read [the latest-search guard](https://github.com/adewale/rayner/blob/main/scenes/explainers/latest-search/scene.ts), [the cache diff](https://github.com/adewale/rayner/blob/main/scenes/explainers/mr-cache/scene.ts) and [layout direction](https://github.com/adewale/rayner/blob/main/scenes/explainers/layout-direction/scene.ts). To write one from the start, follow the [tutorial](TUTORIAL.md), which builds an explainer of LRU and MRU cache replacement.
