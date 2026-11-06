# Font measurement notes

Every phrase measurement uses size 0.9, so the advance ruler repeats the opening’s 4.41. The upper marker’s total gap is 2.57 units: the intended 0.5 plus the 2.07-unit excess caused by the wrong face. The ruler’s ticks and space cells come from the same shaped run the Text draws (`shapeRun`), not from a separate estimate. The rulers step takes both rulers’ pen stops the same way, from one shaped run of the phrase in each face at size 0.9.

The first three steps are `stage.steps`: each picture is drawn from the measurements its step records (`pen` holds the advance step’s glyph starts and spaces), so `rayner check` redraws it from them. The advance step’s dimension is added by the stage after its picture, because a draw cannot make one. The cuts rows are a view of `advances`, so their description can name each cut’s advance, which the fidelity test reads; the diagram and its stretch notes come from the captured layout.

EB Garamond Regular, Bold and Italic outlines are captured and bundled. This example deliberately compares natural diagram measurements with recorded Inter estimates; the stretching factors describe these two labels, not a general conversion between the fonts.

The diagram’s labels, connector and stretch readouts form one declared reading comparison. The annotations use a size readable with the complete comparison; tiny notes would make a phone zoom into a factor while losing the word it measures.

