# Which events can change this session?

- **Reader:** writes event-driven code (a network client, a UI) and has handled a late callback, but has not modelled the states it can arrive in as a table of allowed state-and-event pairs.
- **Answer:** The reducer accepts an event only in a state that has a row for it, so a late OPENED cannot reopen a closed session
- **Changed condition:** the session history, connect then close or a connection that fails. It changes how the session reaches closed (CLOSE from open, or ERROR from connecting) but not the outcome: in both, the late OPENED finds no closed:OPENED row and is refused for the same reason. The comparison the explainer makes is the same event, OPENED, accepted from connecting and refused from closed.
- **Reader's own work:** predict whether the late OPENED reopens the closed session before the answer; send events to the live session on the diagram and the reducer, including events a state has no row for; answer the check questions, which ask about a second CONNECT, an added cancel row and a new reconnecting state.
- **Checked against:** Nothing external: the reducer is this explainer’s own four-row table, from the Lantern example in the scene’s sources. Its own test (`test/explain-models.test.ts`) checks that both histories end in closed and that each of the sixteen state-and-event pairs either follows its row or throws InvalidTransition.
- **Leaves out:** retry and reconnection, timeouts, an event queue, which attempt an event answers (request identity), asynchronous scheduling and a live network; throwing on a missing row is this reducer’s policy, not a requirement of state-machine libraries, which may ignore or queue the event instead.

## Check yourself

1. In the success history, a second CONNECT arrives while the session is open. What does the reducer do?
   It throws InvalidTransition and the session stays open, because the table has no open:CONNECT row. An event name the machine knows is still refused in a state with no row for it.
2. You add one row, connecting:CLOSE → closed, so a user can cancel while connecting. Can the late OPENED that follows the cancel reopen the session?
   No. The cancel moves the session to closed, and closed still has no OPENED row, so the late OPENED still throws. The new row changes which events reach closed, not what closed accepts.
3. A new state, reconnecting, gets a row reconnecting:OPENED → open. A late OPENED from the abandoned first attempt arrives while the session is reconnecting. What happens, and what does that say about the table?
   The row exists, so the session moves to open on the old attempt’s reply. The table matches states and event names; it cannot tell which attempt an OPENED came from. Telling them apart needs something the event carries, such as an attempt number, which this reducer does not model.

## Why this explainer

Taken on its own, OPENED means the connection is open, so a reader who handles events one at a time expects a late OPENED to reopen the session. The explainer starts from that late reply arriving after the session has closed, and the takeaway is that whether an event is accepted depends on the pair of state and event, not the event alone: OPENED is right from connecting, where a reply is expected, and refused from closed, where nothing is waiting for one.

The reducer is written as a table with one row per allowed pair, and the diagram draws each row as an arrow, so a state with no arrow leaving it under some event refuses that event. The two histories both test the late OPENED in closed, one reaching it through CLOSE and the other through ERROR, so the reader sees the refusal does not depend on how the session got there: closed has no rows at all.

The boundary is stated, not hidden: throwing InvalidTransition is this reducer’s choice for a missing row, and the table knows only states and event names. The third check question carries that limit to a machine that can be connecting again when an old reply arrives, which would need the event to say which attempt it answers. The diagram and the code explain the result of a supplied sequence of events; they do not simulate a network connection.
