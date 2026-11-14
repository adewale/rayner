# Why can an older search replace the latest result?

- **Reader:** writes front-end code that starts a request on each keystroke and shows its result, and knows promises resolve asynchronously; has not asked what happens when responses land out of order.
- **Answer:** An older search can finish last, and an unguarded handler publishes whatever finishes last
- **Changed condition:** which search answers first. When "cat" answers first, the unguarded page ends on the stale "ca" and the guarded page stays on "cat". When "ca" answers first, both pages end on "cat", but the unguarded page shows "ca" along the way while the guarded one stays empty until ticket 2 lands: the same final display, different histories.
- **Reader's own work:** predict which query the page ends up showing; choose which search answers first; then the two check questions, a repeated query (tickets, not text) and a failed newest request (the guard is no fallback policy).
- **Checked against:** real JavaScript promises resolved in chosen orders through the same `createSearch` handler the code panel prints: `model.test.ts` runs both completion orders and the check questions' cases (repeated query text, a failing newest request) through it, checks the printed ticket check against the executed handler, and runs every state the race machines explore (10 per rule) through real promises to get the same page; `scene.test.ts` checks the chart scenarios of `fixtures/latest-search-view.ts` and the public story, and `fidelity.ts` holds each step's state to an independent expectation. No network latency is measured.
- **Grounding:** live: JavaScript promises resolved in chosen orders, through the handler the page prints
- **Leaves out:** network timing; debounce, cancellation, retries, loading states, error display and fallback policy; an application that keeps earlier results on the page; failed requests in the drawn scenarios.

## Check yourself

1. The user types “ca”, then “cat”, then “ca” again, starting requests with tickets 1, 2 and 3. Request 3 finishes first; request 1 finishes last. Should request 1 be published because its query text matches the current input?
   No. The current request is ticket 3. Ticket 1 is an older request even though its text is also “ca”; it may contain older data. Compare request tickets, not query strings, and leave request 3’s result on the page.
2. Suppose the newest request fails, then an older successful request arrives. Does the ticket guard publish the older result as a fallback?
   No. Its ticket is still stale. The guard enforces which request may publish; it does not choose a fallback or handle the newest request’s error. An application needs an explicit error or fallback policy.

## Why this explainer

The bug is common and hard to see: both requests succeed, and the page simply shows whichever finished last. The explainer makes the difference between request order and completion order visible as a timeline, a bar per search from its keystroke to its landing and a page track beneath that changes at each landing, so the reader sees the page follow the order the bars end while what the user wants follows the order they start.

The fix is a ticket per request and the latest ticket kept beside the handler; a response publishes only if its ticket is still the latest. The guarded track is drawn under the unguarded one so the reader sees the stale landing crossed out. The ticket belongs to the request, not its query text, which is why the first check question repeats "ca".

The scenarios use real promises resolved in chosen orders, not sleeps or measured latency, so the race is reproducible and the timeline's bars count events, not time. The two timelines are machines over the same handler, one per rule, so `rayner check` explores every interleaving, including "ca" landing before "cat" is typed, which no drawn scenario shows. The older-first scenario is kept because its final displays match: comparing whole publication histories shows the guard still matters there.

The page ends on the guard's boundary: it controls publication, not execution. The old search still runs; cancellation, retries and failure handling need their own decisions.
