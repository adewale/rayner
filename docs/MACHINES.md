# Machines: a model driven by events

**Status: the authoring and checking half of [the live machine](https://github.com/adewale/rayner/issues/88) is built; the player half is not.**
A scene can replay events through its own model as one schedule, and `rayner check`
draws and checks every state those events can reach. The reader's buttons, which would
send the same events from the page, are the remaining work, described at the end.

## The idea

Lantern made seeking a re-run with frames skipped: a frame is a function of the time and
of endpoints fixed when each animation begins. A reader's events can be the same kind of
input. A machine turns each event into a member of an ordinary `Succession`: a `SetState`
whose next state the model computes from the state when it plays, then a keyed sync of
every view drawn from that state. Nothing about it is special to the engine, so a replayed
machine seeks, traces and records like any other play.

```ts
import { Machine } from 'rayner';

const machine = new Machine(this, {
  start: machineAt(initial(chart)),       // where exploring starts
  events: events(chart),                  // what a reader's buttons would be
  next: (state, event) => machineAt(send(chart, state.config, event).config), // the tested model
  views: [main],                          // pictures of this.state, synced after each event
  match: matchByKey({ text: 'whole' }),   // keyed parts keep their identity (default 'key')
});
this.state = machine.spec.start;
await this.play(machine.replay(['POWER_ON', 'START', 'FROTH']));
```

Each event records `{ kind: 'event', event }` as it begins, followed by its views' match
evidence, so a fidelity test can check the events a step replayed and the configuration
it ended in against an outside oracle. `statecharts` does this for both machines it
draws: the parent step reaches brewing by replaying POWER_ON, START and GROUND, and the
frother step reaches the transfer answer by replaying POWER_ON, START and FROTH. The test
checks the events and each final configuration against the XState fixture.

**A machine's views must be functions of the scene's state alone.** Exploration redraws
a state after the run, so a picture that also reads a variable outside the state is drawn
wrongly. Adding the coffee machine as a second Machine showed this: statecharts' picture depended on
a `phase` variable, so its second machine would have been drawn in the frother's layout.
The phase now lives in the state, and the picture is a `view(this, render)`, which also
lets the trace's view check compare it at every step. A machine now refuses, when it is
made, any view that is not a `view(scene, render)`, so the mistake cannot be written.

`SetState` gained the form a machine needs: `new SetState(scene, (current) => next, { event })`
computes the next state from a copy of the state when it begins, so each member of a replay
starts where the one before left it.

## What check does with a machine

After each case runs, `rayner check` explores every machine breadth first from its start,
up to `limit` states (256 by default), and redraws each state as a resting picture. It
fails a state whose picture

- has colliding text or a connector over a label (the same rules as resting pictures),
- shows a label under 14 px at a 1280 px stage,
- has no description,
- does not show its state, for views made from the scene's state (`viewMismatch`), or
- is described exactly as another reachable state is, so neither a reader nor a screen
  reader could tell them apart.

Breadth first means the events reported for a failing state are the shortest that reach
it, which is the shrinking a generated-sequence check would otherwise need. The report
lists each machine's events and the number of states reached. `statecharts` reaches all
9 configurations of the frother machine. A picture that marks only the outer box fails at
`after POWER_ON`, `after POWER_ON, START` and `after POWER_ON, FROTH`.

## Limits

- **Distinguishable is not correct.** The description check proves states are told apart,
  not that each is drawn rightly: a picture that never marks frothing still differs between
  grinding-and-still and grinding-and-frothing, and passes. Say what must be true with an
  [invariant](EXTENDING.md#hold-an-invariant-on-every-frame) or a fidelity test.
- **Phone close-ups are not explored.** Each explored state's labels are measured at a
  1280 px stage by the same legibility sink a run uses; the phone's close-ups are worked
  out for the authored run only.
- **The oracle is XState's explored graph.** `tools/oracle/statecharts.ts` records every
  configuration XState reaches and where every event leads, for every chart. The model is
  compared with that whole graph, and generated event sequences walk it too, so no XState
  install is needed in tests; regenerating the fixture needs the pinned release.
- **A state is compared as JSON.** Two states equal as JSON are one state.

## Not built yet: the player

Issue 88 asks for event buttons under a step's resting picture. The page already runs the
scene, so the design that keeps every guarantee is to treat a reader's events as a machine
replayed from the step's resting state: the player appends the event to a log, re-runs
the scene to the step with `skipUntil`, and plays `machine.send(event)`. The log is the
reader's state: it can sit in the URL beside `step`, so the log is a deep link that seeks
like any step. Leaving the step, opening a fresh link or switching case clears the log.
That needs a way for a step to declare its machine to the player, the buttons with their
keyboard, screen-reader and reduced-motion behaviour, and a transcript line listing the
events. None of it changes the engine.

## Where it does not fit

`ring-buffer` and `state-machine` also replay events one at a time, and neither became a
machine. Between events each animates its main picture by hand: a value token copied into
its slot, an outline drawn, a diagram walked, a code row boxed. Their main pictures are
therefore not views of the state, only their readouts are, and exploring their states
would redraw the readouts over a stale picture and judge it. Making them machines would
first mean drawing each main picture from the state, which would change two published
lessons' animations; that is a separate decision from adopting the API.

## Tried and not kept

- **A separate live-step API with its own `view` and `describe`** (the sketch in issue 88).
  Views and stage descriptions already do both; a second set would let them disagree.
- **Generated random event sequences.** For machines this size, breadth-first exploration
  reaches every state, reports the shortest failing events and needs no seed. A larger
  machine is sampled breadth first up to `limit`; random sequences remain an option there.
- **Running the model in the player as a separate runtime.** It would give up seeking and
  traces for the reader's own actions, which is what makes them checkable.
