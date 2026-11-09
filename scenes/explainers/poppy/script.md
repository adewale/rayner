# What must your agent prove before a company acts for you?

- **Reader:** a developer who has used "Sign in with…" and knows roughly what an OAuth token is, has heard that AI agents will shop and file returns for people, and has not read the Personal Agent Protocol (Poppy).
- **Answer:** A Session header says who is asking, and an access token says what your account allows
- **Changed condition:** what you approve at sign-in. Approve orders:read and orders:write and the exchange is made; approve only orders:read and the same request, with the same Session header, is refused with 403 insufficient_scope, while reading the order still works.
- **Reader's own work:** predict what the shop needs to know before it changes an order; switch the approval and predict the answer to the exchange; at the last step, drive the agent, the thief and your own sign-in and sign-out, and read why each refused press is refused.
- **Checked against:** the Personal Agent Protocol draft 0.4, read and not run: `model.test.ts` holds the model to the rules and examples of its sections 4.7, 5.1 to 5.5 and 7, each test naming its section. There is no reference implementation here to run the model against.
- **Leaves out:** real signatures and delegated keys (who holds a key is a field of the model), time (token lifetimes, the window in which a copied request still works), the checks an agent makes on poppy.json, Device Sign-In, the website channel (browser join) and conversations with the Company's own agent.

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

Most accounts of agent protocols open on a diagram of layers. Poppy's own specification does too: discovery, operator recognition, Sessions, account access, channels, task coverage. A reader can memorise that list and still not see the one decision the rest hangs from, which is that the protocol refuses to let one credential do two jobs. Today an agent that wants to act for you either borrows your password, and becomes indistinguishable from you, or arrives as an anonymous bot, and gets a CAPTCHA. Poppy's answer is to split the question the Company is really asking into two: who is this, and what may it touch? The first is answered by the agent, on its own authority, on every request, with a pseudonym. The second is answered by you, once, on the Company's own page, with ordinary OAuth.

So the explainer follows one errand, the jacket exchange from the specification's own examples, and lets the reader watch what the Company knows grow one row at a time. The cart comes first because it needs no account: the reader sees a Company recognise an agent and a returning stranger without learning who the stranger is. The 401 is the turn. A reader who expected the signed header to be enough has to revise, and the answer is stated there, as the payoff of that refusal.

The approval setting is the lever. Read-only approval sends the same header and gets a different answer, which is the cleanest evidence that the header carries no authority. The thief is there for the other direction: the token carries no identity either, and is refused when someone else signs for it. Those two refusals together are the aha I want to stick: two proofs, neither sufficient, each bound to the other on the wire.

Sign-out ends the story because it is the practical boundary: the Session, the cart and the pseudonym all outlive the grant, and the Company can cut off one agent without touching your password. What the protocol cannot do is bind an agent that ignores it and types your password into the website; the last caption says so.

What I left out is most of the specification by page count: conversations with the Company's own agent, handoff to a person, browser join, task coverage, delegated keys and blind signing. Each is built on the split shown here, and each deserves its own explainer rather than a row in this one.
