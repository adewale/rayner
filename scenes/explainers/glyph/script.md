# Script: why does the same text take different space?

Questions the reader brings: Why does my label overflow when I change the font? Why is a monospace line so much longer? What does a layout engine actually measure?

Set “Hello, outlines” at size 0.9 twice, from the same left edge: once in Inter, once in JetBrains Mono. Same characters, same size, and the rulers end at 6.02 and 8.10 units. Where do the extra 2.08 units come from?

Put a tick wherever one glyph hands the pen to the next. The step between ticks is that glyph's advance, and the line's width is the sum of them. Inter gives each glyph its own: the l advances 0.218, the H 0.669. JetBrains Mono gives every character 0.540, so its fifteen characters take 15 × 0.540 = 8.10. The narrow letters pay for the difference: each of the three l's grows by 0.322. That is the answer: width is the sum of the glyphs' advances, and each font sets its own.

What sits inside an advance is an outline: closed contours of curves, read from a font bundled with Rayner. The o has two contours, its outside and its hole; the space has an advance and no outline at all.

A font designs the two together. JetBrains Mono cannot leave its l a bare stem floating in a 0.540 cell, so it draws a flag on top and a foot turned right. Same character, different outline. So will a shape matcher, which pairs glyphs whose outlines are the same path once each is centred and scaled, pair anything across the two fonts? Every glyph pairs with its own 60% copy, 14 of 14; across the fonts, none do, not even the comma.

One more way the same words take different space, with one font: this diagram of Rayner's own text pipeline was laid out by agentic-mermaid, which recorded each label's width (its textLength) as it placed the boxes. Rayner draws the labels in Inter and fits each to the recorded width, so “PNG stills” is squeezed from Inter's own 4.076 to 3.983. A width is only right when it adds up the advances of the face that is drawn; the font-metrics explainer has the layout measure that face first.

**The aha:** the l. Inter's narrowest letter gains most in a monospace font, and to fill the cell the font has to draw a different letter, which is why nothing pairs across fonts.

**Sentence to remember:** width is the sum of the glyphs' advances, and each font sets its own.

**Check questions**, in `meta.checks`, asked after the last step:

1. Why is “Hello, outlines” exactly 8.10 units wide in JetBrains Mono at size 0.9?
2. Which letter gains the most width in JetBrains Mono, and how does the font fill the extra room?
3. How many of the 14 Inter glyphs pair with JetBrains Mono's by shape, and how many with Inter's own 60% copy?
4. A diagram is laid out with Inter's label widths, then drawn in JetBrains Mono. Are its labels stretched or squeezed? (A transfer: the last step shows the squeeze, not this case.)

The settings case (embedded font: Inter or JetBrains Mono) swaps which face is the selected row and which is the comparison; the numbers and the answer are the same, and the outline counts in `write` change with the face.

| Step | Script | Reader predicts |
| --- | --- | --- |
| reader-width | paragraph 2: the two rulers, 6.02 and 8.10 | which letters make up the 2.08 |
| measure | paragraph 3: ticks, advances, 15 × 0.540, the l's gain; the answer | |
| write | paragraph 4: an advance holds an outline; the o's contours | |
| reader-shape | paragraph 5: the two l's in their advance cells | whether shape matching pairs any glyph across fonts |
| letterforms | paragraph 5: 14 of 14 with the copy, 0 of 14 across fonts | |
| tradeoff | paragraph 6: the diagram squeezes Inter to recorded widths; the limit and the pointer to font-metrics | |
