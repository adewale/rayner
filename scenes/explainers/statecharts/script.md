# What is a statechart?

A coffee machine waits idle, grinds the beans, brews the coffee and holds the drink ready to take. It occupies one of those four boxes at a time. START, GROUND, BREWED and TAKE move it along the arrows. The boxes are states, the arrows are transitions, and together they form a state machine.

Now add a power button. It must switch the machine off whether it is idle, grinding, brewing or ready. How many arrows does that require?

In a flat drawing, each of the four states needs its own POWER_OFF arrow. The hand-copied machine has missed brewing's arrow: pressing the button during brewing does nothing until the brew finishes. Adding another state would create another place to miss the same behaviour. The repeated arrows are copies of one rule: leave whichever powered state is active and go to off.

Put the four states inside a box called on, and attach POWER_OFF to that box. While brewing, the machine first looks for a transition in brewing; finding none for this event, it looks in the enclosing state, on. The parent handles it and the machine leaves on. This is the first idea in a statechart: a state can contain other states, so shared behaviour can belong to their parent.

A media player exposes a different kind of repetition. Playback can be playing or paused, independently of volume being muted or unmuted. A flat state must name both choices: playing · muted, playing · unmuted, paused · muted or paused · unmuted. Changing playback repeats the same move for both volume settings; changing volume repeats it for both playback settings. Each additional independent two-state feature doubles the combinations.

The two words in those names can become two small machines. One tracks playback; the other tracks volume. A dashed line separates these regions inside on. Each region has one active state, and the regions run together: playing on one side and muted on the other represent the same situation as playing · muted in the flat drawing. A statechart can therefore contain a choice of child states or several regions active at once.

Send the same events through the statechart and its flattened version. Both reach the same combinations. The smaller drawing has removed repeated descriptions of behaviour; it has not removed the combinations the player can occupy.

Now add a milk frother to the coffee machine. While the machine is on, the frother can be still or frothing, whatever the brewing cycle is doing. Does it belong in that cycle, or alongside it?

Grinding can pair with either frother state, as can idle, brewing and ready. The frother therefore gets a region beside the brewing cycle, inside on. After POWER_ON, START and FROTH, the machine is grinding and frothing at once. The parent's POWER_OFF still leaves the whole powered machine, including both regions.
