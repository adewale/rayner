# Why can an older search replace the latest result?

You type “ca”, then “cat”. Each change starts a search, and both requests are running. Your current input is “cat”, but its request finishes first and the older “ca” request finishes last. If the page displays each result as it arrives, which query will you end up looking at?

“ca”. First the page shows the results you wanted; then the older response replaces them. Both requests succeeded. The mistake is treating the last response to finish as the last request you made.

Draw each search as a bar from the keystroke that starts it to the moment its answer lands, and put the page beneath them as a track that changes at each landing. The bars overlap: “cat” starts while “ca” is still running, and its shorter bar ends first. The page track reads nothing, then “cat”, then “ca”. The page follows the order in which the bars end, while what the user wants follows the order in which they start.

The handler needs to remember which request is current. Give each search a numbered ticket when it starts: 1 for “ca”, 2 for “cat”. Keep the latest ticket, 2, beside the handler. When a response arrives, compare its own ticket with that latest value. Publish the result only if they match.

“cat” arrives with ticket 2, so it is published. “ca” arrives with ticket 1, so it is dropped. Finishing a request does not change its ticket or the latest number. Once a newer request has started, an old response cannot make itself current by arriving later. Add a guarded track under the unguarded one: it changes when “cat” lands, and when “ca” lands it stays on “cat”.

Now reverse the completion order. Both requests have still started, but “ca” finishes first. Without the guard, the page briefly displays “ca” before “cat” replaces it. With the guard, ticket 1 is already stale, so the initially empty page stays empty until ticket 2 arrives. Both versions eventually show “cat”; the guard also avoids the stale result along the way.

The guard controls publication, not execution. The old search still runs to completion; its response is simply refused permission to change the page. Cancellation, retries and what to show when a request fails need their own decisions. These two examples start with an empty display and successful requests, so they isolate the ordering mistake.
