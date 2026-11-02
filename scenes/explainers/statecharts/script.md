# Script: what is a statechart?

Questions the reader brings: What is a statechart? How is it different from a state machine? Why would I use one?

Many apps model behaviour as a state machine: the thing is in exactly one state, and each event moves it along an arrow. A coffee machine is idle, grinding, brewing or ready. Drawings like this stay readable until states start sharing behaviour.

Give the machine a power button. A plain state machine's arrow leaves one state, so idle, grinding, brewing and ready each need their own POWER_OFF arrow: behaviour shared by many states is copied onto each of them. Put the four in a box called on, and one POWER_OFF on the box does the job. When POWER_OFF arrives while brewing, brewing is asked first, has no POWER_OFF, and its parent takes it. That is the first idea: a statechart is a state machine whose states can contain other states.

The second idea is for features that don't depend on each other. A player that is playing or paused, and muted or unmuted, needs one flat state per combination, four of them, and each new on/off feature doubles that. Split the box with a dashed line and give each side one feature: each side is a region, a small machine in one state at a time, both running at once. A flat state had to name both features at once; a state in a region names only its own, so a new feature adds a region instead of doubling everything.

Nothing new becomes possible: flatten any statechart and you get an ordinary state machine with the same behaviour. What you gain is a drawing the size of the idea instead of the size of every combination, so it stays readable as the product grows.

**The aha:** the grid's own words slide apart into two regions, and playing · muted becomes playing on one side and muted on the other.

**Sentence to remember:** a statechart is a state machine that can nest states and run parts side by side, so shared behaviour is written once and independent features don't multiply.

**Check questions**, in `meta.checks`, asked after the last step. Each asks about this explainer's own machines, so a reader who already knows statecharts can't answer from memory:

1. The four-state coffee machine gets a power button. How many transitions does its flat machine end up with, and how many does the statechart need? (9 and 6)
2. Give the player a third on/off feature. How many flat states does it need, not counting off, and how many states does the statechart gain? (8, and two)
3. After the milk frother is added, how many POWER_OFF arrows does the statechart draw, and how many would the flat machine need? (one, and eight)

**Transfer:** the last two steps ask the reader to place a milk frother in the coffee machine, then show it as a region.

| Step | Script | Reader predicts |
| --- | --- | --- |
| machine | paragraph 1: the concrete machine, and the change to come | how many arrows a power button adds |
| copies | paragraph 2, the copied arrows | how one arrow could do the job |
| parent | paragraph 2, the box, the parent rule traced, and the name | |
| multiply | paragraph 3, first sentence | states with a third feature |
| growth | paragraph 3, "each new on/off feature doubles that", for one to five features | what if each feature had its own machine |
| regions | paragraph 3, the split: the aha | whether a statechart can do more |
| flatten | paragraph 4, with the same events traced through both machines | |
| question, frother | transfer; the last caption ends on the sentence to remember | where the frother goes |
