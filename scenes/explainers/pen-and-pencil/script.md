# Script: can hand-drawn strokes keep a diagram's layout?

Questions the reader brings: How do "hand-drawn" chart styles avoid wrecking the chart? If every stroke is random, why don't the labels drift? What does the hand actually get to decide?

pele-art-diagrams is a web page that draws four charts as ink-and-pencil plates, every stroke a little unsteady, as a hand's would be. This explainer rebuilds its method without its code, on a timeline of its own: four periods, an event in each, and no positions. A simulated hand makes every stroke slightly different, and a seed decides how. Draw it twice, with two seeds: what moves?

First the failure, as a model. Suppose the hand draws the four period boxes itself, each side starting where the last one ended, up to 2° and 3% off. Every error is then carried into every later corner, so two drawings put the same box up to half a unit apart, about 40 px on a page 1280 px wide, and names laid out once no longer line up with their boxes.

The remedy is to fix the route first, the corners and the ends, and let the hand only trace it. The same hand, a spring shaken by tremor, then draws two strokes that stray under half a pixel from the blue band and lie within a few thousandths of a unit of each other. The answer: lay the chart out first and let the hand only trace it, so a new drawing changes the strokes but never the boxes.

For the real timeline the route comes from Agentic Mermaid, which lays it out with Inter's letter widths before any ink. The drawing reads the layout back as marks, 40 outlines, 13 filled shapes and 8 words, and a blue construction pencil traces them: they are the route for every later stroke, the same in both drawings.

Why can't the spring hand drift the way the free hand did? The pen is a mass on a damped spring chasing a point along its own mark, so each stroke is pulled back to its mark and no error carries into the next. Close on the Midnight marker, the ink strays a fifth of a pixel from the ring, less than the ink line's own width; the step's line makes that comparison and the caption gives the line's width. Each stray is given in units and in pixels at 1280 px, where a unit is 80 px.

The scenery is drawn far to near around the chart, and of it the seed places only the sea's pencil strokes and the gulls. The chart and the title own their paper with a 0.12 margin, so the scenery is cut away there. Then the chart is drawn as objects on its marks, planks for periods, tags on strings for events, a rope for the rail, and the words last, in Hershey letters fitted into their boxes. Hershey letters are a public-domain alphabet A. V. Hershey drew for plotters at the U.S. Naval Weapons Laboratory in 1967, each letter a few single pen strokes.

The default case, the second drawing, answers the opening question. Laid over the first, its sea strokes and gulls land elsewhere (the grey ones are the first drawing's), while every plank, tag and word sits in the dashed boxes both drawings were drawn in. Its caption names Hershey letters again, since a reader of the default case never sees the first plate's account of them.

**The aha:** the free hand's boxes drifting apart, then the second plate over the first: the scenery and every wobble changed, and not one box moved.

**Sentence to remember:** lay the chart out first and let the hand only trace it, so a new drawing changes the strokes but never the boxes.

**Check questions**, in `meta.checks`, asked after the last step:

1. The free hand drew its boxes left to right. Drawn right to left, which box would carry the most piled-up error, and why? (Dusk's, drawn last.)
2. Make the spring hand's tremor ten times larger. Would a second drawing move any box? (No: the marks come from the shared layout.)
3. A third drawing uses another seed. What will differ from the first two, and what cannot?

**The reader's lever:** Draw the plate, first or second drawing (the default). Only the plate's ending differs: the second overlays the first drawing's chance-placed strokes and the shared boxes.

| Step | Script | Reader predicts |
| --- | --- | --- |
| text | paragraph 1: pele, the timeline, the seed | what a second drawing moves |
| reader-drift | paragraph 2: the free hand's boxes drift apart | how to stop the drift |
| reader-separate | paragraph 3: the route fixed first, two strokes on it; the answer | |
| layout | paragraph 4: Agentic Mermaid's layout | |
| marks | paragraph 4: the marks read back and traced | |
| hand | paragraph 5: why the spring hand cannot drift; strays in pixels | |
| scene | paragraph 6: what the seed may place, around owned paper | |
| plate | paragraph 6 and 7: the chart, Hershey words, the second drawing over the first (default) | |
