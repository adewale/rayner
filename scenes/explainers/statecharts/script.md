# Script: what is a statechart?

Questions the reader brings: What is a statechart? How is it different from a state machine? Why would I use one?

A statechart is a state machine whose states can contain other states. It adds two things. A state can be a box of states, a parent, and any event its children don't handle goes to the parent. And a state can be split into regions, each in one state at the same time.

Why that matters: in a plain state machine, behaviour shared by many states must be copied onto each of them. Give a coffee machine a power button, and idle, grinding, brewing and ready each need their own POWER_OFF arrow. Put the four in a box called on, and one POWER_OFF on the box does the job.

Independent features multiply. A player that is playing or paused, and muted or unmuted, needs one flat state per combination, four of them, and each new on/off feature doubles that. Booleans hide the same problem: isPlaying and isPaused can both be true, which should be impossible. Regions keep playback and volume apart, as two small machines side by side, so the impossible combination can't be written.

Nothing new becomes possible: flatten any statechart and you get an ordinary state machine with the same behaviour. What you gain is a drawing the size of the idea instead of the size of every combination, so it stays readable as the product grows.

**Sentence to remember:** a statechart is a state machine that can nest states and run parts side by side, so shared behaviour is written once and independent features don't multiply.

**Check questions**, each asked in a step's line and answered by the next step:

1. Given four states that all have the same EXIT arrow, what would a statechart do? (asked in copies, answered in parent)
2. Why do two independent on/off features need four flat states but only two regions? (asked in booleans, answered in regions; growth answers "how many with a third feature?", asked in multiply)
3. Can a statechart do anything a state machine can't? (asked in regions, answered in flatten)

**Transfer:** the last two steps ask the reader to place a milk frother in the coffee machine, then show it as a region.

| Step | Script |
| --- | --- |
| what | paragraph 1 |
| copies | paragraph 2, first two sentences |
| parent | paragraph 2, last sentence, and the parent rule from paragraph 1, drawn as a trace |
| multiply | paragraph 3, first sentence |
| growth | paragraph 3, "each new on/off feature doubles that", for one to five features |
| booleans | paragraph 3, the boolean sentences |
| regions | paragraph 3, last sentence |
| flatten | paragraph 4, with the same events traced through both machines |
| question, frother | transfer; the last caption ends on the sentence to remember |
