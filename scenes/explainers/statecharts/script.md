# Script: what is a statechart?

Questions the reader brings: What is a statechart? How is it different from a state machine? Why would I use one?

A statechart is a state machine whose states can contain other states. It adds two things. A state can be a box of states, a parent, and any event its children don't handle goes to the parent. And a state can be split into regions, each in one state at the same time.

Why that matters: in a plain state machine, behaviour shared by many states must be copied onto each of them. Give a coffee machine a power button, and idle, grinding, brewing and ready each need their own POWER_OFF arrow. Put the four in a box called on, and one POWER_OFF on the box does the job.

Independent features multiply. A player that is playing or paused, and muted or unmuted, needs one flat state per combination, four of them, and each new on/off feature doubles that. Booleans hide the same problem: isPlaying and isPaused can both be true, which should be impossible. Regions keep playback and volume apart, as two small machines side by side, so the impossible combination can't be written.

Nothing new becomes possible: flatten any statechart and you get an ordinary state machine with the same behaviour. What you gain is a drawing the size of the idea instead of the size of every combination, so it stays readable as the product grows.

**Sentence to remember:** a statechart is a state machine that can nest states and run parts side by side, so shared behaviour is written once and independent features don't multiply.

**Check questions** (asked in steps 2, 4 and 5; answered in the step after each):

1. Given four states that all have the same EXIT arrow, what would a statechart do?
2. Why do two independent on/off features need four flat states but only two regions?
3. Can a statechart do anything a state machine can't?

| Step | Script |
| --- | --- |
| what | paragraph 1 |
| copies | paragraph 2, first two sentences; asks question 1 |
| parent | paragraph 2, last sentence, and the parent rule from paragraph 1; answers question 1 |
| multiply | paragraph 3, first three sentences; asks question 2 |
| regions | paragraph 3, last sentence; answers question 2; asks question 3 |
| flatten | paragraph 4; answers question 3 |
