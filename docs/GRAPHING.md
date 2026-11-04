# Graphing

`NumberLine` and `Axes` map the program's numbers to points in the scene. A plot samples the
scene's own function and bars take the values the program computed, so the chart is drawn from the
model at run time, with no build step, and cannot disagree with it.

Everything is an ordinary mobject. Axes are Lines, Polygons and Text in Groups. A plot is one
VMobject made of cubic Béziers, and bars are Rectangles. So `Create` draws a chart in,
`Transform` morphs one set of bars into the next, and seeking lands on the same frame as a full run.

## Example: daylight hours from the seasons model

The seasons explainer computes daylight with `sunlight(latitude, declination)` in
`scenes/explainers/lib/models.ts`. Here the scene plots that same function:

```ts
import { Scene, Axes, Create, Transform, FadeIn, GOLD, TEAL } from '../../../src/index.ts';
import { sunlight, daylightYear } from '../lib/models.ts';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
// Declination: month m (0 = January) to degrees
const declination = (m: number) => 23.44 * Math.sin((2 * Math.PI * (m - 2)) / 12);
// Bar i is centered at x = i + 0.5, so the curve reads month x - 0.5 to line up with it
const daylightAt = (lat: number) => (x: number) => sunlight(lat, declination(x - 0.5)).daylight;

class Daylight extends Scene {
  async construct() {
    const axes = new Axes({
      xRange: [0, 12, 1], yRange: [0, 24, 6], width: 10, height: 5, yLabel: 'hours',
      axisStyle: { stroke: '#a9b1d6' }, yAxisStyle: { includeNumbers: true },
    }).shift([0, -0.3]);
    await this.play(new Create(axes), { runTime: 2 });

    // Tromsø: the curve stays flat at 0 h and 24 h for weeks (see "Plot" below)
    const tromso = axes.plot(daylightAt(69.65), { color: GOLD });
    await this.play(new Create(tromso), { runTime: 1.5 });

    // The month-by-month table the program computes, as bars; then London's
    const bars = axes.bar(daylightYear(69.65), { labels: MONTHS, colors: GOLD, fillOpacity: 0.3 });
    await this.play(new FadeIn(bars));
    await this.play(new Transform(bars, axes.bar(daylightYear(51.5), { labels: MONTHS, colors: TEAL, fillOpacity: 0.3 })));
  }
}
```

## NumberLine

```ts
new NumberLine({ range: [min, max, step], length = 8, includeTicks = true, tickSize = 0.1,
                 includeNumbers = false, numbersToInclude, numbersToExclude, labelFontSize = 0.24,
                 labelColor, decimals, labelDirection, labelBuff = 0.12,
                 includeTip = false, tipLength, tipWidth, rotation = 0, ...style })
```

- The line runs from `min` to `max` and is centered on the origin. Ticks fall at `min + i·step`, and
  `tickSize` is the half-length (each tick reaches that far to either side). Labels default to
  every tick, with as many decimal places as `step` has. When the line is rotated, labels stay
  upright on the `labelDirection` side.
- `n2p(x)` maps a number to a point and `p2n(p)` maps a point back, projected onto the line.
  `unitSize()` gives scene units per unit. All three read the line's **current** endpoints, so they
  stay right after `shift`, `scale` or `rotate`.
- Parts are reached by role: `line`, `tip` (or null), `ticks` and `numbers` (Groups). The children
  are `[line, tip?, ticks, numbers]`, read by index, so a copy's parts are its own.

## Axes

```ts
new Axes({ xRange = [0, 10, 1], yRange = [0, 5, 1], width = 8, height = 4.5,
           axisStyle, xAxisStyle, yAxisStyle, tips = false, xLabel, yLabel, axisLabelFontSize })
```

- The two axes are NumberLines (`axes.xAxis`, `axes.yAxis`), and their lines span exactly
  `width × height` about the origin. `axisStyle` takes any NumberLine option except range, length
  and rotation. `xAxisStyle` and `yAxisStyle` override it for one axis.
- The axes cross at (0, 0) when zero is in both ranges. Otherwise they cross at the nearest end of
  the range, so with an x range of 1..12 the y axis stands at x = 1.
- A label at the crossing is left out on one axis when the other axis runs through it, as in
  manim. When the axes meet at a corner, both zeros stay.
