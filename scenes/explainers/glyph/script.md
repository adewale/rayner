# Why does the same text take different space?

“Hello, outlines” starts at the same left edge in Inter and in JetBrains Mono, at the same size. Yet the rulers end at 6.02 and 8.10 units. Which characters account for the extra 2.08?

Each character moves the pen on by an amount called its advance, and the next character starts where the pen stopped. A space moves the pen without drawing anything. The line's width is the sum of those movements, and the font decides each one. JetBrains Mono gives all fifteen characters 0.540, so its line is 15 × 0.540 = 8.10. Inter gives each l and i just 0.218, so the three l's and the i together gain 1.29 when the phrase moves to JetBrains Mono. The comma, the space and the t add 0.81 more. The H is the one letter Inter draws wider than JetBrains Mono's cell, and it gives 0.13 back. The words are the same; the font's spacing is not.

The ink is a separate part of each glyph: an outline made of closed curves. An o has two contours, its outside and its hole. The space has an advance and no outline, which is why fifteen characters draw only fourteen shapes. A font supplies both parts, the outline that makes the ink and the advance that places the next glyph.

JetBrains Mono gives its l more than twice Inter's room, and it fills that room with a different drawing: a flag at the top and a foot at the bottom, where Inter has a plain stem. Would a shape matcher still pair the two l's? Rayner's matcher compares outlines after removing position and size. Every glyph pairs with its own copy at 60%, but in this phrase none pairs with its counterpart in the other font. The same character does not mean the same outline.

A diagram adds one more way for width to go wrong. Its layout estimates each label's width before any glyph is drawn, and the renderer then fits the real Inter glyphs to that estimate. “PNG stills” advances 4.076 units on its own but is drawn 3.983 wide, so its letters are squeezed. A label drawn at a width its font did not measure changes shape. The font-metrics explainer shows the fix, which is to measure the drawn face before the layout places the boxes.
