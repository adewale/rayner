# What does a cache hit save?

A request needs a user's data. Without a cache, the handler reads the database and returns the result. That costs one database query each time, even if the same data was requested a moment ago. Could a saved copy avoid that query?

Add a key-value store before the database lookup. The handler first checks for the requested user's saved value. If it finds the value, it returns it immediately. This cache hit takes a different path to the reply: it never reaches the database, so this request uses zero database reads.

A cache miss does not have that shortcut. With no saved value to return, the handler still reads the database once. It then saves the fetched value in the key-value store and returns it. That read has not been eliminated; it has also prepared a value that a later request might use.

Compare the two selected requests against the original handler. The hit saves a database query; the miss keeps the query and adds the cache work. The code change and the new branch in the diagram describe the same decision: return early when a saved value is available, otherwise fall through to the old lookup.

The saved value's freshness is a separate question. This example follows a hit or miss without modeling expiry, invalidation, failed writes or competing requests. It counts database reads, not the full latency or cost of the cache path.