- `c2p(x, y)` maps data coordinates to a point. `p2c(p)` is its exact inverse, even after rotation.
  `originPoint()` is `c2p(0, 0)`, which lies off the drawn axes when zero is outside a range.

Graph builders return new mobjects. They are placed where the axes are when you call them, so
move the axes first, then build graphs and add them yourself.

| Method | Returns |
| --- | --- |
| `plot(fn, { xRange?, samples = 64, color, strokeWidth, ...style })` | `VMobject` through `c2p(x, fn(x))` at every sample, left to right |
| `lineGraph(points, { color, ...style })` | `VMobject`: a polyline through `[x, y]` pairs, in the order given |
| `bar(values, { x?, width?, gap = 0.4, colors, labels?, ...style })` | `Group`: one Rectangle per value, then the label Texts |
| `dot(x, y, dotOpts)` | `Dot` at `c2p(x, y)` |
| `verticalLine(x, { from?, to? })` / `horizontalLine(y, { from?, to? })` | `Line` guide; defaults to the full range of the other axis |
| `areaUnder(fn, [a, b], { samples, color, fillOpacity })` | closed `VMobject` between the curve and y = 0 |

### Plot

Each pair of neighbouring samples is joined by one cubic, and every sample is an anchor, so the
curve passes through `c2p(x, fn(x))` exactly (to float32 precision). Handles use monotone cubic
slopes (PCHIP, Fritsch–Carlson) and sit at 1/3 and 2/3 of each x interval. As a result:

- the path is a true function of x, and it is smooth where `fn` is;
- it never overshoots between samples. A clamped value such as `Math.min(CAP, tokens + dt * RATE)`
  or polar daylight pinned at 24 h stays flat at the clamp. Catmull-Rom would bulge past it, and
  straight segments would need many more samples to look smooth;
- it is drawn in sample order, so `Create` traces left to right.

Non-finite values (`1/x` at 0) split the curve into separate subpaths.

### Bars

Bar `i` is centered at `x[i]`, which defaults to `i + 0.5`, so on an x range of `[0, n]` each bar
fills one unit less the `gap`. Bars stand on y = 0 and a negative value hangs below it. Every bar
has the same four corners in the same order, so `Transform(bars, axes.bar(next))` between bar sets
of the same length moves each top edge straight to its new height. If the sign flips, the top edge
passes through zero. Labels sit under the bottom of the chart, below the x-axis numbers when there
are any.

## Animating

- `Create(axes)` draws the x axis, its tip and its ticks, then does the same for the y axis, with
  labels drawn in as they come. Create staggers every member of the family (each label glyph
  counts), so a part's share of the run shrinks as parts are added. Axes with only ticks are clean
  at the default 1 s. With number labels, use `{ runTime: 2 }` or `{ lagRatio: 0.1 }`; the motion
  verifier finds pops at 1 s. `test/graphing.test.ts` pins all three cases.
- `Create(plot)` draws the curve in one sweep, and `Create(axes.lineGraph(...))` draws in point order.
- To update a chart, transform bars into new bars, or a plot into a new plot of the same sample
  count.

## In the explainers

- [seasons](../scenes/explainers/seasons/scene.ts), "year" to "distance": `plot` of `sunlight()` over twelve
  months (145 samples), `verticalLine`s and `dot`s at the solstices and equinoxes, a second
  plot at the mirrored latitude, then all four places on one axes. Ticks carry numbers, not
  text, so the scene places its own month names under the x axis.
- [token-bucket](../scenes/explainers/token-bucket/scene.ts): `lineGraph` segments drawn call by call from the
  same `allow()` results as the gauge, a `horizontalLine` at one token, `dot`s for each request
  (red for 429), and the runs at all three rates overlaid in the last step.

Neither uses `bar` yet. Both replaced Agentic Mermaid xy charts.

## Styled build-time charts

For a chart in a published Mermaid style, the Agentic Mermaid `xychart-beta` path remains
available through `s.show({ source, style })` (see [the reference](REFERENCE.md#diagrams)). It is
captured at build time, keeps the chosen style's typography, and builds axes first, then bars from
the baseline. Use Axes when the numbers come from the scene's program, and an xy chart when the
look matters more than the live link to the code.
