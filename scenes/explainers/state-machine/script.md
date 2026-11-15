# Why does send() throw on a new WebSocket but not after close()?

- **Reader:** writes JavaScript that talks to a server over a WebSocket, has met "InvalidStateError" from send() (Chrome words it "Still in CONNECTING state"), and expects a send() after close() to fail the same way.
- **Answer:** send() sends only in OPEN: before open it throws InvalidStateError, and after close() it quietly sends nothing
- **Changed condition:** when send() is called: on the line after new WebSocket(url), while readyState is CONNECTING, or on the line after close(), while it is CLOSING. The first throws; the second returns, raises no error and sends nothing. Both follow from one rule, the readyState send() finds.
- **Reader's own work:** predict what the asked-about send() does before the answer; switch between the two programs; at the last step press send(), close() and the server's answers on the live socket, including events the socket cannot take in its state, each with its reason; answer the check questions, which ask about a second close() and a send() caught before open.
- **Checked against:** Node's own WebSocket, the global one, run in `model.test.ts` against the small server in `oracle/socket.ts`, which accepts the handshake and answers close only when told: every state the live step's buttons reach (23 from a new socket, 14 from the open one) and every event from each is run on a real socket, comparing readyState, whether send() threw and its error's name, the open and close events, and which messages reached the server once the connection ended. The page's two opening programs run as written, and the code panel's lines are found, in order, in `WebSocket.prototype.send.toString()`.
- **Grounding:** live: Node's own WebSocket, against a local server (undici 7.30.1 in Node 24.22.1 when written)
- **Leaves out:** close() before the socket opens (Node 24 then reports readyState CLOSING, but what it fires differs by release: error and close inside close() in Node 24.22.1, close inside it and then error and a second close in Node 24.0.0; browsers warn that the socket closed before it connected); a server that closes first; failed handshakes and errors; binary data; bufferedAmount, which the WHATWG standard grows on a send() after close() and Node 24 leaves alone; the console warning browsers print for such a send(); timing. The page counts at most two messages.

## Check yourself

1. In the open handler you call ws.close() and then ws.close() again. What does the second close() do?
   Nothing: the first close() made readyState CLOSING, and close() does nothing in CLOSING or CLOSED. It does not throw, and the socket stays CLOSING.
2. Before the socket opens, you wrap send() in try/catch so the error cannot crash the page. Once the open event fires, does the message go out?
   No. The throw means send() did nothing: no message waits for later, so once open fires the server has received 0 messages until you call send() again.

## Why this explainer

The error is a common question, and the usual answer, "wait for onopen", is right without saying why, so the next surprise goes unexplained: a send() after close() raises nothing and the message is lost. Both are the same machine. A WebSocket's readyState is one of four states, and send() is not an arrow between them: it never changes the state, and what it does is decided entirely by the state it finds. The diagram draws the arrows (the server accepting, close(), the server answering), and the code panel prints Node's own send(), whose two checks are the whole answer: CONNECTING throws, anything but OPEN returns.

The two programs are the changed condition. They differ only in when send() is called, and the reader predicts each before the answer. The live step lets the reader press the events, so the CONNECTING-or-CLOSING question can be tried rather than read, and every refusal says why (the server accepts the handshake once; there is no close() to answer yet).

The oracle is the real client. Node ships the browser's WebSocket, so the model's tests drive it through every state the page reaches against a server that answers only when told, which makes the race-free order of events the test's choice. That run also found the case the page leaves out: in Node 24, close() before open reports readyState CLOSING and fires its events in an order that matches neither the standard nor the next release (Node 24.22.1 fires error and close inside close(); Node 24.0.0 fires close, then error and close again); the page stops short of it with a bound rather than teach a quirk as the rule.

This explainer replaced a reducer of four rows that was checked against nothing but itself. It keeps that page's diagram, a Mermaid state diagram driven by the machine, and its code panel boxed from code spans, now spans of Node's real send().
