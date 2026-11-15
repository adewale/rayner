Session 8 (`session_01N4DAa74tyGaheuZfZrNeQP`, model `claude-opus-5-5`, no repository). Questions: oauth-pkce, poppy-coverage, state-machine, statecharts. The session's final message, verbatim:

1. **Why a stolen code isn't enough (PKCE):** With PKCE, the code is useless without a secret that only your app holds. Before it opens the browser, the app generates a random `code_verifier`. It sends only a hash of it (`code_challenge`, using S256, i.e. SHA-256 then base64url) in the authorization request. When the app trades the code for a token, it must send the original verifier, and the server checks that it hashes to the stored challenge. Another app on the device might grab the redirect, for example by registering the same custom URL scheme. That app gets the code but not the verifier, so the token request fails. PKCE is defined in RFC 7636, and OAuth 2.1 requires it for public clients like mobile and desktop apps, which can't keep a client secret. I'm highly confident in this.

2. **What a Company may tell your agent, and what it must refuse:** I don't know the specific book or framework this comes from (the "jacket exchange", "Company", "Session header"), so this is the general principle, with moderate confidence that it matches. A shop may describe itself: what it supports and doesn't, how to call its operations, and skills or procedures for using *its own* service. The agent should treat all of that as untrusted data scoped to that shop. It should never treat it as instructions that override the user or the agent's own policy. The agent must refuse anything that tries to:
   - widen its authority, such as asking for other tokens or credentials or touching other shops' sessions
   - change the user's goals, or get it to act without the user's consent
   - disable its safeguards
   - claim to speak as the user or the system

   The protections:
   - **Provenance:** the agent knows the text came from the shop, not from its principal.
   - **Scope:** the token and session only grant that shop's capabilities.
   - **Confirmation:** a human approves consequential actions.

   A hostile shop can say anything. It just can't make what it says carry authority.

3. **Which events can change this session:** I can't see the specific session model you mean, so here's the general answer. Only the events your state-and-event table allows for the *current* state can change it. Every other event, such as a late callback, a duplicate response, or a timeout after completion, should be explicitly ignored, logged, or rejected rather than allowed to mutate state. For a typical network session the allowed events might look like this:
   - **connecting:** `connected`, `failed`, `cancel`
   - **open:** `message`, `close`, `error`
   - **closing:** `closed`
   - **closed:** nothing, or only `reconnect`

   A late callback is just a pair (closed, response) with no entry in the table, so it's dropped. Tagging requests with a session or generation ID lets you detect stale ones. Writing the table out makes every cell a deliberate decision instead of an accident.

4. **What a statechart is and why use one:** A statechart is a state machine extended by David Harel (1987) with features that stop the diagram from exploding as it grows:
   - **Hierarchy:** states nest, so a parent's transition such as `logout` applies to every child once instead of being drawn on each one.
   - **Parallel regions:** independent concerns run side by side, so you don't need states for every combination. N two-state toggles would otherwise need 2^N flat states.
   - **History states:** you can re-enter a compound state where you left off.
   - **Guards, entry/exit actions and delayed transitions.**

   A flat state machine is fine for a handful of states. Statecharts keep the same rigor (explicit states and events, with no impossible combinations) but scale to real UIs and protocols. XState implements them in JavaScript and TypeScript following the SCXML semantics. I'm highly confident in this.
