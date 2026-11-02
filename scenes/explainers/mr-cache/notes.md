# Construction and scope

The opening compares database-read counts, not a benchmark. The later code diff and diagram edit retain the same getUser lookup on the miss path; the hit's early return is the consequential change.

The source is the pinned Lantern cache example linked in scene metadata. The selected hit has a usable saved value and the miss has none. Empty or malformed cache values, freshness, expiry, invalidation, concurrent fills and service failures are outside these two cases. The scene demonstrates the code/diagram edit and the request path, not a complete deployed cache.
