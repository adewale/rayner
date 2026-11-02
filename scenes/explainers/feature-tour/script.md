# What does an authoring feature leave on the page?

A few lines can turn a circle into a square. The motion makes their relationship easy to see while it plays. But someone opening a link directly to the finished step sees its resting picture. Does the transformation itself leave both shapes there?

It leaves the square. The before-and-after example has a circle beside it because that circle is a separate drawing. The animation’s starting state helps calculate the transition; it is not automatically a persistent comparison panel.

That distinction also applies to text and code changes. A morph can move matching letters and fade the others, or replace one code line with another. At rest the changed line is the current line. Earlier versions do not remain visible just because the animation passed through them. The matching example identifies which glyphs moved so their correspondence can still be inspected.

A camera operation changes a different thing. `s.focus(subject)` brings a small object closer by changing the view, without changing the object’s coordinates. The ruler that previously spanned the stage now shows only its middle. A second before panel would be inside that same changed camera, so the ruler gives the comparison a reference that survives the zoom.

The feature selector pairs short examples of the APIs with their results. Settings choose prepared alternatives; drawing tools leave completed strokes; a saved state gives Restore a position and style to return to. These operations have different mechanics, but each result can be judged by the same question: what evidence remains once the motion ends?

Code describes what happens over time. A directly linked step must also explain the state it leaves behind. The starting copy, ruler and marked differences in these examples make that state inspectable without requiring the reader to replay the transition.
