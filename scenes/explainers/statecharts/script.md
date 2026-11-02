# Script: what is a statechart?

Questions the reader brings: What is a statechart? How is it different from a state machine? Why would I use one?

Show a coffee machine first: four boxes, idle, grinding, brewing and ready, and four arrows between them, START, GROUND, BREWED and TAKE. The machine is always in exactly one box, and each event moves it along an arrow. Only then name the parts: the boxes are states, the arrows transitions, and the whole a state machine; many apps model behaviour this way. The drawing stays readable until several states need the same arrow.

Give the machine a power button. A plain state machine's arrow leaves one state, so idle, grinding, brewing and ready each need their own POWER_OFF arrow: behaviour shared by many states is copied onto each of them. The same event leaving several states for the same place is the first sign that a drawing is missing structure. Put the four in a box called on, and one POWER_OFF on the box does the job. When POWER_OFF arrives while brewing, brewing is asked first; it has no POWER_OFF, so its parent takes it. This is the first of two ideas: a statechart is a state machine whose states can contain other states.

The second idea handles features that don't depend on each other. A player that is playing or paused, and muted or unmuted, needs one flat state per combination, four of them, and each further on/off feature doubles that. Look at the names: every one is two words, one per feature, and every arrow between them changes one word and keeps the other: states named by two independent words are the second sign. Split the box with a dashed line and give each side one feature: each side is a region, a small machine in one state at a time, both running at once. A flat state had to name both features at once; a state in a region names only its own, so a new feature adds a region instead of doubling everything.

Nothing new becomes possible: flatten any statechart and you get an ordinary state machine with the same behaviour; the same events traced through both machines end in the same states. Only the drawing changes: the statechart's grows with the number of features, the flat machine's with the number of combinations.

Then the reader places a milk frother, using the signs: flat, its states would be two words, grinding · frothing and so on, each arrow changing one, so it is a region beside the brewing cycle.

**The angle:** most explanations give Harel's two ideas as features. This one gives the two signs that tell you a flat machine you already have wants them: the same arrow copied onto many states wants a parent, and states named by two independent words want regions.

**The aha:** the grid's own words slide apart into two regions, and playing · muted becomes playing on one side and muted on the other.

**Sentence to remember:** a statechart nests states, so shared behaviour is written once, and runs regions side by side, so independent features don't multiply the states.

**Check questions**, in `meta.checks`, asked after the last step. Each is a machine the steps don't draw, or a count they don't print:

1. The coffee machine gets a fifth state, descaling. How many POWER_OFF arrows does the flat machine need, and how many does the statechart draw? (5 and 1)
2. Give the player five on/off features. How many flat states does it need, not counting off, and how many state boxes does the statechart draw inside on? (32 and 10)
3. After the milk frother is added, how many POWER_OFF arrows does the statechart draw, and how many would the flat machine need? (one, and eight)

**Transfer:** the last two steps ask the reader to place a milk frother in the coffee machine, then show it as a region.

| Step | Script | Reader predicts |
| --- | --- | --- |
| machine | paragraph 1: the machine shown, then named; the change to come | how many arrows a power button adds |
| copies | paragraph 2, the copied arrows and the first sign | how one arrow could do the job |
| parent | paragraph 2, the box, the parent rule traced, and the name | |
| multiply | paragraph 3, the combinations, the doubling and the second sign | what if each feature had its own machine |
| regions | paragraph 3, the split: the aha | whether a statechart can do more |
| flatten | paragraph 4, with the same events traced through both machines | |
| question, frother | paragraph 5, the transfer; the last caption ends on the sentence to remember | where the frother goes |
