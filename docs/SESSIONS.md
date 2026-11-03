# Sessions: a model driven by events

**Status: the authoring and checking half of [the live machine](https://github.com/adewale/rayner/issues/88) is built; the player half is not.**
A scene can replay events through its own model as one schedule, and `rayner check`
draws and checks every state those events can reach. The reader's buttons, which would
send the same events from the page, are the remaining work, described at the end.

## The idea

Lantern made seeking a re-run with frames skipped: a frame is a function of the time and
of endpoints fixed when each animation begins. A reader's events can be the same kind of
input. A session turns each event into a member of an ordinary `Succession`: a `SetState`
whose next state the model computes from the state when it plays, then a keyed sync of
every view drawn from that state. Nothing about it is special to the engine, so a replayed
session seeks, traces and records like any other play.

```ts
import { Session } from 'rayner';

const machine = new Session(this, {
  start: machineAt(initial(chart)),       // where exploring starts
  events: events(chart),                  // what a reader's buttons would be
  next: (state, event) => machineAt(send(chart, state.config, event).config), // the tested model
  views: [main],                          // pictures of this.state, synced after each event
  match: matchByKey({ text: 'whole' }),   // keyed parts keep their identity (default 'keys')
});
this.state = machine.spec.start;
await this.play(machine.replay(['POWER_ON', 'START', 'FROTH']));
```

Each event records `{ kind: 'event', event }` as it begins, followed by its views' match
evidence, so a fidelity test can check the events a step replayed and the configuration
it ended in against an outside oracle. `statecharts` does this for the frother: the
transfer answer is reached by replaying XState's own three events, and the test checks
both the events and the final configuration against the XState fixture.

`SetState` gained the form a session needs: `new SetState(scene, (current) => next, { event })`
computes the next state from a copy of the state when it begins, so each member of a replay
starts where the one before left it.

## What check does with a session

After each case runs, `rayner check` explores every session breadth first from its start,
up to `limit` states (256 by default), and redraws each state as a resting picture. It
fails a state whose picture

- has colliding text or a connector over a label (the same rules as resting pictures),
- has no description,
- does not show its state, for views made from the scene's state (`viewMismatch`), or
- is described exactly as another reachable state is, so neither a reader nor a screen
  reader could tell them apart.

Breadth first means the events reported for a failing state are the shortest that reach
it, which is the shrinking a generated-sequence check would otherwise need. The report
lists each session's events and the number of states reached. `statecharts` reaches all
9 configurations of the frother machine. A picture that marks only the outer box fails at
`after POWER_ON`, `after POWER_ON, START` and `after POWER_ON, FROTH`.

## Limits

- **Distinguishable is not correct.** The description check proves states are told apart,
  not that each is drawn rightly: a picture that never marks frothing still differs between
  grinding-and-still and grinding-and-frothing, and passes. Say what must be true with an
  [invariant](EXTENDING.md#claim-something-on-every-frame) or a fidelity test.
- **Legibility is not explored.** Label sizes are measured during the authored run only.
- **The oracle comparison is the fixture's.** The statecharts model is compared with XState
  on the runs in `tools/oracle/statecharts.ts`; comparing generated sequences would need
  XState installed as a test dependency.
- **A state is compared as JSON.** Two states equal as JSON are one state.

## Not built yet: the player

Issue 88 asks for event buttons under a step's resting picture. The page already runs the
scene, so the design that keeps every guarantee is to treat a reader's events as a session
replayed from the step's resting state: the player appends the event to a log, re-runs
the scene to the step with `skipUntil`, and plays `session.send(event)`. The log is the
reader's state: it can sit in the URL beside `step`, so a session is a deep link that seeks
like any step. Leaving the step, opening a fresh link or switching case clears the log.
That needs a way for a step to declare its session to the player, the buttons with their
keyboard, screen-reader and reduced-motion behaviour, and a transcript line listing the
events. None of it changes the engine.

## Tried and not kept

- **A separate live-step API with its own `view` and `describe`** (the sketch in issue 88).
  Views and stage descriptions already do both; a second set would let them disagree.
- **Generated random event sequences.** For machines this size, breadth-first exploration
  reaches every state, reports the shortest failing events and needs no seed. A larger
  machine is sampled breadth first up to `limit`; random sequences remain an option there.
- **Running the model in the player as a separate runtime.** It would give up seeking and
  traces for the reader's own actions, which is what makes them checkable.
