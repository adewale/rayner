# Machines: a model driven by events

A `Machine` is a scene's model driven by events. The scene replays events through it as one
schedule, `rayner check` draws and checks every state those events can reach, and at the step
where the machine last played the player gives the reader a button per event
([the player](#the-player)). Nine explainers are machines ([the table](#nine-machines)).

## Making one

```ts
import { Machine } from 'rayner';

// In the model module: a new state, or refuse(reason) where the state refuses the event.
//   if (!handled) return refuse(`no ${event} arrow leaves ${config.join(' or ')}, so the machine ignores ${event}`);

const machine = new Machine(this, {
  start: machineAt(initial(chart)),       // where exploring starts
  events: events(chart),                  // one button each in the player
  next: (state, event) => machineAt(send(chart, state.config, event).config), // the tested model
  views: [main],                          // pictures of this.state, synced after each event
  match: matchByKey({ text: 'whole' }),   // keyed parts keep their identity (default 'key')
});
this.state = machine.spec.start;
await this.play(machine.replay(['POWER_ON', 'START', 'FROTH']));
```

Since a frame is a pure function of time ([invariant 1](ENGINE.md#correctness-by-construction)),
a reader's events can be ordinary input to a schedule. Each event becomes a member of a
`Succession`: a [`SetState`](CHOREOGRAPHY.md#setstate) whose next state `next` computes from the
state when it plays, then a staged keyed sync of every view ([the default
transition](#the-default-transition)), or the event's authored transition. A
replayed machine therefore seeks, traces and records like any other play.

| Spec field | What it says |
| --- | --- |
| `start` | Where exploration starts; the scene need not be in it yet |
| `events` | Every event, in the order the player shows them; distinct and at least one |
| `labels` | A button's name for an event whose own name would not read well (default: the event) |
| `next(state, event)` | The model's step, from the model module: a new state, or `refuse(reason)` when the state refuses the event, the reason in the reader's words (`undefined` refuses with no reason) |
| `bound(state, event)` | Where the story stops though the model would go on: the reason, else `undefined` |
| `transition` | Authored motion per event ([below](#refused-events-bounds-and-authored-transitions)) |
| `views` | The pictures synced after each event, each a [`view(scene, draw)`](VIEWS.md) |
| `match` | How the views morph without an authored transition (default `matchByKey({ text: 'whole' })`: keyed parts keep their identity, and a keyed word that changes is replaced) |
| `runTime` | Each event's morph or transition in seconds (default 0.6), or a function of `{ event, before, after }` |
| `limit` | The most states exploration visits from one origin (default 256) |

`machine.send(event, from?)` builds one event's schedule for one state (the scene's state by
default) and refuses to play from any other, so a replay cannot drift from the model.
`replay(events, from?)` chains them. `outcome(state, event)` says what an event does: the next
state, a refusal with the reason `next` gave (`{ refused: reason }`, or `null` for none), or the
story's bound. `model(state, event)` is what `next` alone says, the bound aside. `after(state,
event)` is the next state or `undefined`. `reachable(from?)` lists every state reachable from `from` (default
`start`), breadth first, each with the shortest events that reach it. `lastPlayedIn` is the step
the machine last played in, and `playedUnder` what the scene showed (`scene.shown`) when it did.

Each event records `{ kind: 'event', event }` as it begins, followed by its views' match
evidence, so a fidelity test can check the events a step replayed and the state it ended in
against an outside oracle. `statecharts` does this for both its machines: the parent step
replays POWER_ON, START and GROUND, the frother step POWER_ON, START and FROTH, and the test
checks the events and each final configuration against the XState fixture.

**Views read the state, and nothing else that changes.** Exploration redraws each state after
the run, so a picture that also read a variable outside the state would be drawn wrongly. Every
`View` is made from `(scene, draw)`, and a draw may read `scene.shown` as well: which picture a
phase shows belongs there, not in the model. A machine never changes `shown`. It records what
was shown when it first played and refuses to play under anything else, and exploration draws
every state under it.

## Refused events, bounds and authored transitions

`next` returns `refuse(reason)` when a state refuses an event, with the reason in the reader's
words: `refuse('the ring is empty, so pop has no value to take')`. `refuse` is a small value from
`rayner`, and `isRefusal(value)` tells one apart from a state. Exploration does not follow it, the
player dims the event's button and says the reason, and `send` refuses it before anything plays,
naming the reason. `undefined` is still a refusal, with no reason: the player then says "Not
possible here". There is no separate list of allowed events and no separate reason function: the
branch of `next` that refuses says why, so the buttons, their reasons and the model cannot
disagree.

The reason is a clause, written to follow the event's name: the player says "pop: the ring is
empty, so pop has no value to take" when the button is pressed, and puts it in brackets in a
link's notice. Say which rule refuses, with the state's own values (which door, which box, which
search), since the reader pressed it to find out. A reason is the model's; where the model would
go on but the story stops, that is a [bound](#refused-events-bounds-and-authored-transitions), not
a refusal.

**Why one way.** A separate `why(state, event)` used to give the reason. It had to decide again
which rule refused (python-dict's ran the key's search a second time), nothing checked that it
agreed with `next`, and eight of the nine machines left it out, so their players said "Not
possible here". A reason returned from the branch that refuses cannot name a rule other than the
one that refused, and costs one line where the refusal is. `why` is gone; a spec that still has
one is refused with what to write instead.

A `bound` is different: the model would take the event, but the explainer's story ends before
it (token-bucket's client sends ten requests). Exploration does not follow it either, and the
player says the story stops there rather than that the model refuses. A bound only bounds:
`rayner check` fails one placed on an event the model refuses anyway, since that is a refusal.

An event may have authored motion instead of the keyed morph. `choreograph(current, target)`
names the keyed parts of a view's picture and of its target, and each call animates some of
them in the author's order; `rest()` lands every part no call named, so a transition that
forgets a part still ends on the target. From `ring-buffer`, with the refused push left out:

```ts
transition: {
  push: (t) => {
    const { before, after } = t, c = t.choreograph(ring);  // ring's parts, from its picture now to its picture of `after`
    const slot = before.tail;
    return new Succession([
      arrive(c, before, after, false),                                  // push(v) comes in
      ...outline(c, slot, 0.35),                                        // the slot at tail is outlined
      together([
        c.enter(`ring:value:${slot}`, { from: `ring:incoming:${pushArg(after.operation)}` }), // the value grows from push(v)'s
        c.morph(`ring:slot:${slot}`),
      ]),
      together([turn(c, 'tail', before.tail, after.tail), fields(), c.rest()]), // tail turns round the ring; the rest lands
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
| `travel(key, token, path)` | A token passing along a path, which the target does not have (a message on its arrow, an event walking a link): returns `appear`, `move` and `leave` for the author to place beside other motion. state-machine, statecharts and oauth-pkce use it |
| `rest()` | Every keyed part not yet handled: morphed, faded in or faded out |

`from(key)`, `to(key)`, `has(key, side?)` and `keys(side)` read the two pictures without animating.

A transition is built from `{ event, before, after, target(view), choreograph(view) }` when its
turn comes, from the pictures on screen then, and begun through the scene, so a part that fades
out leaves the picture. A part may leave and enter again, which replaces it in place. A part
brought in is in the picture from the start but unseen, and joins when its turn comes, so
`play()` never takes it for a new mobject. When the transition ends, each keyed part of each view
takes its drawn counterpart's data in place, in the drawn stacking order: nothing moves, and
every part keeps its identity for the next event.

## The default transition

An event with no authored transition morphs each view to the picture of the state it reaches, by
key and staged: parts only the old picture has shrink and fade out over the first half, parts
only the new picture has grow and fade in over the second, and parts both have morph throughout.
A keyed Text whose words change counts as gone and come (`text: 'whole'`), so it is replaced,
not morphed glyph by glyph. A new machine therefore reads at every frame without authored motion:
a word never sits on top of the word replacing it. Parts without a key under no keyed part fade
the same way. Landing is the sync's own, so it ends exactly on the state's picture.

It replaced an unstaged keyed sync (`match: 'key'`), in which every part that went faded out
while every part that came faded in, over the same time, and a keyed word that changed was morphed
glyph by glyph by place. The choice was made by drawing the reader's presses frame by frame
(`runLive` with an animating sink) for python-dict, which authors no transitions, and for
ring-buffer with its transitions taken out, under three defaults:

- **The unstaged keyed sync.** At mid-press python-dict's panel showed "KeyError" and "not
  found", and "pear is still stored, in entry 1." and "Slot 0 has never been used…", on top of
  each other, half faded, for about a third of the press; ring-buffer's operation card showed
  "push 7" and "pop" overlapping, and its head, tail and length values sat on each other.
- **`choreograph(view.current, target).rest()`, staged** (what goes fades out, what persists
  morphs, what comes fades in). A keyed part that persists morphs whole, so a cell whose word
  changed morphed "KeyError" into "not found" letter shape by letter shape, unreadable for most of
  the press. Worse, `rest()` sees only keyed parts: python-dict's note and ring-buffer's readouts
  and card values, which are unkeyed, did not move at all and jumped to the new words in the
  landing frame.
- **The keyed sync, staged.** No frame shows two words in one place: the old words are gone by
  halfway and the new ones come after, while the slots, arrows and rings that both pictures have
  move throughout. Every part, keyed or not, takes part. This is the default.

Two explainers move differently, and no resting picture changed. python-dict authors no
transition, so its presses and replays now replace a changed word instead of morphing it.
monty-hall authors every event but `pick` and `stay`, whose line ("Pick a door" becoming "You
picked A") was morphed glyph by glyph into a blot for a few frames and now fades out and the new
line in. The other seven author every event's transition and are unchanged, frame for frame. A
machine that wants other motion authors a `transition`.

## What check does with a machine

After each scenario runs, `rayner check` runs the scene again to the resting picture of the step
each machine last played in, the stage the reader saw it on, and explores there. A machine whose
views are not on that stage is reported, since its states could not be checked. Exploration
visits every state breadth first from `start`. When the machine's state at that step is not one
of those and some event moves it, exploration also visits every state reachable from there, since
the player lets the reader send events from there. Each origin visits up to `limit` states. Each state is redrawn as a resting
picture, and fails if it

- has colliding text or a connector over a label (the same rules as resting pictures),
- shows a label under 14 px at a 1280 px stage,
- has no description,
- does not show its state (`viewMismatch`), or
- is described exactly as another reachable state is, so neither a reader nor a screen
  reader could tell them apart.

From every state it reaches, exploration plays every authored transition, checks each invariant
a quarter, half, three quarters and all the way through, and requires the transition to end on
the pictures of the state it reaches, compared as rendered, so the landing moves nothing. A
transition that ended elsewhere would leave the view there for good, since a rebuilt picture
keeps its place.

Breadth first means the events reported for a failing state are the shortest that reach it,
which is the shrinking a generated-sequence check would otherwise need. `statecharts` reaches all
9 configurations of the frother machine. A picture that marks only the outer box fails at
`after POWER_ON`, `after POWER_ON, START` and `after POWER_ON, FROTH`.

## Limits

- **Distinguishable is not correct.** The description check proves states are told apart,
  not that each is drawn rightly: a picture that never marks frothing still differs between
  grinding-and-still and grinding-and-frothing, and passes. Say what must be true with an
  [invariant](EXTENDING.md#hold-an-invariant-on-every-frame) or a fidelity test.
- **Phone close-ups are not explored.** Each explored state's labels are measured at a
  1280 px stage by the same legibility sink a run uses; the phone's close-ups are worked
  out for the authored run only. On a phone the player shows the whole picture while the reader
  explores, and Next view tours the step's own close-ups. The review records, at 390 px, the
  smallest label of what the events changed at its best view (`changedLabelPx`) but does not
  require 12 px there: at token-bucket's live step the request boxes a press changes read at
  4.5 to 6.7 px in every view, since the step's close-ups were planned for its own picture.
- **A large machine is sampled.** Exploration stops at `limit` states per origin, so
  ring-buffer's 256 states are a sample, and a reader can press their way to a ring no check drew.
  `describeExplainer` counts states from `start` only.
- **The oracle is XState's explored graph.** `tools/oracle/statecharts.ts` records every
  configuration XState reaches and where every event leads, for every chart. The model is
  compared with that whole graph, and generated event sequences walk it too, so no XState
  install is needed in tests; regenerating the fixture needs the pinned release.
- **A state is compared as JSON.** Two states equal as JSON are one state.

## The player

At the step where a machine last played, the reader can drive it: one button per event under the
step's caption, then **Undo** and **Reset**. [Controls and accessibility](REFERENCE.md#controls-and-accessibility)
gives the reader-facing contract: what the buttons say, how a refused event explains itself, what
Undo, Reset and the keyboard do, and what a screen reader hears. Every one of the nine machines
is live at its step, in every scenario that plays it (oauth-pkce without the attacker plays none).
This section says how it works and why.

**Which step is live: the step the machine last played in.** There is no declaration. The step a
machine last played in (`lastPlayedIn`) is the stage `rayner check` explores it on, so a reader
never drives a machine on a stage the check did not see. A separately declared step could name one
exploration never checked, or one whose stage no longer holds the machine's views (token-bucket's
last step clears them). When two machines last play in one step, the one made later is live there.
`describeExplainer` reports the step as each machine's `step`.

**Where the reader starts.** Where the step leaves the machine: its state at the resting picture.
Three explainers' live steps leave their machine finished: token-bucket's client has sent all ten
requests, both of latest-search's responses have landed, and oauth-pkce's sign-in has run to its
end. When no event goes anywhere from the step's state, the reader's events start from the
machine's `start` instead, and the line over the buttons says "send the events again, in your own
order". The first event redraws the views at the start, in place, as exploration draws a state,
and plays from there. Which of the two applies is a function of the step, so the URL does not say
it (`logStart` in `app/embed-live.ts`).

**The events are the reader's state, and sit in the URL.** A press appends the event to a log,
written beside the step as `sent=push,push,pop` (commas between events, a space as `+`, a colon
kept: `sent=open+B:+goat,stay`; `sent` is a reserved setting id). The picture of a log is the scene
run again to the step's resting picture, then the log played through `machine.send` with every
frame skipped (`runLive`); a press plays its last event frame by frame from the picture of the log
before it, from a run held there when there is one ([what a press costs](#the-player)). A fresh
load of the URL runs the same, all skipped, so a link reopens the same picture, and seeking keeps
its guarantee: a frame is a function of time and of the log. The run stops in the live step as soon
as its picture stops changing (at the end of the play or wait that reaches the step's hold, or as
the step ends), so code a scene runs between its last play and its next step never reaches the
reader's stage. The machine plays under what the scene showed when it played, as exploration draws
it.

A link's events are checked against the machine before anything is drawn: the longest prefix it
takes is replayed, and a notice names the first event it refused or that is past where the story
stops. Each press, Undo and Reset adds a history entry, as a step does, so Back takes an event
back. Copy link keeps the events; a share page, which shows a step's own picture, is used only
when none were sent. Without JavaScript, the transcript lists under a live step the events a
reader can send there: "Try it: send push, pop.", or "Try it: from the start, send AUTHORIZE…"
where the step leaves its machine finished.

**How it is checked.** `test/browser/explain-live.test.ts` builds the nine pages and, at each
live step of the default scenario (twelve steps: statecharts, latest-search and python-dict have
two machines each), presses every event the model takes, two events deep and up to six states per
step, each played in real time. At every state it checks that each button's kind, `aria-disabled`,
reason and name agree with `outcome`, that the URL holds the events, that a press changed the
picture when it changed the state, and that a fresh load of the URL draws the same SVG and the
same buttons. A button set to refused where the model takes the event fails the check (the
deliberate defect). It also checks the keyboard, a refused press, a link with a refused event,
Back, Reset, and leaving the step. `test/embed-live.test.ts` checks the logic in Node: the live
step, the kept prefix, the URL round trip, where the log starts, and that a log's picture is the
same however it is reached, animated or not.

`rayner review` and the catalog review (`npm run demos:review`, three shards in CI) also open the
live states, by their links, at 390 and 1180 px ([reader review](REFERENCE.md#reader-review)).
At each live step they visit every state one press from where the reader's events start, however
many (two to five here); then, breadth first, the states further on until six; and the farthest
state the machine reaches as the sixth, each by its shortest events. The pictures one press away
are the ones every reader who touches a button sees; breadth first keeps each link the shortest
that reaches its state, so a failure names the fewest events; and the farthest state is where a
story's machine ends up (a full ring, the tenth request, both responses landed), the picture most
likely to crowd. Exploration has already drawn every reachable state in Node; this is the served
page's evidence for a bounded sample. There the review checks what applies of a resting step (the
caption, no overflow, no console errors, the stage painting exactly the records the state draws,
and the reader's views showing what the events newly emphasised, else the artwork they changed,
whole and unclipped), that the buttons are what `outcome` gives, and that every label the whole
picture paints reads at least 14 px as at a 1280 px stage, measured from the served page's own
transform. For the nine machines that is 107 states over 21 live steps and every scenario, 214
visits: the catalog review of those nine explainers took 7 min 13 s, 181 s of it the live states
(about a minute for each of CI's three shards), and ring-buffer's `rayner review` went from 44 s
to 75 s. The first state at each width opens as a fresh load of its link and the rest through the
history, as Back reaches them, which draws the same picture at a third of the time. A label drawn tiny only in a
state an event reaches fails it (`test/browser/explain-live-review.test.ts`, the deliberate
defect); `rayner check` fails the same label first, in Node.

**What a press costs.** Running the scene again to the step is most of a press's cost: the
events themselves take a few milliseconds each. So the player holds the run at the picture of the
reader's last log (`runLive` with `keep`, its `session`), and a press that extends that log by one
event plays only the new event from the held picture, exactly as a fresh run of the longer log
plays its last event. The first press at a step, Undo, Reset, Back and a link run afresh, and the
run they make is held in its turn. A held run whose play was cut short (a press during a play) is
dropped, since its scene may have stopped part-way. `test/embed-live.test.ts` checks that a held
run's every frame is the fresh run's, and `test/browser/explain-live.test.ts` that pictures
reached by pressing, now through held runs, are the ones a fresh load of the link draws.

`node tools/live-cost.ts [--cpu 4]` measures it on the built pages: for each live step of the
default scenario it presses six events in Chromium at 1280 × 900 (after one unmeasured press),
each press extending the log, with Reset where no event goes on, and times each from the click to
the first new picture on the stage (the animation starting), to the landing, and to the landing
with motion reduced; in Node it times `runLive` of the same logs, no frame drawn. Median / worst
in milliseconds, on a shared 4-core container (load about 3), before and after holding the run;
4× is Chromium's CPU throttling, a stand-in for a phone:

| Live step | Node: run to the step and the log | First frame, before: 1× / 4× | First frame, held: 1× / 4× | Reduced motion, landed, held: 4× |
| --- | --- | --- | --- | --- |
| `ring-buffer` `result` | 139 / 194 | 127 / 144 · 579 / 625 | 10 / 37 · 31 / 53 | 93 / 112 |
| `state-machine` `terminal` | 110 / 127 | 102 / 128 · 521 / 629 | 7 / 16 · 22 / 43 | 50 / 79 |
| `statecharts` `parent` | 103 / 183 | 95 / 114 · 403 / 651 | 6 / 17 · 20 / 25 | 57 / 67 |
| `statecharts` `frother` | 166 / 213 | 170 / 196 · 600 / 947 | 14 / 17 · 25 / 45 | 54 / 107 |
| `token-bucket` `later` | 190 / 220 | 124 / 194 · 647 / 668 | 5 / 9 · 18 / 29 | 46 / 83 |
| `monty-hall` `choice` | 23 / 30 | 27 / 35 · 151 / 292 | 12 / 22 · 41 / 79 | 19 / 57 |
| `latest-search` `overwrite` | 29 / 41 | 31 / 35 · 137 / 197 | 8 / 40 · 21 / 110 | 38 / 59 |
| `latest-search` `reader-guard` | 89 / 167 | 78 / 93 · 327 / 515 | 7 / 89 · 17 / 267 | 19 / 52 |
| `oauth-pkce` `any-order` | 147 / 168 | 139 / 173 · 509 / 657 | 12 / 159 · 27 / 479 | 76 / 555 |
| `just-bash` `lesson` | 138 / 157 | 117 / 168 · 519 / 822 | 13 / 18 · 29 / 40 | 59 / 95 |
| `python-dict` `broken` | 42 / 49 | 49 / 70 · 249 / 289 | 11 / 16 · 19 / 28 | 55 / 100 |
| `python-dict` `missing` | 84 / 91 | 74 / 106 · 347 / 401 | 13 / 16 · 26 / 39 | 42 / 54 |

Before, every press ran the scene again, and at 4× six of the twelve steps took over half a second
to start moving (ring-buffer, state-machine, frother, token-bucket, oauth-pkce, just-bash). Held,
a press starts in tens of milliseconds; the worsts left are the presses after a Reset, which run
afresh (oauth-pkce's sign-in runs to its end first). Landing takes the event's own motion on top:
0.8 to 2.1 s, which is authored, not overhead.

**Not done.**
- The [benchmark](https://github.com/adewale/rayner/blob/main/bench/explainers/README.md) has not been re-run with the buttons.
- An event whose name has a comma cannot be written in a link.

## Nine machines

| Explainer | Live at | State | Events | What is drawn from state | Explored |
| --- | --- | --- | --- | --- | --- |
| `statecharts` | `parent`, `frother` | A chart's configuration and the boxes it is in | The chart's events, through the model's `send` (`drivenNext`); an event the configuration does not handle is refused, as SCXML discards it, naming the boxes without its arrow | The chart, its active boxes and the arrows they light | 5 and 9 configurations; every event authored: a token runs along the arrow of the state that handled it |
| `ring-buffer` | `result` | `RingState`: the buffer, the last operation and its result, outlines, the tray, the next value | `push`, `pop`; a pop of an empty ring is refused, a push to a full one returns Full, and a push after the value 9 is past the story's bound | Slots, values, pointers, outlines, push(v), the next value, the tray; the readout and card values | 256 states sampled per scenario, every transition played |
| `state-machine` | `terminal` | `SessionState`: the session, the last event and what it returned, the row read, the links travelled | `CONNECT`, `OPENED`, `ERROR`, `CLOSE` (none refused: a throw is the lesson) | The diagram with its trail (`Diagram.picture`), the ring, the lit row or throw; the card | All 21 states per scenario, every transition played |
| `token-bucket` | `later` | `BucketState`: tokens, last refill and every call so far (arrival, 200 or 429, balance found and left) | `request`: the next of the client's ten scheduled requests arrives; the bucket refills on arrival, so there is no tick, and an eleventh request is past the story's bound | The bucket's level, the balance chart, the request boxes and the readout | 11 states per rate; a request's refill climb is one `Follow`, then a token leaves for its box or a 429 ring appears |
| `monty-hall` | `choice` | `Round`: what the reader knows (the pick, the door opened and what it showed, stay or switch, where the car was shown) | `pick X`, `open X: goat` or `car`, `stay`, `switch`, `car behind X`; the rules refuse a second pick, the host opening your door or opening twice, the informed host opening the car, and a decision after the car is shown | The three doors | 46 rounds with the informed host, 52 with the random one; every round is a cell of the strip, with its winner |
| `latest-search` | `overwrite`, `reader-guard` | `RaceState`: tickets, the event log, what the page shows and every write | `start A`, `start B`, `A lands`, `B lands` (B starts after A; a response lands once, after its search started) | The timeline: search bars, landings and the page's spans, a stale span outlined | 10 states per machine, unguarded and guarded: every interleaving; the guarded page never shows a stale result (an invariant), the unguarded one does after two orders |
| `oauth-pkce` | `any-order` | `SignIn`: the request and its challenge, who holds the code, each app's answer, whether the code is spent | `AUTHORIZE`, `AUTHORIZE_S256`, `REDIRECT`, `INTERCEPT`, `CLIENT_REDEEMS`, `APP_REDEEMS`; a code is used once (RFC 6749 §4.1.2) | Three lifelines across the browser and TLS lanes, each message in its slot with a refusal's reason | 20 states; with a challenge the malicious app gets no token in any order (an invariant, and a deliberate defect that sends the real verifier fails it) |
| `just-bash` | `lesson` | `ShellSession`: the shells the caller holds and what `cat` printed on each | The script's lines: the pipeline on the newest shell, `cat` on the newest or on s0, `ls` (refused, as `exec` refuses it); a second write is past the script's bound | s0 and s1, the write's arrow, each cat's output, the kept shell outlined | 6 states; s0 stays the empty shell through every transition |
| `python-dict` | `broken`, `missing` | `DictState`: the eight-slot index and the entries, how a deletion leaves its slot (CPython's D, or the counterfactual that empties it), and the last event's search | `del d[0]`, `del d[8]`, `del d[16]` (refused when the key's search cannot find it, as Python raises KeyError), `d[0]`, `d[8]`, `d[16]`, `d[24]` (a missing key is an answer, not a refusal) | The slot row, the search's arrows, the entry table with [keyed cells](REFERENCE.md#drawing-kit), the panel and the note | 40 states with emptying (`broken`), 45 with CPython's marker (`missing`); the staged keyed morph writes D (or a dash) into the slot and dashes into the entry row in place |

What each refuses, in its model's words (the tests pin each reason):

- `statecharts`: an event no state the chart is in handles: "no GROUND arrow leaves idle or on,
  the box around it, so the machine ignores GROUND" (`drivenNext`).
- `ring-buffer`: a pop of an empty ring: "the ring is empty, so pop has no value to take". A push
  to a full ring is not refused: it returns Full, which the ring shows.
- `state-machine` and `token-bucket` refuse nothing: a throw and a 429 are answers the picture
  shows. token-bucket's eleventh request is past the story's bound.
- `monty-hall`: which rule of the game forbids the move: "you picked door A already, and you pick
  once", "the host opens a door only after you pick one", "door A is yours, and the host never
  opens your door", "the host knows where the car is, and never opens its door", "the host opened
  door B already, and he opens one door", "you stay or switch once the host has opened a door",
  "the host showed the car behind door B, so the round is over", "you chose to stay already",
  "the car is shown once you have stayed or switched", "door B is open and shows a goat", "the car
  was shown behind door C already".
- `latest-search`: "“ca” is typed before “cat”, so search A starts first", "search A has started
  already, and each search starts once", "search B has not started, so it has no response to
  land", "search A’s response has landed already, and a response lands once".
- `oauth-pkce`: "the client has sent its authorization request already, and a sign-in sends one",
  "there is no code to redirect yet: the client has not sent its authorization request", "the
  redirect has brought the code to the client already", "the malicious app has caught the redirect
  already", "the malicious app has no code to redeem: no redirect has brought it one", "the client
  has redeemed the code already, and the server answered Access token".
- `just-bash`: ls: "exec throws “Unknown model command: ls”, since the model runs only echo, tr and
  cat". A second write is past the script's bound.
- `python-dict`: a deletion whose search cannot find its key: "the search for 0 stops at
  never-used slot 7, so del d[0] raises KeyError and changes nothing".

Drawing each main picture from state can reach pictures the story never shows, and exploration
checks those too. In ring-buffer it found two states that differed only in the next value to be
pushed and looked alike (the ring now shows "next N"), and a long tray running into the bottom
pointers' labels. In latest-search it reached an order no scenario shows ("ca" answers before
"cat" is typed). `state-machine`'s diagram is drawn by the view, so the live diagram leaves the
stage; `Diagram.showBy(view)` keeps the stage describing it.

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
- **Starting the reader's events at the step's state, always.** Three explainers' live steps
  leave their machine finished, so every button would be disabled there.
- **A token-bucket of free requests plus a refill tick.** It would contradict the caption (the
  bucket refills lazily, on arrival) and reach about 350,000 states; driving it by the client's
  own schedule keeps it honest and small.
- **Disabling the buttons while an event plays.** A press then landed nowhere; landing the playing
  event and playing the next keeps every press, and the picture is the log's either way.
- **Leaving disabled buttons `disabled`.** A disabled button cannot take focus, so a keyboard or
  screen reader user could not learn why an event is refused; `aria-disabled` keeps it in the Tab
  order with its reason as its description.
- **A key per event.** The player's keys are the arrows and `+`, `-` and `0` on the focused stage,
  and a key per event could not be learned for monty-hall's fourteen events.
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
