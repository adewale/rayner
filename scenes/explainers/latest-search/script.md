# Script: why can an older search replace the latest result?

Questions the reader brings: I typed the whole word, so why does the page show results for half of it? Isn't the last search the one that wins?

A search box starts a search on each keystroke. Type "ca", then "cat", and two searches are in flight: "ca" started first, "cat" second, and the user now wants "cat". The network decides which answers first. Say "cat" answers first and "ca" last. The handler does the obvious thing: when a result arrives, put it on the page. So the page shows "cat", and then "ca" lands and replaces it. The user typed "cat" and is left looking at results for "ca". An older search can finish last, and an unguarded handler publishes whatever finishes last.

What could tell the handler that "ca" is out of date? Number the searches as they start. A counter called latest hands "ca" ticket 1 and "cat" ticket 2, and latest is now 2. Finishing changes neither. When a result lands, publish it only if its ticket is still the latest.

Run the race again with the guard. "cat" lands with ticket 2, the latest, and is published. "ca" lands with ticket 1, not the latest 2, and is dropped. The page ends on "cat". The guard does not cancel the old search, which still runs to the end; it only refuses a result whose ticket is stale.

In the other order, "ca" lands first and "cat" last, and the unguarded page ends right by luck, after a flash of "ca". With the guard, "ca" is dropped on arrival and the page shows nothing until "cat" lands.

**The aha:** the page is wrong although every line of the handler ran correctly; finishing last is not the same as being the latest.

**Sentence to remember:** an older search can finish last, and an unguarded handler publishes whatever finishes last; a ticket from a counter lets it publish only the latest.

**Check questions**, in `meta.checks`, asked after the last step:

1. "ca" then "cat", and "cat" answers first. Without a guard, which results does the page end on?
2. With the guard, "ca" answers first. What does the page show before "cat" answers?
3. Does the guard stop the "ca" search from running?

The model (`lib/latest-search.ts`) resolves two real promises in the chosen order; search A is "ca" and search B is "cat". The two completion orders are the cases: "cat" first is the default because it shows the bug.

| Step | Script | Reader predicts |
| --- | --- | --- |
| race | paragraph 1, the two searches and the order they answer in | which results the page ends on |
| overwrite | paragraph 1, the stale overwrite and the answer | what could mark "ca" as out of date |
| tickets | paragraph 2, the ticket and the guard, with the lines the model runs | whether the first result to land is published |
| reader-first | paragraph 3, the first result through the guard | what happens to the second |
| reader-ticket | paragraph 3, the second result through the guard | |
| reader-guard | paragraphs 3 and 4, both rules side by side | |
