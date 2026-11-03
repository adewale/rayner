# Which events can change this session?

A network session connects in two moves. CONNECT takes it from idle to connecting, and the network's reply decides what happens next: OPENED moves it to open, ERROR to closed. Once open, CLOSE ends it. Now suppose the session has closed, and only then a reply from an earlier connection attempt arrives: OPENED. Taken on its own, OPENED means the connection is open. Should the session reopen?

It should not, and the code that keeps it closed is a reducer: a function given the current state and an event, which returns the next state. This reducer is a table with one row for each state-and-event pair it allows: idle:CONNECT, connecting:OPENED, connecting:ERROR and open:CLOSE. A late OPENED in closed looks for the row closed:OPENED, finds none and throws InvalidTransition, so the state stays closed. The reducer accepts an event only in a state that has a row for it.

That is why the same event can be right in one state and refused in another. OPENED is accepted from connecting, where a reply is expected, and refused from closed, where nothing is waiting for one. Draw the table as a diagram and each row is an arrow; a state with no arrow leaving it under some event refuses that event.

Follow either history through the diagram and the code. Each accepted event lights its row, the reducer returns the next state and the ring moves to it. The success history reaches open and then closes; the failure history reaches closed through ERROR. Both refuse the late OPENED for the same reason: they are in closed, and closed has no rows at all.

Throwing is this reducer's choice for a missing row; another machine could ignore the event or queue it. And the table only knows states and event names. It cannot tell which connection attempt sent an OPENED, so a machine that can be connecting again when an old reply arrives would need the event to say which attempt it answers.
