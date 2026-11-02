# Why must font measurement match the drawn face?

Both rows say “Ink on paper” in EB Garamond, at the same size. Each marker is meant to sit half a unit after the phrase. Yet the upper marker is 2.07 units farther right than the lower one. The drawing is the same; the measurement used to place the marker is different.

The upper row used JetBrains Mono’s width, 6.48 units. The lower used Garamond’s, 4.41. Adding the same half-unit gap to those widths places the markers 2.07 units apart. Changing the drawn font cannot repair a position calculated from another font’s measurements.

A phrase gets its width from its glyph advances: the distance the pen moves before starting the next glyph. Spaces contribute an advance without ink. Adding the advances gives the position where another glyph would begin, which can differ from the edge of the visible ink. The ruler follows those movements.

The font’s cut matters as well as its family. At size 0.9 this phrase advances 4.41 units in Regular, 4.85 in Bold and 4.24 in Italic. These cuts supply different glyphs and metrics. Measuring Regular and drawing Bold leaves less room than the layout calculated.

A diagram layout needs those measurements before it chooses box sizes. When it measures EB Garamond first, the words fit their boxes at their natural widths. With the other setting, the layout uses Inter estimates and the renderer stretches Garamond to fill the recorded widths: Paper grows to roughly 1.399 times its natural width.

The misplaced marker and stretched word have the same cause. One stage made a geometric decision using a different face from the one another stage drew. Accurate text layout requires those stages to agree about the face, cut and size.
