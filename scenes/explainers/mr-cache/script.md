# What does a cache hit save?

- **Reader:** a developer reviewing a merge request that puts a key-value cache in front of a database query; reads TypeScript and knows what a database read is, and may assume a cache only ever saves work.
- **Answer:** A hit saves the database read; a miss still makes it, and adds a cache read and write
- **Changed condition:** the request followed. A hit runs lines 2 and 3 and returns with zero database reads; a miss runs lines 2 to 6, making the original query plus a KV read and a KV write, so it does more work than before the change.
- **Reader's own work:** predict what a hit and a miss cost before the change is shown; switch between the hit and the miss; the three check questions apply the paths to a hit rate, a job that never repeats a lookup, and a user who does not exist.
- **Checked against:** the real git CLI: `fidelity.ts` diffs the before and after code (`code.ts`) with `git diff --no-index` and holds the diff step's TransformDiff hunks and line counts to it, and checks each scenario's read count and walked path. The code itself is not run against Workers KV or D1; the third check answer is an inference from Cloudflare's KV documentation (`get(key, "json")` resolves with `null` for a missing key) and the code.
- **Grounding:** live: git diff, run on the before and after code
- **Leaves out:** latency and price (it counts database reads, not a benchmark); expiry beyond the 300-second TTL, invalidation, failed writes, concurrent fills, service failures, and the delay before a write made in one location is visible in another. It demonstrates the code and diagram edit and one request's path, not a deployed cache.

## Check yourself

1. Nine of ten requests for one user are hits. How many database reads do those ten requests make, against how many before the change?
   One, the miss that filled the cache, against ten. Each hit returns from KV without reaching D1.
2. A nightly job looks up every user exactly once. What does the cache do to its database reads, and to its total work?
   Every lookup misses, so the job still makes one database read per user, as before, and each lookup adds a KV read and a KV write. The cache saves nothing here and costs two extra operations a user.
3. For a user who does not exist, the query returns null. What happens on the next lookup for that user, and which line decides it?
   It misses again and reads D1 again. The put stores the text null; get with "json" parses it back to null, and line 3, if (hit), treats null as no saved value. A missing user is never answered from the cache.

## Why this explainer

The tempting belief is that a cache only saves work. The point of this explainer is the miss: it still makes the database read it always made, and adds a cache read and a cache write. Whether the cache helps therefore depends on how often the same value is asked for again within its lifetime, and the check questions push the reader to that conclusion with a high hit rate and with a job that never repeats a lookup.

The two scenarios are read off the code's two paths, and the steps keep the code and the request diagram in step: the same edit is shown as a TransformDiff on the code and replayed as operations on the diagram. The old getUser query survives on the miss path, rewritten to keep its result; the hit's early return is the consequential change, so it is what the outlines mark. The code also decides what counts as a hit: `if (hit)` treats any empty saved value as a miss, which is what the third question asks about.

The code began as Lantern's engine example (pinned in `meta.sources`); the hit scenario has a usable saved value and the miss has none.
