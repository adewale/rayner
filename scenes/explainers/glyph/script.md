# Why does the same text take different space?

“Hello, outlines” starts at the same left edge in Inter and JetBrains Mono, at the same size. Yet the rulers end at 6.02 and 8.10 units. Which characters account for the extra space?

A character occupies more than its visible ink. After drawing it, the pen advances to the next starting position; a space advances the pen without drawing anything. The line’s advance is the sum of those movements. In this example Inter gives an l 0.218 units and an H 0.669. JetBrains Mono gives each of the fifteen characters 0.540, making 8.10 units. The three narrow l’s gain 0.322 each. The words have not changed; the font’s spacing has.

The ink has a separate description: an outline made of closed curves. An o has an outside contour and a hole. An l in JetBrains Mono has a flag and a foot where Inter has a simpler stem. A font supplies both these shapes and the advances that place them.

Would a shape matcher recognise the same letters across the two faces? This matcher compares outlines after removing position and size. All fourteen drawn glyphs match their own smaller copies, but none matches its counterpart in the other font. The same character name does not imply the same path.

A diagram can introduce another discrepancy. Its layout records how wide a label should be, and the renderer fits the drawn word to that width. Here “PNG stills” naturally advances 4.076 units in Inter but is fitted to a recorded 3.983. The squeeze comes from a disagreement between measurement and drawing. Choosing a font changes the space a label needs; forcing an old width can conceal that change by distorting the letters.
