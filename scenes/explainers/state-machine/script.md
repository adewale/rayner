# Which events can change this session?

A session starts idle. CONNECT moves it to connecting, where it waits for the connection's result. OPENED moves it to open; ERROR instead takes it to closed. If it opened successfully, CLOSE can take it from open to closed.

The current state matters as much as the event's name. OPENED means a connection completed, but does it follow that OPENED should make the session open whenever it arrives? Consider a late completion after the session has closed.

The reducer looks for a row matching both the current state and the incoming event. It has a connecting:OPENED row, but no closed:OPENED row. The late event therefore raises InvalidTransition and leaves the session closed. A completion from the earlier connection attempt cannot reopen it through a row that does not exist.

Follow either history through the diagram and code. Each accepted event selects a reducer row, returns the next state and moves the ring to that state. The success history reaches open before CLOSE; the failure history reaches closed through ERROR. Both refuse the later OPENED for the same reason: their current state is closed.

This small reducer treats an undefined state-and-event pair as an error. A different machine could ignore or defer an event instead. Here, the arrows define the allowed changes and a missing arrow is a refusal, not an instruction to guess the intended state.
