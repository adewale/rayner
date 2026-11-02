# Script: how do I write that in Rayner?

Questions the reader brings: I am deciding whether to write explainers in Rayner. How much code does a feature take, and what does my reader actually get from it?

Each case is one thing an author wants to do, asked as a question: how do I show one shape turning into another? The first step shows the few lines an author writes for it. Its caption says what those lines do and, plainly, what the next step draws besides them (usually a copy of the starting picture on the left). Its line asks the reader to predict something about what the lines leave on screen, such as whether a link to the step shows the circle, the square or both.

The second step runs those lines and splits the picture: the starting picture on the left, which the page draws separately, and what the lines leave after they run on the right. A reader who opens a step from a link never sees the transform play; the recipe alone would leave only the square, and only the circle beside it says what happened. That carries to every scene, and it is the answer, the line of every result step: from a link, a reader sees only the picture a step leaves at rest, so it must show what changed.

The default case is the animation, where the motion is the whole point and a direct link would show only its end. The camera case cannot put a before panel beside a moved camera, because the camera frames the whole picture, so it draws a ruler across the whole stage first: after the zoom the ruler shows only its middle, and a label in the closer view says how many of the stage's 16 units it frames and that the circle has not moved. The matching case lists, under cache hit, which letters the animation moved and which it faded, read from the pairs it made.

**The aha:** the circle on the left and the square on the right, with the caption saying that only the square came from the recipe.

**Sentence to remember:** a reader gets the picture your lines leave at rest, so leave the before beside the after.

**Check questions**, in `meta.checks`, asked after the last step. Each asks about a feature or setting no case shows.

1. Your step removes a warning with FadeOut, then holds for its caption. What does a reader who opens that step from a link see of the warning, and what could the step leave instead?
2. This page has one setting with fifteen options. Add a light or dark theme setting. How many cases does the build make, and which can a reader open? (Thirty.)
3. In the state case, a later step sets `this.state.count = 5` but never plays `label.sync()`. What does the trace record, and what does the label show? (5; still 1.)

**Cases:** 15 authoring features, from steps and settings to RTL layout and drawing tools. Changing the case starts at its recipe (`caseNavigation: 'first'`); a direct link to a result still opens the result.

| Step | Script | Reader predicts |
| --- | --- | --- |
| recipe | paragraph 1: the author's question, the lines that answer it, and what the result adds | the case's own question about what the lines leave on screen |
| result | paragraph 2: before and after, the answer as the line; paragraph 3 for the camera and matching cases | |
