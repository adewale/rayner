# What is a statechart, and why use one instead of a state machine?

- **Reader:** a programmer who can read a box-and-arrow state machine, or will after the first step, and has heard of statecharts (perhaps through XState) without knowing what they add.
- **Answer:** A statechart is a state machine whose states can contain other states, active one at a time or several at once
- **Changed condition:** no setting changes the outcome. The explainer compares instead: each machine drawn flat and as a statechart, with their counts of boxes and transitions, and the same events sent through the media player's statechart and its flattened version, which end in the same states.
- **Reader's own work:** predict how many arrows a power button adds, how one arrow could do the job, and what a third feature costs the flat player; place the milk frother before the answer step; press the events of the brewing machine and the frother machine live; answer the check questions.
- **Checked against:** XState 5.33.3. `oracle/statecharts.ts` explores each drawn chart (the coffee machine, the media player, the player boxed inside on, and the coffee machine with the frother) with XState alone, recorded in `fixtures/statecharts-xstate.json`; `model.test.ts` compares the model's reachable configurations, transitions, handled events, the scripted runs and generated event sequences with it. The player with three to five features and the check questions' frother charts are checked by the model's own tests, `answers.ts` and the scene's guard, not by XState.
- **Grounding:** recorded: XState 5.33.3
- **Leaves out:** guards, actions, history, final states and delays; Statemate's transition priorities, which differ from the inner-state-first rule of XState and SCXML used here; more than two independent features drawn (the count tests go to five); the frother charts the check questions ask about, which no step draws. The missing POWER_OFF is a deliberately incomplete hand copy, not a real appliance's behaviour.

## Check yourself

1. Give the frother its own power, so FROTH and STOP work whether the coffee machine is on or off. Where does the frother region go now, and how many states does the flat machine need?
   Outside on, beside the whole machine: since the frother works whether the machine is off or on, it becomes a region next to the off-and-on machine, and the statechart’s top level splits in two. Flat, every one of the machine’s 5 states pairs with still or frothing, off included: 10 states where the frother inside on needed 9.
2. Now the frother runs on the brewing steam, so it can be still or frothing only while brewing, and leaving brewing stops it. Write the flat machine’s state names. Does the second sign still say “region”, and where does the frother go?
   The names are off, idle, grinding, brewing · still, brewing · frothing and ready: 6 states. Only the brewing states have two words, so the words are not independent and the second sign does not apply. The frother goes inside brewing as a box of two states, which makes brewing a parent: the first idea again. The statechart draws 8 transitions where the flat machine draws 13.
3. In the last step the machine is grinding while the frother is frothing. Press POWER_OFF, then POWER_ON. Is the frother still frothing?
   No. POWER_OFF is taken by on, which leaves both regions; POWER_ON enters on again, and each region starts at its start dot: idle and still. Nothing in the chart remembers where a region was when the machine went off.

## Why this explainer

Statecharts are usually introduced as a taxonomy: hierarchy, concurrency, history, each with a definition. This explainer instead gives each idea a problem it removes. The coffee machine shows repeated transitions: a power button needs a POWER_OFF copied onto every state, and a hand copy that misses brewing's shows the cost of copying. A box around the four states takes the one arrow, and that is the first idea, a parent. The media player shows repeated combinations: two independent features make every flat state a two-word name, and splitting the box into regions removes the repetition. Keeping the two problems on separate machines stops the two ideas blurring into one.

The reader should leave with two signs to look for in a flat machine (one event leading from several states to the same place, and states named by independent words) and with the knowledge that a statechart changes the drawing, not the behaviour: flattened, it is an ordinary state machine. The trace step exists to make that last point undeniable. The frother then asks the reader to apply both signs to the opening machine before the answer is shown.

The check answers state counts from the model; the guard at the top of `scene.ts` fails the scene if the model stops giving them. The pictures key every part by its place in the playback × volume grid so morphs carry states between pictures; `picture.ts` says how.
