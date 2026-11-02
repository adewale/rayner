# Script: can hand-drawn strokes keep a diagram's layout?

Questions the reader brings: How do "hand-drawn" chart styles avoid wrecking the chart? If every stroke is random, why don't the labels drift? What does the hand actually get to decide?

The opening is the failure on the real chart. A timeline of four periods, an event in each, and no positions is drawn by a simulated hand that wobbles a little on every line, as this explainer models a person's hand: the rail, then each box, ring and string from left to right, every line setting off from where the previous one stopped. The words sit where a layout program placed them, and 5 of the 8 (2 in the first drawing) poke out of the box drawn round them. The reader predicts what has to be settled before any ink.

Then why, on four plain boxes. Each side begins at the end of the side before, up to 2° and 3% off, and the pen moves on from where it lifted, so every error is carried into every later corner. Two drawings with different seeds put the same box up to half a unit apart, about 40 px on a page 1280 px wide.

The remedy is to fix the route first, the corners and the ends, and let the hand only trace it. The pen is a mass on a damped spring chasing a point along the route, so each stroke is pulled back to its route and no error reaches the next. Two drawings stay within 0.005 units of the blue band, and a ×36 magnifier shows them 0.003 apart where they differ most. The answer, in this hand model: lay the chart out first and let the hand only trace it, so a new drawing changes each stroke's wobble and leaves every box where the layout put it.

For the real timeline the route comes from Agentic Mermaid, the Mermaid layout library Rayner draws its diagrams with, which places every box with Inter's letter widths before any ink. rough.js takes the same order (`rectangle(x, y, width, height)` gets its corner and size from the caller; roughness and a seed set the wobble, per its wiki), but its documentation does not say what the other order costs, which the first two steps showed. The drawing reads the layout back as marks, 40 outlines, 13 filled shapes and 8 words, and a blue construction pencil traces them.

Close on the Midnight marker, with the rest of the construction set aside, the ink lies on a pale blue band several ink widths wide, so the blue shows either side of it; it strays a fifth of a pixel from the ring, and the caption gives the largest stray over all 125 ink strokes too.

Then the chart is drawn as objects on its marks, planks for periods, tags on strings for events, a rope for the rail, and the words last. Around it the seed places the sea's pencil strokes and the gulls. In the default case, the second drawing, the plate is laid over the first: its sea strokes and gulls land elsewhere, while every plank, tag and word sits in the dashed boxes both drawings were drawn in. The look follows pele-art-diagrams, a web page of hand-drawn charts; it is credited there and in the sources.

The ending sets the opening's drawing above the finished plate: boxes up to half a unit or more from where they belong and words outside them, against the same wobbling strokes traced on fixed marks with all 8 words inside.

**The aha:** the opening's words outside their boxes, explained by the drifting plain boxes, and resolved at the end by the plate traced on the layout's marks, set beneath the opening's drawing.

**Sentence to remember:** lay the chart out first and let the hand only trace it.

**Check questions**, in `meta.checks`, asked after the last step. Both are transfers no step shows.

1. Give the spring hand the opening's route instead, a point moving corner to corner by the chained moves. Would words still poke out? (Yes: the spring keeps the ink near whatever route it chases, and that route has wandered. The opening's drawing was made exactly this way.)
2. Lower the spring's damping to a quarter, so the pen overshoots at corners. Would a second drawing move any box? (No: the ink strays further, about 0.02 units instead of 0.005 in the model, but each stroke starts at rest on its own mark and chases only that mark.)

**The reader's lever:** Draw the plate, first or second drawing (the default). The opening and the ending use the case's seed, and the plate step differs (the second overlays the first drawing's chance-placed strokes and the shared boxes).

| Step | Script | Reader predicts |
| --- | --- | --- |
| text | paragraph 1: the timeline drawn line from line, words outside their boxes | what must be settled before any ink |
| reader-drift | paragraph 2: why the boxes wander, on four plain boxes | how to stop the drift |
| reader-separate | paragraph 3: the route fixed first, the spring hand, two strokes on it, magnified; the answer | |
| layout | paragraph 4: Agentic Mermaid's layout; rough.js takes the same order | |
| marks | paragraph 4: the marks read back and traced | |
| hand | paragraph 5: close on one marker; the largest stray over the whole chart | |
| plate | paragraph 6: the chart, the scenery, the second drawing over the first (default); pele credited | |
| freehand | paragraph 7: the opening's drawing above the finished plate (the ending) | |

**Claims:** the drift of a free hand ("every error is carried into every later corner") and the answer's "leaves every box where the layout put it" are held by `test/explain-pen-and-pencil.test.ts`, the second as a property over random boxes and seeds; "the same in both drawings" by a test that compares the two cases' construction strokes path for path. The opening's line-by-line drawing and the layout step's boxes are marked shown: those sentences speak of the drawing on screen.

## Limits

- The hand is this explainer's own model: a mass on a damped spring with low-passed tremor, and a free hand that turns each move by up to 2° and stretches it by up to 3%, an assumption rather than pele's method. No real hand or pen was measured.
- Two seeds are drawn, 1967 and 7. That any seed leaves each box in place rests on the property test of the model, with its tolerance of 2√2 times the tremor, and on no further drawings.
- One timeline is laid out: four periods with one event each. Longer labels, more periods and other diagram families are not shown.
- rough.js is cited from its wiki and was not run; no step draws rough.js output.
- No case draws the two check questions' variants: the opening's route under the spring hand, or the damping lowered to a quarter.
