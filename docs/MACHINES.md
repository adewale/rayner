# Machines: a model driven by events

**Status: [the live machine](https://github.com/adewale/rayner/issues/88) is built: authoring, checking and the player.**
A scene can replay events through its own model as one schedule, and `rayner check`
draws and checks every state those events can reach. At the step where a machine last
played, the player gives the reader a button per event, which sends the same events from
the page ([the player](#the-player)). The benchmark has not been re-run with it yet.

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
The phase is now what the scene shows (`scene.shown.phase`), the configuration is the
model, and the picture is a `view(this, draw)` of both, which also lets the trace's view
check compare it at every step. A machine plays under one `shown`: it records it when it
plays and refuses to play under another, and exploration draws every reachable state under it.

**Exploration runs where the machine played.** `rayner check` used to explore every machine on
the stage the run ended with. A scene whose last step clears the machine's views away would then
be explored on a stage without them, and every check would pass with nothing to check; converting
token-bucket found this. A machine now records the step it last played in, and exploration runs the
scene again to that step's resting picture (a frame is a function of time, so the seek reproduces
it exactly) and checks every reachable state there. Explored without that stage, a machine whose
views are off the stage is reported, not passed. A machine now refuses, when it is
made, any view that is not a `view(scene, draw)`, so the mistake cannot be written.

`SetState` gained the form a machine needs: `new SetState(scene, (current) => next, { event })`
computes the next state from a copy of the state when it begins, so each member of a replay
starts where the one before left it.

## Refused events and authored transitions

`next` returns `undefined` when a state refuses an event. Exploration does not follow it,
`machine.after(state, event)` says so to a player that disables the event's button, and
`send` refuses it before anything plays. There is no separate list of allowed events: one
function says both, so the buttons and the model cannot disagree.

An event may have authored motion instead of the keyed morph. `choreograph(current, target)`
names the keyed parts of a view's picture and of its target, and each call animates some of
them in the author's order; `rest()` lands every part no call named, so a transition that
forgets a part still ends on the target. From `ring-buffer`:

```ts
transition: {
  push: ({ before, after, views, targets }) => {
    const c = choreograph(views[0].current, targets[0]);   // targets: each view's picture of `after`, placed where it lands
    return new Succession([
      c.enter(`ring:mark:${before.tail}`, { create: true }),          // outline the slot at tail
      new AnimationGroup([
        c.enter(`ring:value:${before.tail}`, { from: 'ring:incoming:6' }), // the value grows from a copy of push(v)'s
        c.morph(`ring:slot:${before.tail}`),
      ]),
      new AnimationGroup([turnTail(c), c.rest()]),                    // tail turns round the ring (Follow); the rest lands
    ]);
  },
},
```

| Call | What it does |
| --- | --- |
| `morph(key)` | The current part becomes its target |
| `enter(key, { from?, create? })` | A part only the target has: faded in, drawn, or grown from a copy of the current part `from` |
| `leave(key)` | A part only the current picture has fades out and leaves the picture |
| `insert(key, like)` | An unseen copy of `like`, for the author to animate; it must end as the target part, or leave when the target has none (a token walking a link) |
| `own(key)` | The author animates this current part (with `Follow`, say) and must end it as the target part |
| `rest()` | Every keyed part not yet handled: morphed, faded in or faded out |

A part may leave and enter again, which replaces it in place. A part brought in is in the
picture from the start but unseen, and joins when its turn comes, so `play()` never takes it
for a new mobject. The transition is built when its turn comes, from the pictures on screen
then, and begun through the scene, so a part that fades out leaves the picture. It plays over
the machine's `runTime`, which may be a function of the event and the states either side
(`ring-buffer` gives a refused push longer than a plain one). When it ends, each keyed part of
each view takes its drawn counterpart's data in place, in the drawn stacking order: nothing
moves, and every part keeps its identity for the next event. `send(event, from)` builds its
schedule for one state (the scene's state by default) and refuses to play from any other, so a
replay cannot drift from the model.

## What check does with a machine

After each scenario runs, `rayner check` explores every machine breadth first from its start, and plays every authored transition from every state it reaches: each invariant is checked a quarter, half, three quarters and all the way through, and the transition must end on the pictures of the state it reaches, compared as rendered, so the landing moves nothing. A transition that ends elsewhere would leave the view there for good, since a rebuilt picture keeps its place. It explores up to `limit` states (256 by default), and redraws each state as a resting picture. It
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

## The player

At the step where a machine last played, the reader can drive it: one button per event under
the resting picture, then **Undo** and **Reset**. Every one of the eight machines below is live
at its step, in every scenario that plays it (oauth-pkce without the attacker plays none).

**Which step is live: the step the machine last played in.** There is no declaration. A machine
already records the step it last played in (`lastPlayedIn`), and that is the step `rayner check`
explores it on: the scene run again to that step's resting picture, every reachable state drawn
and checked there. A separately declared step could be one exploration never checked, or one
whose stage no longer holds the machine's views (token-bucket's last step clears them). One fact
in one place: a scene makes a machine live at a step by playing it there last. When two machines
last play in one step, the one made later is live there. `describeExplainer` reports the step as
each machine's `step`.

**Where the reader starts.** Where the step leaves the machine, its state at the resting
picture. Wiring the eight explainers showed three steps that leave their machine finished:
token-bucket's client has sent all ten requests, both of latest-search's responses have landed,
and oauth-pkce's sign-in has run to its end. Every button there would be disabled. So when no
event goes anywhere from the step's state, the reader's events start from the machine's `start`,
the state exploration starts from, and the line over the buttons says "send the events again, in
your own order". The first event redraws the views at the start, in place, as exploration draws
a state, and plays from there. Which of the two applies is a function of the step, so the URL
does not say it (`logStart` in `app/embed-live.ts`).

**The events are the reader's state, and sit in the URL.** A press appends the event to a log,
written beside the step as `sent=push,push,pop` (commas between events, a space as `+`, a colon
kept: `sent=open+B:+goat,stay`; `sent` is a reserved setting id). The picture of a log is the
scene run again to the step's resting picture, then the log played through `machine.send` with
every frame skipped (`runLive`); a press plays its last event frame by frame from the picture of
the log before it. A fresh load of the URL runs the same, all skipped, so a link reopens the same
picture, and seeking keeps its guarantees: a frame is a function of time and of the log. The run
stops in the live step as soon as its picture stops changing (at the end of the play or wait
that reaches the step's hold, or as the step ends), so code a scene runs between its last play
and its next step never reaches the reader's stage. The machine plays under what the scene
showed when it played, as exploration draws it.

A link's events are checked against the machine before anything is drawn: the longest prefix it
takes is replayed, and a notice names the first event it refused or that is past where the story
stops, as an unknown step falls back to the first. Events for a step with no machine are left
out, with a notice. Showing another step, switching scenario, or opening a link without `sent`
starts with no events. Each press, Undo and Reset adds a history entry, as a step does, so Back
takes an event back. Copy link keeps the events; a share page, which shows a step's own picture,
is used only when none were sent.

**Buttons.** Each event's button says what `outcome` says from the state the events reached. An
event that goes somewhere is a plain button. One the model refuses, or one past where the story
stops (`bound`), stays focusable with `aria-disabled`, dimmed, the second dashed, and says why on
hover and on focus: the machine's `why`, else "Not possible here", or "The story stops here:"
and the bound's reason. The reason is the button's accessible description, and pressing it only
says why. A button is named by the machine's `labels` for its event, else the event itself:

```ts
new Machine(this, {
  events: BASH_EVENTS,
  labels: { RUN_PIPELINE: 'Run the pipeline', CAT_NEWEST: 'cat on the newest shell', CAT_S0: 'cat on s0', LS: 'ls' },
  // ...
});
```

A press during a play lands that event and plays the next. Undo and Reset draw their picture at
once. Under reduced motion every event lands at once, with the crossfade the player uses between
steps. On a phone the picture is shown whole while the reader explores.

**Keyboard and screen readers.** Tab reaches every event, refused ones too, and Enter or Space
presses it. There is no key per event: the player's keys are the arrows (step, or pan a zoomed
stage) and `+`, `-` and `0` on the focused stage, and a key per event could not be learned for
monty-hall's fourteen. The arrows do nothing on a button, so they never step away from the events.
A polite status line under the buttons says what each event did: the event, then what it changed
of the picture's description (the whole summary when no description changed). A refused press
says the event and why. The stage is `aria-busy` while an event plays, and its description, and
"What the picture shows", follow the picture the events land on.

**Transcript.** Without JavaScript the page's transcript lists, under a live step, the events a
reader can send there: "Try it: send push, pop.", or "Try it: from the start, send AUTHORIZE…"
where the step leaves its machine finished.

**How it is checked.** `test/browser/explain-live.test.ts` builds the eight pages and, at each
live step of the default scenario (ten steps: statecharts and latest-search have two machines),
presses every event the model takes, two events deep and up to six states per step, each played
in real time. At every state it checks that each button's kind, `aria-disabled`, reason and name
agree with `outcome`, that the URL holds the events, that a press changed the picture when it
changed the state, and that a fresh load of the URL draws the same SVG and the same buttons. A
button set to refused where the model takes the event fails the check (the deliberate defect).
It also checks the keyboard, a refused press, a link with a refused event, Back, Reset, and
leaving the step. `test/embed-live.test.ts` checks the logic in Node: the live step, the kept
prefix, the URL round trip, where the log starts, and that a log's picture is the same however
it is reached, animated or not.

**Not done.**
- Each press runs the scene again to the step, which takes 50 to 300 ms for these eight in Node
  before the event starts to move. Keeping a run suspended at the step would avoid it, at the cost
  of a second way to reach a picture.
- From the step's state the reader can reach states exploration, which starts at `start` and
  samples a large machine, never drew: ring-buffer's 256 are a sample.
- `rayner review` does not yet visit a live step and send events through the real page, and the
  benchmark has not been re-run with the buttons.
- An event whose name has a comma cannot be written in a link.

## Nine machines

| Explainer | State | Events | What is drawn from state | Explored |
| --- | --- | --- | --- | --- |
| `statecharts` | A chart's configuration and the boxes it is in | The chart's events, through the model's `send`; an event the configuration does not handle is refused, as SCXML discards it | The chart, its active boxes and the arrows they light | 5 and 9 configurations; every event authored: a token runs along the arrow of the state that handled it |
| `ring-buffer` | `RingState`: the buffer, the last operation and its result, outlines, the tray, the next value | `push`, `pop` (a pop of an empty ring, or a push past 9, is refused) | Slots, values, pointers, outlines, push(v), the next value, the tray; the readout and card values | 256 states sampled per scenario, every transition played |
| `state-machine` | `SessionState`: the session, the last event and what it returned, the row read, the links travelled | `CONNECT`, `OPENED`, `ERROR`, `CLOSE` (none refused: a throw is the lesson) | The diagram with its trail (`Diagram.picture`), the ring, the lit row or throw; the card | All 21 states per scenario, every transition played |
| `token-bucket` | `BucketState`: tokens, last refill and every call so far (arrival, 200 or 429, balance found and left) | `request`: the next of the client's ten scheduled requests arrives; the bucket refills on arrival, so there is no tick, and an eleventh request is refused | The bucket's level, the balance chart, the request boxes and the readout | 11 states per rate; a request's refill climb is one `Follow`, then a token leaves for its box or a 429 ring appears |
| `monty-hall` | `Round`: what the reader knows (the pick, the door opened and what it showed, stay or switch, where the car was shown) | `pick X`, `open X: goat` or `car`, `stay`, `switch`, `car behind X`; the rules refuse a second pick, the host opening your door or opening twice, the informed host opening the car, and a decision after the car is shown | The three doors | 46 rounds with the informed host, 52 with the random one; every round is a cell of the strip, with its winner |
| `latest-search` | `RaceState`: tickets, the event log, what the page shows and every write | `start A`, `start B`, `A lands`, `B lands` (B starts after A; a response lands once, after its search started) | The timeline: search bars, landings and the page's spans, a stale span outlined | 10 states per machine, unguarded and guarded: every interleaving; the guarded page never shows a stale result (an invariant), the unguarded one does after two orders |
| `oauth-pkce` | `SignIn`: the request and its challenge, who holds the code, each app's answer, whether the code is spent | `AUTHORIZE`, `AUTHORIZE_S256`, `REDIRECT`, `INTERCEPT`, `CLIENT_REDEEMS`, `APP_REDEEMS`; a code is used once (RFC 6749 §4.1.2) | Three lifelines across the browser and TLS lanes, each message in its slot with a refusal's reason | 20 states; with a challenge the malicious app gets no token in any order (an invariant, and a deliberate defect that sends the real verifier fails it) |
| `just-bash` | `ShellSession`: the shells the caller holds and what `cat` printed on each | The script's lines: the pipeline on the newest shell, `cat` on the newest or on s0, `ls` (refused, as `exec` refuses it); a second write is refused only to bound the script | s0 and s1, the write's arrow, each cat's output, the kept shell outlined | 6 states; s0 stays the empty shell through every transition |
| `python-dict` | `DictState`: the eight-slot index and the entries, how a deletion leaves its slot (CPython's D, or the counterfactual that empties it), and the last event's search | `del d[0]`, `del d[8]`, `del d[16]` (refused when the key's search cannot find it, as Python raises KeyError), `d[0]`, `d[8]`, `d[16]`, `d[24]` (a missing key is an answer, not a refusal) | The slot row, the search's arrows, the entry table with keyed cells, the panel and the note | 45 states with the marker, 40 with emptying; the keyed morph writes D (or a dash) into the slot and dashes into the entry row in place |

Making `ring-buffer` and `state-machine` machines meant drawing each main picture from state.
Their resting pictures stayed the same, except where exploration found something the story
never reached: two ring states that differed only in the next value pushed looked alike (the
ring now shows "next N"), and a long tray ran into the bottom pointers' labels (the tray row is
lower, and shows the most recent values that fit). `state-machine`'s diagram is drawn by the
view, so the live diagram leaves the stage; `Diagram.showBy(view)` keeps the stage describing it.

The next five kept their resting pictures too. Converting them found one engine gap and some
smaller things. **Token-bucket's last step clears the bucket away**, so exploration on the final
stage checked nothing; exploration now runs where each machine last played (above). A token-bucket
built as free requests plus a refill tick would have contradicted its caption (the bucket refills
lazily) and reached about 350,000 states; driving it by the client's own schedule keeps it honest
and small. Motion checks caught a monty-hall door and a token that appeared in one frame, and the
phone review caught a monty-hall emphasis that zoomed the predict step past its rule. Latest-search's
exploration reached an order no scenario shows ("ca" answers before "cat" is typed), and its stale
outline now means what it says: a result published after a newer search started.

## Tried and not kept

- **A separate live-step API with its own `view` and `describe`** (the sketch in issue 88).
  Views and stage descriptions already do both; a second set would let them disagree.
- **Generated random event sequences.** For machines this size, breadth-first exploration
  reaches every state, reports the shortest failing events and needs no seed. A larger
  machine is sampled breadth first up to `limit`; random sequences remain an option there.
- **Running the model in the player as a separate runtime.** It would give up seeking and
  traces for the reader's own actions, which is what makes them checkable.
- **Declaring the live step** (`step(name, { live: machine })`, or `machine.live()`). The step a
  machine last played in already says it, and it is the stage exploration checked; a second
  declaration could name a stage that was never checked.
- **Starting the reader's events at the step's state, always.** Three of the eight steps leave
  their machine finished, so every button would be disabled there.
- **Disabling the buttons while an event plays.** A press then landed nowhere; landing the playing
  event and playing the next keeps every press, and the picture is the log's either way.
- **Leaving disabled buttons `disabled`.** A disabled button cannot take focus, so a keyboard or
  screen reader user could not learn why an event is refused; `aria-disabled` keeps it in the Tab
  order with its reason as its description.
- **A trail laid over the diagram as a copy of the link.** The copy's route sat above the
  label's backing plate, so it crossed its own label (the route check said so), and a copy with
  the label drew the label twice. Drawing the whole diagram from state (`Diagram.picture`) has
  no overlay.
- **Landing a transition with a one-frame keyed morph.** Parts without keys (a readout's
  glyphs) faded out and back within a frame. **Landing by swapping in the drawn pictures** gave
  every part a new identity in the frame the next event's copy appeared, which the motion
  check could not pair. Landing in place keeps identities and moves nothing.
- **Building a transition when its schedule is built.** In a replay, the second event's
  transition held the first picture, which the first event's landing had replaced. It is built
  when its turn comes.
