# Why must font measurement match the drawn face?

- **Reader:** builds layouts, diagrams or text rendering, or has seen a label overflow its box, and treats a string's width as a property of the string rather than of the font that draws it.
- **Answer:** Measure the face you draw: each face and cut gives the same text its own advances
- **Changed condition:** the diagram's widths. Measured in EB Garamond first, both boxes fit their words and both stretch factors are ×1.000; laid out from Inter estimates, the renderer stretches Ink by 1.135 and Paper by 1.399, so no single scale converts Inter widths into Garamond ones.
- **Reader's own work:** predict where the phrase's width comes from after seeing the misplaced marker; switch the diagram between measured widths and Inter estimates; answer the check questions on the reversed mistake, a Bold cut, a trailing space and a ×1.000 box.
- **Checked against:** the fonts themselves, outside the scene's own shaping: `test/explain-fidelity.test.ts` compares every phrase width with independent uharfbuzz runs over `@fontsource/eb-garamond@5.3.0`'s original latin WOFF2 files (Regular, Bold and Italic, before subsetting or snapshot capture), checks JetBrains Mono's twelve 0.54 cells, and holds the diagram's recorded widths to original-font measurements in `docs/evidence/authoring-layout/font-vectors.json`. There is no model of its own; the measurements come from the captured lettering snapshot.
- **Leaves out:** any font other than EB Garamond, JetBrains Mono and Inter's recorded estimates, and any phrase but “Ink on paper” and the two diagram labels; the stretch factors describe those two labels, not a general conversion between the fonts.

## Check yourself

1. Reverse the opening’s mistake: measure “Ink on paper” in EB Garamond, draw it in JetBrains Mono, and put the marker 0.5 units after the measured width. Where does the marker land?
   On the words. It goes 4.41 + 0.5 = 4.91 units from the start, but the JetBrains Mono phrase runs to 6.48, so the marker sits about 1.57 units before the phrase ends.
2. A layout measures the phrase in Regular and puts a marker 0.5 units after it, but the phrase is drawn in Bold. What happens to the gap?
   It shrinks from 0.5 to 0.06 units: Bold advances 0.44 further than Regular at size 0.9, so the marker nearly touches the words.
3. Add a trailing space, “Ink on paper ”. No ink changes. Does the marker move?
   Yes. The space has an advance, so the measured width grows by that advance, and the marker, placed after the width, moves right by the same amount.
4. In some other diagram, a box reads “stretched ×1.000”. What does that say about how its word was measured?
   Its recorded width equals the drawn word’s own advance: the layout measured the face, cut and size the renderer drew, or a face that happens to give that word the same advance.

## Why this explainer

Text that lands in the wrong place usually looks like a drawing bug, and authors try to fix it by redrawing. The opening shows why that cannot work: both rows draw the same words in the same face, and the upper marker is 2.07 units too far right only because its position was computed from JetBrains Mono's width before anything was drawn. The reader should leave seeing a width as a sum of a face's advances, decided before drawing, which has to come from the face that will be drawn.

The advance ruler answers the opening's question by adding up the twelve advances, spaces included, to the same 4.41 the lower row used. The rulers step then lays both faces' pen stops under the upper row so the drift is visible glyph by glyph; that is the aha, the error growing with every glyph rather than appearing at the end. Cuts follow because readers who accept "match the family" still measure Regular and draw Bold. The diagram setting carries the same rule into a real layout, and the two different stretch factors stop the reader reaching for a single correction ratio.

Construction notes: the first three steps are staged steps drawn from the measurements each records, so `rayner check` redraws them; the cuts rows are a view of the recorded advances so their description can name each one, which the fidelity test reads. The diagram's labels, connector and stretch readouts form one declared reading comparison, and its notes are sized to stay readable alongside it on a phone.
