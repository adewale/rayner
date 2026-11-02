# Script: how do I write that in Rayner?

Questions the reader brings: I am deciding whether to write explainers in Rayner. How much code does a feature take, and what does my reader actually get from it?

Each case is one thing an author wants to do, asked as a question: how do I show one shape turning into another? The first step shows the few lines an author writes for it, and its caption opens with the answer: each feature takes a few lines of the scene, and the picture they leave at rest is what a reader who opens the step from a link sees. Its caption says what those lines do and, plainly, what the next step draws besides them (usually a copy of the starting picture on the left). Its line asks the reader to predict something about what the lines leave on screen, such as whether a link to the step shows the circle, the square or both.

The second step runs those lines and splits the picture: the starting picture on the left, which the page draws separately, and what the lines leave after they run on the right. A reader who opens a step from a link never sees the transform play; the recipe alone would leave only the square, and only the circle beside it says what happened. That carries to every scene. Each result's line makes the case's own point about what its lines leave at rest, such as "From a link, these lines leave a square; the circle is a separate drawing." Captions say what the case shows and stop there, without lists of related calls the case never uses.

The default case is the animation, where the motion is the whole point and a direct link would show only its end. The camera case cannot put a before panel beside a moved camera, because the camera frames the whole picture, so it draws a ruler across the whole stage first: after the zoom the ruler shows only its middle, and a label in the closer view says how many of the stage's 16 units it frames and that the circle has not moved. The matching case lists, under cache hit, which letters the animation moved and which it faded, read from the pairs it made.

**The aha:** the circle on the left and the square on the right, with the caption saying that only the square came from the recipe.

**Sentence to remember:** a reader gets the picture your lines leave at rest, so leave the before beside the after.

**Check questions**, in `meta.checks`, asked after the last step. Each asks about a variant no case shows.

1. Run the code-edits recipe twice: count += 1 → count += 2 → count += 3, each with markAdded. What does a link to that step show? (let count = 0 and count += 3, marked added; count += 2 faded out with its mark, so nothing shows it existed. Checked against `CodeBlock.morph` in `explain/panels.ts`.)
2. In the camera case, a second circle sits at (5, 0) before `s.focus(subject)`. Is it in the result? (No: the view frames 6 of 16 units, roughly x = −3 to 3; the circle is still at (5, 0).)
3. Can the chart case plot numbers each reader types? (No: a reader chooses only among a setting's declared options; offer prepared data sets as options.)

**Cases:** 15 authoring features, from steps and settings to RTL layout and drawing tools. Changing the case starts at its recipe (`caseNavigation: 'first'`); a direct link to a result still opens the result.

| Step | Script | Reader predicts |
| --- | --- | --- |
| recipe | paragraph 1: the answer, the author's question, the lines that answer it, and what the result adds | the case's own question about what the lines leave on screen |
| result | paragraph 2: before and after, with the case's own point as the line; paragraph 3 for the camera and matching cases | |
