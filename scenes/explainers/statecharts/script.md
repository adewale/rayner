# Script: what is a statechart?

Questions the reader brings: What is a statechart? How is it different from a state machine? Why would I use one?

Show a coffee machine first: four boxes, idle, grinding, brewing and ready, and four arrows between them, START, GROUND, BREWED and TAKE. The machine is always in exactly one box, and each event moves it along an arrow. Only then name the parts: the boxes are states, the arrows transitions, and the whole a state machine. Then ask for a power button.

Give the machine a power button. A plain state machine's arrow leaves one state, so idle, grinding, brewing and ready each need their own POWER_OFF arrow: behaviour shared by many states is copied onto each of them. The same event leaving several states for the same place is the first sign that a drawing is missing structure. Put the four in a box called on, and one POWER_OFF on the box does the job. When POWER_OFF arrives while brewing, brewing is asked first; it has no POWER_OFF, so its parent takes it. This is the first of two ideas: a statechart is a state machine whose states can contain other states.

The second idea handles features that don't depend on each other. A player that is playing or paused, and muted or unmuted, with neither choice limiting the other, needs one flat state per combination, four of them, and each further on/off feature doubles that. Look at the names: every one is two words, one per feature, and every arrow between them changes one word and keeps the other: states named by two independent words are the second sign. Split the box with a dashed line and give each side one feature: each side is a region, a small machine in one state at a time, both running at once. A flat state had to name both features at once; a state in a region names only its own, so a new feature adds a region instead of doubling everything.

Nothing new becomes possible: flatten any statechart and you get an ordinary state machine with the same behaviour; the same events traced through both machines end in the same states. Only the drawing changes: the statechart's grows with the number of features, the flat machine's with the number of combinations.

Then the reader places a milk frother, using the signs: flat, its states would pair every brewing state with still or frothing, grinding · frothing and so on, each arrow changing one word, so it is a region beside the brewing cycle. The last caption ends on the frother; it does not restate the two ideas.

**The angle:** most explanations give Harel's two ideas as features. This one gives the two signs that tell you a flat machine you already have wants them: the same arrow copied onto many states wants a parent, and states named by two independent words want regions.

**The aha:** the grid's own words slide apart into two regions, and playing · muted becomes playing on one side and muted on the other.

**Sentence to remember:** a statechart nests states, so shared behaviour is written once, and runs regions side by side, so each independent feature adds a few drawn states where the flat machine doubles. (At run time the combinations still exist; the flatten step says so.)

**Check questions**, in `meta.checks`, asked after the last step. Each hands the reader a flat machine no step draws and asks them to apply the two signs:

1. A traffic light: green, yellow, red and flashing; TIMER goes round the three lamps, FAULT leaves each for flashing, RESET goes back to red. Which arrows can a box replace? (The three FAULT arrows, which share a target; the TIMER arrows go to different places and stay. 7 transitions become 5.)
2. A car door: closed · locked, closed · unlocked, open · unlocked. Every name is two words; should the door and the lock be regions? (No: the words depend on each other. Split, the door would reach open · locked, 4 states where it had 3.)
3. A fan: off, and six on states named by speed (three values, one SPEED event round them) and swing. Which signs, and what does the statechart draw? (Both: a parent on with one POWER, and two regions, one of three states. 7 boxes and 19 transitions become 7 boxes and 7 transitions.)

The scene computes every count from the model and throws if the boxed light stops flattening to the flat one, or if the flat door could reach open · locked.

**Transfer:** the last two steps ask the reader to place a milk frother in the coffee machine, then show it as a region.

| Step | Script | Reader predicts |
| --- | --- | --- |
| machine | paragraph 1: the machine shown, then named; the power button | how many arrows a power button adds |
| copies | paragraph 2, the copied arrows and the first sign | how one arrow could do the job |
| parent | paragraph 2, the box, the parent rule traced, and the name | |
| multiply | paragraph 3, the combinations, the doubling and the second sign | what if each feature had its own machine |
| regions | paragraph 3, the split: the aha | whether a statechart can do more |
| flatten | paragraph 4, with the same events traced through both machines | |
| question, frother | paragraph 5, the transfer | where the frother goes |
