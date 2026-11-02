# Script: why must font measurement match the drawn face?

Questions the reader brings: I swapped in a serif face and my layout went wrong; why? What does “measure the text” actually measure? Do bold and italic need measuring separately?

Draw “Ink on paper” in EB Garamond at size 0.9, twice, and ask for a marker 0.5 units after each. The upper row measured the phrase as JetBrains Mono, 6.48 units, and its marker floats 2.07 units past the words. The lower row measured EB Garamond, 4.41, and its marker sits where it was meant to. Same words, same face on screen; only the measurement differs. Where does a phrase's width come from?

Each glyph tells the pen how far to move before the next one: its advance. Add them up, spaces included, and you have the phrase's width: 5.88 units for “Ink on paper” in EB Garamond at size 1.2, ending where a next glyph would start rather than at the last ink. The advances belong to the face, so the answer is: measure the face you draw; each face and cut gives the same text its own advances.

“Each cut” is meant literally. Bold is not Regular thickened, nor Italic Regular slanted: at size 0.9 the phrase is 4.41 in Regular, 4.85 in Bold and 4.24 in Italic, because each cut is its own font with its own metrics. A width measured in Regular is wrong for Bold.

A diagram layout makes the same mistake or avoids it. Measured in EB Garamond before Agentic Mermaid places the boxes, each box is sized from its word, and each word is drawn at its own width (stretched ×1.000). The other case lays the same diagram out from Agentic Mermaid's default Inter width estimates: the boxes are sized for another face, and Rayner stretches the Garamond words to fill them, Ink ×1.135 and Paper ×1.399. It is the first step's mistake again; here the words bend instead of a marker moving.

**The aha:** the stretched Paper box. The marker in step 1 and the bent word in the last step are one mistake: one face measured, another drawn.

**Sentence to remember:** measure the face you draw: each face and cut gives the same text its own advances.

**Check questions**, in `meta.checks`, asked after the last step:

1. Why does the upper marker sit 2.07 units further right than the lower one?
2. Which cut makes the phrase widest, and by how much more than Regular?
3. A layout measures the phrase in Regular, puts a marker 0.5 after it, and the phrase is drawn in Bold. What happens to the gap? (A transfer: 0.5 − 0.44 = 0.06.)

**The reader's lever:** the Diagram widths setting. Measured in EB Garamond (default) shows the fix; Inter estimates shows the failure. Both cases share the first three steps.

| Step | Script | Reader predicts |
| --- | --- | --- |
| layout | paragraph 2: two markers, 6.48 against 4.41 | where a phrase's width comes from |
| advance | paragraph 3: advances add up; the answer | |
| cuts | paragraph 4: Regular, Bold, Italic | |
| diagram | paragraph 5: ×1.000 measured, or stretched from Inter estimates | |
