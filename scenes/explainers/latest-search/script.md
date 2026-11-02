# Script: why can an older search replace the latest result?

For an engineer whose search UI occasionally shows results for earlier input. Explain request identity with the smallest race that can lose the user's intent.

The user types “ca”, then “cat”. Both requests are running, but only “cat” describes the current input. Suppose “cat” finishes first and “ca” last. Before showing the results, ask which query the page will end on if every successful response is published.

It ends on “ca”. Each request succeeded; the page is wrong because completion order differs from the order of the user's requests. An older search can finish last, and an unguarded handler publishes whatever finishes last. What information would let the handler recognise an outdated response?

Give each request a ticket when it starts: 1 for “ca”, 2 for “cat”. Keep 2 as the latest ticket. A response may publish only when its ticket matches that latest value. Finishing a request changes neither ticket. Ask the reader to decide what happens to the first response, then to the second.

With the guard, ticket 2 publishes and ticket 1 is dropped, whichever finishes first. In the alternate completion order the unguarded page eventually ends correctly too, but briefly shows “ca”; the guard leaves the initially empty page empty until “cat” arrives. The guard does not cancel work. It decides which completed request may change the page.

**Remember:** request order expresses the user's latest intent; response order does not. Compare a response's ticket with the latest started request.

**Transfer questions:**

1. Start “ca”, “cat”, then “ca” again, with tickets 1, 2 and 3. Request 3 finishes first and request 1 last. Should the last response publish because its query text matches the input? (No: ticket 1 is still stale. Identical query text does not make an old request current.)
2. The newest request fails; an older successful response then arrives. Does the guard publish it as a fallback? (No. Its ticket is stale. Error and fallback behavior need an explicit policy.)

| Step | What it contributes |
| --- | --- |
| race | Separate request order from completion order; predict the final display |
| overwrite | Show the stale overwrite, then ask how to recognise it |
| tickets | Introduce the counter only once the reader needs request identity |
| reader-first | Apply the equality check to the first completion |
| reader-ticket | Apply it to the second without changing latest |
| reader-guard | Compare the guarded and unguarded traces together |

## Limits

The displayed cases resolve two successful, real JavaScript promises in controlled orders. They start with an empty display and no earlier results. There is no network or timing benchmark. The three-request and rejected-request transfer exercises run through the same handler in tests but are not additional displayed cases. The example does not implement debouncing, cancellation, retries, loading/error UI or fallback policy. The guard protects publication, not the cost of work already started.
