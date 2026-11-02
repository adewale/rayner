# Script: how do I write that in Rayner?

Questions the reader brings: I am deciding whether to write explainers in Rayner. How much code does a feature take, and what does my reader actually get from it?

Each case is one thing an author wants to do, asked as a question: how do I show one shape turning into another? The first step shows the few lines an author writes for it, and asks the reader to predict what the next step's picture will show when opened from a link.

The second step runs those lines, and the picture is split: what the reader would have seen before the feature ran, and what it leaves after. That split is the answer, and it is the lesson that carries to every scene: each feature is a few lines of construct(), and a reader gets the picture those lines leave at rest, so the resting picture must show what changed. A reader who opens a step from a link never sees the transform play; they see the square. Shown beside the circle it came from, the square still says what happened.

The default case is the animation, where the motion is the whole point and a direct link would show only its end. The camera case cannot put a before panel beside a moved camera, so it draws a ruler across the whole stage first: after the zoom the ruler shows only its middle, and a label in the closer view says how many of the stage's 16 units it frames and that the circle has not moved.

**The aha:** the circle on the left and the square on the right, with the arrow between: a still that tells the whole animation.

**Sentence to remember:** a reader gets the picture your lines leave at rest, so leave the before beside the after.

**Check questions**, in `meta.checks`, asked after the last step:

1. Your step moves a label with an animation, then holds for its caption. A reader opens that step from a link. What do they see, and what should the step leave on screen?
2. You want a counter that the trace records and the picture shows, and the two must never disagree. Which case's recipe do you copy, and why not edit a Text?
3. An Arabic explainer puts its summary card at 'start'. Which side does it land on, and how do you keep its digits in left-to-right order?

**Cases:** 15 authoring features, from steps and settings to RTL layout and drawing tools. Changing the case starts at its recipe (`caseNavigation: 'first'`); a direct link to a result still opens the result.

| Step | Script | Reader predicts |
| --- | --- | --- |
| recipe | paragraph 1: the author's question and the lines that answer it | what the result's resting picture will show |
| result | paragraph 2: before and after, and the answer; paragraph 3 for the camera | |
