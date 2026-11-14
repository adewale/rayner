# Can hand-drawn strokes keep a diagram’s layout?

- **Reader:** someone who has seen hand-drawn-looking diagrams (rough.js, Excalidraw, illustrated charts) and wonders how a loose hand keeps labels in their boxes; no knowledge of springs or layout engines needed.
- **Answer:** Lay the chart out first and let the hand only trace it, so a new drawing changes each stroke’s wobble and leaves every box where the layout put it
- **Changed condition:** the plate's drawing, first or second. The second drawing moves the sea strokes and gulls and changes every stroke's wobble, but every plank, tag and word lands in the same laid-out boxes as the first, shown dashed over it.
- **Reader's own work:** say what must be fixed before any ink, from the opening's words poking out of their boxes; judge which marks a second drawing would move; switch between the two drawings; answer the check questions.
- **Checked against:** Nothing external for the hand: the spring hand and the chained free hand are the explainer's own models, and `model.test.ts` and `scene.test.ts` check their own properties (a seed repeats its stroke, the ink strays no more than the tremor, a free hand's error carries into every later corner, both drawings trace the same construction marks, any seed leaves every box where the layout put it). The Hershey Simplex glyphs are tested against Hershey's own strokes for A, from Paul Bourke's transcription; the layout comes from Agentic Mermaid with Inter's measured letter widths.
- **Grounding:** none
- **Leaves out:** how a real person draws: the spring and the free hand's 2° and 3% errors are chosen, not measured. Only seeds 1967 and 7 are pictured, on one made-up timeline of four periods with one event each. rough.js is compared from its documented rectangle-and-seed API, not rendered; pele-art-diagrams is credited for the visual treatment, whose page code is not used.

## Check yourself

1. Give the spring hand of the third step the opening’s route instead: a point that moves corner to corner as the opening’s hand did, each line starting where the last one stopped and up to 2° and 3% off. Would words still poke out of their boxes?
   Yes. The spring keeps the ink close to whatever route it chases, but that route has wandered just as the opening’s boxes did, so the boxes still end up far from where the layout put them. The opening’s drawing was made exactly this way. What keeps the words inside is a route laid out before any ink; the spring only keeps each stroke near its route.
2. Lower the spring hand’s damping to a quarter of its value, so the pen overshoots at every corner before settling. Would a second drawing then move any box?
   No. The ink would stray further from its marks, about 0.02 units instead of 0.005 in this model. But each stroke still starts at rest on its own laid-out mark and chases only that mark, so the overshoot never carries into the next stroke, and every box stays where the layout put it.

## Why this explainer

Hand-drawn diagram styles look like they trade precision for charm. The point here is that the trade is not forced: what decides whether labels fit is not how steady the pen is but whether the route is fixed before the ink. The opening makes the failure concrete on the real timeline (a hand that chains its own moves pushes words out of their boxes) so the reader feels the problem before any machinery. The two simulations then separate route construction from ink motion: errors that become the next stroke's starting point accumulate; errors around a fixed route do not.

The answer lands at the third step, on a miniature route, and the main path confirms it on the real timeline with the construction marks and a close-up of one ring before the closing comparison sets the opening's drawing above the traced one. The layout step (a box's measured width) and the decorated plate are details: the first repeats what the marks step says, and the plate's only argument, that a second seed moves sea and gulls but no box, the third step already makes. The plate keeps the setting because its second drawing overlays the first's scenery and the shared boxes.

The method follows pele-art-diagrams as described in rheos/secondunit-videos' study of that page; the model reimplements the method, not the page's unlicensed code.
