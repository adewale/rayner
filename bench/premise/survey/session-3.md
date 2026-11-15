Session 3 (`session_01N4DAa9XH2L5TRBZUBQ1gnG`, model `claude-opus-5-5`, no repository). Questions: git-branches, float-sum, poppy-sessions, galton-board, isdigit, ical-recurrence. The session's final message, verbatim:

1. **Git merges:** You only get a merge commit when the two branches have both moved on. If your branch hasn't changed since the other branch split off from it, Git can just move your branch label forward to the newer commit. That's called a "fast-forward", and nothing new is created. If both branches have new commits, no single existing commit contains both sets of changes. Git then makes a new commit with two parents to join the two histories. You can force a merge commit with `--no-ff`, or refuse to merge without a fast-forward using `--ff-only`. (Very confident.)

2. **0.1 + 0.2:** A double stores numbers as binary fractions, meaning sums of powers of two. 0.1 can't be written exactly that way, just as 1/3 can't be written exactly in decimal. So it's stored as the nearest value that fits in 53 significant bits, and 0.2 is too. The two small rounding errors add up. The sum lands on the double just above the one closest to 0.3, and that prints as 0.30000000000000004. For prices, store whole cents as integers or use a decimal type. To compare floats, check that they're within a small tolerance instead of using `==`. (Very confident.)

3. **The seal:** I don't know the specific document you're reading, so this is the general pattern rather than its exact contents (moderate confidence). The seal is usually a signed token, such as a JWT, issued by a party the shop already trusts, like the agent's platform or an identity provider. The shop doesn't need to know the agent. It checks the signature against that issuer's published public keys, then checks the expiry, the audience (that the seal was meant for this shop) and often a key the seal is bound to. To identify the User without revealing who they are, the seal carries a pairwise pseudonymous identifier. That's a stable, opaque ID made for this one shop. The shop can tell it's the same User each time, but the ID tells it nothing about the person, and other shops see a different ID for the same User.

4. **Galton board:** Where a ball ends up depends only on how many times it bounced right, not on the order. There's only one path that goes right every time. There are many paths that go right about half the time. With 10 rows, exactly 5 rights can happen 252 ways, while 10 rights can happen only 1 way, out of 1,024 paths in total. Every path is equally likely, so the middle bins collect the most balls. As you add rows, the shape gets closer and closer to the normal "bell" curve. That's the central limit theorem. (Very confident.)

5. **isdigit and int:** No. `str.isdigit()` is true for characters like superscript "²" and circled "①", but `int()` raises ValueError on them. Also, `isdigit()` rejects "-5", " 5" and "+5", all of which `int()` accepts. `isdecimal()` is the closer match, since `int()` accepts any Unicode decimal digit, such as Arabic-Indic "٣". The most reliable guard is to call `int(s)` inside `try/except ValueError`. (Very confident.)

6. **Cancelled meeting:** A guest's calendar holds its own copy of the event. Cancelling it doesn't delete that copy remotely. The organizer's server has to send the guest a cancellation message, and the guest's calendar has to receive it and apply it. That can go wrong in several ways:
   - The cancellation was never sent, perhaps because the organizer deleted the event without notifying guests.
   - It was lost or filtered by email.
   - It didn't match the guest's copy, because the event ID differed or it was an older version.
   - For a recurring meeting, only one occurrence or one version of the series was cancelled.
   - The guest's client imported the invite as a static file and never handles updates.

   (Confident.)
