<!-- The blind reviewer's brief. Fill /workspace/rayner/bench/explainers/round-3-2026-11-19/pairs, # What is a statechart, and why use one instead of a state machine?

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
, A statechart is a state machine whose states can contain other states, active one at a time or several at once and 1. Give the frother its own power, so FROTH and STOP work whether the coffee machine is on or off. Where does the frother region go now, and how many states does the flat machine need?
   Outside on, beside the whole machine: since the frother works whether the machine is off or on, it becomes a region next to the off-and-on machine, and the statechart’s top level splits in two. Flat, every one of the machine’s 5 states pairs with still or frothing, off included: 10 states where the frother inside on needed 9.
2. Now the frother runs on the brewing steam, so it can be still or frothing only while brewing, and leaving brewing stops it. Write the flat machine’s state names. Does the second sign still say “region”, and where does the frother go?
   The names are off, idle, grinding, brewing · still, brewing · frothing and ready: 6 states. Only the brewing states have two words, so the words are not independent and the second sign does not apply. The frother goes inside brewing as a box of two states, which makes brewing a parent: the first idea again. The statechart draws 8 transitions where the flat machine draws 13.
3. In the last step the machine is grinding while the frother is frothing. Press POWER_OFF, then POWER_ON. Is the frother still frothing?
   No. POWER_OFF is taken by on, which leaves both regions; POWER_ON enters on again, and each region starts at its start dot: idle and still. Nothing in the chart remembers where a region was when the machine went off.
 from the round's script; change nothing else between rounds. -->
You are an independent editor judging educational explainers. Do not modify any files outside your own scratch notes.

In `/workspace/rayner/bench/explainers/round-3-2026-11-19/pairs` there are **pairs** of explainers that teach the same thing, built from the same approved script. Each pair has an X and a Y. For each explainer there is:
- `pairN-X.html`: the actual page; open it and use it.
- `pairN-X.png`: a contact sheet of its steps.
- `pairN-X.transcript.json`: its step text.

Within a pair, the two were built by the same author using two different methods. You aren't told which is which; judge only what a learner experiences. Don't look in any other folder.

**The script they all show:**
> # What is a statechart, and why use one instead of a state machine?

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


**Sentence to remember:** A statechart is a state machine whose states can contain other states, active one at a time or several at once

**Check questions:**
1. Give the frother its own power, so FROTH and STOP work whether the coffee machine is on or off. Where does the frother region go now, and how many states does the flat machine need?
   Outside on, beside the whole machine: since the frother works whether the machine is off or on, it becomes a region next to the off-and-on machine, and the statechart’s top level splits in two. Flat, every one of the machine’s 5 states pairs with still or frothing, off included: 10 states where the frother inside on needed 9.
2. Now the frother runs on the brewing steam, so it can be still or frothing only while brewing, and leaving brewing stops it. Write the flat machine’s state names. Does the second sign still say “region”, and where does the frother go?
   The names are off, idle, grinding, brewing · still, brewing · frothing and ready: 6 states. Only the brewing states have two words, so the words are not independent and the second sign does not apply. The frother goes inside brewing as a box of two states, which makes brewing a parent: the first idea again. The statechart draws 8 transitions where the flat machine draws 13.
3. In the last step the machine is grinding while the frother is frothing. Press POWER_OFF, then POWER_ON. Is the frother still frothing?
   No. POWER_OFF is taken by on, which leaves both regions; POWER_ON enters on again, and each region starts at its start dot: idle and still. Nothing in the chart remembers where a region was when the machine went off.


**How to evaluate.** Use Playwright to open each `file://` page. Step through it with its own controls at 1280×800 and at 390×844, try its interactive parts, and take screenshots you then look at. Spend comparable effort on each page.

For each explainer, judge:
- **Answer and understanding.** Does it state the answer up front? Could a newcomer answer the check questions and apply them to a new case afterwards?
- **The learner's own work.** Does the learner predict, commit, act or test anything, or only read and click Next? Does doing so teach, or is it decoration?
- **Pictures.** Does each picture teach without its text? Is it legible at 1280 and 390? Is it consistent from step to step, and free of clutter?
- **Mechanism and pattern.** Is the rule that decides the outcome visible as it happens? Does it show the general pattern beyond the example?
- **Correctness.** Note any wrong or misleading statement, count or picture.
- **Economy.** Length, pacing, scrolling, and whether it is overwhelming. A learner's time matters.
- **Phone experience.**
- **Accessibility, as far as you can observe it:** keyboard use, a text alternative for pictures, and reduced motion if you can test it.

**Report (under 1,200 words):**
1. For each pair: which of X and Y teaches better, and how decisively (clearly, slightly, or a toss-up). Give three to five specific reasons, citing steps and what you saw.
2. Across the pairs: the capabilities the winning explainers have that the losers lack.
3. Anything one method does consistently better than the other, whichever wins overall. For this item only, note which pages share a style without guessing who made them.
4. The single most important change that would make each losing explainer beat its partner.
