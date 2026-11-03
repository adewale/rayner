# Why must font measurement match the drawn face?

Both rows say “Ink on paper” in EB Garamond, at the same size, and each marker is meant to sit half a unit after the phrase. Yet the upper marker is 2.07 units farther right than the lower one. The drawing is the same in both rows; only the measurement used to place the marker differs.

The upper row used JetBrains Mono's width for the phrase, 6.48 units. The lower row used Garamond's, 4.41. Adding the same half-unit gap to each puts the markers 2.07 units apart. Redrawing the words cannot fix this, because the marker's position was calculated from the other font's numbers before anything was drawn.

Where does a phrase's width come from? Each glyph moves the pen on by its advance, and the next glyph starts where the pen stopped. The two spaces in “Ink on paper” move the pen without drawing anything. The width is the sum of all twelve advances, 4.41 units in Garamond Regular, and that sum is what the lower row added the gap to.

The cut matters as well as the family. At the same size the phrase advances 4.41 units in Regular, 4.85 in Bold and 4.24 in Italic, because each cut has its own glyphs and its own advances. A layout that measures Regular and draws Bold leaves 0.44 units less room than it planned.

A diagram layout needs these widths before it chooses its box sizes. When it measures EB Garamond first, each word fits its box at its natural width. When it uses Inter estimates instead, the renderer stretches each Garamond word to the width recorded for Inter: Ink by 1.135 and Paper by 1.399. The two factors differ, so there is no single scale that converts Inter widths into Garamond ones; the only cure is to measure the face that will be drawn.

The misplaced marker and the stretched word have one cause: one stage made a geometric decision from one face, and another stage drew a different one. Text lands where the layout meant only when both stages agree on the face, the cut and the size. This page tests that for one phrase, three Garamond cuts and two diagram labels; it does not compare other fonts.
