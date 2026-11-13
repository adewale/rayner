# How does Poppy work?

- **Reader:** a developer who has used "Sign in with…" and has heard that AI agents will shop and file returns for people, but has not read the Personal Agent Protocol (Poppy) and does not want to read eleven sections to learn its shape.
- **Answer:** Your agent signs every request to say who is asking, and you approve separately what it may do with your account
- **Changed condition:** what you approve at sign-in. Approve orders:read and orders:write and the exchange is made; approve only orders:read and the same request, under the same seal, is refused with 403 insufficient_scope.
- **Reader's own work:** predict what the shop should ask a strange agent first; switch the approval and predict the answer to the exchange; at the last step, drive the whole protocol, from reading poppy.json to signing out, and read why each refused press is refused.
- **Checked against:** the Personal Agent Protocol draft 1.0 (in progress; as published on 2026-11-13), read and not run: `model.test.ts` holds the model to the rules and examples of its sections 3, 4.7, 5.1 to 5.5, 6, 7 and 8, each test naming its section. There is no reference implementation here to run the model against. It is also held to what the protocol itself publishes, copied on 2026-11-13 into `fixtures/poppy-official.json`: the JSON Schemas of its Company implementation kit and the example documents of its spec.md. POPPY_JSON and ISSUER_METADATA give the examples' values, `discover` accepts the example documents, and a Session JWT's claims meet the kit's schema except the shortened sid and the stand-in ath (`fixtures/json-schema.ts` is the schema checker these tests share).
- **Leaves out:** real signatures and delegated keys (who holds a key is a field of the model), time (token lifetimes, the window in which a copied request still works), Device Sign-In, the steps inside browser join and the messages inside a conversation (each is one request here), handoff to a person, and task coverage.

## Check yourself

1. You approved only orders:read. What does the Company answer when the agent tries the exchange, and when it asks to see the order?
   The exchange gets 403 insufficient_scope, naming orders:write; the order gets 200. The Session header is the same on both: the token decides.
2. A thief copies a whole request, Session header and access token together, and sends both to the exchange URL instead. Why does that fail?
   400 invalid_session: the header was signed for another method or URL. A Session header is signed for one request, so it cannot be moved to another.
3. After sign-out the agent asks to see the order again. What comes back, and what does the Company still know?
   401, naming orders:read. The Company still knows agent.example, User ID usr_Q7c1vK and Session Yx2b7Q with its cart: sign-out ended account access, not the Session.
4. You use the same agent at shoes.example. What can the two Companies compare to learn that you are one person?
   Nothing the agent sends: example.com sees usr_Q7c1vK and shoes.example sees usr_m4Tz9P, and neither ID is derived from anything about you.

## Why this explainer

The question is the plain one a newcomer asks, and the specification answers it with a table of six layers. A reader can memorise that table and still not be able to say what happens when an agent turns up at a shop. So this follows one errand, the jacket exchange from the specification's own examples, from the moment the agent is a stranger to the moment it signs out, and lets each part of the protocol arrive when the errand needs it: poppy.json when the agent has no way in, the Session header when the shop needs to know who is asking, the three channels once there is a Session to tie them together, OAuth when the errand touches the account.

The picture has two marks and I want the reader to leave with both in their hands. The round seal is the Session header: the agent makes it for itself, for every request, and it says who is asking. The diamond key is the access token: only you can have one cut, on the Company's own page, and it says what your account allows. The motion is there to show where each comes from. A request grows out of the agent's seal and travels its lane. The key arrives from the Company's edge. A thief's packet comes from outside the agent, carrying the agent's key under its own seal, and stops. Where a packet rests says how it fared: against the Company's edge when it was accepted, short of it when it was refused.

The turn is the 401. A reader who has watched three sealed requests succeed expects the fourth to succeed too, and it stops short: the seal says who, and says nothing about what. The approval setting makes the same point from the other side, since a key cut for reading stops the same request with a 403 under an identical seal.

The first version of this explainer asked a narrower question and drew three columns of small text, which a phone showed as a tour of crops and, at the live step, as a picture nobody could read. This one is drawn for a phone first: every label reads on a whole 358 px stage, the stage carries no heading so the picture has its full height, and marks do work that words did before. What I gave up is on the page as words instead: the request's method and path, and the rule of the draft that decided each answer, are in each picture's description.

What I left out is still most of the specification by page count: the steps inside browser join, conversations and handoff to a person, task coverage, delegated keys and blind signing. Browser join and the chat each appear as one request so the reader sees the Session span them; how each works inside deserves its own explainer.
