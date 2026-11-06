# Why does the same text take different space?

- **Reader:** has set text in more than one font and seen it come out a different length, but thinks of a letter as one thing whatever the font; knows nothing of advances or outlines.
- **Answer:** Width is the sum of the glyphs’ advances, and each font sets its own
- **Changed condition:** which font is the embedded one (Inter or JetBrains Mono). The phrase and its two widths stay the same, 6.02 against 8.10; the setting swaps which row is measured first and which font the shape matcher tries to pair with its own copy and with the other.
- **Reader's own work:** say which letters make up the 2.08-unit difference; predict whether shape matching will pair any Inter glyph with a JetBrains Mono one; choose the embedded font; then the three check questions (a space's advance, "illicit" against "mammoth", and whether moving or resizing could make the outlines pair).
- **Checked against:** Nothing external: the widths and outlines are Rayner's own shaper's, read from the bundled Inter and JetBrains Mono font files; `test/explain-glyph.test.ts` measures the stated advances (0.218, 0.540, the H, the 1.29, 0.81 and −0.13 groups) and the check answers' widths with those shapers rather than reading them from the scene, and `test/explain-fidelity.test.ts` holds the measure step's state and caption to them.
- **Leaves out:** any claim about fonts or phrases beyond this phrase in these two font files (some glyphs of other fonts may well pair); and how a diagram label measured before layout is drawn, which belongs to the font-metrics explainer.

## Check yourself

1. A space adds no outline. Why can adding one still move the next word farther right?
   A space has an advance even though it draws no ink. The pen moves by that advance before the next glyph, so the line grows without another outline.
2. “illicit” and “mammoth” both have seven letters. Set each in JetBrains Mono instead of Inter: which one grows, and could the other shrink?
   In JetBrains Mono both are 7 × 0.540 = 3.78 units. “illicit” is mostly thin stems that Inter gives 0.218 each, so it grows from 1.90 to 3.78. Inter gives m 0.788, more than JetBrains Mono’s cell, so “mammoth” shrinks from 4.24 to 3.78.
3. Could moving or uniformly resizing the Inter glyphs make them match the JetBrains Mono paths that failed to pair?
   No. The matcher already removes position and uniform size before comparing paths. Those operations cannot remove differences in the outlines themselves.

## Why this explainer

The same words at the same size, starting at the same left edge, end 2.08 units apart. That is a puzzle a reader can feel, and its answer is the one fact about text layout that most people lack: each glyph moves the pen on by its own advance, and the font sets every advance. The measure step answers it by groups of characters, so the reader sees that Inter's thin l's and i do most of the work and its H gives a little back.

The second half stands on shape matching: a font sets both a glyph's spacing and its outline. JetBrains Mono's l fills its wider cell with a flag and a foot where Inter has a plain stem, and the matcher, which ignores position and size, pairs every glyph with its own 60% copy and none with the other font's. The space is the bridge between the halves: it advances the pen without any outline.

Two earlier steps were cut. One drew the phrase as outlines with the o's contours and control net; it described ink the width question does not need, so its one useful fact (the space advances without an outline) moved into the measure and letterforms captions. The other showed a diagram label squeezed to a width recorded before drawing; that is a measurement lesson, and the font-metrics explainer teaches it with a requested face measured before layout. If the squeezed label is wanted, it belongs there, as the uncorrected case beside font-metrics' measured one.

Every number on the page comes from the engine's shaped runs, not estimated widths, so the page cannot drift from the fonts it embeds.
