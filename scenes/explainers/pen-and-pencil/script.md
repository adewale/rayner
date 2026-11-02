# Script: can hand-drawn strokes keep a diagram's layout?

Questions the reader brings: How do "hand-drawn" chart styles avoid wrecking the chart? If every stroke is random, why don't the labels drift? What does the hand actually get to decide?

pele-art-diagrams is a web page that draws four charts as ink-and-pencil plates, every stroke a little unsteady, as a hand's would be. This explainer rebuilds its method without its code, on a timeline of its own: four periods, an event in each, and no positions. A simulated hand makes every stroke slightly different, and a seed decides how. Draw it twice, with two seeds: what moves?

First the failure, as a model. Suppose the hand draws the four period boxes itself, each side starting where the last one ended, up to 2° and 3% off. Every error is then carried into every later corner, so two drawings put the same box up to half a unit apart, about 40 px on a page 1280 px wide, and names laid out once no longer line up with their boxes.

The remedy is to fix the route first, the corners and the ends, and let the hand only trace it. The hand is now a pen on a damped spring chasing a point along the route, shaken by tremor, so each stroke is pulled back to its route and no error carries into the next. The two drawings stray under half a pixel from the blue band; a wide grey line for the first drawing holds the second's thin dark line all the way, and a ×36 magnifier at the place they are furthest apart shows them 0.003 units apart. The answer: lay the chart out first and let the hand only trace it, so a new drawing changes each stroke's wobble and leaves every box where the layout put it.

For the real timeline the route comes from Agentic Mermaid, the Mermaid layout library Rayner draws its diagrams with, which places every box with Inter's letter widths before any ink. The drawing reads the layout back as marks, 40 outlines, 13 filled shapes and 8 words, and a blue construction pencil traces them: they are the route for every later stroke, the same in both drawings.

Close on the Midnight marker, with the rest of the construction set aside, the ink strays a fifth of a pixel from the ring, less than the ink line's own width; the caption gives the largest stray over all 125 ink strokes of the chart too. Each stray is given in units and in pixels at 1280 px, where a unit is 80 px.

Then the chart is drawn as objects on its marks, planks for periods, tags on strings for events, a rope for the rail, and the words last, in single-stroke Hershey letters fitted into their boxes. Around it the seed places the sea's pencil strokes and the gulls, and the scenery is cut away from the paper the chart owns. In the default case, the second drawing, the plate is laid over the first: its sea strokes and gulls land elsewhere (the grey ones are the first drawing's), while every plank, tag and word sits in the dashed boxes both drawings were drawn in.

The ending puts the second step's free hand on this real plate. It draws the rail first, then every box, ring and string, each line starting where the last ended, while the words keep their laid-out places. Its boxes end up half a unit or more from where they belong, and some words poke out of the boxes drawn round them (outlined in red: 5 of 8 in the default case, 2 in the first); below it, the same chart traced on its marks has every word inside its box.

**The aha:** the free hand's boxes drifting apart, then, at the end, the real plate drawn free above the traced plate: words outside their boxes against words in place.

**Sentence to remember:** lay the chart out first and let the hand only trace it.

**Check questions**, in `meta.checks`, asked after the last step. Both are transfers no step shows.

1. Suppose the free hand set its pen down exactly on each box's laid-out corner before drawing it. Would the boxes still drift apart from Dusk to Dawn? (No: each box is off only by its own sides' errors, so the error stops growing along the row.)
2. Rename Midnight's event "Wick trimmed twice". What changes, and do the two drawings still agree? (The layout widens that tag and may move its neighbours; both drawings trace the new marks and still agree.)

**The reader's lever:** Draw the plate, first or second drawing (the default). The plate's ending differs (the second overlays the first drawing's chance-placed strokes and the shared boxes), and so does the free hand's ending, which uses the case's seed.

| Step | Script | Reader predicts |
| --- | --- | --- |
| text | paragraph 1: pele, the timeline, the seed | what a second drawing moves |
| reader-drift | paragraph 2: the free hand's boxes drift apart | how to stop the drift |
| reader-separate | paragraph 3: the route fixed first, the spring hand, two strokes on it, magnified; the answer | |
| layout | paragraph 4: Agentic Mermaid's layout | |
| marks | paragraph 4: the marks read back and traced | |
| hand | paragraph 5: close on one marker; the largest stray over the whole chart | |
| plate | paragraph 6: the chart, the scenery, the second drawing over the first (default) | |
| freehand | paragraph 7: the free hand on the real plate above the traced plate (the ending) | |
