# Script: what is a statechart?

Questions the reader brings: What is a statechart? How is it different from a state machine? Why would I use one?

Show a coffee machine first: four boxes, idle, grinding, brewing and ready, and four arrows between them, START, GROUND, BREWED and TAKE. The machine is always in exactly one box, and each event moves it along an arrow. Only then name the parts: the boxes are states, the arrows transitions, and the whole a state machine. Then ask for a power button.

Give the machine a power button. A plain state machine's arrow leaves one state, so idle, grinding, brewing and ready each need their own POWER_OFF arrow: behaviour shared by many states is copied onto each of them. Copied by hand, one is easy to miss, and the picture misses brewing's: the model's hand-copied flat machine (`byHand`) stays in brewing when POWER_OFF arrives, so the cost is a machine you cannot switch off, not only an arrow count. The same event leaving several states for the same place is the first of two signs to look for in a flat machine. Put the four in a box called on, and one POWER_OFF on the box does the job and cannot be forgotten. In XState and SCXML, when POWER_OFF arrives while brewing, brewing is asked first; it has no POWER_OFF, so its parent takes it. (Statemate gives the outer transition priority; the scene scopes the rule.) The box is half of the answer: a statechart is a state machine whose states can contain other states, active one at a time or several at once.

The second idea handles features that don't depend on each other. A player that is playing or paused, and muted or unmuted, with neither choice limiting the other, needs one flat state per combination, four of them, and each further on/off feature doubles that. Look at the names: every one is two words, one per feature, and every arrow between them changes one word and keeps the other: states named by two independent words are the second sign. Split the box with a dashed line and give each side one feature: each side is a region, a small machine in one state at a time, both running at once. A flat state had to name both features at once; a state in a region names only its own, so a new feature adds a region instead of doubling everything.

Nothing new becomes possible: flatten any statechart and you get an ordinary state machine with the same behaviour; the same events traced through both machines end in the same states. Only the drawing changes: the statechart's grows with the number of features, the flat machine's with the number of combinations.

Then the reader places a milk frother, using the signs: flat, its states would pair every brewing state with still or frothing, grinding · frothing and so on, each arrow changing one word, so it is a region beside the brewing cycle. The line gives the flat machine's size, which the question asked for, and the caption says why grinding and frothing are both green: after POWER_ON, START and FROTH, each region is in its own state at once. The last caption ends on the frother; it does not restate the two ideas.

**The angle:** most explanations give Harel's two ideas as features. This one gives the two signs that tell you a flat machine you already have wants them: the same arrow copied onto many states wants a parent, and states named by two independent words want regions.

**The aha:** the grid's own words slide apart into two regions, and playing · muted becomes playing on one side and muted on the other.

**Sentence to remember:** a statechart is a state machine whose states can contain other states, active one at a time or several at once: the first kind writes shared behaviour once, and the second lets each independent feature add a few drawn states where the flat machine doubles. (At run time the combinations still exist; the flatten step says so.)

**Check questions**, in `meta.checks`, asked after the last step. Each changes this explainer's frother, or replays its last machine, in a way no step shows:

1. Give the frother its own power, so it works whether the machine is on or off. Where does the region go, and how big is the flat machine? (Beside the whole off-and-on machine, at the top level; 10 states where the frother inside on needed 9.)
2. The frother runs on the brewing steam, so it exists only while brewing. Does the second sign still say "region"? (No: only the brewing states have two words, so the words are not independent. The frother goes inside brewing, which becomes a parent: the first idea. 6 flat states.)
3. In the last step's machine, grinding and frothing, press POWER_OFF and then POWER_ON. Is the frother still frothing? (No: both regions restart at their start dots, idle and still.)

The scene computes every count and state from the model, and throws if the frother outside on cannot froth while the machine is off, if the frother inside on can, or if the steam frother froths outside brewing.

**Transfer:** the last two steps ask the reader to place a milk frother in the coffee machine, then show it as a region.

| Step | Script | Reader predicts |
| --- | --- | --- |
| machine | paragraph 1: the machine shown, then named; the power button | how many arrows a power button adds |
| copies | paragraph 2, the copied arrows, brewing's missed copy, and the first sign | how one arrow could do the job |
| parent | paragraph 2, the box, the parent rule traced and scoped, and the answer | |
| multiply | paragraph 3, the combinations, the doubling and the second sign | what if each feature had its own machine |
| regions | paragraph 3, the split: the aha | whether a statechart can do more |
| flatten | paragraph 4, with the same events traced through both machines | |
| question, frother | paragraph 5, the transfer | where the frother goes |
