# What does a cache hit save?

A request asks for a user, and the handler's lookup function runs one database query to answer it. Ask for the same user a second later and it runs the same query again. A merge request puts a cache in front of that query, a key-value store of saved users. Before reading the change, predict what it does to a request whose user is already saved, and to one whose user is not.

The first is a hit. The handler finds the saved value in the cache and returns it, and the request never reaches the database: zero reads instead of one. The second is a miss, and it is easy to assume it costs what it cost before. It costs more. The handler looks in the cache and finds nothing, reads the database once, as it always did, then writes the result into the cache before returning it. A hit saves the database read; a miss still makes it, and adds a cache read and write.

The code change says the same thing in five lines. Two new lines check the cache and return early on a hit. The old database query survives, rewritten to keep its result in a variable, and two more new lines save that result for 300 seconds and return it. Replayed on the request diagram, the same edit removes the handler's direct path to the database and puts the cache in its place, with a hit branch straight to the reply and a miss branch that falls through to the old query.

So whether the cache helps depends on how often the same value is asked for again within its lifetime. Many repeats turn most requests into hits that skip the database. A value asked for once never becomes a hit; its request pays for a cache read and a cache write on top of the database read it would have made anyway. The code also decides what counts as a hit: it treats any empty saved value as a miss.

This example follows one hit and one miss through the code. It counts database reads, not latency or price, and it does not model expiry beyond the 300-second lifetime, invalidation, failed writes, competing requests, or the delay before a write made in one location is visible in another.
