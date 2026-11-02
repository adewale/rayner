# Script: can hand-drawn strokes keep a diagram's layout?

Questions the reader brings: How do “hand-drawn” chart styles avoid wrecking the chart? If every stroke is random, why don't the labels drift? What does the hand actually get to decide?

pele-art-diagrams is a web page that draws four charts as ink-and-pencil plates, every stroke a little unsteady, as a hand's would be. This explainer models its method, not its code, on a timeline of its own: four periods, an event in each, and no positions. A simulated hand makes every stroke slightly different. If it also decided where the boxes and words went, a second drawing could move them. So draw it again with another seed: what moves?

The trick fits on one line. Fix the route first, the corners and the ends, and let the hand only trace it: a spring shaken by tremor draws a dark stroke that strays a few thousandths of a unit and never leaves the blue band. That is the answer: lay the chart out first and let the hand only trace it, so a new drawing changes the strokes but never the boxes.

For the timeline, the layout is Agentic Mermaid's. On its own page pele lays the chart out itself and sizes its boxes with Hershey letter widths. Hershey letters are a public-domain alphabet A. V. Hershey drew for plotters at the U.S. Naval Weapons Laboratory in 1967, each letter a few single pen strokes rather than a filled outline. Here the layout uses Inter's widths and the Hershey letters are fitted into its boxes at the end. The drawing reads the layout back as marks, 40 outlines, 13 filled shapes and 8 words, and a blue construction pencil traces them.

Close on the Midnight marker: the pen is a mass on a damped spring chasing a point along the line, shaken by tremor of up to 0.006 units, and the spring smooths the tremor away. The ink's largest stray, 0.002 units, is less than the ink line's own width.

The made-up world is drawn far to near around the chart: hills, sea, a rock and a lighthouse, gulls. The chart and the title own their paper with a 0.12 margin, so the scenery is cut away there. Then the chart is drawn as objects on its marks, planks for periods, tags on strings for events, a rope for the rail, and the Hershey words last, inside their boxes.

The second drawing answers the opening question. Laid over the first, its sea strokes and gulls land elsewhere, the grey ones being the first drawing's, while every plank, tag and word sits in the dashed boxes both drawings were drawn in.

**The aha:** the second plate with the first one's boxes over it: the scenery and every wobble changed, and not one box moved.

**Sentence to remember:** lay the chart out first and let the hand only trace it, so a new drawing changes the strokes but never the boxes.

**Check questions**, in `meta.checks`, asked after the last step:

1. On its own page, how does pele size a chart's boxes, and what does this explainer do instead?
2. Tremor reaches 0.006 units; why does the ink stay within a few thousandths of its line?
3. How does the scenery avoid the chart and the title?

**The reader's lever:** Draw the plate, first or second drawing. Only the plate's ending differs: the second overlays the first drawing's chance-placed strokes and the shared boxes.

| Step | Script | Reader predicts |
| --- | --- | --- |
| text | paragraph 2: pele, the timeline, the wobbling hand | what a second drawing moves |
| reader-separate | paragraph 3: the route and the stroke; the answer | |
| layout | paragraph 4: Agentic Mermaid's layout; pele and Hershey explained | |
| marks | paragraph 4: the marks read back and traced | |
| hand | paragraph 5: the spring, and the stray against the ink's width | |
| scene | paragraph 6: scenery around owned paper | |
| plate | paragraph 6 and 7: the chart and its words; the second drawing over the first | |
